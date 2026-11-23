import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DatabaseService } from '../database/database.service';
import { PlaybackQueueItem, PlaybackSettings, PlaybackState, VerseView } from '../models';
import { NativeAudio } from './native-audio';

const emptyState: PlaybackState = {
  playing: false, ended: false, positionMs: 0, durationMs: 0, speed: 1, currentIndex: 0, itemCount: 0
};

@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly state = new BehaviorSubject<PlaybackState>(emptyState);
  private lastSaved = 0;
  private currentItems: PlaybackQueueItem[] = [];
  private currentSettings?: PlaybackSettings;

  constructor(private readonly db: DatabaseService) {
    void NativeAudio.addListener('playbackState', (state) => {
      this.state.next(state);
      if (!state.playing || Date.now() - this.lastSaved > 5000) void this.rememberPosition(state).catch(() => undefined);
    }).catch(() => undefined);
    void NativeAudio.getPlaybackState().then((state) => this.state.next(state)).catch(() => undefined);
  }

  queueFromVerses(verses: VerseView[], poemTitle: string): { items: PlaybackQueueItem[]; missing: number[] } {
    const items: PlaybackQueueItem[] = [];
    const missing: number[] = [];
    for (const verse of verses) {
      if (!verse.recording || verse.recording.is_archived) {
        missing.push(verse.number);
        continue;
      }
      items.push({
        poemId: verse.progress.poem_id, verseId: verse.id, poemTitle,
        verseNumber: verse.number, relativePath: verse.recording.file_path
      });
    }
    return { items, missing };
  }

  async play(items: PlaybackQueueItem[], settings: PlaybackSettings, startIndex = 0): Promise<void> {
    if (!items.length) throw new Error('لا توجد تسجيلات صالحة للتشغيل.');
    this.currentItems = items;
    this.currentSettings = settings;
    await NativeAudio.requestNotifications();
    await NativeAudio.playQueue({ items, ...settings, startIndex });
    await this.db.setSetting('last_playback', { items, settings, startIndex });
  }

  async playVerse(verse: VerseView, poemTitle: string): Promise<void> {
    const { items } = this.queueFromVerses([verse], poemTitle);
    await this.play(items, { verseRepeats: 1, groupRepeats: 1, gapSeconds: 0, speed: this.state.value.speed });
  }

  async pause(): Promise<void> { await NativeAudio.pause(); }
  async resume(): Promise<void> { await NativeAudio.resume(); }
  async stop(): Promise<void> { await NativeAudio.stop(); }
  async next(): Promise<void> { await NativeAudio.next(); }
  async previous(): Promise<void> { await NativeAudio.previous(); }
  async seek(positionMs: number): Promise<void> { await NativeAudio.seekTo({ positionMs }); }
  async setSpeed(speed: number): Promise<void> {
    await NativeAudio.setSpeed({ speed });
    if (this.currentSettings) this.currentSettings.speed = speed;
  }

  async resumeLast(): Promise<boolean> {
    const last = await this.db.getSetting<{ items: PlaybackQueueItem[]; settings: PlaybackSettings; startIndex: number } | undefined>('last_playback', undefined);
    if (!last?.items.length) return false;
    const position = await this.db.getSetting<{ currentIndex: number; positionMs: number } | undefined>('last_position', undefined);
    const index = Math.min(position?.currentIndex ?? last.startIndex, last.items.length - 1);
    await this.play(last.items, last.settings, index);
    if (position?.positionMs) await NativeAudio.seekTo({ positionMs: position.positionMs });
    return true;
  }

  private async rememberPosition(state: PlaybackState): Promise<void> {
    this.lastSaved = Date.now();
    if (!state.verseId || !state.poemId) return;
    await this.db.setSetting('last_position', {
      poemId: state.poemId, verseId: state.verseId, positionMs: state.positionMs,
      currentIndex: state.currentIndex, updatedAt: new Date().toISOString()
    });
    if (this.currentItems.length) {
      await this.db.run(`INSERT INTO playback_positions(queue_key,poem_id,verse_id,position_ms,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(queue_key) DO UPDATE SET poem_id=excluded.poem_id,verse_id=excluded.verse_id,
        position_ms=excluded.position_ms,updated_at=excluded.updated_at`,
        ['last', state.poemId, state.verseId, Math.round(state.positionMs), new Date().toISOString()]);
    }
  }
}
