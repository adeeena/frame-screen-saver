import { Injectable, signal, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Subject,
  timer,
  switchMap,
  takeUntil,
  retry,
  catchError,
  of,
  tap,
} from 'rxjs';

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

  private destroy$ = new Subject<void>();

  constructor() {
    timer(0, 20 * 60 * 1000) // Start immediately, then repeat 20 min
      .pipe(
        switchMap(() =>
          this.http.get<ClockResponse>(this.apiUrl).pipe(
            retry(2), // Retry up to 2 times on failure
            tap((response: { time: string; }) => {
              this._time.set(response.time);
              this._error.set(null); // Clear error on success
            }),
            catchError((err) => {
              const errorMessage = 'Could not fetch time.';
              console.error(errorMessage, err);
              this._error.set(errorMessage);
              return of(null); // Continue the stream
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}