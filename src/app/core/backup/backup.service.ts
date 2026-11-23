import { Injectable } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DatabaseService } from '../database/database.service';
import { BackupSnapshot, MemoryStatus, Progress } from '../models';
import { newId } from '../text.utils';
import { BackupFileResult, NativeBackup } from './native-backup';

const tables = ['poems', 'chapters', 'verses', 'recordings', 'progress', 'playlists', 'review_events', 'settings', 'playback_positions'] as const;
type Table = typeof tables[number];
type Row = Record<string, unknown>;

const columns: Record<Table, string[]> = {
  poems: ['id', 'payload', 'title', 'author', 'science', 'revision', 'sha256', 'is_complete', 'is_present', 'updated_at', 'search_text'],
  chapters: ['poem_id', 'id', 'title', 'number'],
  verses: ['poem_id', 'id', 'number', 'first_hemistich', 'second_hemistich', 'text', 'text_hash', 'chapter_id', 'search_text', 'is_present'],
  recordings: ['id', 'poem_id', 'verse_id', 'file_path', 'mime_type', 'codec', 'size_bytes', 'duration_ms', 'created_at', 'verse_text_hash', 'is_current', 'is_archived', 'text_changed'],
  progress: ['poem_id', 'verse_id', 'status', 'memorized_at', 'last_reviewed_at', 'review_count', 'review_due_at'],
  playlists: ['id', 'name', 'poem_id', 'verse_ids', 'settings', 'created_at', 'updated_at'],
  review_events: ['id', 'poem_id', 'verse_id', 'reviewed_at', 'result'],
  settings: ['key', 'value'],
  playback_positions: ['queue_key', 'poem_id', 'verse_id', 'position_ms', 'updated_at']
};

@Injectable({ providedIn: 'root' })
export class BackupService {
  constructor(private readonly db: DatabaseService) {}

  async create(): Promise<BackupFileResult> {
    let deviceId = await this.db.getSetting<string | undefined>('device_id', undefined);
    if (!deviceId) {
      deviceId = newId('device');
      await this.db.setSetting('device_id', deviceId);
    }
    const snapshot = { backup_schema_version: 1, app_schema_version: 1, created_at: new Date().toISOString(), device_id: deviceId } as BackupSnapshot;
    await this.db.transaction(async () => {
      for (const table of tables) {
        (snapshot as unknown as Row)[table] = await this.db.query<Row>(`SELECT * FROM ${table}`);
      }
    });
    const date = snapshot.created_at.slice(0, 10);
    return NativeBackup.createBackup({ snapshot, outputName: `mahfuzat-backup-${date}.zip` });
  }

  async share(result: BackupFileResult): Promise<void> {
    await Share.share({ title: 'نسخة المحفوظات الاحتياطية', files: [result.url] });
  }

  async restore(uri: string): Promise<{ restored: boolean; recordings: number }> {
    const result = await NativeBackup.restoreBackup({ uri });
    const restoredBackups = await this.db.getSetting<string[]>('restored_backups', []);
    if (restoredBackups.includes(result.backupId)) {
      await Promise.all(result.files.map((file) => Filesystem.deleteFile({ path: file.restoredPath, directory: Directory.Data }).catch(() => undefined)));
      return { restored: false, recordings: 0 };
    }
    const pathMap = new Map(result.files.map((file) => [file.originalPath, file.restoredPath]));
    let recordingCount = 0;
    await this.db.transaction(async () => {
      for (const row of result.snapshot.poems as Row[]) await this.insert('poems', row, 'NOTHING');
      for (const row of result.snapshot.chapters as Row[]) await this.insert('chapters', row, 'NOTHING');
      for (const row of result.snapshot.verses as Row[]) await this.insert('verses', row, 'NOTHING');
      for (const row of result.snapshot.progress as Row[]) await this.mergeProgress(row);
      for (const row of result.snapshot.review_events as Row[]) await this.insert('review_events', row, 'NOTHING');
      for (const row of result.snapshot.playlists as Row[]) await this.insert('playlists', row, 'NOTHING');
      for (const row of result.snapshot.settings as Row[]) {
        if (row['key'] !== 'restored_backups') await this.insert('settings', row, 'NOTHING');
      }
      for (const row of result.snapshot.playback_positions as Row[]) await this.insert('playback_positions', row, 'NOTHING');
      for (const source of result.snapshot.recordings as Row[]) {
        const row: Row = { ...source, file_path: pathMap.get(String(source['file_path'])) };
        if (!row['file_path']) throw new Error('ملف صوتي مفقود من النسخة الاحتياطية.');
        const existing = await this.db.query('SELECT id FROM recordings WHERE id=?', [row['id']]);
        if (existing.length) continue;
        if (row['is_current'] === 1) {
          const current = await this.db.query('SELECT id FROM recordings WHERE poem_id=? AND verse_id=? AND is_current=1', [row['poem_id'], row['verse_id']]);
          if (current.length) row['is_current'] = 0;
        }
        await this.insert('recordings', row, 'NOTHING');
        recordingCount++;
      }
      await this.db.run(`UPDATE recordings SET
        is_archived=COALESCE((SELECT CASE WHEN v.is_present=1 THEN 0 ELSE 1 END FROM verses v
          WHERE v.poem_id=recordings.poem_id AND v.id=recordings.verse_id),1),
        text_changed=COALESCE((SELECT CASE WHEN v.text_hash=recordings.verse_text_hash THEN 0 ELSE 1 END FROM verses v
          WHERE v.poem_id=recordings.poem_id AND v.id=recordings.verse_id),0)`);
      await this.db.setSetting('restored_backups', [...restoredBackups, result.backupId]);
    });
    return { restored: true, recordings: recordingCount };
  }

  private async mergeProgress(row: Row): Promise<void> {
    const existing = await this.db.query<Progress>('SELECT * FROM progress WHERE poem_id=? AND verse_id=?', [row['poem_id'], row['verse_id']]);
    if (!existing.length) { await this.insert('progress', row, 'NOTHING'); return; }
    const current = existing[0];
    const incoming = row as unknown as Progress;
    const rank: Record<MemoryStatus, number> = { not_started: 0, learning: 1, needs_review: 2, memorized: 3, mastered: 4 };
    const incomingNewer = (incoming.last_reviewed_at ?? '') > (current.last_reviewed_at ?? '');
    const merged: Progress = {
      poem_id: current.poem_id, verse_id: current.verse_id,
      status: rank[incoming.status] > rank[current.status] || incomingNewer ? incoming.status : current.status,
      memorized_at: current.memorized_at ?? incoming.memorized_at,
      last_reviewed_at: incomingNewer ? incoming.last_reviewed_at : current.last_reviewed_at,
      review_count: Math.max(current.review_count, incoming.review_count),
      review_due_at: incomingNewer ? incoming.review_due_at : current.review_due_at
    };
    await this.db.run(`UPDATE progress SET status=?,memorized_at=?,last_reviewed_at=?,review_count=?,review_due_at=?
      WHERE poem_id=? AND verse_id=?`, [merged.status, merged.memorized_at ?? null, merged.last_reviewed_at ?? null,
      merged.review_count, merged.review_due_at ?? null, merged.poem_id, merged.verse_id]);
  }

  private async insert(table: Table, row: Row, conflict: 'NOTHING'): Promise<void> {
    if (!row || typeof row !== 'object') throw new Error(`صف غير صالح في ${table}`);
    const names = columns[table];
    const values = names.map((name) => {
      const value = row[name];
      if (value !== null && !['string', 'number', 'undefined'].includes(typeof value)) throw new Error(`قيمة غير صالحة في ${table}.${name}`);
      return value ?? null;
    });
    await this.db.run(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(() => '?').join(',')}) ON CONFLICT DO ${conflict}`, values);
  }
}
