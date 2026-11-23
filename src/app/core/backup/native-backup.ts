import { registerPlugin } from '@capacitor/core';
import { BackupSnapshot } from '../models';

export interface BackupFileResult {
  path: string;
  url: string;
  sizeBytes: number;
}

export interface RestoreResult {
  snapshot: BackupSnapshot;
  backupId: string;
  files: { originalPath: string; restoredPath: string }[];
}

interface BackupPlugin {
  createBackup(options: { snapshot: BackupSnapshot; outputName: string }): Promise<BackupFileResult>;
  restoreBackup(options: { uri: string }): Promise<RestoreResult>;
}

export const NativeBackup = registerPlugin<BackupPlugin>('MahfuzatBackup');
