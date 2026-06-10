import {
  Injectable,
  Signal,
  computed,
  inject,
  signal,
  DestroyRef,
  PLATFORM_ID,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root',
})
export class ImageCycleService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _images = signal<readonly string[]>([]);
  private readonly _imageMeta = signal<readonly { title: string; subtitle: string }[]>([]);
  private readonly _currentIndex = signal<number>(0);
  private _loopCount = 0;

  private readonly _setRefresh = new Subject<void>();
  /** Emits each time a new set of images is loaded (after 10 loops). */
  readonly setRefresh$: Observable<void> = this._setRefresh.asObservable();

  readonly images = this._images.asReadonly();

  readonly currentImage = computed<string | null>(() => {
    const list = this._images();
    if (list.length === 0) return null;
    return list[this._currentIndex()] ?? null;
  });

  readonly nextImage = computed<string | null>(() => {
    const list = this._images();
    if (list.length === 0) return null;
    const nextIndex = (this._currentIndex() + 1) % list.length;
    return list[nextIndex] ?? null;
  });

  /** Per-image metadata (city title + country subtitle) for the current image. */
  readonly currentMeta: Signal<ImageMeta> = computed<ImageMeta>(() => {
    const meta = this._imageMeta();
    const idx = this._currentIndex();
    const entry = meta[idx];
    if (!entry) return EMPTY_META;
    return { location: '', title: entry.title, subtitle: entry.subtitle };
  });

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadGallery();
  }

  private loadGallery(): void {
    this.http
      .get<GalleryResponse>('/api/gallery')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((gallery) => {
        this._images.set(gallery.images);
        this._imageMeta.set(gallery.imageMeta ?? []);
        this._currentIndex.set(0);
        this._setRefresh.next();
      });
  }

  advance(): void {
    const len = this._images().length;
    if (len === 0) return;
    const nextIndex = (this._currentIndex() + 1) % len;
    this._currentIndex.set(nextIndex);

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
}
