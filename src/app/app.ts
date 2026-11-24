import { Component, OnInit, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IONIC_COMPONENTS } from './ionic.imports';
import { addIcons } from 'ionicons';
import {
  addOutline, arrowBackOutline, arrowForwardOutline, bookOutline, bookmarkOutline, checkmarkCircleOutline,
  checkmarkDoneOutline, checkmarkOutline, chevronBackOutline, closeOutline, createOutline, downloadOutline,
  folderOpenOutline, informationCircleOutline, libraryOutline, listOutline, micOutline, musicalNotesOutline,
  optionsOutline, pauseOutline, playBackOutline, playForwardOutline, playOutline, refreshOutline, repeatOutline,
  saveOutline, settingsOutline, shareOutline, shieldCheckmarkOutline, stopOutline, textOutline, timerOutline,
  trashOutline
} from 'ionicons/icons';
import { DatabaseService } from './core/database/database.service';
import { SyncService } from './core/content/sync.service';
import { PlayerBarComponent } from './components/player-bar.component';

@Component({
  selector: 'app-root',
  imports: [...IONIC_COMPONENTS, PlayerBarComponent, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  readonly error = signal('');
  private readonly currentUrl = signal('');
  readonly showNavigation = computed(() => !this.currentUrl().startsWith('/poem/'));

  constructor(private readonly db: DatabaseService, private readonly sync: SyncService, router: Router) {
    this.currentUrl.set(router.url);
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.currentUrl.set(event.urlAfterRedirects);
    });
    addIcons({
      addOutline, arrowBackOutline, arrowForwardOutline, bookOutline, bookmarkOutline, checkmarkCircleOutline,
      checkmarkDoneOutline, checkmarkOutline, chevronBackOutline, closeOutline, createOutline, downloadOutline,
      folderOpenOutline, informationCircleOutline, libraryOutline, listOutline, micOutline, musicalNotesOutline,
      optionsOutline, pauseOutline, playBackOutline, playForwardOutline, playOutline, refreshOutline, repeatOutline,
      saveOutline, settingsOutline, shareOutline, shieldCheckmarkOutline, stopOutline, textOutline, timerOutline,
      trashOutline
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.db.init();
      await this.sync.seedDemo();
      const fontScale = await this.db.getSetting('font_scale', 1);
      document.documentElement.style.fontSize = `${fontScale * 100}%`;
      this.sync.startAutoSync();
      if (!(await this.sync.contentUrl()).includes('YOUR-USERNAME')) void this.sync.syncNow().catch(() => undefined);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
