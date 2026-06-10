import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, skip, take } from 'rxjs';
import { gsap } from 'gsap';
import { Router } from '@angular/router';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';
import { CoverPageComponent } from '../cover-page/cover-page.component';
import { ColumnsPageComponent } from '../columns-page/columns-page.component';
import { DebugOverlayComponent } from '../debug-overlay/debug-overlay.component';
import { ImageCycleService } from '../../services/image-cycle.service';
import { KeyboardService } from '../../services/keyboard.service';

const TIMINGS = {
  page1Duration: 10,
  page2Duration: 5,
  page3Duration: 10,
  crossfadeDuration: 0.4,
  pauseCountdown: 30,
} as const;

interface FrameElements {
  readonly imageA: HTMLDivElement;
  readonly imageB: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly cover: HTMLElement;
  readonly columns: HTMLElement;
}

@Component({
  selector: 'app-the-frame',
  templateUrl: './the-frame.html',
  styleUrl: './the-frame.scss',
  standalone: true,
  imports: [CoverPageComponent, ColumnsPageComponent, DebugOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TheFrame {
  private readonly imageCycleService = inject(ImageCycleService);
  private readonly keyboardService = inject(KeyboardService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly configService = inject(ScreensaverConfigService);

  @ViewChild('imageA') private imageA!: ElementRef<HTMLDivElement>;
  @ViewChild('imageB') private imageB!: ElementRef<HTMLDivElement>;
  @ViewChild('infoOverlay') private infoOverlay!: ElementRef<HTMLDivElement>;
  @ViewChild('progressBar') private progressBar!: ElementRef<HTMLDivElement>;
  @ViewChild('coverPage', { read: ElementRef }) private coverPageEl!: ElementRef<HTMLElement>;
  @ViewChild('columnsPage', { read: ElementRef }) private columnsPageEl!: ElementRef<HTMLElement>;

  readonly isPaused = signal(false);
  readonly showDebug = signal(false);
  readonly currentPage = signal<1 | 2 | 3>(1);
  readonly frameStyle = signal<0 | 1 | 2 | 3 | 4>(0);

  private mainTimeline!: gsap.core.Timeline;
  private pauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pauseBarTween: gsap.core.Tween | null = null;
  private frameIntervalId: ReturnType<typeof setInterval> | null = null;
  private els!: FrameElements;
  private activeLayer: 'a' | 'b' = 'a';
  /** Measured pixel size of the image area — used to request correctly-sized images. */
  private imgW = 0;
  private imgH = 0;

  private kenBurnsTween: gsap.core.Tween | null = null;

  readonly sidebarLayout = signal(false);

  private static readonly DIM_STORAGE_KEY = 'frame-dim-level';
  private static readonly DIM_STEP = 0.08;
  private static readonly DIM_MIN = 0;
  private static readonly DIM_MAX = 0.80;

  /** 0–0.80 black overlay opacity. Persisted in localStorage, adjusted with I/O keys. */
  readonly dimLevel = signal<number>(
    Math.min(
      TheFrame.DIM_MAX,
      Math.max(
        TheFrame.DIM_MIN,
        parseFloat(globalThis.localStorage?.getItem(TheFrame.DIM_STORAGE_KEY) ?? '0') || 0,
      ),
    ),
  );

  readonly showCog = signal(false);
  private cogHideTimeoutId: ReturnType<typeof setTimeout> | null = null;

  onMouseMove(): void {
    this.showCog.set(true);
    if (this.cogHideTimeoutId !== null) clearTimeout(this.cogHideTimeoutId);
    this.cogHideTimeoutId = setTimeout(() => this.showCog.set(false), 3000);
  }

  constructor() {
    // Must subscribe here (injection context) for takeUntilDestroyed to work.
    // skip(1) because setRefresh$ fires once immediately on first gallery load —
    // we don't want to advance frame style before anything has been shown.
    this.imageCycleService.setRefresh$
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.advanceFrameStyle());

    afterNextRender(() => {
      this.initElements();
      this.buildTimeline();
      this.setupKeyboard();

      this.frameIntervalId = setInterval(() => this.advanceFrameStyle(), 5 * 60 * 1000);

      // Auto-reload: read interval from config once it loads, then schedule.
      toObservable(this.configService.config, { injector: this.injector })
        .pipe(
          filter((cfg) => cfg !== null),
          take(1),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((cfg) => {
          const hours = cfg!.animationSettings.autoReloadIntervalHours;
          if (hours > 0) {
            setTimeout(() => globalThis.location.reload(), hours * 60 * 60 * 1000);
          }
        });

      this.destroyRef.onDestroy(() => {
        if (this.frameIntervalId !== null) clearInterval(this.frameIntervalId);
        if (this.pauseTimeoutId !== null) clearTimeout(this.pauseTimeoutId);
        if (this.cogHideTimeoutId !== null) clearTimeout(this.cogHideTimeoutId);
        this.kenBurnsTween?.kill();
      });

      // Images load asynchronously (HTTP → /api/gallery).
      // Wait for the first non-null image, then prime the two layers.
      toObservable(this.imageCycleService.currentImage, { injector: this.injector })
        .pipe(
          filter((img): img is string => img !== null),
          take(1),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.initImages());
    });
  }

  private initElements(): void {
    this.els = {
      imageA: this.imageA.nativeElement,
      imageB: this.imageB.nativeElement,
      overlay: this.infoOverlay.nativeElement,
      cover: this.coverPageEl.nativeElement,
      columns: this.columnsPageEl.nativeElement,
    };
  }

  private initImages(): void {
    // Measure the image layer div to request an appropriately-sized image
    this.imgW = this.els.imageA.clientWidth;
    this.imgH = this.els.imageA.clientHeight;

    const current = this.imageCycleService.currentImage();
    const next = this.imageCycleService.nextImage();
    if (current) {
      this.els.imageA.style.backgroundImage = `url('${this.resizedUrl(current)}')`;
      gsap.set(this.els.imageA, { opacity: 1 });
      this.startKenBurns(this.els.imageA);
    }
    if (next) {
      this.els.imageB.style.backgroundImage = `url('${this.resizedUrl(next)}')`;
    }
    this.activeLayer = 'a';
  }

  /** Converts a /media/<pack>/content/<file> URL into /api/resize?file=<pack>/content/<file>&w=<w>&h=<h> */
  private resizedUrl(mediaUrl: string): string {
    if (!mediaUrl || this.imgW === 0 || this.imgH === 0) return mediaUrl;
    // Strip the leading /media/ prefix — the rest is the pack-relative path
    const packRelative = mediaUrl.startsWith('/media/') ? mediaUrl.slice('/media/'.length) : mediaUrl;
    if (!packRelative) return mediaUrl;
    return `/api/resize?file=${encodeURIComponent(packRelative)}&w=${this.imgW}&h=${this.imgH}`;
  }

  private buildTimeline(): void {
    const { els } = this;
    gsap.set(els.overlay, { opacity: 0 });
    gsap.set(els.cover, { opacity: 0, x: '-2vw' });
    gsap.set(els.columns, { opacity: 0, x: '-2vw' });

    this.mainTimeline = gsap
      .timeline()
      .addLabel('page1', 0)
      .call(() => this.currentPage.set(1), [], 'page1')
      .addLabel('page2', TIMINGS.page1Duration)
      .to(els.overlay, { opacity: 1, duration: TIMINGS.crossfadeDuration }, 'page2')
      .to(els.cover, { opacity: 1, x: 0, duration: TIMINGS.crossfadeDuration }, 'page2')
      .call(() => this.currentPage.set(2), [], 'page2')
      .addLabel('page3', `page2+=${TIMINGS.crossfadeDuration + TIMINGS.page2Duration}`)
      .to(els.cover, { opacity: 0, x: '2vw', duration: TIMINGS.crossfadeDuration }, 'page3')
      .to(els.columns, { opacity: 1, x: 0, duration: TIMINGS.crossfadeDuration }, 'page3')
      .call(() => this.currentPage.set(3), [], 'page3')
      .addLabel('end', `page3+=${TIMINGS.crossfadeDuration + TIMINGS.page3Duration}`)
      .to(els.overlay, { opacity: 0, duration: TIMINGS.crossfadeDuration }, 'end')
      .to(els.columns, { opacity: 0, x: '2vw', duration: TIMINGS.crossfadeDuration }, 'end')
      .call(() => {
        gsap.set(els.cover, { x: '-2vw' });
        gsap.set(els.columns, { x: '-2vw' });
        this.currentPage.set(1);
        this.advanceImage();
      });
  }

  private startKenBurns(el: HTMLElement): void {
    this.kenBurnsTween?.kill();
    const totalDuration = TIMINGS.page1Duration + TIMINGS.page2Duration + TIMINGS.page3Duration;
    const dx = (Math.random() - 0.5) * 2;   // subtle random pan ±1%
    const dy = (Math.random() - 0.5) * 1.5; // subtle random pan ±0.75%
    gsap.set(el, { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: 'center center' });
    this.kenBurnsTween = gsap.to(el, {
      scale: 1.04,
      xPercent: dx,
      yPercent: dy,
      duration: totalDuration,
      ease: 'none',
    });
  }

  private advanceImage(): void {
    this.imageCycleService.advance();
    const current = this.imageCycleService.currentImage();

    if (this.activeLayer === 'a') {
      if (current) {
        this.els.imageB.style.backgroundImage = `url('${this.resizedUrl(current)}')`;
      }
      this.startKenBurns(this.els.imageB);
      gsap.to(this.els.imageB, { opacity: 1, duration: TIMINGS.crossfadeDuration });
      gsap.to(this.els.imageA, {
        opacity: 0,
        duration: TIMINGS.crossfadeDuration,
        onComplete: () => {
          const next = this.imageCycleService.nextImage();
          if (next) {
            this.els.imageA.style.backgroundImage = `url('${this.resizedUrl(next)}')`;
          }
          gsap.set(this.els.imageA, { scale: 1, xPercent: 0, yPercent: 0 });
        },
      });
      this.activeLayer = 'b';
    } else {
      if (current) {
        this.els.imageA.style.backgroundImage = `url('${this.resizedUrl(current)}')`;
      }
      this.startKenBurns(this.els.imageA);
      gsap.to(this.els.imageA, { opacity: 1, duration: TIMINGS.crossfadeDuration });
      gsap.to(this.els.imageB, {
        opacity: 0,
        duration: TIMINGS.crossfadeDuration,
        onComplete: () => {
          const next = this.imageCycleService.nextImage();
          if (next) {
            this.els.imageB.style.backgroundImage = `url('${this.resizedUrl(next)}')`;
          }
          gsap.set(this.els.imageB, { scale: 1, xPercent: 0, yPercent: 0 });
        },
      });
      this.activeLayer = 'a';
    }

    gsap.delayedCall(TIMINGS.crossfadeDuration, () => {
      this.mainTimeline.restart();
    });
  }

  private skipToNextImage(): void {
    this.mainTimeline.kill();
    gsap.killTweensOf([this.els.overlay, this.els.cover, this.els.columns]);
    gsap.set(this.els.overlay, { opacity: 0 });
    gsap.set(this.els.cover, { opacity: 0, x: '-2vw' });
    gsap.set(this.els.columns, { opacity: 0, x: '-2vw' });
    this.advanceImage();
  }

  private setupKeyboard(): void {
    this.keyboardService.arrowRight$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.skipToNextImage());

    this.keyboardService.space$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const page = this.currentPage();
        if (page === 1) {
          this.mainTimeline.seek('page2');
        } else if (page === 2) {
          this.mainTimeline.seek('page3');
        } else {
          this.skipToNextImage();
        }
      });

    this.keyboardService.keyP$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.togglePause());

    this.keyboardService.keyD$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.showDebug.update((v) => !v));

    this.keyboardService.keyEscape$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.showDebug.set(false));

    this.keyboardService.keyF$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.advanceFrameStyle());

    this.keyboardService.keyC$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.navigateToConfig());

    this.keyboardService.keyA$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sidebarLayout.update((v) => !v));

    this.keyboardService.keyI$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.adjustDim(TheFrame.DIM_STEP));

    this.keyboardService.keyO$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.adjustDim(-TheFrame.DIM_STEP));

    this.keyboardService.keyR$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => globalThis.location.reload());
  }

  navigateToConfig(): void {
    this.mainTimeline.pause();
    this.router.navigate(['/config']);
  }

  private adjustDim(delta: number): void {
    const next = Math.round(
      Math.min(TheFrame.DIM_MAX, Math.max(TheFrame.DIM_MIN, this.dimLevel() + delta)) * 100,
    ) / 100;
    this.dimLevel.set(next);
    globalThis.localStorage?.setItem(TheFrame.DIM_STORAGE_KEY, String(next));
  }

  private advanceFrameStyle(): void {
    this.frameStyle.update((s) => ((s + 1) % 5) as 0 | 1 | 2 | 3 | 4);
  }

  private togglePause(): void {
    if (this.isPaused()) {
      this.resumeTimeline();
    } else {
      this.pauseTimeline();
    }
  }

  private pauseTimeline(): void {
    this.mainTimeline.pause();
    this.isPaused.set(true);
    const bar = this.progressBar.nativeElement;
    gsap.set(bar, { scaleX: 1 });
    this.pauseBarTween = gsap.to(bar, {
      scaleX: 0,
      duration: TIMINGS.pauseCountdown,
      ease: 'none',
    });
    this.pauseTimeoutId = setTimeout(() => this.resumeTimeline(), TIMINGS.pauseCountdown * 1000);
  }

  private resumeTimeline(): void {
    if (this.pauseTimeoutId !== null) {
      clearTimeout(this.pauseTimeoutId);
      this.pauseTimeoutId = null;
    }
    this.pauseBarTween?.kill();
    this.pauseBarTween = null;
    gsap.set(this.progressBar.nativeElement, { scaleX: 1 });
    this.mainTimeline.resume();
    this.isPaused.set(false);
  }
}