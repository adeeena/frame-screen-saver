import { ChangeDetectionStrategy, Component, Input, ViewChild, ElementRef, AfterViewChecked, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import moment from 'moment';
import { ClockService } from '../../services/clock.service';
import { TrainService, Departure } from '../../services/train.service';
import { CalendarService, CalendarDay, CalendarEvent } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { SolarService } from '../../services/solar.service';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';

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
  styleUrls: ['./columns-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class ColumnsPageComponent implements AfterViewChecked {
  @Input() sidebarLayout = false;

  @ViewChild('calendarRef') private calendarRef?: ElementRef<HTMLElement>;

  private trimCount = 0;
  private _trimPending = false;
  private _lastCandidateKey = '';

  constructor(
    readonly clockService: ClockService,
    readonly trainService: TrainService,
    readonly calendarService: CalendarService,
    readonly weatherService: WeatherService,
    readonly solarService: SolarService,
    readonly configService: ScreensaverConfigService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  get config() { return this.configService.config()?.appSettings ?? null; }

  get candidateDays(): readonly CalendarDay[] {
    const nowMs = this.clockService.nowMs();
    const todayStr = moment(nowMs).format('YYYY-MM-DD');
    const nowTime = moment(nowMs).format('HH:mm');
    return this.calendarService.days()
      .map((day) => {
        if (day.date === todayStr) {
          const events = day.events.filter((e) => e.isAllDay || e.startTime >= nowTime);
          return { ...day, events };
        }
        return day;
      })
      .filter((d) => d.events.length > 0)
      .slice(0, this.config?.calendar?.maxDisplayDays ?? 2);
  }

  get displayDays(): readonly CalendarDay[] {
    let days = [...this.candidateDays] as CalendarDay[];
    let remaining = this.trimCount;
    while (remaining > 0 && days.length > 0) {
      const last = days[days.length - 1];
      const isOnlyDay = days.length === 1;
      if (!isOnlyDay && last.events.length <= 1) {
        days = days.slice(0, -1);
      } else if (last.events.length > 1) {
        days = [...days.slice(0, -1), { ...last, events: last.events.slice(0, -1) }];
      } else {
        break;
      }
      remaining--;
    }
    return days;
  }

  get weatherIconName(): string {
    const code = this.weatherService.symbolCode();
    const key = code.replace(/_(day|night|polartwilight)$/, '');
    return WEATHER_ICON_MAP[key] ?? 'cloud';
  }

  ngAfterViewChecked(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Reset trim count when the underlying data changes
    const key = this.candidateDays.map((d) => d.date + ':' + d.events.length).join('|');
    if (key !== this._lastCandidateKey) {
      this._lastCandidateKey = key;
      this.trimCount = 0;
      this._trimPending = false;
    }

    // Trim one event at a time if the calendar container overflows
    if (!this._trimPending) {
      const el = this.calendarRef?.nativeElement;
      if (el && el.scrollHeight > el.clientHeight + 2) {
        this._trimPending = true;
        setTimeout(() => {
          this.trimCount++;
          this._trimPending = false;
        });
      }
    }
  }

  departureProgress(dep: Departure): number {
    return Math.max(0, Math.min(100, 100 - (dep.minutesUntilDeparture / MAX_MINUTES) * 100));
  }

  get futureDepartures(): readonly Departure[] {
    // Use Date.now() (real UTC ms) — not clockService, whose nowMs() can be
    // offset if browser timezone ≠ server timezone (common on embedded Pi).
    // moment() parses the ISO departure string robustly across all formats.
    const nowMs = Date.now();
    return this.trainService.departures().filter(
      (dep) => moment(dep.expectedDeparture).valueOf() >= nowMs,
    );
  }

  minutesUntil(dep: Departure): number {
    // Same rationale: Date.now() avoids clock-service timezone offset issues.
    const now = Math.floor(Date.now() / 60000) * 60000;
    const dep_min = Math.floor(moment(dep.expectedDeparture).valueOf() / 60000) * 60000;
    return Math.max(0, Math.round((dep_min - now) / 60000));
  }

  /** Returns the departure time to display in the server's local timezone.
   *  Prefers the server-computed displayTime field (populated after server rebuild).
   *  Falls back to converting the ISO departure string using the server's UTC offset
   *  (from clockService) — handles both UTC 'Z' strings (PRIM) and offset strings. */
  departureTime(dep: Departure): string {
    if (dep.displayTime) return dep.displayTime;
    const offset = this.clockService.utcOffset();
    if (offset) {
      // moment().utcOffset() shifts the display to the given offset without
      // changing the underlying UTC value. Handles Z, +02:00, and bare strings.
      return moment(dep.expectedDeparture).utcOffset(offset).format('HH:mm');
    }
    return moment.parseZone(dep.expectedDeparture).format('HH:mm');
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