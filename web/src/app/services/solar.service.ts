import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Subject,
  timer,
  of,
  expand,
  catchError,
  takeUntil,
  retry,
  delay,
  delayWhen,
  switchMap,
} from 'rxjs';
import moment from 'moment';
import { API_BASE_URL } from './api-base-url.token';
import { ClockService } from './clock.service';

export interface SolarEventResponse {
  type: 'sunrise' | 'sunset';
  time: string; // "yyyy-mm-dd HH:mm:ss"
  utcOffset: string; // "+01:00"
}

@Injectable({
  providedIn: 'root',
})
export class SolarService implements OnDestroy {
  private http = inject(HttpClient);
  private clockService: ClockService = inject(ClockService);
  private readonly apiUrl = `${inject(API_BASE_URL)}solar/next-event`;

  // Signals for the next solar event and error state
  private readonly _nextEvent = signal<SolarEventResponse | null>(null);
  private readonly _error = signal<string | null>(null);

  // Public readonly signals for components
  public readonly nextEvent = this._nextEvent.asReadonly();
  public readonly error = this._error.asReadonly();

  private destroy$ = new Subject<void>();

  constructor() {
    // Start immediately, then schedule subsequent calls based on response
    timer(0)
      .pipe(
        // Use expand to create a self-scheduling stream
        expand((response) => {
          const delayMs = this.calculateNextDelay(response);
          return timer(delayMs).pipe(
            switchMap(() => this.http.get<SolarEventResponse>(this.apiUrl))
          );
        }),
        retry({ count: 2, delay: 60 * 1000 }), // Retry on error after 1 minute
        catchError((err: any) => {
          const errorMessage = 'Could not fetch solar event after retries.';
          console.error(errorMessage, err);
          this._error.set(errorMessage);
          // In case of permanent error, wait 5 minutes before trying the whole sequence again.
          return of(null).pipe(delay(5 * 60 * 1000));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response: SolarEventResponse | null) => {
        if (response) {
          this._nextEvent.set(response);
          this._error.set(null);
        }
      });
  }

  private calculateNextDelay(response: SolarEventResponse | 0): number {
    // For the very first emission from timer(0), response is 0.
    if (response === 0) return 0;

    const nowString = this.clockService.time();
    if (nowString === 'Loading...') return 2000; // Clock not ready, wait 2s

    const now = moment(nowString);
    const eventDate = moment(response.time);

    return eventDate.isSameOrBefore(now) ? 60 * 1000 : eventDate.diff(now) + 60 * 1000;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
