import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, timer, of } from 'rxjs';
import { switchMap, retry, catchError, takeUntil } from 'rxjs/operators';
import moment from 'moment';

interface ClockResponse {
  readonly time: string;
  readonly timezone: string;
  readonly utcOffset?: string;
}

@Injectable({ providedIn: 'root' })
export class ClockService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = '/api/clock';

  private _time = '';
  private _error: string | null = null;
  private serverTimeOffset = 0;
  private _hasSynced = false;
  private _utcOffset = '';

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;

    // Sync with server every 20 minutes
    timer(0, 20 * 60 * 1000)
      .pipe(
        switchMap(() =>
          this.http.get<ClockResponse>(this.apiUrl).pipe(
            retry(2),
            catchError((err) => {
              console.error('Could not fetch time.', err);
              this._error = 'Could not fetch time.';
              return of(null);
            }),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        if (response) {
          this.serverTimeOffset = Date.now() - moment(response.time).valueOf();
          this._hasSynced = true;
          this._time = moment(Date.now() - this.serverTimeOffset).format('YYYY-MM-DD HH:mm:ss');
          if (response.utcOffset) this._utcOffset = response.utcOffset;
          this._error = null;
        }
      });

    // Update time every minute (only after first sync)
    timer(0, 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this._hasSynced) return;
        const syncedTime = Date.now() - this.serverTimeOffset;
        this._time = moment(syncedTime).format('YYYY-MM-DD HH:mm:ss');
      });
  }

  time(): string { return this._time; }
  error(): string | null { return this._error; }
  /** UTC offset string of the server timezone, e.g. '+02:00'. Empty until first sync. */
  utcOffset(): string { return this._utcOffset; }

  /** Synced current time in milliseconds */
  nowMs(): number { return Date.now() - this.serverTimeOffset; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
