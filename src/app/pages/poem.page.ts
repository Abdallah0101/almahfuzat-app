import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import { AlertController, ToastController } from '@ionic/angular';
import { IONIC_COMPONENTS } from '../ionic.imports';
import { ExportService } from '../core/audio/export.service';
import { PlayerService } from '../core/audio/player.service';
import { RecordingService, RecordingSession } from '../core/audio/recording.service';
import { DatabaseService } from '../core/database/database.service';
import { LibraryRepository } from '../core/database/library.repository';
import { ExportResult } from '../core/audio/native-audio';
import { MemoryStatus, PlaybackQueueItem, PlaybackSettings, Poem, VerseView } from '../core/models';
import { normalizeArabic } from '../core/text.utils';

@Component({
  selector: 'app-poem',
  imports: [CommonModule, FormsModule, ...IONIC_COMPONENTS, RouterLink],
  templateUrl: './poem.page.html'
})
export class PoemPage implements OnInit {
  readonly poem = signal<Poem | undefined>(undefined);
  readonly verses = signal<VerseView[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly search = signal('');
  readonly displayLimit = signal(100);
  readonly filteredVerses = computed(() => {
    const query = normalizeArabic(this.search());
    return query ? this.verses().filter((verse) => normalizeArabic(verse.text).includes(query)) : this.verses();
  });
  readonly visibleVerses = computed(() => this.filteredVerses().slice(0, this.displayLimit()));
  readonly lastExport = signal<ExportResult | undefined>(undefined);
  rangeStart = 1;
  rangeEnd = 50;
  sequential = false;
  settings: PlaybackSettings = { verseRepeats: 1, groupRepeats: 1, gapSeconds: 1, speed: 1 };
  readonly statuses: MemoryStatus[] = ['not_started', 'learning', 'memorized', 'needs_review', 'mastered'];
  readonly statusLabels: Record<MemoryStatus, string> = {
    not_started: 'لم أبدأ', learning: 'أحفظه حاليًا', memorized: 'محفوظ', needs_review: 'يحتاج مراجعة', mastered: 'متقن'
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly repository: LibraryRepository,
    private readonly db: DatabaseService,
    readonly recording: RecordingService,
    readonly player: PlayerService,
    readonly exporter: ExportService,
    private readonly alerts: AlertController,
    private readonly toasts: ToastController
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.poem.set(await this.repository.poem(id));
    this.verses.set(await this.repository.verses(id));
    this.rangeEnd = Math.min(50, this.verses().length);
    this.settings = await this.db.getSetting('playback_settings', this.settings);
  }

  async copyVerse(verse: VerseView): Promise<void> {
    try {
      await Clipboard.write({ string: verse.text });
      await this.toast(`تم نسخ البيت ${verse.number}. يمكنك لصقه في البحث أو تطبيق آخر.`);
    } catch (error) {
      await this.toast(error instanceof Error ? error.message : 'تعذر نسخ البيت.', 'danger');
    }
  }

  toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  showMore(event: CustomEvent): void {
    this.displayLimit.update((limit) => limit + 100);
    (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  clearSelection(): void { this.selected.set(new Set<string>()); }

  selectRange(): void {
    const start = Math.min(this.rangeStart, this.rangeEnd);
    const end = Math.max(this.rangeStart, this.rangeEnd);
    this.selected.set(new Set(this.verses().filter((verse) => verse.number >= start && verse.number <= end).map((verse) => verse.id)));
  }

  selectChapter(chapterId: string): void {
    this.selected.set(new Set(this.verses().filter((verse) => verse.chapter_id === chapterId).map((verse) => verse.id)));
  }

  selectRecorded(): void {
    this.selected.set(new Set(this.verses().filter((verse) => verse.recording && !verse.recording.is_archived).map((verse) => verse.id)));
  }

  async setStatus(verse: VerseView, status: MemoryStatus): Promise<void> {
    await this.repository.setProgress(verse.progress.poem_id, verse.id, status);
    this.verses.update((items) => items.map((item) => item.id === verse.id ? { ...item, progress: { ...item.progress, status } } : item));
  }

  async beginRecording(verse: VerseView): Promise<void> {
    if (verse.recording) {
      const alert = await this.alerts.create({ header: 'استبدال التسجيل', message: 'يوجد تسجيل لهذا البيت. هل تريد تسجيل محاولة جديدة؟', buttons: [
        { text: 'إلغاء', role: 'cancel' }, { text: 'تسجيل جديد', role: 'confirm' }
      ] });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') return;
    }
    await this.guard(() => this.recording.start(verse));
  }

  async stopRecording(): Promise<void> { await this.guard(() => this.recording.stop()); }
  async cancelRecording(): Promise<void> { await this.guard(() => this.recording.cancel()); }

  async restartRecording(session: RecordingSession): Promise<void> {
    await this.guard(async () => {
      await this.recording.cancel();
      await this.recording.start(session.verse);
    });
  }

  async saveRecording(): Promise<void> {
    const session = this.recording.session.value;
    if (!session) return;
    const keep = await this.db.getSetting('keep_attempts', true);
    const saved = await this.guard(() => this.recording.save(keep));
    if (!saved) return;
    this.verses.update((items) => items.map((item) => item.id === saved.id ? saved : item));
    await this.toast('حُفظ التسجيل وربط بمعرّف البيت الثابت.');
    if (this.sequential) {
      const next = this.verses().find((verse) => verse.number > saved.number && !verse.recording);
      if (next) await this.beginRecording(next);
      else await this.toast('لا يوجد بيت لاحق غير مسجل.');
    }
  }

  async preview(session: RecordingSession): Promise<void> {
    const poem = this.poem();
    if (!poem) return;
    await this.player.play([{ poemId: poem.id, verseId: session.verse.id, poemTitle: poem.title,
      verseNumber: session.verse.number, relativePath: session.pendingPath }], { verseRepeats: 1, groupRepeats: 1, gapSeconds: 0, speed: 1 });
  }

  async playSingle(verse: VerseView): Promise<void> {
    const poem = this.poem();
    if (!poem) return;
    const { items } = this.player.queueFromVerses([verse], poem.title);
    await this.guard(() => this.player.play(items, { ...this.settings, groupRepeats: 1, gapSeconds: 0 }));
  }

  async playAllRecorded(): Promise<void> {
    const poem = this.poem();
    if (!poem) return;
    const recorded = this.verses().filter((verse) => verse.recording && !verse.recording.is_archived);
    const { items } = this.player.queueFromVerses(recorded, poem.title);
    await this.guard(() => this.player.play(items, this.settings));
  }

  async playSelected(): Promise<void> {
    const selected = this.selectedVerses();
    const poem = this.poem();
    if (!poem || !selected.length) { await this.toast('حدد أبياتًا أولًا.', 'warning'); return; }
    const { items, missing } = this.player.queueFromVerses(selected, poem.title);
    if (!missing.length) { await this.guard(() => this.player.play(items, this.settings)); return; }
    const alert = await this.alerts.create({
      header: 'بعض الأبيات غير مسجلة',
      message: `الأرقام: ${missing.join('، ')}. لن يُنشأ صوت اصطناعي لها.`,
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        { text: 'الوقوف عند أول ناقص', handler: () => { void this.playUntilMissing(selected); } },
        { text: 'تخطي غير المسجل', handler: () => { void this.guard(() => this.player.play(items, this.settings)); } }
      ]
    });
    await alert.present();
  }

  private async playUntilMissing(selected: VerseView[]): Promise<void> {
    const poem = this.poem();
    if (!poem) return;
    const firstMissing = selected.findIndex((verse) => !verse.recording || verse.recording.is_archived);
    const available = firstMissing < 0 ? selected : selected.slice(0, firstMissing);
    const { items } = this.player.queueFromVerses(available, poem.title);
    await this.guard(() => this.player.play(items, this.settings));
  }

  async savePlaylist(): Promise<void> {
    const selected = this.selectedVerses();
    const poem = this.poem();
    if (!poem || !selected.length) { await this.toast('حدد أبياتًا للمجموعة.', 'warning'); return; }
    const alert = await this.alerts.create({ header: 'حفظ مجموعة صوتية', inputs: [{ name: 'name', type: 'text', placeholder: 'مثال: مراجعة باب القياس' }], buttons: [
      { text: 'إلغاء', role: 'cancel' },
      { text: 'حفظ', handler: async (value) => {
        if (!value.name?.trim()) return false;
        await this.repository.savePlaylist(value.name.trim(), poem.id, selected.map((verse) => verse.id), this.settings);
        await this.toast('حُفظت المجموعة بمعرّفات الأبيات.');
        return true;
      } }
    ] });
    await alert.present();
  }

  async exportSelected(): Promise<void> {
    const selected = this.selectedVerses();
    const poem = this.poem();
    if (!poem || !selected.length) { await this.toast('حدد أبياتًا للتصدير.', 'warning'); return; }
    const { items, missing } = this.player.queueFromVerses(selected, poem.title);
    if (missing.length) {
      const alert = await this.alerts.create({ header: 'استثناء غير المسجل', message: `غير مسجل: ${missing.join('، ')}`, buttons: [
        { text: 'إلغاء', role: 'cancel' }, { text: 'متابعة', role: 'confirm' }
      ] });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') return;
    }
    await this.exportNow(items);
  }

  private async exportNow(items: PlaybackQueueItem[]): Promise<void> {
    const poem = this.poem();
    if (!poem) return;
    const numbers = items.map((item) => item.verseNumber);
    const name = `${poem.title.replace(/\s+/g, '-')}-الأبيات-${String(Math.min(...numbers)).padStart(3, '0')}-${String(Math.max(...numbers)).padStart(3, '0')}.wav`;
    const result = await this.guard(() => this.exporter.export(items, { ...this.settings, outputName: name }));
    if (!result) return;
    this.lastExport.set(result);
    await this.toast(`تم حفظ الملف في ${result.publicPath} (${(result.sizeBytes / 1048576).toFixed(1)} ميغابايت).`);
  }

  estimatedBytes(): number {
    const selected = this.selectedVerses().filter((verse) => verse.recording);
    const duration = selected.reduce((sum, verse) => sum + verse.recording!.duration_ms, 0) * this.settings.verseRepeats;
    const silence = selected.length * this.settings.verseRepeats * this.settings.gapSeconds * 1000;
    return Math.round((duration + silence) * this.settings.groupRepeats * 44100 * 2 / 1000);
  }

  selectedVerses(): VerseView[] {
    const ids = this.selected();
    return this.verses().filter((verse) => ids.has(verse.id));
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try { return await operation(); }
    catch (error) { await this.toast(error instanceof Error ? error.message : String(error), 'danger'); return undefined; }
  }

  private async toast(message: string, color = 'primary'): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
