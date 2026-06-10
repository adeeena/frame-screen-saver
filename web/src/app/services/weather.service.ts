import { Injectable, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap, catchError, of, startWith } from 'rxjs';

interface WeatherData {
  readonly temperature: number;
  readonly symbolCode: string;
  readonly weatherLabel: string;
  readonly windSpeed: number;
  readonly windDirection: number;
  readonly uvIndex: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _temperature = signal<number>(0);
  private readonly _symbolCode = signal<string>('clearsky_day');
  private readonly _weatherLabel = signal<string>('');
  private readonly _windSpeed = signal<number>(0);
  private readonly _windDirection = signal<number>(0);
  private readonly _uvIndex = signal<number | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly temperature = this._temperature.asReadonly();
  readonly symbolCode = this._symbolCode.asReadonly();
  readonly weatherLabel = this._weatherLabel.asReadonly();
  readonly windSpeed = this._windSpeed.asReadonly();
  readonly windDirection = this._windDirection.asReadonly();
  readonly uvIndex = this._uvIndex.asReadonly();
  readonly error = this._error.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    interval(30 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<WeatherData>('/api/weather').pipe(
            catchError((err) => {
              console.error('Could not fetch weather.', err);
              this._error.set('Could not fetch weather.');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        if (data) {
          this._temperature.set(data.temperature);
          this._symbolCode.set(data.symbolCode);
          this._weatherLabel.set(data.weatherLabel);
          this._windSpeed.set(data.windSpeed);
          this._windDirection.set(data.windDirection);
          this._uvIndex.set(data.uvIndex);
          this._error.set(null);
        }
      });
  }
}

