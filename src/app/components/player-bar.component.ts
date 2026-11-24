import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlayerService } from '../core/audio/player.service';
import { IONIC_COMPONENTS } from '../ionic.imports';

@Component({
  selector: 'app-player-bar',
  imports: [CommonModule, ...IONIC_COMPONENTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (player.state | async; as state) {
      @if (state.itemCount > 0) {
        <section class="player" aria-label="مشغل التسجيلات">
          <div class="now-playing">
            <span class="artwork" aria-hidden="true"><ion-icon name="musical-notes-outline" /></span>
            <div class="track-copy">
              <small>{{ state.playing ? 'يُشغَّل الآن' : 'الاستماع متوقف مؤقتًا' }}</small>
              <div class="title">{{ state.title }} <span>· البيت {{ state.verseNumber }}</span></div>
            </div>
            <span class="queue-count">{{ state.currentIndex + 1 }} / {{ state.itemCount }}</span>
          </div>
          <ion-range [min]="0" [max]="state.durationMs || 1" [value]="state.positionMs"
            (ionChange)="seek($event.detail.value)" aria-label="موضع التشغيل" />
          <div class="controls">
            <div class="transport">
              <ion-button fill="clear" (click)="player.previous()" aria-label="البيت السابق"><ion-icon name="play-back-outline" /></ion-button>
              <ion-button class="main-control" fill="clear" (click)="state.playing ? player.pause() : player.resume()"
                [attr.aria-label]="state.playing ? 'إيقاف مؤقت' : 'متابعة التشغيل'">
                <ion-icon [name]="state.playing ? 'pause-outline' : 'play-outline'" />
              </ion-button>
              <ion-button fill="clear" (click)="player.next()" aria-label="البيت التالي"><ion-icon name="play-forward-outline" /></ion-button>
            </div>
            <div class="secondary-controls">
              <ion-select [value]="state.speed" (ionChange)="player.setSpeed($event.detail.value)" interface="popover" aria-label="سرعة التشغيل">
                <ion-select-option [value]="0.75">0.75x</ion-select-option>
                <ion-select-option [value]="1">1x</ion-select-option>
                <ion-select-option [value]="1.25">1.25x</ion-select-option>
                <ion-select-option [value]="1.5">1.5x</ion-select-option>
              </ion-select>
              <ion-button class="stop-control" fill="clear" color="danger" (click)="player.stop()" aria-label="إيقاف نهائي"><ion-icon name="stop-outline" /></ion-button>
            </div>
          </div>
          @if (state.error) { <ion-note color="danger" class="player-error">{{ state.error }}</ion-note> }
        </section>
      }
    }
  `,
  styles: [`
    :host { position: fixed; right: 12px; bottom: calc(var(--player-bottom, 10px) + env(safe-area-inset-bottom)); left: 12px; z-index: 1000; pointer-events: none; }
    .player { width: min(100%, 720px); margin-inline: auto; padding: 12px 16px 9px; border: 1px solid rgb(255 255 255 / 75%); border-radius: 20px; background: rgb(255 255 255 / 94%); box-shadow: 0 14px 45px rgb(11 48 40 / 22%); backdrop-filter: blur(18px); pointer-events: auto; }
    .now-playing { display: flex; align-items: center; gap: 10px; }
    .artwork { display: grid; place-items: center; width: 39px; height: 39px; flex: 0 0 39px; border-radius: 12px; background: #eaf1eb; color: #1e6a54; font-size: 1.25rem; }
    .track-copy { flex: 1; min-width: 0; }
    .track-copy small { display: block; margin-bottom: 2px; color: #8b978f; font-size: .57rem; }
    .title { overflow: hidden; color: #18352e; font-size: .73rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .title span { color: #7a8980; font-weight: 400; }
    .queue-count { flex: 0 0 auto; padding: 4px 8px; border-radius: 8px; background: #f3f5f1; color: #77867d; font-size: .6rem; direction: ltr; }
    ion-range { min-height: 25px; padding: 2px 0 0; --bar-height: 3px; --bar-background: #e2e8e2; --bar-background-active: #1e6a54; --knob-background: #1e6a54; --knob-size: 13px; }
    .controls { display: flex; align-items: center; justify-content: space-between; }
    .transport, .secondary-controls { display: flex; align-items: center; gap: 3px; }
    ion-button { width: 38px; height: 36px; min-height: 36px; margin: 0; --color: #526b5d; --background-hover: #edf2ed; --border-radius: 11px; }
    ion-button ion-icon { font-size: 1.25rem; }
    .main-control { width: 43px; height: 41px; --background: #174d3f; --color: #fff; --background-hover: #0f3e33; --border-radius: 13px; box-shadow: 0 5px 14px rgb(23 77 63 / 20%); }
    .secondary-controls { padding: 2px 5px; border-radius: 10px; background: #f4f6f2; }
    .stop-control { width: 31px; height: 30px; min-height: 30px; }
    ion-select { width: 65px; min-height: 30px; padding: 0 7px; color: #526b5d; font-size: .65rem; font-weight: 700; }
    .player-error { display: block; padding-top: 4px; font-size: .65rem; }
    @media (max-width: 480px) {
      :host { right: 8px; bottom: calc(var(--player-bottom, 7px) + env(safe-area-inset-bottom)); left: 8px; }
      .player { padding: 10px 12px 8px; border-radius: 17px; }
      .queue-count { display: none; }
    }
  `]
})
export class PlayerBarComponent {
  constructor(readonly player: PlayerService) {}

  seek(value: number | { lower: number; upper: number }): void {
    if (typeof value === 'number') void this.player.seek(value);
  }
}
