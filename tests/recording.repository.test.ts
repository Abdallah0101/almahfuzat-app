import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryRepository } from '../src/app/core/database/library.repository';
import { Recording } from '../src/app/core/models';
import { TestDatabase } from './test-database';

const recording = (id: string): Recording => ({
  id, poem_id: 'poem', verse_id: 'stable-verse', file_path: `recordings/${id}.m4a`, mime_type: 'audio/mp4',
  codec: 'AAC', size_bytes: 100, duration_ms: 1000, created_at: '2026-01-01', verse_text_hash: 'hash',
  is_current: true, is_archived: false, text_changed: false
});

describe('recording replacement', () => {
  let db: TestDatabase;
  let repository: LibraryRepository;
  beforeEach(async () => { db = new TestDatabase(); await db.init(); repository = new LibraryRepository(db as never); });

  it('keeps old attempts only when requested', async () => {
    await repository.saveRecording(recording('old'), true);
    await repository.saveRecording(recording('new'), true);
    expect(await db.query('SELECT id FROM recordings')).toHaveLength(2);
    expect(await db.query('SELECT id FROM recordings WHERE is_current=1')).toHaveLength(1);
  });

  it('removes old metadata when attempts are disabled so backup never references deleted files', async () => {
    await repository.saveRecording(recording('old'), true);
    await repository.saveRecording(recording('new'), false);
    const rows = await db.query<{ id: string; is_current: number }>('SELECT id,is_current FROM recordings');
    expect(rows).toEqual([{ id: 'new', is_current: 1 }]);
  });
});
