import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, interval, of } from 'rxjs';
import { switchMap, catchError, startWith, takeUntil } from 'rxjs/operators';

export interface HourlyForecast {
  readonly time: string;
  readonly hourLabel: string;
  readonly temperature: number;
  readonly precipitation: number;
  readonly cloudCoverage: number;
  readonly symbolCode: string;
}

interface WeatherForecastData {
  readonly hourly: readonly HourlyForecast[];
  readonly todayMin: number;
  readonly todayMax: number;
  readonly todayCloudMin: number;
  readonly todayCloudMax: number;
  readonly next12hPrecipitation: number;
  readonly willRain: boolean;
  readonly willBeSunny: boolean;
}

@Injectable({ providedIn: 'root' })
export class WeatherForecastService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private _hourly: readonly HourlyForecast[] = [];
  private _todayMin = 0;
  private _todayMax = 0;
  private _todayCloudMin = 0;
  private _todayCloudMax = 0;
  private _next12hPrecipitation = 0;
  private _willRain = false;
  private _willBeSunny = false;
  private _error: string | null = null;

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;

    interval(30 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<WeatherForecastData>('/api/weather/forecast').pipe(
            catchError((err) => {
              console.error('Could not fetch weather forecast.', err);
              this._error = 'Could not fetch weather forecast.';
              return of(null);
            }),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((data) => {
        if (data) {
          this._hourly = data.hourly;
          this._todayMin = data.todayMin;
          this._todayMax = data.todayMax;
          this._todayCloudMin = data.todayCloudMin;
          this._todayCloudMax = data.todayCloudMax;
          this._next12hPrecipitation = data.next12hPrecipitation;
          this._willRain = data.willRain;
          this._willBeSunny = data.willBeSunny;
          this._error = null;
        }
      });
  }

  hourly(): readonly HourlyForecast[] { return this._hourly; }
  todayMin(): number { return this._todayMin; }
  todayMax(): number { return this._todayMax; }
  todayCloudMin(): number { return this._todayCloudMin; }
  todayCloudMax(): number { return this._todayCloudMax; }
  next12hPrecipitation(): number { return this._next12hPrecipitation; }
  willRain(): boolean { return this._willRain; }
  willBeSunny(): boolean { return this._willBeSunny; }
  error(): string | null { return this._error; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
