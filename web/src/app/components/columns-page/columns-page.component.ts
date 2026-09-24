import { ChangeDetectionStrategy, Component, Input, ViewChild, ElementRef, AfterViewChecked, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import moment from 'moment';
import { ClockService } from '../../services/clock.service';
import { CalendarService, CalendarDay, CalendarEvent } from '../../services/calendar.service';
import { ScreensaverConfigService, WorldClockCity } from '../../services/screensaver-config.service';
import { WeatherService, WorldCityWeather } from '../../services/weather.service';
import { weatherIconName } from '../../services/weather-icon';

interface CityWeatherDisplay {
  readonly name: string;
  readonly iconName: string;
  readonly temperature: number;
  readonly timezone?: string;
}

interface OffPeakStatus {
  readonly labelKey: string;
  readonly countdown: string;
}

const MINUTE_MS = 60 * 1000;

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
  private worldCityWeatherSource: readonly WorldCityWeather[] | null = null;
  private worldClockCitiesSource: readonly WorldClockCity[] | null = null;
  private compactCityWeather: readonly CityWeatherDisplay[] = [];
  private featuredCityWeather: CityWeatherDisplay | null = null;
  private readonly cityTimeFormatters = new Map<string, Intl.DateTimeFormat>();
  private readonly timezoneOffsetFormatters = new Map<string, Intl.DateTimeFormat>();
  private offsetCacheKey = '';
  private offsetCache = '';
  private calendarSource: readonly CalendarDay[] | null = null;
  private calendarMinute = -1;
  private calendarMaxDays = -1;
  private candidateDaysCache: readonly CalendarDay[] = [];
  private displayDaysSource: readonly CalendarDay[] | null = null;
  private displayDaysTrimCount = -1;
  private displayDaysCache: readonly CalendarDay[] = [];

  constructor(
    readonly clockService: ClockService,
    readonly calendarService: CalendarService,
    readonly configService: ScreensaverConfigService,
    readonly weatherService: WeatherService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  get config() { return this.configService.config()?.appSettings ?? null; }

  get offPeakStatus(): OffPeakStatus {
    const timezone = this.config?.timezone ?? 'UTC';
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(this.clockService.nowMs());
    const [hours, minutes] = localTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    const inMorningOffPeak = currentMinutes >= 30 && currentMinutes < 390;
    const inAfternoonOffPeak = currentMinutes >= 870 && currentMinutes < 990;
    const targetMinutes = inMorningOffPeak
      ? 390
      : inAfternoonOffPeak
        ? 990
        : currentMinutes < 30
          ? 30
          : currentMinutes < 870
            ? 870
            : 30 + 24 * 60;

    return {
      labelKey: inMorningOffPeak || inAfternoonOffPeak ? 'eco.endsIn' : 'eco.nextStart',
      countdown: formatDuration(targetMinutes - currentMinutes),
    };
  }

  /** Compact-only cities (name + icon + temp), in configured order. */
  get compactCities(): readonly CityWeatherDisplay[] {
    this.refreshCityWeather();
    return this.compactCityWeather;
  }

  get featuredCity(): CityWeatherDisplay | null {
    this.refreshCityWeather();
    return this.featuredCityWeather;
  }

  private cityWeather(config: WorldClockCity, citiesByName: ReadonlyMap<string, WorldCityWeather>): CityWeatherDisplay | null {
    const weather = citiesByName.get(config.name);
    if (!weather) return null;
    return {
      name: config.name,
      iconName: weatherIconName(weather.symbolCode),
      temperature: weather.temperature,
      timezone: config.timezone,
    };
  }

  private refreshCityWeather(): void {
    const source = this.weatherService.worldCities();
    const cityConfigs = this.config?.worldClock.cities ?? [];
    if (source === this.worldCityWeatherSource && cityConfigs === this.worldClockCitiesSource) return;

    this.worldCityWeatherSource = source;
    this.worldClockCitiesSource = cityConfigs;
    const citiesByName = new Map(source.map((city) => [city.name, city]));
    this.compactCityWeather = cityConfigs
      .filter((city) => city.role === 'compact')
      .map((city) => this.cityWeather(city, citiesByName))
      .filter((city): city is CityWeatherDisplay => city !== null);
    const featuredConfig = cityConfigs.find((city) => city.role === 'featured' && city.timezone);
    this.featuredCityWeather = featuredConfig
      ? this.cityWeather(featuredConfig, citiesByName)
      : null;
  }

  get featuredCityTime(): string {
    const city = this.featuredCity;
    if (!city?.timezone) return '';
    let formatter = this.cityTimeFormatters.get(city.timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: city.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      this.cityTimeFormatters.set(city.timezone, formatter);
    }
    return formatter.format(this.clockService.nowMs());
  }

  get featuredCityOffsetLabel(): string {
    const nowMs = this.clockService.nowMs();
    const city = this.featuredCity;
    if (!city?.timezone) return '';
    const localTz = this.config?.timezone ?? 'UTC';
    const cacheKey = `${localTz}:${city.timezone}:${Math.floor(nowMs / MINUTE_MS)}`;
    if (cacheKey === this.offsetCacheKey) return this.offsetCache;

    const diff = this.tzOffsetMinutes(localTz, nowMs) - this.tzOffsetMinutes(city.timezone, nowMs);
    const sign = diff >= 0 ? '+' : '-';
    const abs = Math.abs(diff);
    this.offsetCacheKey = cacheKey;
    this.offsetCache = `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
    return this.offsetCache;
  }

  /** Minutes east of UTC for the given IANA timezone at the given instant. */
  private tzOffsetMinutes(timeZone: string, atMs: number): number {
    let formatter = this.timezoneOffsetFormatters.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
      this.timezoneOffsetFormatters.set(timeZone, formatter);
    }
    const zoneLabel = formatter.format(atMs).match(/(?:GMT|UTC)([+-]\d{1,2})(?::?(\d{2}))?/i)?.[0] ?? '';
    const match = zoneLabel.match(/(?:GMT|UTC)([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours * 60 + (hours < 0 ? -minutes : minutes);
  }

  get candidateDays(): readonly CalendarDay[] {
    const nowMs = this.clockService.nowMs();
    const minute = Math.floor(nowMs / MINUTE_MS);
    const source = this.calendarService.days();
    const maxDays = this.config?.calendar?.maxDisplayDays ?? 2;
    if (source === this.calendarSource && minute === this.calendarMinute && maxDays === this.calendarMaxDays) {
      return this.candidateDaysCache;
    }

    const todayStr = moment(nowMs).format('YYYY-MM-DD');
    const nowTime = moment(nowMs).format('HH:mm');
    this.calendarSource = source;
    this.calendarMinute = minute;
    this.calendarMaxDays = maxDays;
    this.candidateDaysCache = source
      .map((day) => {
        if (day.date === todayStr) {
          const events = day.events.filter((e) => e.isAllDay || e.startTime >= nowTime);
          return { ...day, events };
        }
        return day;
      })
      .filter((d) => d.events.length > 0)
      .slice(0, maxDays);
    return this.candidateDaysCache;
  }

  get displayDays(): readonly CalendarDay[] {
    const candidateDays = this.candidateDays;
    if (candidateDays === this.displayDaysSource && this.trimCount === this.displayDaysTrimCount) {
      return this.displayDaysCache;
    }

    let days = [...candidateDays] as CalendarDay[];
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
    this.displayDaysSource = candidateDays;
    this.displayDaysTrimCount = this.trimCount;
    this.displayDaysCache = days;
    return this.displayDaysCache;
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

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}