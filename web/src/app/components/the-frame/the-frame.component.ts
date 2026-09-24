import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { filter, skip, take, takeUntil } from 'rxjs/operators';
import { gsap } from 'gsap';
import { Router } from '@angular/router';
import { ScreensaverConfig, ScreensaverConfigService } from '../../services/screensaver-config.service';
import { CoverPageComponent } from '../cover-page/cover-page.component';
import { ColumnsPageComponent } from '../columns-page/columns-page.component';
import { TransportPageComponent } from '../transport-page/transport-page.component';
import { WeatherPageComponent } from '../weather-page/weather-page.component';
import { DebugOverlayComponent } from '../debug-overlay/debug-overlay.component';
import { ImageCycleService } from '../../services/image-cycle.service';
import { KeyboardService } from '../../services/keyboard.service';

interface FrameTimings {
  readonly stillImageDuration: number;
  readonly coverPageDuration: number;
  readonly columnsPageDuration: number;
  readonly transportPageDuration: number;
  readonly weatherPageDuration: number;
  readonly transitionDuration: number;
}

const DEFAULT_TIMINGS: FrameTimings = {
  stillImageDuration: 5,
  coverPageDuration: 10,
  columnsPageDuration: 10,
  transportPageDuration: 10,
  weatherPageDuration: 10,
  transitionDuration: 0.4,
};

const PAUSE_COUNTDOWN_SECONDS = 30;

const seconds = (milliseconds: number | undefined, fallback: number): number =>
  Number.isFinite(milliseconds) && milliseconds! > 0 ? milliseconds! / 1000 : fallback;

const frameChangeCycles = (cycles: number | undefined): number =>
  Number.isFinite(cycles) && cycles! > 0 ? Math.floor(cycles!) : 10;

interface FrameElements {
  readonly imageA: HTMLDivElement;
  readonly imageB: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly cover: HTMLElement;
  readonly columns: HTMLElement;
  readonly transport: HTMLElement;
  readonly weather: HTMLElement;
}

@Component({
  selector: 'app-the-frame',
  templateUrl: './the-frame.html',
  styleUrls: ['./the-frame.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class TheFrameComponent implements AfterViewInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  @ViewChild('imageA') private imageA!: ElementRef<HTMLDivElement>;
  @ViewChild('imageB') private imageB!: ElementRef<HTMLDivElement>;
  @ViewChild('infoOverlay') private infoOverlay!: ElementRef<HTMLDivElement>;
  @ViewChild('progressBar') private progressBar!: ElementRef<HTMLDivElement>;
  @ViewChild('outerFrame') private outerFrame!: ElementRef<HTMLDivElement>;
  @ViewChild('coverPage', { read: ElementRef }) private coverPageEl!: ElementRef<HTMLElement>;
  @ViewChild('columnsPage', { read: ElementRef }) private columnsPageEl!: ElementRef<HTMLElement>;
  @ViewChild('transportPage', { read: ElementRef }) private transportPageEl!: ElementRef<HTMLElement>;
  @ViewChild('weatherPage', { read: ElementRef }) private weatherPageEl!: ElementRef<HTMLElement>;

  isPaused = false;
  showDebug = false;
  currentPage: 1 | 2 | 3 | 4 | 5 = 1;
  frameStyle: 0 | 1 | 2 | 3 | 4 | 5 = (Math.floor(Math.random() * 6)) as 0 | 1 | 2 | 3 | 4 | 5;

  private mainTimeline!: gsap.core.Timeline;
  private pauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pauseBarTween: gsap.core.Tween | null = null;
  private timings = DEFAULT_TIMINGS;
  private frameChangeAfterCycles = 10;
  private completedImageCycles = 0;
  private els!: FrameElements;
  private activeLayer: 'a' | 'b' = 'a';
  /** Measured pixel size of the image area — used to request correctly-sized images. */
  private imgW = 0;
  private imgH = 0;

  private kenBurnsTween: gsap.core.Tween | null = null;

  sidebarLayout = false;

  private static readonly DIM_STORAGE_KEY = 'frame-dim-level';
  private static readonly DIM_STEP = 0.08;
  private static readonly DIM_MIN = 0;
  private static readonly DIM_MAX = 0.80;

  /** 0–0.80 black overlay opacity. Persisted in localStorage, adjusted with I/O keys. */
  dimLevel = 0;

  showCog = false;
  private cogHideTimeoutId: ReturnType<typeof setTimeout> | null = null;

  onMouseMove(): void {
    this.showCog = true;
    if (this.cogHideTimeoutId !== null) clearTimeout(this.cogHideTimeoutId);
    this.cogHideTimeoutId = setTimeout(() => { this.showCog = false; }, 3000);
  }

  constructor(
    private readonly imageCycleService: ImageCycleService,
    private readonly keyboardService: KeyboardService,
    private readonly router: Router,
    private readonly configService: ScreensaverConfigService,
    private readonly ngZone: NgZone,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    // Read persisted dim level from localStorage
    if (typeof localStorage !== 'undefined') {
      const stored = parseFloat(localStorage.getItem(TheFrameComponent.DIM_STORAGE_KEY) ?? '0') || 0;
      this.dimLevel = Math.min(TheFrameComponent.DIM_MAX, Math.max(TheFrameComponent.DIM_MIN, stored));
    }

    if (!isPlatformBrowser(this.platformId)) return;

    // skip(1) because setRefresh$ fires once immediately on first gallery load
    this.imageCycleService.setRefresh$
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(() => this.advanceFrameStyle());
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const loadedConfig = this.configService.config();
    if (loadedConfig) this.applyAnimationSettings(loadedConfig.animationSettings);

    this.ngZone.runOutsideAngular(() => {
      this.initElements();
      // Hide the whole frame (chrome + image) until the first image is ready, so
      // neither the pre-config frame style nor an empty image layer is ever visible.
      gsap.set(this.outerFrame.nativeElement, { opacity: 0 });
      this.buildTimeline();
    });
    this.setupKeyboard();

    this.configService.config$
      .pipe(
        filter((cfg) => cfg !== null),
        take(1),
        takeUntil(this.destroy$),
      )
      .subscribe((cfg) => {
        if (cfg !== loadedConfig) {
          this.applyAnimationSettings(cfg!.animationSettings);
          this.ngZone.runOutsideAngular(() => {
            this.mainTimeline.kill();
            this.buildTimeline();
          });
        }
        const hours = cfg!.animationSettings.autoReloadIntervalHours;
        if (hours > 0) {
          setTimeout(() => location.reload(), hours * 60 * 60 * 1000);
        }
      });

    // Images load asynchronously (HTTP → /api/gallery).
    // Wait for the first non-null image, then prime the two layers.
    this.imageCycleService.currentImage$
      .pipe(
        filter((img): img is string => img !== null),
        take(1),
        takeUntil(this.destroy$),
      )
      .subscribe(() => this.initImages());
  }

  private applyAnimationSettings(settings: ScreensaverConfig['animationSettings']): void {
    this.timings = {
      stillImageDuration: seconds(settings.stillImageTimeoutMs, DEFAULT_TIMINGS.stillImageDuration),
      coverPageDuration: seconds(settings.coverPageTimeoutMs, DEFAULT_TIMINGS.coverPageDuration),
      columnsPageDuration: seconds(settings.columnsPageTimeoutMs, DEFAULT_TIMINGS.columnsPageDuration),
      transportPageDuration: seconds(settings.transportPageTimeoutMs, DEFAULT_TIMINGS.transportPageDuration),
      weatherPageDuration: seconds(settings.weatherPageTimeoutMs, DEFAULT_TIMINGS.weatherPageDuration),
      transitionDuration: seconds(settings.pageTransitionDurationMs, DEFAULT_TIMINGS.transitionDuration),
    };
    this.frameChangeAfterCycles = frameChangeCycles(settings.frameChangeAfterCycles);
  }

  private initElements(): void {
    this.els = {
      imageA: this.imageA.nativeElement,
      imageB: this.imageB.nativeElement,
      overlay: this.infoOverlay.nativeElement,
      cover: this.coverPageEl.nativeElement,
      columns: this.columnsPageEl.nativeElement,
      transport: this.transportPageEl.nativeElement,
      weather: this.weatherPageEl.nativeElement,
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
    gsap.to(this.outerFrame.nativeElement, { opacity: 1, duration: 0.6 });
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
    const timings = this.timings;
    const run = <T>(fn: () => T) => this.ngZone.run(fn);
    gsap.set(els.overlay, { opacity: 0 });
    gsap.set(els.cover, { opacity: 0, x: '-2vw' });
    gsap.set(els.columns, { opacity: 0, x: '-2vw' });
    gsap.set(els.transport, { opacity: 0, x: '-2vw' });
    gsap.set(els.weather, { opacity: 0, x: '-2vw' });

    this.mainTimeline = gsap
      .timeline()
      .addLabel('page1', 0)
      .call(() => run(() => { this.currentPage = 1; }), [], 'page1')
      .addLabel('page2', timings.stillImageDuration)
      .to(els.overlay, { opacity: 1, duration: timings.transitionDuration }, 'page2')
      .to(els.cover, { opacity: 1, x: 0, duration: timings.transitionDuration }, 'page2')
      .call(() => run(() => { this.currentPage = 2; }), [], 'page2')
      .addLabel('page3', `page2+=${timings.transitionDuration + timings.coverPageDuration}`)
      .to(els.cover, { opacity: 0, x: '2vw', duration: timings.transitionDuration }, 'page3')
      .to(els.columns, { opacity: 1, x: 0, duration: timings.transitionDuration }, 'page3')
      .call(() => run(() => { this.currentPage = 3; }), [], 'page3')
      .addLabel('page4', `page3+=${timings.transitionDuration + timings.columnsPageDuration}`)
      .to(els.columns, { opacity: 0, x: '2vw', duration: timings.transitionDuration }, 'page4')
      .to(els.transport, { opacity: 1, x: 0, duration: timings.transitionDuration }, 'page4')
      .call(() => run(() => { this.currentPage = 4; }), [], `page4+=${timings.transitionDuration}`)
      .addLabel('messagePause', `page4+=${timings.transitionDuration}`)
      .addPause('messagePause')
      .addLabel('page5', 'messagePause+=0.01')
      .to(els.transport, { opacity: 0, x: '2vw', duration: timings.transitionDuration }, 'page5')
      .to(els.weather, { opacity: 1, x: 0, duration: timings.transitionDuration }, 'page5')
      .call(() => run(() => { this.currentPage = 5; }), [], 'page5')
      .addLabel('end', `page5+=${timings.transitionDuration + timings.weatherPageDuration}`)
      .to(els.overlay, { opacity: 0, duration: timings.transitionDuration }, 'end')
      .to(els.weather, { opacity: 0, x: '2vw', duration: timings.transitionDuration }, 'end')
      .call(() => run(() => {
        gsap.set(els.cover, { x: '-2vw' });
        gsap.set(els.columns, { x: '-2vw' });
        gsap.set(els.transport, { x: '-2vw' });
        gsap.set(els.weather, { x: '-2vw' });
        this.currentPage = 1;
        this.advanceImage();
      }));
  }

  onMessageCycleComplete(): void {
    if (this.currentPage === 4 && !this.isPaused) this.mainTimeline.resume();
  }

  private startKenBurns(el: HTMLElement): void {
    this.kenBurnsTween?.kill();
    const totalDuration = this.timings.stillImageDuration
      + this.timings.coverPageDuration
      + this.timings.columnsPageDuration
      + this.timings.transportPageDuration
      + this.timings.weatherPageDuration;
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
      gsap.to(this.els.imageB, { opacity: 1, duration: this.timings.transitionDuration });
      gsap.to(this.els.imageA, {
        opacity: 0,
        duration: this.timings.transitionDuration,
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
      gsap.to(this.els.imageA, { opacity: 1, duration: this.timings.transitionDuration });
      gsap.to(this.els.imageB, {
        opacity: 0,
        duration: this.timings.transitionDuration,
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

    this.completedImageCycles += 1;
    if (this.completedImageCycles >= this.frameChangeAfterCycles) {
      this.completedImageCycles = 0;
      this.ngZone.run(() => this.advanceFrameStyle());
    }

    gsap.delayedCall(this.timings.transitionDuration, () => {
      this.mainTimeline.restart();
    });
  }

  private skipToNextImage(): void {
    this.mainTimeline.kill();
    gsap.killTweensOf([this.els.overlay, this.els.cover, this.els.columns, this.els.transport, this.els.weather]);
    gsap.set(this.els.overlay, { opacity: 0 });
    gsap.set(this.els.cover, { opacity: 0, x: '-2vw' });
    gsap.set(this.els.columns, { opacity: 0, x: '-2vw' });
    gsap.set(this.els.transport, { opacity: 0, x: '-2vw' });
    gsap.set(this.els.weather, { opacity: 0, x: '-2vw' });
    this.advanceImage();
  }

  private setupKeyboard(): void {
    this.keyboardService.arrowRight$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.skipToNextImage());

    this.keyboardService.space$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const page = this.currentPage;
        if (page === 1) {
          this.mainTimeline.seek('page2');
        } else if (page === 2) {
          this.mainTimeline.seek('page3');
        } else if (page === 3) {
          this.mainTimeline.seek('page4');
        } else if (page === 4) {
          this.mainTimeline.resume();
        } else {
          this.skipToNextImage();
        }
      });

    this.keyboardService.keyP$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.togglePause());

    this.keyboardService.keyD$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.showDebug = !this.showDebug; });

    this.keyboardService.keyEscape$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.showDebug = false; });

    this.keyboardService.keyF$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.advanceFrameStyle());

    this.keyboardService.keyC$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.navigateToConfig());

    this.keyboardService.keyA$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.sidebarLayout = !this.sidebarLayout; });

    this.keyboardService.keyI$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.adjustDim(TheFrameComponent.DIM_STEP));

    this.keyboardService.keyO$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.adjustDim(-TheFrameComponent.DIM_STEP));

    this.keyboardService.keyR$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => location.reload());
  }

  navigateToConfig(): void {
    this.mainTimeline.pause();
    this.router.navigate(['/config']);
  }

  private adjustDim(delta: number): void {
    const next = Math.round(
      Math.min(TheFrameComponent.DIM_MAX, Math.max(TheFrameComponent.DIM_MIN, this.dimLevel + delta)) * 100,
    ) / 100;
    this.dimLevel = next;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TheFrameComponent.DIM_STORAGE_KEY, String(next));
    }
  }

  private advanceFrameStyle(): void {
    this.frameStyle = ((this.frameStyle + 1) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
  }

  private togglePause(): void {
    if (this.isPaused) {
      this.resumeTimeline();
    } else {
      this.pauseTimeline();
    }
  }

  private pauseTimeline(): void {
    this.mainTimeline.pause();
    this.isPaused = true;
    const bar = this.progressBar.nativeElement;
    gsap.set(bar, { scaleX: 1 });
    this.pauseBarTween = gsap.to(bar, {
      scaleX: 0,
      duration: PAUSE_COUNTDOWN_SECONDS,
      ease: 'none',
    });
    this.pauseTimeoutId = setTimeout(() => this.resumeTimeline(), PAUSE_COUNTDOWN_SECONDS * 1000);
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
    this.isPaused = false;
  }

  ngOnDestroy(): void {
    if (this.pauseTimeoutId !== null) clearTimeout(this.pauseTimeoutId);
    if (this.cogHideTimeoutId !== null) clearTimeout(this.cogHideTimeoutId);
    this.kenBurnsTween?.kill();
    this.destroy$.next();
    this.destroy$.complete();
  }
}