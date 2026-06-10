import { Injectable, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, of, expand, catchError, delay, switchMap } from 'rxjs';
import moment from 'moment';
import { ClockService } from './clock.service';

export interface SolarEventResponse {
  readonly type: 'sunrise' | 'sunset';
  readonly time: string;
  readonly utcOffset: string;
}

@Injectable({
  providedIn: 'root',
})
export class SolarService {
  private readonly http = inject(HttpClient);
  private readonly clockService = inject(ClockService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = '/api/solar/next-event';

  private readonly _nextEvent = signal<SolarEventResponse | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly nextEvent = this._nextEvent.asReadonly();
  readonly error = this._error.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    timer(0)
      .pipe(
        expand((response) => {
          const delayMs = this.calculateNextDelay(response);
          return timer(delayMs).pipe(
            switchMap(() => this.http.get<SolarEventResponse>(this.apiUrl)),
          );
        }),
        catchError((err) => {
          console.error('Could not fetch solar event after retries.', err);
          this._error.set('Could not fetch solar event.');
          return of(null).pipe(delay(5 * 60 * 1000));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response) {
          this._nextEvent.set(response as SolarEventResponse);
          this._error.set(null);
        }
      });
  }

  private calculateNextDelay(response: SolarEventResponse | 0): number {
    if (response === 0) return 0;
    const nowString = this.clockService.time();
    if (!nowString) return 2000;
    const now = moment(nowString);
    const eventDate = moment(response.time);
    return eventDate.isSameOrBefore(now) ? 60 * 1000 : eventDate.diff(now) + 60 * 1000;
  }
}
