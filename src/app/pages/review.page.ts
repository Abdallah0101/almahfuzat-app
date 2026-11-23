import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { IONIC_COMPONENTS } from '../ionic.imports';
import { PlayerService } from '../core/audio/player.service';
import { DatabaseService } from '../core/database/database.service';
import { LibraryRepository } from '../core/database/library.repository';
import { VerseView } from '../core/models';

interface ReviewItem { verse: VerseView; poemTitle: string }

@Component({ selector: 'app-review', imports: [CommonModule, FormsModule, ...IONIC_COMPONENTS, RouterLink], templateUrl: './review.page.html' })
export class ReviewPage implements OnInit {
  readonly items = signal<ReviewItem[]>([]);
  readonly counts = signal({ reviews: 0, memorized: 0 });
  newGoal = 10;
  reviewGoal = 30;

  constructor(private readonly repository: LibraryRepository, private readonly db: DatabaseService,
    readonly player: PlayerService, private readonly toasts: ToastController) {}

  async ngOnInit(): Promise<void> {
    this.newGoal = await this.db.getSetting('daily_new_goal', 10);
    this.reviewGoal = await this.db.getSetting('daily_review_goal', 30);
    await this.load();
  }

  async load(): Promise<void> {
    const verses = await this.repository.reviewToday();
    const titles = new Map<string, string>();
    const items: ReviewItem[] = [];
    for (const verse of verses) {
      const poemId = verse.progress.poem_id;
      if (!titles.has(poemId)) titles.set(poemId, (await this.repository.poem(poemId))?.title ?? poemId);
      items.push({ verse, poemTitle: titles.get(poemId)! });
    }
    this.items.set(items);
    this.counts.set(await this.repository.todayCounts());
  }

  async review(item: ReviewItem, remembered: boolean): Promise<void> {
    await this.repository.review(item.verse.progress.poem_id, item.verse.id, remembered);
    this.items.update((items) => items.filter((value) => value.verse.id !== item.verse.id));
    this.counts.set(await this.repository.todayCounts());
  }

  async play(item: ReviewItem): Promise<void> {
    try { await this.player.playVerse(item.verse, item.poemTitle); }
    catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
  }

  async playAll(): Promise<void> {
    const items = this.items().filter((item) => item.verse.recording);
    if (!items.length) { await this.show('لا توجد تسجيلات لمراجعة اليوم.'); return; }
    const queue = items.flatMap((item) => this.player.queueFromVerses([item.verse], item.poemTitle).items);
    await this.player.play(queue, { verseRepeats: 1, groupRepeats: 1, gapSeconds: 1, speed: 1 });
  }

  async saveGoals(): Promise<void> {
    await this.db.setSetting('daily_new_goal', Math.max(1, this.newGoal));
    await this.db.setSetting('daily_review_goal', Math.max(1, this.reviewGoal));
    await this.show('حُفظ الهدف اليومي.');
  }

  private async show(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 2500 });
    await toast.present();
  }
}
