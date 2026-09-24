import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WeatherService } from '../../services/weather.service';
import { WeatherForecastService, HourlyForecast } from '../../services/weather-forecast.service';
import { SolarEvent, SolarEventResponse, SolarService } from '../../services/solar.service';
import { weatherIconName } from '../../services/weather-icon';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';

/** Width of each meteogram slice, in hours — coarser steps read more easily than hourly ticks. */
const SLICE_HOURS = 3;
/** Number of slices to plot (24h of forecast). */
const SLICE_COUNT = 8;

export interface MeteogramSlice extends HourlyForecast {
  /** Precipitation (mm) summed across the whole slice, not just its first hour. */
  readonly precipitation: number;
}

interface NightBand {
  readonly leftPercent: number;
  readonly widthPercent: number;
}

@Component({
  selector: 'app-weather-page',
  templateUrl: './weather-page.html',
  styleUrls: ['./weather-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class WeatherPageComponent {
  private hourlySource: readonly HourlyForecast[] | null = null;
  private solarSource: SolarEventResponse | null = null;
  private meteogramCache: readonly MeteogramSlice[] = [];
  private nightBandsCache: readonly NightBand[] = [];
  private temperaturePathCache = '';
  private maximumPrecipitation = 0.1;

  constructor(
    readonly weatherService: WeatherService,
    readonly forecastService: WeatherForecastService,
    readonly solarService: SolarService,
    readonly configService: ScreensaverConfigService,
  ) {}

  get currentIconName(): string {
    return weatherIconName(this.weatherService.symbolCode());
  }

  /** Wind speed converted from the API's m/s to knots. */
  get windKnots(): number {
    return Math.round(this.weatherService.windSpeed() * 1.94384);
  }

  hourIconName(h: HourlyForecast): string {
    return weatherIconName(h.symbolCode);
  }

  /** Hourly forecast resampled into 3-hour slices for a more legible chart. */
  get meteogram(): readonly MeteogramSlice[] {
    this.refreshDerivedWeather();
    return this.meteogramCache;
  }

  get nightBands(): readonly NightBand[] {
    this.refreshDerivedWeather();
    return this.nightBandsCache;
  }

  /** Rain bar height as a percentage of the tallest bar in the visible window. Zero mm renders no bar at all. */
  barHeight(mm: number): number {
    this.refreshDerivedWeather();
    return Math.round((mm / this.maximumPrecipitation) * 100);
  }

  /** Smooth SVG path (0–100 viewBox) tracing the temperature curve through each slice. */
  get temperaturePath(): string {
    this.refreshDerivedWeather();
    return this.temperaturePathCache;
  }

  private refreshDerivedWeather(): void {
    const hourly = this.forecastService.hourly();
    const solar = this.solarService.nextEvent();
    if (hourly === this.hourlySource && solar === this.solarSource) return;

    this.hourlySource = hourly;
    this.solarSource = solar;
    const slices: MeteogramSlice[] = [];
    for (let i = 0; i < SLICE_COUNT; i++) {
      const start = i * SLICE_HOURS;
      const head = hourly[start];
      if (!head) break;
      const block = hourly.slice(start, start + SLICE_HOURS);
      const precipitation = Math.round(block.reduce((sum, h) => sum + h.precipitation, 0) * 10) / 10;
      slices.push({ ...head, precipitation });
    }
    this.meteogramCache = slices;
    this.maximumPrecipitation = Math.max(...slices.map((hour) => hour.precipitation), 0.1);
    this.nightBandsCache = this.createNightBands(
      hourly.slice(0, SLICE_COUNT * SLICE_HOURS),
      solar?.events ?? [],
    );
    this.temperaturePathCache = this.createTemperaturePath(slices);
  }

  private createNightBands(hours: readonly HourlyForecast[], solarEvents: readonly SolarEvent[]): readonly NightBand[] {
    if (hours.length === 0) return [];

    const windowStart = Date.parse(hours[0].time);
    const windowEnd = Date.parse(hours[hours.length - 1].time);
    if (windowEnd <= windowStart) return [];
    const daylight = solarEvents
      .reduce<Array<{ start: number; end: number }>>((periods, event, index, events) => {
        if (event.type !== 'sunrise') return periods;
        const sunset = events.slice(index + 1).find((candidate) => candidate.type === 'sunset');
        if (sunset) periods.push({ start: Date.parse(event.time), end: Date.parse(sunset.time) });
        return periods;
      }, []);

    if (daylight.length === 0) return this.symbolNightBands(hours);

    const bands: NightBand[] = [];
    let cursor = windowStart;
    for (const period of daylight) {
      if (period.end <= windowStart || period.start >= windowEnd) continue;
      if (cursor < period.start) bands.push(this.makeNightBand(cursor, Math.min(period.start, windowEnd), windowStart, windowEnd));
      cursor = Math.max(cursor, period.end);
    }
    if (cursor < windowEnd) bands.push(this.makeNightBand(cursor, windowEnd, windowStart, windowEnd));

    return bands;
  }

  /** Smooth SVG path (0–100 viewBox) tracing the temperature curve through each slice.
   *  Kept clear of the top of its box (PADDING_TOP) so it never collides with the
   *  per-slice temperature/icon labels drawn above it. */
  private createTemperaturePath(points: readonly MeteogramSlice[]): string {
    const PADDING_TOP = 28;
    if (points.length === 0) return '';
    const temps = points.map((h) => h.temperature);
    const min = Math.min(...temps);
    const range = Math.max(...temps) - min || 1;
    const step = 100 / Math.max(1, points.length - 1);
    const coords: Array<readonly [number, number]> = points.map((h, i) => [
      i * step,
      100 - ((h.temperature - min) / range) * (100 - PADDING_TOP),
    ]);
    return this.smoothPath(coords);
  }

  /** Catmull-Rom → cubic Bézier smoothing, so the line flows through every point instead of jagged segments.
   *  Control points are clamped to each segment's own value range so the curve never overshoots
   *  past the top of a peak or the bottom of a dip (i.e. never crosses above the highest label). */
  private smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
    }
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
      const segMinY = Math.min(p1[1], p2[1]);
      const segMaxY = Math.max(p1[1], p2[1]);
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = Math.min(segMaxY, Math.max(segMinY, p1[1] + (p2[1] - p0[1]) / 6));
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = Math.min(segMaxY, Math.max(segMinY, p2[1] - (p3[1] - p1[1]) / 6));
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  private makeNightBand(start: number, end: number, windowStart: number, windowEnd: number): NightBand {
    const duration = windowEnd - windowStart;
    return {
      leftPercent: ((start - windowStart) / duration) * 100,
      widthPercent: ((end - start) / duration) * 100,
    };
  }

  private symbolNightBands(hours: readonly HourlyForecast[]): readonly NightBand[] {
    const bands: NightBand[] = [];
    let start = -1;
    for (let index = 0; index <= hours.length; index++) {
      const isDark = index < hours.length && /_(night|polartwilight)$/.test(hours[index].symbolCode);
      if (isDark && start < 0) start = index;
      if (!isDark && start >= 0) {
        bands.push({
          leftPercent: (start / hours.length) * 100,
          widthPercent: ((index - start) / hours.length) * 100,
        });
        start = -1;
      }
    }
    return bands;
  }
}

