import { NgxSplideModule } from 'ngx-splide';
import { Component, inject, isDevMode } from '@angular/core';
import { gsap } from 'gsap';
import { ClockService } from '../../services/clock.service';

@Component({
  selector: 'app-the-frame',
  templateUrl: './the-frame.html',
  styleUrl: './the-frame.scss',
  imports: [ NgxSplideModule ],
  standalone: true
})
export class TheFrame {
  IMAGE_DISPLAY_TIMEOUT_MS: number = isDevMode() ? 2000 : 8000;
  COVER_PAGE_DISPLAY_TIMEOUT_MS: number = isDevMode() ? 2000 : 8000;
  COLUMNS_PAGE_DISPLAY_TIMEOUT_MS: number = isDevMode() ? 2000 : 8000;

  public clockService = inject(ClockService);

  onSplideInit(splide: any)
  {
    var tl = gsap.timeline();

    tl.add('page2')
      .to("#screensaver-info-pages", {
        opacity: 1,
        delay: this.IMAGE_DISPLAY_TIMEOUT_MS / 1000
      }, 'page2')
      .to("#screensaver-info-pages .cover-page", {
        opacity: 1,
        x: 0,
        delay: this.IMAGE_DISPLAY_TIMEOUT_MS / 1000
      }, 'page2');

      tl.add('page3')
      .to("#screensaver-info-pages .cover-page", {
        opacity: 0,
        x: 32,
        delay: this.COVER_PAGE_DISPLAY_TIMEOUT_MS / 1000
      }, 'page3')
      .to("#screensaver-info-pages .columns-page", {
        opacity: 1,
        x: 0,
        delay: this.COVER_PAGE_DISPLAY_TIMEOUT_MS / 1000
      }, 'page3');

      tl.add('transient')
        .to('#screensaver-info-pages', {
          opacity: 0,
          delay: this.COLUMNS_PAGE_DISPLAY_TIMEOUT_MS / 1000
        }, 'transient')
        .to('#screensaver-info-pages .columns-page', {
          opacity: 0,
          x: 32,
          delay: this.COLUMNS_PAGE_DISPLAY_TIMEOUT_MS / 1000
        }, 'transient').call(() => {
          splide.go('>');
          tl.restart();
        });
  }
}