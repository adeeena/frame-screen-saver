import { ChangeDetectionStrategy, Component, computed, inject, input, signal, ViewChild, ElementRef, effect, untracked, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import moment from 'moment';
import { ClockService } from '../../services/clock.service';
import { TrainService, Departure } from '../../services/train.service';
import { CalendarService, CalendarDay, CalendarEvent } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { SolarService } from '../../services/solar.service';
import { FormatDateTimePipe } from '../../pipes/format-date-time.pipe';
import { FeatherIconDirective } from '../../directives/feather-icon.directive';
import { serverConfig } from '../../../server.config';

const MAX_MINUTES = 60;

const WEATHER_ICON_MAP: Readonly<Record<string, string>> = {
  clearsky: 'sun',
  fair: 'sun',
  partlycloudy: 'cloud',
  cloudy: 'cloud',
  fog: 'wind',
  lightrain: 'cloud-drizzle',
  lightrainshowers: 'cloud-drizzle',
  rain: 'cloud-rain',
  rainshowers: 'cloud-rain',
  heavyrain: 'cloud-rain',
  heavyrainshowers: 'cloud-rain',
  lightsnow: 'cloud-snow',
  snow: 'cloud-snow',
  heavysnow: 'cloud-snow',
  sleet: 'cloud-snow',
  lightsleet: 'cloud-snow',
  thunder: 'cloud-lightning',
  rainandthunder: 'cloud-lightning',
} as const;

@Component({
  selector: 'app-columns-page',
  templateUrl: './columns-page.html',
  styleUrl: './columns-page.scss',
  standalone: true,
  imports: [FormatDateTimePipe, FeatherIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColumnsPageComponent {
  readonly clockService = inject(ClockService);
  readonly trainService = inject(TrainService);
  readonly calendarService = inject(CalendarService);
  readonly weatherService = inject(WeatherService);
  readonly solarService = inject(SolarService);
  readonly config = serverConfig;
  readonly sidebarLayout = input(false);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('calendarRef') private calendarRef?: ElementRef<HTMLElement>;

  private readonly _trimCount = signal(0);

  /** Source days: past events removed, max 4 days, before overflow trimming */
  private readonly candidateDays = computed((): readonly CalendarDay[] => {
    void this.clockService.time();
    const now = this.clockService.nowMs();
    const todayStr = moment(now).format('YYYY-MM-DD');
    const nowTime = moment(now).format('HH:mm');
    return this.calendarService.days()
      .map(day => {
        if (day.date === todayStr) {
          const events = day.events.filter(e => e.isAllDay || e.startTime >= nowTime);
          return { ...day, events };
        }
        return day;
      })
      .filter(d => d.events.length > 0)
      .slice(0, this.config.calendar.maxDisplayDays);
  });

  /** Days to actually render, trimmed to avoid container overflow */
  readonly displayDays = computed((): readonly CalendarDay[] => {
    void this.clockService.time();
    let days = [...this.candidateDays()] as CalendarDay[];
    let remaining = this._trimCount();
    while (remaining > 0 && days.length > 0) {
      const last = days[days.length - 1];
      const isOnlyDay = days.length === 1;
      if (!isOnlyDay && last.events.length <= 1) {
        // Remove the whole last day
        days = days.slice(0, -1);
      } else if (last.events.length > 1) {
        // Trim last event of last day
        days = [...days.slice(0, -1), { ...last, events: last.events.slice(0, -1) }];
      } else {
        // Only one event in only day — can't trim further
        break;
      }
      remaining--;
    }
    return days;
  });

  readonly weatherIconName = computed(() => {
    const code = this.weatherService.symbolCode();
    const key = code.replace(/_(day|night|polartwilight)$/, '');
    return WEATHER_ICON_MAP[key] ?? 'cloud';
  });

  constructor() {
    // Reset trim whenever source data changes
    effect(() => {
      this.candidateDays();
      untracked(() => this._trimCount.set(0));
    });

    if (isPlatformBrowser(this.platformId)) {
      // After each change to displayDays, check overflow after two animation frames
      // (first rAF: Angular renders; second rAF: browser paints)
      effect(() => {
        this.displayDays(); // subscribe
        untracked(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = this.calendarRef?.nativeElement;
              if (el && el.scrollHeight > el.clientHeight + 2) {
                this._trimCount.update(v => v + 1);
              }
            });
          });
        });
      });
    }
  }

  departureProgress(dep: Departure): number {
    return Math.max(0, Math.min(100, 100 - (dep.minutesUntilDeparture / MAX_MINUTES) * 100));
  }

  minutesUntil(dep: Departure): number {
    void this.clockService.time();
    const now = Math.floor(Date.now() / 60000) * 60000;
    const dep_min = Math.floor(new Date(dep.expectedDeparture).getTime() / 60000) * 60000;
    return Math.max(0, Math.round((dep_min - now) / 60000));
  }

  dayLabelParts(day: CalendarDay): { accent: string; normal: string } {
    const dateStr = moment(day.date, 'YYYY-MM-DD').format('dddd, MMMM D');
    if (day.dayLabel === 'Today') return { accent: 'Today', normal: '' };
    if (day.dayLabel === 'Tomorrow') return { accent: 'Tomorrow', normal: ', ' + dateStr };
    return { accent: day.dayLabel, normal: ', ' + moment(day.date, 'YYYY-MM-DD').format('MMMM D') };
  }

  eventTime(evt: CalendarEvent): string {
    if (evt.isAllDay) return 'All day';
    if (evt.endTime && evt.endTime !== evt.startTime) return evt.startTime + ' – ' + evt.endTime;
    return evt.startTime;
  }
}