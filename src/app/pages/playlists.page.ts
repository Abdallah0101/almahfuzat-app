import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { IONIC_COMPONENTS } from '../ionic.imports';
import { ExportService } from '../core/audio/export.service';
import { PlayerService } from '../core/audio/player.service';
import { LibraryRepository } from '../core/database/library.repository';
import { PlaybackQueueItem, Playlist } from '../core/models';

@Component({ selector: 'app-playlists', imports: [CommonModule, ...IONIC_COMPONENTS, RouterLink], templateUrl: './playlists.page.html' })
export class PlaylistsPage implements OnInit {
  readonly playlists = signal<Playlist[]>([]);
  readonly titles = new Map<string, string>();

  constructor(private readonly repository: LibraryRepository, readonly player: PlayerService,
    readonly exporter: ExportService, private readonly alerts: AlertController, private readonly toasts: ToastController) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    const playlists = await this.repository.playlists();
    this.playlists.set(playlists);
    for (const playlist of playlists) {
      if (!this.titles.has(playlist.poem_id)) this.titles.set(playlist.poem_id, (await this.repository.poem(playlist.poem_id))?.title ?? 'منظومة مؤرشفة');
    }
  }

  async queue(playlist: Playlist): Promise<{ items: PlaybackQueueItem[]; missing: number[] }> {
    const verses = (await this.repository.verses(playlist.poem_id)).filter((verse) => playlist.verse_ids.includes(verse.id));
    return this.player.queueFromVerses(verses, this.titles.get(playlist.poem_id) ?? '');
  }

  async play(playlist: Playlist): Promise<void> {
    const { items, missing } = await this.queue(playlist);
    try {
      await this.player.play(items, playlist.settings);
      if (missing.length) await this.show(`تم تخطي الأبيات غير المسجلة: ${missing.join('، ')}`);
    } catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
  }

  async export(playlist: Playlist): Promise<void> {
    const { items } = await this.queue(playlist);
    if (!items.length) { await this.show('لا توجد تسجيلات حالية لهذه المجموعة.'); return; }
    try {
      const result = await this.exporter.export(items, { ...playlist.settings, outputName: `${playlist.name}.wav` });
      await this.exporter.share(result);
    } catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
  }

  async remove(playlist: Playlist): Promise<void> {
    const alert = await this.alerts.create({ header: 'حذف المجموعة', message: 'لن تُحذف التسجيلات أو حالات الحفظ.', buttons: [
      { text: 'إلغاء', role: 'cancel' },
      { text: 'حذف', role: 'destructive', handler: async () => { await this.repository.deletePlaylist(playlist.id); await this.load(); } }
    ] });
    await alert.present();
  }

  private async show(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 3000 });
    await toast.present();
  }
}
