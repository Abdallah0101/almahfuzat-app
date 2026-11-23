export interface PoemSource {
  name: string;
  url?: string;
  notes?: string;
}

export interface Chapter {
  id: string;
  title: string;
  number?: number;
}

export interface Verse {
  id: string;
  number: number;
  first_hemistich: string;
  second_hemistich: string;
  text: string;
  chapter_id?: string;
  is_present?: boolean;
}

export interface Poem {
  schema_version: 1;
  id: string;
  title: string;
  author: string;
  description?: string;
  science: string;
  source: PoemSource;
  is_complete: boolean;
  revision: number;
  chapters: Chapter[];
  verses: Verse[];
}

export interface ManifestEntry {
  id: string;
  title: string;
  author: string;
  science: string;
  verse_count: number;
  path: string;
  revision: number;
  sha256: string;
  is_complete: boolean;
}

export interface Manifest {
  schema_version: 1;
  catalog_version: number;
  updated_at: string;
  poems: ManifestEntry[];
}

export type MemoryStatus = 'not_started' | 'learning' | 'memorized' | 'needs_review' | 'mastered';

export interface Progress {
  poem_id: string;
  verse_id: string;
  status: MemoryStatus;
  memorized_at?: string;
  last_reviewed_at?: string;
  review_count: number;
  review_due_at?: string;
}

export interface Recording {
  id: string;
  poem_id: string;
  verse_id: string;
  file_path: string;
  mime_type: string;
  codec: string;
  size_bytes: number;
  duration_ms: number;
  created_at: string;
  verse_text_hash: string;
  is_current: boolean;
  is_archived: boolean;
  text_changed: boolean;
}

export interface VerseView extends Verse {
  recording?: Recording;
  progress: Progress;
}

export interface LibraryItem {
  poem: Poem;
  memorized_count: number;
  recorded_count: number;
  progress_percent: number;
}

export interface PlaybackSettings {
  verseRepeats: number;
  groupRepeats: number;
  gapSeconds: 0 | 1 | 3 | 5;
  speed: number;
}

export interface PlaybackQueueItem {
  poemId: string;
  verseId: string;
  poemTitle: string;
  verseNumber: number;
  relativePath: string;
}

export interface PlaybackState {
  playing: boolean;
  ended: boolean;
  poemId?: string;
  verseId?: string;
  title?: string;
  verseNumber?: number;
  positionMs: number;
  durationMs: number;
  speed: number;
  currentIndex: number;
  itemCount: number;
  error?: string;
}

export interface Playlist {
  id: string;
  name: string;
  poem_id: string;
  verse_ids: string[];
  settings: PlaybackSettings;
  created_at: string;
  updated_at: string;
}

export interface ExportOptions extends PlaybackSettings {
  outputName: string;
}

export interface BackupSnapshot {
  backup_schema_version: 1;
  app_schema_version: number;
  created_at: string;
  device_id: string;
  poems: unknown[];
  chapters: unknown[];
  verses: unknown[];
  recordings: unknown[];
  progress: unknown[];
  playlists: unknown[];
  review_events: unknown[];
  settings: unknown[];
  playback_positions: unknown[];
}
