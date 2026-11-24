import { registerPlugin } from '@capacitor/core';
import { ExportOptions, PlaybackQueueItem, PlaybackSettings, PlaybackState } from '../models';

export interface RecordingResult {
  relativePath: string;
  mimeType: string;
  codec: string;
  sizeBytes: number;
  durationMs: number;
}

export interface ExportResult {
  path: string;
  url: string;
  publicPath: string;
  sizeBytes: number;
  durationMs: number;
}

export interface MahfuzatAudioPlugin {
  checkPermissions(): Promise<{ microphone: 'granted' | 'denied' | 'prompt' }>;
  requestPermissions(options?: { permissions: string[] }): Promise<{ microphone: 'granted' | 'denied' | 'prompt' }>;
  requestNotifications(): Promise<void>;
  startRecording(options: { relativePath: string }): Promise<void>;
  stopRecording(): Promise<RecordingResult>;
  cancelRecording(options: { relativePath: string }): Promise<void>;
  playQueue(options: PlaybackSettings & { items: PlaybackQueueItem[]; startIndex?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(options: { positionMs: number }): Promise<void>;
  setSpeed(options: { speed: number }): Promise<void>;
  getPlaybackState(): Promise<PlaybackState>;
  exportWav(options: ExportOptions & { items: PlaybackQueueItem[] }): Promise<ExportResult>;
  shareExport(options: { url: string; title: string; dialogTitle: string }): Promise<void>;
  addListener(event: 'playbackState', callback: (state: PlaybackState) => void): Promise<{ remove(): Promise<void> }>;
  addListener(event: 'exportProgress', callback: (progress: { percent: number; processedItems: number; totalItems: number }) => void): Promise<{ remove(): Promise<void> }>;
}

export const NativeAudio = registerPlugin<MahfuzatAudioPlugin>('MahfuzatAudio');
