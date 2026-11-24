import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { IONIC_COMPONENTS } from '../ionic.imports';
import { LibraryRepository } from '../core/database/library.repository';
import { SyncService } from '../core/content/sync.service';
import { LibraryItem } from '../core/models';
import { normalizeArabic } from '../core/text.utils';

@Component({
  selector: 'app-library',
  imports: [CommonModule, FormsModule, ...IONIC_COMPONENTS, RouterLink],
  templateUrl: './library.page.html'
})
export class LibraryPage implements OnInit {
  readonly items = signal<LibraryItem[]>([]);
  readonly sciences = signal<string[]>([]);
  readonly loading = signal(true);
  readonly totals = computed(() => {
    const items = this.items();
    const verses = items.reduce((sum, item) => sum + item.poem.verses.length, 0);
    const memorized = items.reduce((sum, item) => sum + item.memorized_count, 0);
    const recorded = items.reduce((sum, item) => sum + item.recorded_count, 0);
    return {
      poems: items.length,
      memorized,
      recorded,
      progress: verses ? Math.round(memorized * 100 / verses) : 0
    };
  });
  search = '';
  science = '';
  sort: 'title' | 'revision' = 'title';

  constructor(
    private readonly repository: LibraryRepository,
    readonly sync: SyncService,
    private readonly toast: ToastController
  ) {}

  async ngOnInit(): Promise<void> { await this.sync.seedDemo(); await this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.repository.list(normalizeArabic(this.search), this.science, this.sort));
      this.sciences.set(await this.repository.sciences());
    } finally {
      this.loading.set(false);
    }
  }

  async synchronize(): Promise<void> {
    try {
      const count = await this.sync.syncNow();
      await this.load();
      await this.show(count ? `تم تنزيل ${count} منظومة محدّثة.` : 'المكتبة محدّثة بالفعل.');
    } catch (error) {
      await this.show(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.synchronize();
    (event.target as HTMLIonRefresherElement).complete();
  }

  private async show(message: string, color = 'primary'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }
}
