import { Injectable, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap, catchError, of, startWith } from 'rxjs';

export interface CalendarEvent {
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly location: string;
  readonly isAllDay: boolean;
}

export interface CalendarDay {
  readonly date: string;
  readonly dayLabel: string;
  readonly events: readonly CalendarEvent[];
}

@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _days = signal<readonly CalendarDay[]>([]);

  readonly days = this._days.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    interval(15 * 60 * 1000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<CalendarDay[]>('/api/calendar').pipe(
            catchError((err) => {
              console.error('Could not fetch calendar.', err);
              return of([] as CalendarDay[]);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => this._days.set(data));
  }
}

