import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class KeyboardService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly platformId: object;

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

  private keydownHandler?: (event: KeyboardEvent) => void;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.platformId = platformId;
    if (!isPlatformBrowser(this.platformId)) return;

    this.keydownHandler = (event: KeyboardEvent): void => {
      if (event.key === ' ') event.preventDefault();
      this.keySubject.next(event);
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    this.keySubject.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
}

