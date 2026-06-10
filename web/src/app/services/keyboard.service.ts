import { Injectable, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, filter, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class KeyboardService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly keySubject = new Subject<KeyboardEvent>();

  readonly arrowRight$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'ArrowRight'),
  );
  readonly space$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === ' '),
  );
  readonly keyP$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'p' || e.key === 'P'),
  );
  readonly keyD$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'd' || e.key === 'D'),
  );
  readonly keyEscape$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'Escape'),
  );
  readonly keyF$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'f' || e.key === 'F'),
  );
  readonly keyC$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'c' || e.key === 'C'),
  );
  readonly keyA$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'a' || e.key === 'A'),
  );
  readonly keyI$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'i' || e.key === 'I'),
  );
  readonly keyO$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'o' || e.key === 'O'),
  );
  readonly keyR$: Observable<KeyboardEvent> = this.keySubject.pipe(
    filter((e) => e.key === 'r' || e.key === 'R'),
  );

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const handler = (event: KeyboardEvent): void => {
      if (event.key === ' ') event.preventDefault();
      this.keySubject.next(event);
    };

    window.addEventListener('keydown', handler);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', handler);
      this.keySubject.complete();
    });
  }
}

