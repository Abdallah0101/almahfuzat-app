import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingService } from '../src/app/core/audio/recording.service';
import { NativeAudio } from '../src/app/core/audio/native-audio';
import { VerseView } from '../src/app/core/models';

vi.mock('../src/app/core/audio/native-audio', () => ({
  NativeAudio: { requestPermissions: vi.fn(), startRecording: vi.fn() }
}));

const verse: VerseView = {
  id: 'verse-1', number: 1, first_hemistich: 'أ', second_hemistich: 'ب', text: 'أ\nب',
  progress: { poem_id: 'poem-1', verse_id: 'verse-1', status: 'not_started', review_count: 0 }
};

describe('recording permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NativeAudio.requestPermissions).mockResolvedValue({ microphone: 'granted' });
    vi.mocked(NativeAudio.startRecording).mockResolvedValue(undefined);
  });

  it('requests only the microphone without requiring legacy storage access', async () => {
    const service = new RecordingService({} as never);
    await service.start(verse);
    expect(NativeAudio.requestPermissions).toHaveBeenCalledWith({ permissions: ['microphone'] });
    expect(NativeAudio.startRecording).toHaveBeenCalledOnce();
    expect(service.session.value?.recording).toBe(true);
  });
});
