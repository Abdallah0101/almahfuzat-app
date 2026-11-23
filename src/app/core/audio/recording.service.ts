import { Injectable } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { BehaviorSubject } from 'rxjs';
import { LibraryRepository } from '../database/library.repository';
import { Recording, VerseView } from '../models';
import { newId, sha256Hex } from '../text.utils';
import { NativeAudio, RecordingResult } from './native-audio';

export interface RecordingSession {
  verse: VerseView;
  pendingPath: string;
  recording: boolean;
  result?: RecordingResult;
}

@Injectable({ providedIn: 'root' })
export class RecordingService {
  readonly session = new BehaviorSubject<RecordingSession | undefined>(undefined);

  constructor(private readonly repository: LibraryRepository) {}

  async start(verse: VerseView): Promise<void> {
    if (this.session.value) throw new Error('أنهِ التسجيل الحالي أو ألغِه أولًا.');
    const permission = await NativeAudio.requestPermissions();
    if (permission.microphone !== 'granted') throw new Error('يلزم إذن الميكروفون لتسجيل البيت.');
    const pendingPath = `recordings/.pending/${newId('attempt')}.m4a`;
    await NativeAudio.startRecording({ relativePath: pendingPath });
    this.session.next({ verse, pendingPath, recording: true });
  }

  async stop(): Promise<void> {
    const session = this.requiredSession();
    const result = await NativeAudio.stopRecording();
    this.session.next({ ...session, recording: false, result });
  }

  async cancel(): Promise<void> {
    const session = this.session.value;
    if (!session) return;
    await NativeAudio.cancelRecording({ relativePath: session.pendingPath });
    this.session.next(undefined);
  }

  async save(keepAttempts: boolean): Promise<VerseView> {
    const session = this.requiredSession();
    if (!session.result || session.recording) throw new Error('أوقف التسجيل قبل الحفظ.');
    const id = newId('recording');
    const poemId = session.verse.progress.poem_id;
    const target = `recordings/${poemId}/${session.verse.id}/${id}.m4a`;
    await Filesystem.mkdir({ path: `recordings/${poemId}/${session.verse.id}`, directory: Directory.Data, recursive: true });
    await Filesystem.rename({ from: session.pendingPath, to: target, directory: Directory.Data, toDirectory: Directory.Data });
    const recording: Recording = {
      id, poem_id: poemId, verse_id: session.verse.id, file_path: target,
      mime_type: session.result.mimeType, codec: session.result.codec,
      size_bytes: session.result.sizeBytes, duration_ms: session.result.durationMs,
      created_at: new Date().toISOString(), verse_text_hash: await sha256Hex(session.verse.text),
      is_current: true, is_archived: false, text_changed: false
    };
    let previous: Recording | undefined;
    try {
      previous = await this.repository.saveRecording(recording, keepAttempts);
    } catch (error) {
      await Filesystem.deleteFile({ path: target, directory: Directory.Data }).catch(() => undefined);
      throw error;
    }
    if (previous && !keepAttempts && previous.file_path !== target) {
      await Filesystem.deleteFile({ path: previous.file_path, directory: Directory.Data }).catch(() => undefined);
    }
    this.session.next(undefined);
    return { ...session.verse, recording };
  }

  private requiredSession(): RecordingSession {
    const session = this.session.value;
    if (!session) throw new Error('لا يوجد تسجيل قيد العمل.');
    return session;
  }
}
