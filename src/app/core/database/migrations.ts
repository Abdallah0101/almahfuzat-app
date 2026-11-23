export const DATABASE_VERSION = 1;

export const migrations: Record<number, string[]> = {
  1: [`
    CREATE TABLE IF NOT EXISTS poems (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      science TEXT NOT NULL,
      revision INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      is_complete INTEGER NOT NULL,
      is_present INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      search_text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapters (
      poem_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      number INTEGER,
      PRIMARY KEY (poem_id, id)
    );
    CREATE TABLE IF NOT EXISTS verses (
      poem_id TEXT NOT NULL,
      id TEXT NOT NULL,
      number INTEGER NOT NULL,
      first_hemistich TEXT NOT NULL,
      second_hemistich TEXT NOT NULL,
      text TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      chapter_id TEXT,
      search_text TEXT NOT NULL,
      is_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (poem_id, id),
      UNIQUE (poem_id, number)
    );
    CREATE INDEX IF NOT EXISTS verses_order ON verses(poem_id, is_present, number);
    CREATE INDEX IF NOT EXISTS verses_search ON verses(poem_id, search_text);
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      poem_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      codec TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      verse_text_hash TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 1,
      is_archived INTEGER NOT NULL DEFAULT 0,
      text_changed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS recordings_verse ON recordings(poem_id, verse_id, is_current, is_archived);
    CREATE UNIQUE INDEX IF NOT EXISTS one_current_recording ON recordings(poem_id, verse_id) WHERE is_current = 1;
    CREATE TABLE IF NOT EXISTS progress (
      poem_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','learning','memorized','needs_review','mastered')),
      memorized_at TEXT,
      last_reviewed_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0,
      review_due_at TEXT,
      PRIMARY KEY (poem_id, verse_id)
    );
    CREATE INDEX IF NOT EXISTS progress_due ON progress(review_due_at, status);
    CREATE TABLE IF NOT EXISTS review_events (
      id TEXT PRIMARY KEY,
      poem_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      result TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_events_date ON review_events(reviewed_at);
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      poem_id TEXT NOT NULL,
      verse_ids TEXT NOT NULL,
      settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playback_positions (
      queue_key TEXT NOT NULL,
      poem_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      position_ms INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (queue_key)
    );
  `]
};
