import { ChangeDetectionStrategy, Component, Input, ViewChild, ElementRef, AfterViewChecked, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import moment from 'moment';
import { ClockService } from '../../services/clock.service';
import { CalendarService, CalendarDay, CalendarEvent } from '../../services/calendar.service';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';
import { WeatherService } from '../../services/weather.service';
import { weatherIconName } from '../../services/weather-icon';

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
    readonly calendarService: CalendarService,
    readonly configService: ScreensaverConfigService,
    readonly weatherService: WeatherService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  private static readonly SAO_PAULO_TZ = 'America/Sao_Paulo';
  private static readonly SAO_PAULO_CITY = 'São Paulo';
  /** Cities shown compact (no time/offset) — same timezone as the frame's local timezone. */
  static readonly COMPACT_CITY_NAMES: readonly string[] = ['Paris', 'Basel', 'Budapest', 'Nice'];

  get config() { return this.configService.config()?.appSettings ?? null; }

  /** Compact-only cities (name + icon + temp), in configured order. */
  get compactCities(): readonly { name: string; iconName: string; temperature: number }[] {
    return ColumnsPageComponent.COMPACT_CITY_NAMES
      .map((name) => this.cityWeather(name))
      .filter((c): c is { name: string; iconName: string; temperature: number } => c !== null);
  }

  get saoPauloWeather(): { iconName: string; temperature: number } | null {
    const city = this.cityWeather(ColumnsPageComponent.SAO_PAULO_CITY);
    return city ? { iconName: city.iconName, temperature: city.temperature } : null;
  }

  private cityWeather(name: string): { name: string; iconName: string; temperature: number } | null {
    const city = this.weatherService.worldCities().find((c) => c.name === name);
    if (!city) return null;
    return { name, iconName: weatherIconName(city.symbolCode), temperature: city.temperature };
  }

  get saoPauloTime(): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: ColumnsPageComponent.SAO_PAULO_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(this.clockService.nowMs());
  }

  /** Offset of the frame's local timezone relative to São Paulo, e.g. "+5:00". */
  get saoPauloOffsetLabel(): string {
    const nowMs = this.clockService.nowMs();
    const localTz = this.config?.timezone ?? 'Europe/Paris';
    const diff = this.tzOffsetMinutes(localTz, nowMs) - this.tzOffsetMinutes(ColumnsPageComponent.SAO_PAULO_TZ, nowMs);
    const sign = diff >= 0 ? '+' : '-';
    const abs = Math.abs(diff);
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  }

  /** Minutes east of UTC for the given IANA timezone at the given instant. */
  private tzOffsetMinutes(timeZone: string, atMs: number): number {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(atMs);
    const match = parts.find((p) => p.type === 'timeZoneName')?.value.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours * 60 + (hours < 0 ? -minutes : minutes);
  }

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