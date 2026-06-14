import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, interval, of } from 'rxjs';
import { switchMap, catchError, startWith, takeUntil } from 'rxjs/operators';

interface WeatherData {
  readonly temperature: number;
  readonly symbolCode: string;
  readonly weatherLabel: string;
  readonly windSpeed: number;
  readonly windDirection: number;
  readonly uvIndex: number | null;
}

@Injectable({ providedIn: 'root' })
export class WeatherService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private _temperature = 0;
  private _symbolCode = 'clearsky_day';
  private _weatherLabel = '';
  private _windSpeed = 0;
  private _windDirection = 0;
  private _uvIndex: number | null = null;
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
          this.http.get<WeatherData>('/api/weather').pipe(
            catchError((err) => {
              console.error('Could not fetch weather.', err);
              this._error = 'Could not fetch weather.';
              return of(null);
            }),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((data) => {
        if (data) {
          this._temperature = data.temperature;
          this._symbolCode = data.symbolCode;
          this._weatherLabel = data.weatherLabel;
          this._windSpeed = data.windSpeed;
          this._windDirection = data.windDirection;
          this._uvIndex = data.uvIndex;
          this._error = null;
        }
      });
  }

  temperature(): number { return this._temperature; }
  symbolCode(): string { return this._symbolCode; }
  weatherLabel(): string { return this._weatherLabel; }
  windSpeed(): number { return this._windSpeed; }
  windDirection(): number { return this._windDirection; }
  uvIndex(): number | null { return this._uvIndex; }
  error(): string | null { return this._error; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

