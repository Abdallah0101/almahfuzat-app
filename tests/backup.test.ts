import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from '../src/app/core/backup/backup.service';
import { NativeBackup } from '../src/app/core/backup/native-backup';
import { BackupSnapshot } from '../src/app/core/models';
import { TestDatabase } from './test-database';

vi.mock('../src/app/core/backup/native-backup', () => ({ NativeBackup: { restoreBackup: vi.fn(), createBackup: vi.fn() } }));

function snapshot(recordingId: string, backupPath: string): BackupSnapshot {
  const poem = { schema_version: 1, id: 'demo', title: 'اختبار', author: 'اختبار', science: 'اختبار', source: { name: 'اختبار' }, is_complete: true, revision: 1, chapters: [], verses: [] };
  return {
    backup_schema_version: 1, app_schema_version: 1, created_at: '2026-01-01T00:00:00Z', device_id: 'device',
    poems: [{ id: 'demo', payload: JSON.stringify(poem), title: 'اختبار', author: 'اختبار', science: 'اختبار', revision: 1, sha256: 'a'.repeat(64), is_complete: 1, is_present: 1, updated_at: '2026-01-01', search_text: 'اختبار' }],
    chapters: [],
    verses: [{ poem_id: 'demo', id: 'stable-1', number: 1, first_hemistich: 'أ', second_hemistich: 'ب', text: 'أ\nب', text_hash: 'hash', chapter_id: null, search_text: 'أ ب', is_present: 1 }],
    recordings: [{ id: recordingId, poem_id: 'demo', verse_id: 'stable-1', file_path: backupPath, mime_type: 'audio/mp4', codec: 'AAC', size_bytes: 20, duration_ms: 1000, created_at: '2026-01-01', verse_text_hash: 'hash', is_current: 1, is_archived: 0, text_changed: 0 }],
    progress: [{ poem_id: 'demo', verse_id: 'stable-1', status: 'mastered', memorized_at: '2026-01-01', last_reviewed_at: '2026-01-02', review_count: 5, review_due_at: '2026-02-01' }],
    playlists: [{ id: 'list', name: 'مراجعة', poem_id: 'demo', verse_ids: '["stable-1"]', settings: '{}', created_at: '2026-01-01', updated_at: '2026-01-01' }],
    review_events: [], settings: [], playback_positions: []
  };
}

describe('backup restore', () => {
  let db: TestDatabase;
  beforeEach(async () => { db = new TestDatabase(); await db.init(); vi.clearAllMocks(); });

  it('restores a fresh database with audio at a new path and remains idempotent', async () => {
    const data = snapshot('recording-1', 'recordings/old.m4a');
    vi.mocked(NativeBackup.restoreBackup).mockResolvedValue({ snapshot: data, backupId: 'backup-1', files: [{ originalPath: 'recordings/old.m4a', restoredPath: 'restored/one.m4a' }] });
    const service = new BackupService(db as never);
    expect(await service.restore('content://backup')).toEqual({ restored: true, recordings: 1 });
    const recordings = await db.query<{ file_path: string; is_current: number }>('SELECT * FROM recordings');
    expect(recordings[0].file_path).toBe('restored/one.m4a');
    expect(recordings[0].is_current).toBe(1);
    expect((await db.query('SELECT * FROM progress'))[0]).toMatchObject({ status: 'mastered', review_count: 5 });
    expect(await db.query('SELECT * FROM playlists')).toHaveLength(1);
    expect(await service.restore('content://backup')).toEqual({ restored: false, recordings: 0 });
    expect(await db.query('SELECT * FROM recordings')).toHaveLength(1);
  });

  it('does not replace an existing current recording on conflict', async () => {
    const first = snapshot('recording-1', 'recordings/one.m4a');
    const second = snapshot('recording-2', 'recordings/two.m4a');
    vi.mocked(NativeBackup.restoreBackup)
      .mockResolvedValueOnce({ snapshot: first, backupId: 'backup-1', files: [{ originalPath: 'recordings/one.m4a', restoredPath: 'restored/one.m4a' }] })
      .mockResolvedValueOnce({ snapshot: second, backupId: 'backup-2', files: [{ originalPath: 'recordings/two.m4a', restoredPath: 'restored/two.m4a' }] });
    const service = new BackupService(db as never);
    await service.restore('content://one');
    await service.restore('content://two');
    const rows = await db.query<{ id: string; is_current: number }>('SELECT id,is_current FROM recordings ORDER BY id');
    expect(rows).toEqual([{ id: 'recording-1', is_current: 1 }, { id: 'recording-2', is_current: 0 }]);
  });
});
