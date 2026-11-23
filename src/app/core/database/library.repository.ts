import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';
import { LibraryItem, MemoryStatus, PlaybackSettings, Playlist, Poem, Progress, Recording, VerseView } from '../models';
import { newId } from '../text.utils';

interface RecordingRow {
  id: string; poem_id: string; verse_id: string; file_path: string; mime_type: string; codec: string;
  size_bytes: number; duration_ms: number; created_at: string; verse_text_hash: string;
  is_current: number; is_archived: number; text_changed: number;
}

interface VerseRow {
  poem_id: string; id: string; number: number; first_hemistich: string; second_hemistich: string;
  text: string; chapter_id?: string; status?: MemoryStatus; memorized_at?: string;
  last_reviewed_at?: string; review_count?: number; review_due_at?: string;
  recording_id?: string; file_path?: string; mime_type?: string; codec?: string; size_bytes?: number;
  duration_ms?: number; recording_created_at?: string; verse_text_hash?: string;
  is_archived?: number; text_changed?: number;
}

const defaultProgress = (poemId: string, verseId: string): Progress => ({
  poem_id: poemId, verse_id: verseId, status: 'not_started', review_count: 0
});

@Injectable({ providedIn: 'root' })
export class LibraryRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(search = '', science = '', sort: 'title' | 'revision' = 'title'): Promise<LibraryItem[]> {
    const conditions = ['p.is_present = 1'];
    const values: unknown[] = [];
    if (search) { conditions.push('p.search_text LIKE ?'); values.push(`%${search}%`); }
    if (science) { conditions.push('p.science = ?'); values.push(science); }
    values.push(sort === 'title' ? 0 : 1);
    const rows = await this.db.query<{
      payload: string; verse_count: number; memorized_count: number; recorded_count: number;
    }>(`SELECT p.payload,
        (SELECT COUNT(*) FROM verses v WHERE v.poem_id=p.id AND v.is_present=1) AS verse_count,
        (SELECT COUNT(*) FROM progress pr JOIN verses v ON v.poem_id=pr.poem_id AND v.id=pr.verse_id
          WHERE pr.poem_id=p.id AND v.is_present=1 AND pr.status IN ('memorized','mastered')) AS memorized_count,
        (SELECT COUNT(*) FROM recordings r JOIN verses v ON v.poem_id=r.poem_id AND v.id=r.verse_id
          WHERE r.poem_id=p.id AND r.is_current=1 AND r.is_archived=0 AND v.is_present=1) AS recorded_count
        FROM poems p WHERE ${conditions.join(' AND ')}
        ORDER BY CASE WHEN ? = 0 THEN p.title END COLLATE NOCASE ASC,
                 CASE WHEN ? = 1 THEN p.revision END DESC`, [...values, ...values.slice(-1)]);
    return rows.map((row) => ({
      poem: JSON.parse(row.payload) as Poem,
      memorized_count: row.memorized_count,
      recorded_count: row.recorded_count,
      progress_percent: row.verse_count ? Math.round(row.memorized_count * 100 / row.verse_count) : 0
    }));
  }

  async sciences(): Promise<string[]> {
    const rows = await this.db.query<{ science: string }>('SELECT DISTINCT science FROM poems WHERE is_present=1 ORDER BY science');
    return rows.map((row) => row.science);
  }

  async poem(id: string): Promise<Poem | undefined> {
    const rows = await this.db.query<{ payload: string }>('SELECT payload FROM poems WHERE id=? AND is_present=1', [id]);
    return rows.length ? JSON.parse(rows[0].payload) as Poem : undefined;
  }

  async verses(poemId: string): Promise<VerseView[]> {
    const rows = await this.db.query<VerseRow>(`SELECT v.*, p.status, p.memorized_at, p.last_reviewed_at,
      p.review_count, p.review_due_at, r.id AS recording_id, r.file_path, r.mime_type, r.codec,
      r.size_bytes, r.duration_ms, r.created_at AS recording_created_at, r.verse_text_hash,
      r.is_archived, r.text_changed
      FROM verses v
      LEFT JOIN progress p ON p.poem_id=v.poem_id AND p.verse_id=v.id
      LEFT JOIN recordings r ON r.poem_id=v.poem_id AND r.verse_id=v.id AND r.is_current=1
      WHERE v.poem_id=? AND v.is_present=1 ORDER BY v.number`, [poemId]);
    return rows.map((row) => this.verseView(row));
  }

  async verse(poemId: string, verseId: string): Promise<VerseView | undefined> {
    const verses = await this.verses(poemId);
    return verses.find((verse) => verse.id === verseId);
  }

  async recordings(poemId: string, verseIds: string[]): Promise<Recording[]> {
    if (!verseIds.length) return [];
    const placeholders = verseIds.map(() => '?').join(',');
    const rows = await this.db.query<RecordingRow>(
      `SELECT * FROM recordings WHERE poem_id=? AND verse_id IN (${placeholders}) AND is_current=1 AND is_archived=0`,
      [poemId, ...verseIds]
    );
    return rows.map((row) => this.recording(row));
  }

  async saveRecording(recording: Recording, keepAttempts = true): Promise<Recording | undefined> {
    // القراءة قبل الدفعة الذرية؛ التحديث والإدراج معًا في executeSet(transaction=true)
    const previous = await this.currentRecording(recording.poem_id, recording.verse_id);
    const demote = {
      statement: 'UPDATE recordings SET is_current=0 WHERE poem_id=? AND verse_id=? AND is_current=1',
      values: [recording.poem_id, recording.verse_id],
    };
    const purge = {
      statement: 'DELETE FROM recordings WHERE poem_id=? AND verse_id=?',
      values: [recording.poem_id, recording.verse_id],
    };
    const insert = {
      statement: `INSERT INTO recordings(id,poem_id,verse_id,file_path,mime_type,codec,size_bytes,duration_ms,
        created_at,verse_text_hash,is_current,is_archived,text_changed) VALUES(?,?,?,?,?,?,?,?,?,?,1,0,0)`,
      values: [recording.id, recording.poem_id, recording.verse_id, recording.file_path, recording.mime_type,
        recording.codec, recording.size_bytes, recording.duration_ms, recording.created_at, recording.verse_text_hash],
    };
    await this.db.executeSet(keepAttempts ? [demote, insert] : [purge, insert], true);
    return previous;
  }

  async currentRecording(poemId: string, verseId: string): Promise<Recording | undefined> {
    const rows = await this.db.query<RecordingRow>(
      'SELECT * FROM recordings WHERE poem_id=? AND verse_id=? AND is_current=1', [poemId, verseId]
    );
    return rows.length ? this.recording(rows[0]) : undefined;
  }

  async recordingHistory(poemId: string, verseId: string): Promise<Recording[]> {
    const rows = await this.db.query<RecordingRow>(
      'SELECT * FROM recordings WHERE poem_id=? AND verse_id=? ORDER BY created_at DESC', [poemId, verseId]
    );
    return rows.map((row) => this.recording(row));
  }

  async setProgress(poemId: string, verseId: string, status: MemoryStatus): Promise<void> {
    const old = await this.progress(poemId, verseId);
    const now = new Date().toISOString();
    const memorizedAt = ['memorized', 'mastered'].includes(status) ? (old.memorized_at ?? now) : old.memorized_at;
    const dueDays = status === 'needs_review' ? 0 : status === 'mastered' ? 7 : status === 'memorized' ? 3 : status === 'learning' ? 1 : null;
    const due = dueDays === null ? null : new Date(Date.now() + dueDays * 86400000).toISOString();
    await this.db.run(`INSERT INTO progress(poem_id,verse_id,status,memorized_at,last_reviewed_at,review_count,review_due_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(poem_id,verse_id) DO UPDATE SET status=excluded.status,
      memorized_at=excluded.memorized_at,last_reviewed_at=excluded.last_reviewed_at,
      review_count=excluded.review_count,review_due_at=excluded.review_due_at`,
      [poemId, verseId, status, memorizedAt, old.last_reviewed_at ?? null, old.review_count, due]);
  }

  async review(poemId: string, verseId: string, remembered: boolean): Promise<void> {
    const old = await this.progress(poemId, verseId);
    const now = new Date();
    const count = old.review_count + 1;
    const status: MemoryStatus = !remembered ? 'needs_review' : old.status === 'mastered' || count >= 4 ? 'mastered' : 'memorized';
    const days = remembered ? Math.min(60, Math.max(3, count * 3)) : 0;
    await this.db.transaction(async () => {
      await this.db.run(`INSERT INTO progress(poem_id,verse_id,status,memorized_at,last_reviewed_at,review_count,review_due_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(poem_id,verse_id) DO UPDATE SET status=excluded.status,
        memorized_at=excluded.memorized_at,last_reviewed_at=excluded.last_reviewed_at,
        review_count=excluded.review_count,review_due_at=excluded.review_due_at`,
        [poemId, verseId, status, old.memorized_at ?? now.toISOString(), now.toISOString(), count,
          new Date(now.getTime() + days * 86400000).toISOString()]);
      await this.db.run('INSERT INTO review_events(id,poem_id,verse_id,reviewed_at,result) VALUES(?,?,?,?,?)',
        [newId('review'), poemId, verseId, now.toISOString(), remembered ? 'remembered' : 'forgotten']);
    });
  }

  async progress(poemId: string, verseId: string): Promise<Progress> {
    const rows = await this.db.query<Progress>('SELECT * FROM progress WHERE poem_id=? AND verse_id=?', [poemId, verseId]);
    return rows[0] ?? defaultProgress(poemId, verseId);
  }

  async reviewToday(): Promise<VerseView[]> {
    const rows = await this.db.query<{ poem_id: string; verse_id: string }>(`SELECT p.poem_id,p.verse_id FROM progress p
      JOIN verses v ON v.poem_id=p.poem_id AND v.id=p.verse_id AND v.is_present=1
      WHERE p.status='needs_review' OR (p.review_due_at IS NOT NULL AND p.review_due_at<=?)
      ORDER BY p.review_due_at LIMIT 200`, [new Date().toISOString()]);
    const result = await Promise.all(rows.map((row) => this.verse(row.poem_id, row.verse_id)));
    return result.filter((verse): verse is VerseView => !!verse);
  }

  async todayCounts(): Promise<{ reviews: number; memorized: number }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const reviews = await this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM review_events WHERE reviewed_at>=?', [start.toISOString()]);
    const memorized = await this.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM progress WHERE memorized_at>=? AND status IN ('memorized','mastered')", [start.toISOString()]);
    return { reviews: reviews[0]?.count ?? 0, memorized: memorized[0]?.count ?? 0 };
  }

  async savePlaylist(name: string, poemId: string, verseIds: string[], settings: PlaybackSettings, id?: string): Promise<string> {
    const now = new Date().toISOString();
    const playlistId = id ?? newId('playlist');
    const old = id ? await this.playlist(id) : undefined;
    await this.db.run(`INSERT INTO playlists(id,name,poem_id,verse_ids,settings,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,poem_id=excluded.poem_id,verse_ids=excluded.verse_ids,
      settings=excluded.settings,updated_at=excluded.updated_at`,
      [playlistId, name, poemId, JSON.stringify(verseIds), JSON.stringify(settings), old?.created_at ?? now, now]);
    return playlistId;
  }

  async playlists(): Promise<Playlist[]> {
    const rows = await this.db.query<Playlist & { verse_ids: string; settings: string }>('SELECT * FROM playlists ORDER BY updated_at DESC');
    return rows.map((row) => ({ ...row, verse_ids: JSON.parse(row.verse_ids), settings: JSON.parse(row.settings) }));
  }

  async playlist(id: string): Promise<Playlist | undefined> {
    return (await this.playlists()).find((playlist) => playlist.id === id);
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.db.run('DELETE FROM playlists WHERE id=?', [id]);
  }

  private verseView(row: VerseRow): VerseView {
    return {
      id: row.id, number: row.number, first_hemistich: row.first_hemistich,
      second_hemistich: row.second_hemistich, text: row.text, chapter_id: row.chapter_id, is_present: true,
      progress: {
        poem_id: row.poem_id, verse_id: row.id, status: row.status ?? 'not_started',
        memorized_at: row.memorized_at, last_reviewed_at: row.last_reviewed_at,
        review_count: row.review_count ?? 0, review_due_at: row.review_due_at
      },
      recording: row.recording_id ? {
        id: row.recording_id, poem_id: row.poem_id, verse_id: row.id, file_path: row.file_path!,
        mime_type: row.mime_type!, codec: row.codec!, size_bytes: row.size_bytes!, duration_ms: row.duration_ms!,
        created_at: row.recording_created_at!, verse_text_hash: row.verse_text_hash!, is_current: true,
        is_archived: row.is_archived === 1, text_changed: row.text_changed === 1
      } : undefined
    };
  }

  private recording(row: RecordingRow): Recording {
    return { ...row, is_current: row.is_current === 1, is_archived: row.is_archived === 1, text_changed: row.text_changed === 1 };
  }
}
