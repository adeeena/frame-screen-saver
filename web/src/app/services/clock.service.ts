import { Injectable, signal, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import moment from 'moment';
import { Subject, timer, switchMap, takeUntil, retry, catchError, of, tap } from 'rxjs';

// Interface for the API response
interface ClockResponse {
  time: string;
  timezone: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClockService implements OnDestroy {
  private http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/clock';

  // Signals for time and error state
  private readonly _time = signal('');
  private readonly _error = signal<string | null>(null);

  // Public readonly signals for components
  public readonly time = this._time.asReadonly();
  public readonly error = this._error.asReadonly();

  private serverTimeOffset: number | null = null;
  private destroy$ = new Subject<void>();

  constructor() {
    // 1. Periodically sync with the server to get the time and calculate the offset.
    timer(0, 20 * 60 * 1000) // Syncs on start, then every 20 minutes.
      .pipe(
        switchMap(() =>
          this.http.get<ClockResponse>(this.apiUrl).pipe(
            retry(2),
            catchError((err) => {
              const errorMessage = 'Could not fetch time.';
              console.error(errorMessage, err);
              this._error.set(errorMessage);
              return of(null);
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (response) {
          // Calculate the difference between client time and server time.
          this.serverTimeOffset = Date.now() - moment(response.time).valueOf();
          this._error.set(null);
        }
      });

    // 2. Update the time signal every second using the calculated offset.
    // The formatting pipe will ensure it only visually changes every minute.
    timer(0, 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.serverTimeOffset !== null) {
          const syncedTime = Date.now() - this.serverTimeOffset;
          this._time.set(moment(syncedTime).format('YYYY-MM-DD HH:mm:ss'));
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
