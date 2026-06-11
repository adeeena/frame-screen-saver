import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, timer, of } from 'rxjs';
import { expand, catchError, delay, switchMap, takeUntil } from 'rxjs/operators';
import moment from 'moment';
import { ClockService } from './clock.service';

export interface SolarEventResponse {
  readonly type: 'sunrise' | 'sunset';
  readonly time: string;
  readonly utcOffset: string;
}

@Injectable({ providedIn: 'root' })
export class SolarService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = '/api/solar/next-event';

  private _nextEvent: SolarEventResponse | null = null;
  private _error: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly clockService: ClockService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
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
          this._error = 'Could not fetch solar event.';
          return of(null).pipe(delay(5 * 60 * 1000));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        if (response) {
          this._nextEvent = response as SolarEventResponse;
          this._error = null;
        }
      });
  }

  nextEvent(): SolarEventResponse | null { return this._nextEvent; }
  error(): string | null { return this._error; }

  private calculateNextDelay(response: SolarEventResponse | number): number {
    if (typeof response === 'number') return 0;
    const nowString = this.clockService.time();
    if (!nowString) return 2000;
    const now = moment(nowString);
    const eventDate = moment(response.time);
    return eventDate.isSameOrBefore(now) ? 60 * 1000 : eventDate.diff(now) + 60 * 1000;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
