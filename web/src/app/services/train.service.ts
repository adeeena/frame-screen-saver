import { Injectable, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap, catchError, of, startWith } from 'rxjs';

export interface Departure {
  readonly line: string;
  readonly lineColor?: string;
  readonly lineTextColor?: string;
  readonly destination: string;
  readonly scheduledDeparture: string;
  readonly expectedDeparture: string;
  readonly minutesUntilDeparture: number;
  readonly status: 'onTime' | 'delayed' | 'unknown';
}

@Injectable({
  providedIn: 'root',
})
export class TrainService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _departures = signal<readonly Departure[]>([]);

  readonly departures = this._departures.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    interval(20 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<Departure[]>('/api/transit').pipe(
            catchError((err) => {
              console.error('Could not fetch train departures.', err);
              return of([] as Departure[]);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => this._departures.set(data));
  }
}

