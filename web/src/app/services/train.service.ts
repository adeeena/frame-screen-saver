import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, interval, of } from 'rxjs';
import { switchMap, catchError, startWith, takeUntil } from 'rxjs/operators';

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

@Injectable({ providedIn: 'root' })
export class TrainService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private _departures: readonly Departure[] = [];

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
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
        takeUntil(this.destroy$),
      )
      .subscribe((data) => { this._departures = data; });
  }

  departures(): readonly Departure[] { return this._departures; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

