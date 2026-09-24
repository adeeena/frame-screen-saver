import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { combineLatest, Subject, interval, of } from 'rxjs';
import { switchMap, catchError, startWith, takeUntil } from 'rxjs/operators';
import { ScreensaverConfigService } from './screensaver-config.service';

export interface Departure {
  readonly line: string;
  readonly lineColor?: string;
  readonly lineTextColor?: string;
  readonly missionCode?: string;
  readonly destination: string;
  readonly scheduledDeparture: string;
  readonly expectedDeparture: string;
  /** Pre-formatted local time string (HH:mm) — computed server-side to avoid client timezone issues. */
  readonly displayTime: string;
  readonly minutesUntilDeparture: number;
  readonly status: 'onTime' | 'delayed' | 'unknown';
}

export interface TransitRouteDepartures {
  readonly id: string;
  readonly departures: readonly Departure[];
}

@Injectable({ providedIn: 'root' })
export class TrainService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private _routes: readonly TransitRouteDepartures[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly configService: ScreensaverConfigService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;

    combineLatest([
      interval(2 * 60 * 1000).pipe(startWith(0)),
      this.configService.config$,
    ])
      .pipe(
        switchMap(([, config]) =>
          config?.appSettings.transit.isEnabled
            ? this.http.get<TransitRouteDepartures[]>('/api/transit/routes').pipe(
            catchError((err) => {
              console.error('Could not fetch train departures.', err);
              return of([] as TransitRouteDepartures[]);
            }),
              )
            : of([] as TransitRouteDepartures[]),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((data) => { this._routes = data; });
  }

  routes(): readonly TransitRouteDepartures[] { return this._routes; }

  departures(routeId?: string): readonly Departure[] {
    if (routeId) return this._routes.find((route) => route.id === routeId)?.departures ?? [];
    return this._routes.reduce<Departure[]>((all, route) => all.concat(route.departures), []);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

