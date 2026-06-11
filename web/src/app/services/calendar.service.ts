import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Subject, interval, of } from 'rxjs';
import { switchMap, catchError, startWith, takeUntil } from 'rxjs/operators';

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

@Injectable({ providedIn: 'root' })
export class CalendarService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private _days: readonly CalendarDay[] = [];

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
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
        takeUntil(this.destroy$),
      )
      .subscribe((data) => { this._days = data; });
  }

  days(): readonly CalendarDay[] { return this._days; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

