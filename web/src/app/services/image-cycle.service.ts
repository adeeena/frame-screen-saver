import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface GalleryResponse {
  readonly title: string;
  readonly text: string;
  readonly images: readonly string[];
  readonly imageMeta: readonly { readonly title: string; readonly subtitle: string }[];
}

export interface ImageMeta {
  readonly location: string;
  readonly title: string;
  readonly subtitle: string;
}

const EMPTY_META: ImageMeta = { location: '', title: '', subtitle: '' };

/** How many full loops through the image set before fetching a new one. */
const LOOPS_BEFORE_REFRESH = 10;

@Injectable({ providedIn: 'root' })
export class ImageCycleService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private _images: readonly string[] = [];
  private _imageMeta: readonly { title: string; subtitle: string }[] = [];
  private _currentIndex = 0;
  private _loopCount = 0;

  private readonly _setRefresh = new Subject<void>();
  /** Emits each time a new set of images is loaded (after 10 loops). */
  readonly setRefresh$: Observable<void> = this._setRefresh.asObservable();

  /** Emits whenever the current image changes. */
  private readonly _currentImage$ = new BehaviorSubject<string | null>(null);
  readonly currentImage$: Observable<string | null> = this._currentImage$.asObservable();

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadGallery();
  }

  images(): readonly string[] { return this._images; }

  currentImage(): string | null {
    if (this._images.length === 0) return null;
    return this._images[this._currentIndex] ?? null;
  }

  nextImage(): string | null {
    if (this._images.length === 0) return null;
    const nextIndex = (this._currentIndex + 1) % this._images.length;
    return this._images[nextIndex] ?? null;
  }

  currentMeta(): ImageMeta {
    const entry = this._imageMeta[this._currentIndex];
    if (!entry) return EMPTY_META;
    return { location: '', title: entry.title, subtitle: entry.subtitle };
  }

  private loadGallery(): void {
    this.http
      .get<GalleryResponse>('/api/gallery')
      .pipe(takeUntil(this.destroy$))
      .subscribe((gallery) => {
        this._images = gallery.images;
        this._imageMeta = gallery.imageMeta ?? [];
        this._currentIndex = 0;
        this._currentImage$.next(this.currentImage());
        this._setRefresh.next();
      });
  }

  advance(): void {
    const len = this._images.length;
    if (len === 0) return;
    const nextIndex = (this._currentIndex + 1) % len;
    this._currentIndex = nextIndex;
    this._currentImage$.next(this.currentImage());

    // Completed one full loop through all images
    if (nextIndex === 0) {
      this._loopCount++;
      if (this._loopCount >= LOOPS_BEFORE_REFRESH) {
        this._loopCount = 0;
        this.loadGallery();
      }
    }
  }

  /** Returns the image URL directly (images are already full paths like /media/foo.jpg). */
  getImageUrl(image: string | null): string {
    return image ?? '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this._currentImage$.complete();
  }
}
