import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { BehaviorSubject } from 'rxjs';
import { DatabaseService } from '../database/database.service';
import { Manifest, ManifestEntry, Poem } from '../models';
import { normalizeArabic, sha256Hex } from '../text.utils';
import { ContentValidator } from './content-validator';

export interface SyncStatus {
  syncing: boolean;
  lastSuccess?: string;
  lastError?: string;
  downloaded: number;
}

interface DownloadedPoem {
  poem: Poem;
  entry: ManifestEntry;
}

export const DEFAULT_CONTENT_URL = 'https://abdallah0101.github.io/almahfuzat-content';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly validator = new ContentValidator();
  private inFlight?: Promise<number>;
  private seeding?: Promise<void>;
  private autoStarted = false;
  readonly status = new BehaviorSubject<SyncStatus>({ syncing: false, downloaded: 0 });

  constructor(private readonly db: DatabaseService) {}

  async contentUrl(): Promise<string> {
    return (await this.db.getSetting('content_url', DEFAULT_CONTENT_URL)).replace(/\/+$/, '');
  }

  async setContentUrl(value: string): Promise<void> {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('يجب أن يكون عنوان المحتوى HTTPS.');
    }
    await this.db.setSetting('content_url', url.toString().replace(/\/+$/, ''));
  }

  async syncNow(): Promise<number> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performSync().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async performSync(): Promise<number> {
    this.status.next({ ...this.status.value, syncing: true, lastError: undefined, downloaded: 0 });
    try {
      const base = await this.contentUrl();
      if (base.includes('YOUR-USERNAME')) throw new Error('اضبط عنوان مستودع المحتوى من الإعدادات أولًا.');
      const localVersion = await this.db.getSetting('catalog_version', 0);
      const manifest = await this.downloadManifest(base);
      if (manifest.catalog_version < localVersion) throw new Error('إصدار الفهرس البعيد أقدم من المحلي؛ لم تُعدّل البيانات.');
      let downloaded = 0;
      if (manifest.catalog_version !== localVersion) {
        const localRows = await this.db.query<{ id: string; revision: number; sha256: string }>('SELECT id,revision,sha256 FROM poems');
        const local = new Map(localRows.map((row) => [row.id, row]));
        const changed = manifest.poems.filter((entry) => local.get(entry.id)?.sha256 !== entry.sha256);
        const prepared: DownloadedPoem[] = [];
        for (const entry of changed) {
          const old = local.get(entry.id);
          if (old && entry.revision <= old.revision) throw new Error(`مراجعة ${entry.id} يجب أن تكون أكبر من ${old.revision}.`);
          const poem = await this.downloadPoem(base, entry);
          prepared.push({ poem, entry });
        }
        await this.applyCatalog(prepared, manifest);
        downloaded = prepared.length;
      }
      const now = new Date().toISOString();
      await this.db.setSetting('last_successful_sync', now);
      this.status.next({ syncing: false, lastSuccess: now, downloaded });
      return downloaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.next({ ...this.status.value, syncing: false, lastError: message });
      throw error;
    }
  }

  private async downloadManifest(base: string): Promise<Manifest> {
    const response = await this.fetch(`${base}/manifest.json?ts=${Date.now()}`);
    return this.validator.manifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response)));
  }

  private async downloadPoem(base: string, entry: ManifestEntry): Promise<Poem> {
    if (!/^poems\/[a-z0-9-]+\.json$/.test(entry.path) || entry.path !== `poems/${entry.id}.json`) {
      throw new Error('رفض مسار ملف غير آمن.');
    }
    const bytes = await this.fetch(`${base}/${entry.path}`);
    const digest = await sha256Hex(bytes);
    if (digest !== entry.sha256) throw new Error(`بصمة ${entry.id} غير مطابقة؛ أُلغيت المزامنة دون تعديل البيانات.`);
    const poem = this.validator.poem(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), entry.id);
    if (poem.revision !== entry.revision || poem.verses.length !== entry.verse_count) {
      throw new Error(`بيانات الفهرس لا تطابق ملف ${entry.id}.`);
    }
    return poem;
  }

  private async fetch(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await globalThis.fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`تعذر تنزيل المحتوى (${response.status}).`);
      return await response.arrayBuffer();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async applyCatalog(downloaded: DownloadedPoem[], manifest: Manifest): Promise<void> {
    await this.db.transaction(async () => {
      const ids = manifest.poems.map((entry) => entry.id);
      if (ids.length) {
        await this.db.run(`UPDATE poems SET is_present=0 WHERE id NOT IN (${ids.map(() => '?').join(',')})`, ids);
        await this.db.run(`UPDATE verses SET is_present=0 WHERE poem_id NOT IN (${ids.map(() => '?').join(',')})`, ids);
        await this.db.run(`UPDATE recordings SET is_archived=1 WHERE poem_id NOT IN (${ids.map(() => '?').join(',')})`, ids);
      } else {
        await this.db.run('UPDATE poems SET is_present=0');
        await this.db.run('UPDATE verses SET is_present=0');
        await this.db.run('UPDATE recordings SET is_archived=1');
      }
      for (const item of downloaded) await this.upsertPoem(item.poem, item.entry.sha256);
      await this.db.setSetting('catalog_version', manifest.catalog_version);
      await this.db.setSetting('catalog_updated_at', manifest.updated_at);
    });
  }

  private async upsertPoem(poem: Poem, digest: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(`INSERT INTO poems(id,payload,title,author,science,revision,sha256,is_complete,is_present,updated_at,search_text)
      VALUES(?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,title=excluded.title,
      author=excluded.author,science=excluded.science,revision=excluded.revision,sha256=excluded.sha256,
      is_complete=excluded.is_complete,is_present=1,updated_at=excluded.updated_at,search_text=excluded.search_text`,
      [poem.id, JSON.stringify(poem), poem.title, poem.author, poem.science, poem.revision, digest,
        poem.is_complete ? 1 : 0, now, normalizeArabic(`${poem.title} ${poem.author} ${poem.science}`)]);
    await this.db.run('UPDATE verses SET is_present=0, number=-1000000-rowid WHERE poem_id=?', [poem.id]);
    await this.db.run('DELETE FROM chapters WHERE poem_id=?', [poem.id]);
    for (const chapter of poem.chapters) {
      await this.db.run('INSERT INTO chapters(poem_id,id,title,number) VALUES(?,?,?,?)',
        [poem.id, chapter.id, chapter.title, chapter.number ?? null]);
    }
    for (const verse of poem.verses) {
      const textHash = await sha256Hex(verse.text);
      await this.db.run(`INSERT INTO verses(poem_id,id,number,first_hemistich,second_hemistich,text,text_hash,chapter_id,search_text,is_present)
        VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(poem_id,id) DO UPDATE SET number=excluded.number,
        first_hemistich=excluded.first_hemistich,second_hemistich=excluded.second_hemistich,text=excluded.text,
        text_hash=excluded.text_hash,chapter_id=excluded.chapter_id,search_text=excluded.search_text,is_present=1`,
        [poem.id, verse.id, verse.number, verse.first_hemistich, verse.second_hemistich, verse.text,
          textHash, verse.chapter_id ?? null, normalizeArabic(verse.text)]);
    }
    await this.db.run(`UPDATE recordings SET
      is_archived=COALESCE((SELECT CASE WHEN v.is_present=1 THEN 0 ELSE 1 END FROM verses v
        WHERE v.poem_id=recordings.poem_id AND v.id=recordings.verse_id),1),
      text_changed=COALESCE((SELECT CASE WHEN v.text_hash=recordings.verse_text_hash THEN 0 ELSE 1 END FROM verses v
        WHERE v.poem_id=recordings.poem_id AND v.id=recordings.verse_id),0)
      WHERE poem_id=?`, [poem.id]);
  }

  seedDemo(): Promise<void> {
    this.seeding ??= this.performSeedDemo().finally(() => { this.seeding = undefined; });
    return this.seeding;
  }

  private async performSeedDemo(): Promise<void> {
    const count = await this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM poems');
    if ((count[0]?.count ?? 0) > 0) return;
    const bytes = await this.fetch('assets/seed/poem.json');
    const text = new TextDecoder().decode(bytes);
    const poem = this.validator.poem(JSON.parse(text));
    const entry: ManifestEntry = {
      id: poem.id, title: poem.title, author: poem.author, science: poem.science,
      verse_count: poem.verses.length, path: `poems/${poem.id}.json`, revision: poem.revision,
      sha256: await sha256Hex(bytes), is_complete: poem.is_complete
    };
    await this.db.transaction(() => this.upsertPoem(poem, entry.sha256));
    await this.db.setSetting('catalog_version', 0);
  }

  startAutoSync(): void {
    if (this.autoStarted) return;
    this.autoStarted = true;
    void App.addListener('resume', () => { void this.syncNow().catch(() => undefined); });
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow().catch(() => undefined);
    }, 15 * 60 * 1000);
  }
}
