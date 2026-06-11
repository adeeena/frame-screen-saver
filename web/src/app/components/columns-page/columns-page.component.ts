import { ChangeDetectionStrategy, Component, Input, ViewChild, ElementRef, AfterViewChecked, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import moment from 'moment';
import { ClockService } from '../../services/clock.service';
import { TrainService, Departure } from '../../services/train.service';
import { CalendarService, CalendarDay, CalendarEvent } from '../../services/calendar.service';
import { WeatherService } from '../../services/weather.service';
import { SolarService } from '../../services/solar.service';
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
  styleUrls: ['./columns-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class ColumnsPageComponent implements AfterViewChecked {
  @Input() sidebarLayout = false;

  readonly config = serverConfig;

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
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

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
      .slice(0, this.config.calendar.maxDisplayDays);
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

  minutesUntil(dep: Departure): number {
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