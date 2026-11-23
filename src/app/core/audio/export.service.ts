import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { BehaviorSubject } from 'rxjs';
import { ExportOptions, PlaybackQueueItem } from '../models';
import { ExportResult, NativeAudio } from './native-audio';

@Injectable({ providedIn: 'root' })
export class ExportService {
  readonly progress = new BehaviorSubject({ active: false, percent: 0, processedItems: 0, totalItems: 0 });

  constructor() {
    void NativeAudio.addListener('exportProgress', (event) => {
      this.progress.next({ active: event.percent < 100, ...event });
    }).catch(() => undefined);
  }

  async export(items: PlaybackQueueItem[], options: ExportOptions): Promise<ExportResult> {
    if (!items.length) throw new Error('اختر أبياتًا مسجلة قبل إنشاء الملف.');
    const outputName = options.outputName.replace(/[\\/:*?"<>|]/g, '-').replace(/\.wav$/i, '') + '.wav';
    this.progress.next({ active: true, percent: 0, processedItems: 0, totalItems: items.length });
    try {
      return await NativeAudio.exportWav({ ...options, outputName, items });
    } finally {
      this.progress.next({ ...this.progress.value, active: false });
    }
  }

  async share(result: ExportResult): Promise<void> {
    await Share.share({ title: 'تصدير تسجيلات المحفوظات', files: [result.url] });
  }
}
