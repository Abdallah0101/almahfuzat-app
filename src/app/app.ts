import { Component, OnInit, signal } from '@angular/core';
import { IONIC_COMPONENTS } from './ionic.imports';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, bookmarkOutline, checkmarkOutline, closeOutline, createOutline, downloadOutline, libraryOutline, listOutline, micOutline, pauseOutline, playOutline, refreshOutline, saveOutline, settingsOutline, shareOutline, stopOutline, trashOutline } from 'ionicons/icons';
import { DatabaseService } from './core/database/database.service';
import { SyncService } from './core/content/sync.service';
import { PlayerBarComponent } from './components/player-bar.component';

@Component({
  selector: 'app-root',
  imports: [...IONIC_COMPONENTS, PlayerBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  readonly error = signal('');

  constructor(private readonly db: DatabaseService, private readonly sync: SyncService) {
    addIcons({ addOutline, arrowBackOutline, bookmarkOutline, checkmarkOutline, closeOutline, createOutline,
      downloadOutline, libraryOutline, listOutline, micOutline, pauseOutline, playOutline, refreshOutline,
      saveOutline, settingsOutline, shareOutline, stopOutline, trashOutline });
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
