import { afterEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import path from 'node:path';
import { migrations } from '../src/app/core/database/migrations';
import { SyncService } from '../src/app/core/content/sync.service';
import { Manifest, Poem } from '../src/app/core/models';
import { sha256Hex } from '../src/app/core/text.utils';

class TestDatabase {
  private db!: Database;

  async init(): Promise<void> {
    const SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) });
    this.db = new SQL.Database();
    for (const sql of migrations[1]) this.db.exec(sql);
  }

  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    statement.bind(values as never);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }

  async run(sql: string, values: unknown[] = []): Promise<number> {
    this.db.run(sql, values as never);
    return this.db.getRowsModified();
  }

  async execute(sql: string): Promise<void> { this.db.exec(sql); }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.query<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
    return rows.length ? JSON.parse(rows[0].value) : fallback;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
  }
}

function poem(count: number, revision: number): Poem {
  return {
    schema_version: 1, id: 'demo-poem', title: 'منظومة اختبار', author: 'مؤلف اختبار', science: 'نحو',
    source: { name: 'اختبار' }, is_complete: false, revision, chapters: [],
    verses: Array.from({ length: count }, (_, index) => ({
      id: `stable-${String(index + 1).padStart(3, '0')}`, number: index + 1,
      first_hemistich: `الشَّطْرُ الأَوَّلُ ${index + 1}`, second_hemistich: `الشَّطْرُ الثَّانِي ${index + 1}`,
      text: `الشَّطْرُ الأَوَّلُ ${index + 1}\nالشَّطْرُ الثَّانِي ${index + 1}`
    }))
  };
}

async function server(initial: Poem) {
  const db = new TestDatabase();
  await db.init();
  await db.setSetting('content_url', 'https://content.test');
  let current = initial;
  let raw = `${JSON.stringify(initial, null, 2)}\n`;
  let catalog = 1;
  const manifest = async (): Promise<Manifest> => ({
    schema_version: 1, catalog_version: catalog, updated_at: new Date(1700000000000 + catalog).toISOString(),
    poems: [{ id: current.id, title: current.title, author: current.author, science: current.science,
      verse_count: current.verses.length, path: `poems/${current.id}.json`, revision: current.revision,
      sha256: await sha256Hex(raw), is_complete: current.is_complete }]
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/manifest.json')) return new Response(JSON.stringify(await manifest()));
    if (url.includes('/poems/demo-poem.json')) return new Response(raw);
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const sync = new SyncService(db as never);
  return {
    db, sync, fetchMock,
    async publish(next: Poem, corruptHash = false) {
      current = next;
      raw = `${JSON.stringify(next, null, 2)}\n`;
      catalog++;
      if (corruptHash) {
        const original = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
          if (String(input).includes('/manifest.json')) {
            const value = await manifest();
            value.poems[0].sha256 = '0'.repeat(64);
            return new Response(JSON.stringify(value));
          }
          return original(input, undefined as never);
        });
      }
    }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SQLite synchronization', () => {
  it('adds ten verses then appends ten without duplication', async () => {
    const fixture = await server(poem(10, 1));
    await fixture.sync.syncNow();
    let rows = await fixture.db.query<{ id: string }>('SELECT id FROM verses WHERE poem_id=? AND is_present=1', ['demo-poem']);
    expect(rows).toHaveLength(10);
    await fixture.publish(poem(20, 2));
    await fixture.sync.syncNow();
    rows = await fixture.db.query('SELECT id FROM verses WHERE poem_id=? AND is_present=1', ['demo-poem']);
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.id)).size).toBe(20);
  });

  it('marks a recording when its verse text changes without deleting it', async () => {
    const fixture = await server(poem(10, 1));
    await fixture.sync.syncNow();
    const third = poem(10, 1).verses[2];
    await fixture.db.run(`INSERT INTO recordings(id,poem_id,verse_id,file_path,mime_type,codec,size_bytes,duration_ms,created_at,verse_text_hash)
      VALUES('rec-3','demo-poem','stable-003','recordings/3.m4a','audio/mp4','AAC',100,1000,?,?)`, [new Date().toISOString(), await sha256Hex(third.text)]);
    const changed = poem(10, 2);
    changed.verses[2].first_hemistich = 'نَصٌّ مُصَحَّحٌ';
    changed.verses[2].text = `${changed.verses[2].first_hemistich}\n${changed.verses[2].second_hemistich}`;
    await fixture.publish(changed);
    await fixture.sync.syncNow();
    const rows = await fixture.db.query<{ id: string; text_changed: number }>("SELECT id,text_changed FROM recordings WHERE id='rec-3'");
    expect(rows[0]).toEqual({ id: 'rec-3', text_changed: 1 });
  });

  it('keeps recording attached to stable id after middle insertion', async () => {
    const fixture = await server(poem(10, 1));
    await fixture.sync.syncNow();
    const originalThird = poem(10, 1).verses[2];
    await fixture.db.run(`INSERT INTO recordings(id,poem_id,verse_id,file_path,mime_type,codec,size_bytes,duration_ms,created_at,verse_text_hash)
      VALUES('rec-3','demo-poem','stable-003','recordings/3.m4a','audio/mp4','AAC',100,1000,?,?)`, [new Date().toISOString(), await sha256Hex(originalThird.text)]);
    const inserted = poem(10, 2);
    inserted.verses.splice(2, 0, { id: 'inserted-middle', number: 3, first_hemistich: 'بيت مدرج', second_hemistich: 'في المنتصف', text: 'بيت مدرج\nفي المنتصف' });
    inserted.verses.forEach((verse, index) => { verse.number = index + 1; });
    await fixture.publish(inserted);
    await fixture.sync.syncNow();
    const rows = await fixture.db.query<{ verse_id: string; number: number; is_archived: number }>(`SELECT r.verse_id,v.number,r.is_archived FROM recordings r
      JOIN verses v ON v.poem_id=r.poem_id AND v.id=r.verse_id WHERE r.id='rec-3'`);
    expect(rows[0]).toEqual({ verse_id: 'stable-003', number: 4, is_archived: 0 });
  });

  it('rejects a bad SHA-256 and leaves the previous catalog intact', async () => {
    const fixture = await server(poem(10, 1));
    await fixture.sync.syncNow();
    await fixture.publish(poem(20, 2), true);
    await expect(fixture.sync.syncNow()).rejects.toThrow('بصمة');
    const rows = await fixture.db.query('SELECT id FROM verses WHERE poem_id=? AND is_present=1', ['demo-poem']);
    expect(rows).toHaveLength(10);
    expect(await fixture.db.getSetting('catalog_version', 0)).toBe(1);
  });

  it('does not redownload poems when catalog_version is unchanged', async () => {
    const fixture = await server(poem(10, 1));
    await fixture.sync.syncNow();
    fixture.fetchMock.mockClear();
    await fixture.sync.syncNow();
    expect(fixture.fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fixture.fetchMock.mock.calls[0][0])).toContain('manifest.json');
  });
});
