import { describe, expect, it } from 'vitest';
import { PlayerService } from '../src/app/core/audio/player.service';
import { VerseView } from '../src/app/core/models';

function verse(number: number, recorded: boolean): VerseView {
  return {
    id: `stable-${number}`, number, first_hemistich: 'أ', second_hemistich: 'ب', text: 'أ\nب',
    progress: { poem_id: 'poem', verse_id: `stable-${number}`, status: 'not_started', review_count: 0 },
    recording: recorded ? { id: `rec-${number}`, poem_id: 'poem', verse_id: `stable-${number}`,
      file_path: `recordings/${number}.m4a`, mime_type: 'audio/mp4', codec: 'AAC', size_bytes: 10,
      duration_ms: 1000, created_at: '', verse_text_hash: '', is_current: true, is_archived: false, text_changed: false
    } : undefined
  };
}

describe('playlist construction', () => {
  it('keeps verse order and reports missing recordings', () => {
    const player = Object.create(PlayerService.prototype) as PlayerService;
    const result = player.queueFromVerses([verse(3, true), verse(4, false), verse(5, true)], 'اختبار');
    expect(result.items.map((item) => item.verseId)).toEqual(['stable-3', 'stable-5']);
    expect(result.missing).toEqual([4]);
    expect(result.items[0].relativePath).toContain('3.m4a');
  });
});
