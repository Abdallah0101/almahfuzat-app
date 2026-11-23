import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { AlertController, ToastController } from '@ionic/angular';
import { IONIC_COMPONENTS } from '../ionic.imports';
import { BackupService } from '../core/backup/backup.service';
import { BackupFileResult } from '../core/backup/native-backup';
import { PlayerService } from '../core/audio/player.service';
import { SyncService } from '../core/content/sync.service';
import { DatabaseService } from '../core/database/database.service';

@Component({ selector: 'app-settings', imports: [CommonModule, FormsModule, ...IONIC_COMPONENTS, RouterLink], templateUrl: './settings.page.html' })
export class SettingsPage implements OnInit {
  contentUrl = '';
  fontScale = 1;
  keepAttempts = true;
  lastSync = '';
  readonly archivedCount = signal(0);
  readonly busy = signal(false);
  readonly backup = signal<BackupFileResult | undefined>(undefined);

  constructor(private readonly db: DatabaseService, readonly sync: SyncService,
    private readonly backups: BackupService, readonly player: PlayerService,
    private readonly alerts: AlertController, private readonly toasts: ToastController) {}

  async ngOnInit(): Promise<void> {
    this.contentUrl = await this.sync.contentUrl();
    this.fontScale = await this.db.getSetting('font_scale', 1);
    this.keepAttempts = await this.db.getSetting('keep_attempts', true);
    this.lastSync = await this.db.getSetting('last_successful_sync', '');
    const archived = await this.db.query<{ count: number }>('SELECT COUNT(*) AS count FROM recordings WHERE is_archived=1');
    this.archivedCount.set(archived[0]?.count ?? 0);
  }

  async saveUrl(): Promise<void> {
    try { await this.sync.setContentUrl(this.contentUrl); await this.show('حُفظ عنوان المحتوى.'); }
    catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
  }

  async setFontScale(): Promise<void> {
    document.documentElement.style.fontSize = `${this.fontScale * 100}%`;
    await this.db.setSetting('font_scale', this.fontScale);
  }

  async setKeepAttempts(): Promise<void> { await this.db.setSetting('keep_attempts', this.keepAttempts); }

  async synchronize(): Promise<void> {
    this.busy.set(true);
    try { await this.sync.syncNow(); this.lastSync = await this.db.getSetting('last_successful_sync', ''); await this.show('اكتملت المزامنة.'); }
    catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
    finally { this.busy.set(false); }
  }

  async createBackup(): Promise<void> {
    this.busy.set(true);
    try { this.backup.set(await this.backups.create()); await this.show('اكتملت النسخة الاحتياطية وحُفظت على الجهاز.'); }
    catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
    finally { this.busy.set(false); }
  }

  async shareBackup(): Promise<void> {
    const backup = this.backup();
    if (backup) await this.backups.share(backup);
  }

  async restoreBackup(): Promise<void> {
    const alert = await this.alerts.create({ header: 'استعادة نسخة', message: 'ستُدمج البيانات ولن تُستبدل التسجيلات الموجودة. اختر ملف ZIP أنشأه هذا التطبيق.', buttons: [
      { text: 'إلغاء', role: 'cancel' }, { text: 'اختيار الملف', role: 'confirm' }
    ] });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
    this.busy.set(true);
    try {
      const picked = await FilePicker.pickFiles({ types: ['application/zip', 'application/octet-stream'], limit: 1, readData: false });
      const path = picked.files[0]?.path;
      if (!path) throw new Error('لم يتم اختيار ملف صالح.');
      const result = await this.backups.restore(path);
      await this.show(result.restored ? `تمت الاستعادة وإضافة ${result.recordings} تسجيلًا.` : 'هذه النسخة مستعارة مسبقًا؛ لم تتكرر البيانات.');
    } catch (error) { await this.show(error instanceof Error ? error.message : String(error)); }
    finally { this.busy.set(false); }
  }

  async resumeLast(): Promise<void> {
    if (!await this.player.resumeLast()) await this.show('لا يوجد موضع استماع محفوظ.');
  }

  private async show(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 4000, position: 'bottom' });
    await toast.present();
  }
}
