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
          <div class="title">{{ state.title }} — البيت {{ state.verseNumber }}</div>
          <ion-range [min]="0" [max]="state.durationMs || 1" [value]="state.positionMs"
            (ionChange)="seek($event.detail.value)" aria-label="موضع التشغيل" />
          <div class="controls">
            <ion-button fill="clear" (click)="player.previous()" aria-label="البيت السابق"><ion-icon name="play-outline" class="previous" /></ion-button>
            <ion-button fill="clear" (click)="state.playing ? player.pause() : player.resume()" aria-label="تشغيل أو إيقاف">
              <ion-icon [name]="state.playing ? 'pause-outline' : 'play-outline'" />
            </ion-button>
            <ion-button fill="clear" (click)="player.next()" aria-label="البيت التالي"><ion-icon name="play-outline" /></ion-button>
            <ion-select [value]="state.speed" (ionChange)="player.setSpeed($event.detail.value)" interface="popover" aria-label="سرعة التشغيل">
              <ion-select-option [value]="0.75">0.75x</ion-select-option>
              <ion-select-option [value]="1">1x</ion-select-option>
              <ion-select-option [value]="1.25">1.25x</ion-select-option>
              <ion-select-option [value]="1.5">1.5x</ion-select-option>
            </ion-select>
            <ion-button fill="clear" color="danger" (click)="player.stop()" aria-label="إيقاف نهائي"><ion-icon name="stop-outline" /></ion-button>
          </div>
          @if (state.error) { <ion-note color="danger">{{ state.error }}</ion-note> }
        </section>
      }
    }
  `,
  styles: [`
    :host { position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000; pointer-events: none; }
    .player { pointer-events: auto; background: #fffdf8; border-top: 1px solid #d9d1c2; padding: 4px 12px calc(4px + env(safe-area-inset-bottom)); box-shadow: 0 -4px 18px #0002; }
    .title { text-align: center; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ion-range { padding-block: 0; min-height: 24px; }
    .controls { display: flex; align-items: center; justify-content: center; }
    ion-button { margin: 0; }
    .previous { transform: rotate(180deg); }
    ion-select { max-width: 80px; }
  `]
})
export class PlayerBarComponent {
  constructor(readonly player: PlayerService) {}

  seek(value: number | { lower: number; upper: number }): void {
    if (typeof value === 'number') void this.player.seek(value);
  }
}
