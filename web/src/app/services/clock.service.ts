import { Injectable, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import moment from 'moment';
import { Subject, timer, switchMap, retry, catchError, of } from 'rxjs';

interface ClockResponse {
  readonly time: string;
  readonly timezone: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClockService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = '/api/clock';

  private readonly _time = signal('');
  private readonly _error = signal<string | null>(null);

  readonly time = this._time.asReadonly();
  readonly error = this._error.asReadonly();

  private serverTimeOffset: number = 0;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Sync with server every 20 minutes
    timer(0, 20 * 60 * 1000)
      .pipe(
        switchMap(() =>
          this.http.get<ClockResponse>(this.apiUrl).pipe(
            retry(2),
            catchError((err) => {
              console.error('Could not fetch time.', err);
              this._error.set('Could not fetch time.');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (response) {
          this.serverTimeOffset = Date.now() - moment(response.time).valueOf();
          this._error.set(null);
        }
      });

    // Update time signal every minute
    timer(0, 60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const syncedTime = Date.now() - this.serverTimeOffset;
        this._time.set(moment(syncedTime).format('YYYY-MM-DD HH:mm:ss'));
      });
  }

  /** Synced current time in milliseconds (same epoch used by the time signal) */
  nowMs(): number {
    return Date.now() - this.serverTimeOffset;
  }
}
