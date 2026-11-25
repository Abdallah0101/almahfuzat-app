import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Clipboard } from '@capacitor/clipboard';
import { BehaviorSubject } from 'rxjs';
import { PoemPage } from '../src/app/pages/poem.page';
import { PlayerService } from '../src/app/core/audio/player.service';
import { NativeAudio } from '../src/app/core/audio/native-audio';
import { PlaybackState, VerseView } from '../src/app/core/models';

vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: vi.fn() } }));
vi.mock('../src/app/core/audio/native-audio', () => ({ NativeAudio: { stop: vi.fn() } }));

const verse: VerseView = {
  id: 'verse-1', number: 7, first_hemistich: 'الشطر الأول', second_hemistich: 'الشطر الثاني',
  text: 'الشطر الأول\nالشطر الثاني',
  progress: { poem_id: 'poem-1', verse_id: 'verse-1', status: 'not_started', review_count: 0 }
};

describe('verse tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('copies the complete verse including both hemistichs', async () => {
    vi.mocked(Clipboard.write).mockResolvedValue(undefined);
    const toast = { present: vi.fn().mockResolvedValue(undefined) };
    const page = Object.create(PoemPage.prototype) as PoemPage;
    Object.assign(page, { toasts: { create: vi.fn().mockResolvedValue(toast) } });
    await page.copyVerse(verse);
    expect(Clipboard.write).toHaveBeenCalledWith({ string: 'الشطر الأول\nالشطر الثاني' });
    expect(toast.present).toHaveBeenCalledOnce();
  });

  it('clears the player immediately when playback is stopped', async () => {
    vi.mocked(NativeAudio.stop).mockResolvedValue(undefined);
    const player = Object.create(PlayerService.prototype) as PlayerService;
    const state: PlaybackState = {
      playing: true, ended: false, positionMs: 1000, durationMs: 5000, speed: 1, currentIndex: 0, itemCount: 1
    };
    Object.assign(player, { state: new BehaviorSubject(state), currentItems: [{}], currentSettings: {} });
    await player.stop();
    expect(player.state.value.itemCount).toBe(0);
    expect(player.state.value.playing).toBe(false);
  });
});
