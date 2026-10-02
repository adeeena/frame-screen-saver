import { Injectable, Inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { interval, of, Subject } from 'rxjs';
import { catchError, startWith, switchMap, takeUntil } from 'rxjs/operators';

export type VigilanceSeverity = 'yellow' | 'orange' | 'red';

export interface VigilanceAlert {
  readonly severity: VigilanceSeverity;
  readonly phenomenon: string;
}

interface VigilanceResponse {
  readonly alerts: readonly VigilanceAlert[];
}

@Injectable({ providedIn: 'root' })
export class WeatherVigilanceService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private _alerts: readonly VigilanceAlert[] = [];

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;

    interval(10 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() => this.http.get<VigilanceResponse>('/api/weather/vigilance').pipe(
          catchError((error) => {
            console.error('Could not fetch Yvelines vigilance.', error);
            return of(null);
          }),
        )),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        if (response) this._alerts = response.alerts;
      });
  }

  alerts(): readonly VigilanceAlert[] { return this._alerts; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}