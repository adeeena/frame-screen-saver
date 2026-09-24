// Zone.js MUST be the very first import in the SSR bundle entry point.
// The browser build gets it via polyfills.ts; the server builder does not.
import 'zone.js/dist/zone-node';
import dotenv from 'dotenv';
import { ngExpressEngine } from '@nguniversal/express-engine';
import { AppServerModule } from './app/app-server.module';
import { APP_BASE_HREF } from '@angular/common';
import express, { Request, Response, NextFunction } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import path from 'path';
import { randomBytes } from 'crypto';
import https from 'https';
import momentTz from 'moment-timezone';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs-extra';
import WebSocket, { WebSocketServer } from 'ws';
import { transit_realtime } from 'gtfs-realtime-bindings';
import { getConfigFilePath, getServerConfig, TransitConfig } from './server.config';
import { calendarDayKey, excludedCalendarDays } from './calendar-recurrence';

// Resolve .env relative to this file (web/.env), not process.cwd() — the working
// directory the server is launched from varies (repo root vs web/) and dotenv's
// default cwd-relative lookup silently finds nothing, leaving API keys undefined.
const webRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(webRoot, '.env') });

const externalAxios = process.env['ALLOW_INSECURE_TLS'] === 'true'
  ? axios.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) })
  : axios.create();

// ─── Media directory (resolved once at startup) ───────────────────────────────
// Relative overrides are anchored to web/, matching the location of web/.env.
const mediaDir = process.env['MEDIA_DIR']
  ? path.resolve(webRoot, process.env['MEDIA_DIR'])
  : path.resolve(webRoot, '../media');

const browserDistFolder = join(__dirname, '../browser');
const configFilePath = getConfigFilePath();
const indexHtml = existsSync(join(browserDistFolder, 'index.original.html'))
  ? 'index.original.html'
  : 'index';

const app = express();

// Our Universal express-engine
app.engine(
  'html',
  ngExpressEngine({
    bootstrap: AppServerModule,
  }),
);

app.set('view engine', 'html');
app.set('views', browserDistFolder);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cache<T> {
  data: T | null;
  expiresAt: number;
}

interface SolarData {
  readonly type: 'sunrise' | 'sunset';
  readonly time: string;
  readonly utcOffset: string;
  readonly events: readonly {
    readonly type: 'sunrise' | 'sunset';
    readonly time: string;
  }[];
}

interface StoredMessage {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

interface WeatherData {
  readonly temperature: number;
  readonly symbolCode: string;
  readonly weatherLabel: string;
  readonly windSpeed: number;
  readonly windDirection: number;
  readonly uvIndex: number | null;
}

interface WorldCityConfig {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface WorldCityWeather {
  readonly name: string;
  readonly temperature: number;
  readonly symbolCode: string;
}

interface HourlyForecastPoint {
  readonly time: string;
  /** Pre-formatted local time string (HH:mm) — computed server-side to avoid client timezone issues. */
  readonly hourLabel: string;
  readonly temperature: number;
  /** Expected precipitation (mm) in the hour following this point. */
  readonly precipitation: number;
  /** Cloud cover percentage (0–100). */
  readonly cloudCoverage: number;
  readonly symbolCode: string;
  /** UV index (clear-sky max) for this hour, when the provider reports one. */
  readonly uvIndex: number | null;
}

interface WeatherForecastData {
  readonly hourly: readonly HourlyForecastPoint[];
  readonly todayMin: number;
  readonly todayMax: number;
  readonly todayCloudMin: number;
  readonly todayCloudMax: number;
  readonly todayUvMin: number | null;
  readonly todayUvMax: number | null;
  /** Total expected precipitation (mm) over the next 12 hours. */
  readonly next12hPrecipitation: number;
  readonly willRain: boolean;
  readonly willBeSunny: boolean;
}

interface Departure {
  readonly line: string;
  readonly lineColor?: string;
  readonly lineTextColor?: string;
  readonly missionCode?: string;
  readonly destination: string;
  readonly scheduledDeparture: string;
  readonly expectedDeparture: string;
  /** Pre-formatted local time string (HH:mm) — computed server-side to avoid client timezone issues. */
  readonly displayTime: string;
  readonly minutesUntilDeparture: number;
  readonly status: 'onTime' | 'delayed' | 'unknown';
}

interface CalendarEventEntry {
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly location: string;
  readonly isAllDay: boolean;
}

interface CalendarDay {
  readonly date: string;
  readonly dayLabel: string;
  readonly events: readonly CalendarEventEntry[];
}

// ─── Caches ───────────────────────────────────────────────────────────────────

const solarCache: Cache<SolarData> = { data: null, expiresAt: 0 };
const weatherCache: Cache<WeatherData> = { data: null, expiresAt: 0 };
const weatherForecastCache: Cache<WeatherForecastData> = { data: null, expiresAt: 0 };
const worldWeatherCaches = new Map<string, Cache<WorldCityWeather>>();
const transitCaches = new Map<string, Cache<readonly Departure[]>>();
const calendarCache: Cache<readonly CalendarDay[]> = { data: null, expiresAt: 0 };

// ─── Weather symbol map ───────────────────────────────────────────────────────

const SYMBOL_MAP: Readonly<Record<string, string>> = {
  clearsky: 'Clear',
  fair: 'Fair',
  partlycloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  lightrain: 'Light rain',
  rain: 'Rain',
  heavyrain: 'Heavy rain',
  lightrainshowers: 'Light showers',
  rainshowers: 'Showers',
  heavyrainshowers: 'Heavy showers',
  lightsnow: 'Light snow',
  snow: 'Snow',
  heavysnow: 'Heavy snow',
  sleet: 'Sleet',
  lightsleet: 'Light sleet',
  thunder: 'Storm',
  rainandthunder: 'Thunderstorm',
} as const;

function getWeatherLabel(symbolCode: string): string {
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  return SYMBOL_MAP[base] ?? symbolCode;
}

function metNoUserAgent(): string {
  return process.env['MET_NO_USER_AGENT'] || 'ambient-display/1.0';
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function clockHandler(_req: Request, res: Response): Promise<void> {
  const { timezone } = getServerConfig();
  const now = momentTz.tz(timezone);
  res.json({
    time: now.format('YYYY-MM-DD HH:mm:ss'),
    timezone,
    utcOffset: now.format('Z'),
  });
}

async function solarHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { timezone, location } = getServerConfig();
    const now = momentTz.tz(timezone);
    if (solarCache.data && Date.now() < solarCache.expiresAt) {
      res.json(solarCache.data);
      return;
    }
    const { latitude, longitude } = location;
    const offset = now.format('Z');
    const getSolarData = async (date: string): Promise<{ sunrise: { time: string }; sunset: { time: string } }> => {
      const url = new URL('https://api.met.no/weatherapi/sunrise/3.0/sun');
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('date', date);
      url.searchParams.set('offset', offset);
      const resp = await externalAxios.get(url.toString(), { headers: { 'User-Agent': metNoUserAgent() } });
      return resp.data.properties as { sunrise: { time: string }; sunset: { time: string } };
    };
    const todayData = await getSolarData(now.format('YYYY-MM-DD'));
    const todaySunrise = momentTz.parseZone(todayData.sunrise.time);
    const todaySunset = momentTz.parseZone(todayData.sunset.time);
    const tomorrow = now.clone().add(1, 'day');
    const tomorrowData = await getSolarData(tomorrow.format('YYYY-MM-DD'));
    const tomorrowSunrise = momentTz.parseZone(tomorrowData.sunrise.time);
    const tomorrowSunset = momentTz.parseZone(tomorrowData.sunset.time);
    let nextEventTime: momentTz.Moment;
    let nextEventType: 'sunrise' | 'sunset';
    if (now.isBefore(todaySunrise)) {
      nextEventType = 'sunrise';
      nextEventTime = todaySunrise;
    } else if (now.isBefore(todaySunset)) {
      nextEventType = 'sunset';
      nextEventTime = todaySunset;
    } else {
      nextEventType = 'sunrise';
      nextEventTime = tomorrowSunrise;
    }
    const data: SolarData = {
      type: nextEventType,
      // .format() includes the UTC offset (e.g. '2026-06-12T04:51:26+02:00')
      // so the client pipe (moment.parseZone) can display in the correct timezone.
      time: nextEventTime.format(),
      utcOffset: nextEventTime.format('Z'),
      events: [
        { type: 'sunrise', time: todaySunrise.format() },
        { type: 'sunset', time: todaySunset.format() },
        { type: 'sunrise', time: tomorrowSunrise.format() },
        { type: 'sunset', time: tomorrowSunset.format() },
      ],
    };
    solarCache.data = data;
    solarCache.expiresAt = nextEventTime.valueOf();
    res.json(data);
  } catch (error) {
    console.error('Solar handler error:', error);
    if (solarCache.data) { res.json(solarCache.data); }
    else { res.status(500).json({ message: 'Solar data unavailable' }); }
  }
}

async function weatherHandler(_req: Request, res: Response): Promise<void> {
  try {
    if (weatherCache.data && Date.now() < weatherCache.expiresAt) {
      res.json(weatherCache.data);
      return;
    }
    const { latitude, longitude } = getServerConfig().location;
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
    const resp = await externalAxios.get<{
      properties: {
        timeseries: Array<{
          data: {
            instant: { details: { air_temperature: number; wind_speed: number; wind_from_direction: number } };
            next_1_hours?: { summary: { symbol_code: string }; details?: { ultraviolet_index_clear_sky_max?: number } };
          };
        }>;
      };
    }>(url, { headers: { 'User-Agent': metNoUserAgent() } });
    const timeseries = resp.data.properties.timeseries[0];
    const instant = timeseries.data.instant.details;
    const symbolCode = timeseries.data.next_1_hours?.summary?.symbol_code ?? 'clearsky_day';
    const uvRaw = timeseries.data.next_1_hours?.details?.ultraviolet_index_clear_sky_max;
    const data: WeatherData = {
      temperature: Math.round(instant.air_temperature),
      symbolCode,
      weatherLabel: getWeatherLabel(symbolCode),
      windSpeed: instant.wind_speed,
      windDirection: instant.wind_from_direction,
      uvIndex: uvRaw != null ? Math.round(uvRaw) : null,
    };
    const expiresHeader = resp.headers['expires'] as string | undefined;
    const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : Date.now() + 30 * 60 * 1000;
    weatherCache.data = data;
    weatherCache.expiresAt = expiresAt;
    res.json(data);
  } catch (error) {
    console.error('Weather handler error:', error);
    if (weatherCache.data) { res.json(weatherCache.data); }
    else { res.json({ temperature: 0, symbolCode: 'clearsky_day', weatherLabel: 'Unknown', windSpeed: 0, windDirection: 0, uvIndex: null }); }
  }
}

async function weatherForecastHandler(_req: Request, res: Response): Promise<void> {
  try {
    if (weatherForecastCache.data && Date.now() < weatherForecastCache.expiresAt) {
      res.json(weatherForecastCache.data);
      return;
    }
    const { timezone, location } = getServerConfig();
    const { latitude, longitude } = location;
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
    const resp = await externalAxios.get<{
      properties: {
        timeseries: Array<{
          time: string;
          data: {
            instant: { details: { air_temperature: number; cloud_area_fraction?: number } };
            next_1_hours?: {
              summary: { symbol_code: string };
              details?: { precipitation_amount?: number; ultraviolet_index_clear_sky_max?: number };
            };
          };
        }>;
      };
    }>(url, { headers: { 'User-Agent': metNoUserAgent() } });

    // The compact endpoint only carries an hourly next_1_hours breakdown for the near
    // term (~2 days) before falling back to 6-hourly steps — filter those out.
    const HOURS_AHEAD = 24;
    const hourly: HourlyForecastPoint[] = resp.data.properties.timeseries
      .filter((entry) => entry.data.next_1_hours)
      .slice(0, HOURS_AHEAD)
      .map((entry) => ({
        time: entry.time,
        hourLabel: momentTz.parseZone(entry.time).tz(timezone).format('HH:mm'),
        temperature: Math.round(entry.data.instant.details.air_temperature),
        precipitation: entry.data.next_1_hours?.details?.precipitation_amount ?? 0,
        cloudCoverage: Math.round(entry.data.instant.details.cloud_area_fraction ?? 0),
        symbolCode: entry.data.next_1_hours?.summary.symbol_code ?? 'clearsky_day',
        uvIndex: entry.data.next_1_hours?.details?.ultraviolet_index_clear_sky_max != null
          ? Math.round(entry.data.next_1_hours.details.ultraviolet_index_clear_sky_max)
          : null,
      }));

    const today = momentTz.tz(timezone).format('YYYY-MM-DD');
    const todayEntries = hourly.filter(
      (h) => momentTz.parseZone(h.time).tz(timezone).format('YYYY-MM-DD') === today,
    );
    const source = todayEntries.length > 0 ? todayEntries : hourly;
    const temps = source.map((h) => h.temperature);
    const clouds = source.map((h) => h.cloudCoverage);
    const uvValues = source.map((h) => h.uvIndex).filter((uv): uv is number => uv !== null);
    const next12hPrecipitation = hourly.slice(0, 12).reduce((sum, h) => sum + h.precipitation, 0);
    const willRain = source.some((h) => h.precipitation >= 0.2 || /rain|sleet|snow|thunder/.test(h.symbolCode));
    const daylightEntries = source.filter((h) => {
      const hour = momentTz.parseZone(h.time).tz(timezone).hour();
      return hour >= 8 && hour <= 20;
    });
    const clearCount = daylightEntries.filter((h) => /^(clearsky|fair)/.test(h.symbolCode)).length;
    const willBeSunny = !willRain && daylightEntries.length > 0 && clearCount / daylightEntries.length >= 0.5;

    const data: WeatherForecastData = {
      hourly,
      todayMin: temps.length > 0 ? Math.min(...temps) : 0,
      todayMax: temps.length > 0 ? Math.max(...temps) : 0,
      todayCloudMin: clouds.length > 0 ? Math.min(...clouds) : 0,
      todayCloudMax: clouds.length > 0 ? Math.max(...clouds) : 0,
      todayUvMin: uvValues.length > 0 ? Math.min(...uvValues) : null,
      todayUvMax: uvValues.length > 0 ? Math.max(...uvValues) : null,
      next12hPrecipitation: Math.round(next12hPrecipitation * 10) / 10,
      willRain,
      willBeSunny,
    };
    const expiresHeader = resp.headers['expires'] as string | undefined;
    const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : Date.now() + 30 * 60 * 1000;
    weatherForecastCache.data = data;
    weatherForecastCache.expiresAt = expiresAt;
    res.json(data);
  } catch (error) {
    console.error('Weather forecast handler error:', error);
    if (weatherForecastCache.data) { res.json(weatherForecastCache.data); }
    else { res.json({ hourly: [], todayMin: 0, todayMax: 0, todayCloudMin: 0, todayCloudMax: 0, todayUvMin: null, todayUvMax: null, next12hPrecipitation: 0, willRain: false, willBeSunny: false }); }
  }
}

async function fetchWorldCityWeather(city: WorldCityConfig): Promise<WorldCityWeather> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${city.latitude}&lon=${city.longitude}`;
  const resp = await externalAxios.get<{
    properties: {
      timeseries: Array<{
        data: {
          instant: { details: { air_temperature: number } };
          next_1_hours?: { summary: { symbol_code: string } };
        };
      }>;
    };
  }>(url, { headers: { 'User-Agent': metNoUserAgent() } });
  const timeseries = resp.data.properties.timeseries[0];
  return {
    name: city.name,
    temperature: Math.round(timeseries.data.instant.details.air_temperature),
    symbolCode: timeseries.data.next_1_hours?.summary?.symbol_code ?? 'clearsky_day',
  };
}

async function worldWeatherHandler(_req: Request, res: Response): Promise<void> {
  const config = await fs.readJson(configFilePath).catch(() => ({})) as {
    appSettings?: { worldClock?: { cities?: WorldCityConfig[] } };
  };
  const cities = config.appSettings?.worldClock?.cities ?? [];

  const result = await Promise.all(cities.map(async (city) => {
    const cache = worldWeatherCaches.get(city.name) ?? { data: null, expiresAt: 0 };
    worldWeatherCaches.set(city.name, cache);
    try {
      if (!cache.data || Date.now() >= cache.expiresAt) {
        cache.data = await fetchWorldCityWeather(city);
        cache.expiresAt = Date.now() + 30 * 60 * 1000;
      }
    } catch (error) {
      console.error(`World-clock weather for ${city.name} error:`, (error as Error)?.message ?? error);
    }
    return cache.data ?? { name: city.name, temperature: 0, symbolCode: 'clearsky_day' };
  }));
  res.json(result);
}

async function imageListHandler(_req: Request, res: Response): Promise<void> {
  try {
    const baseUrl = mediaDir;
    if (!(await fs.pathExists(baseUrl))) { res.json([]); return; }
    const subdirs = await fs.readdir(baseUrl);
    const result: Array<{ type: string; id: string }> = [];
    for (const subdir of subdirs) {
      const subdirPath = path.join(baseUrl, subdir);
      const stat = await fs.stat(subdirPath);
      if (!stat.isDirectory()) continue;
      const files = await fs.readdir(subdirPath);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          result.push({ type: subdir, id: path.basename(file, ext) });
        }
      }
    }
    res.json(result);
  } catch (error) {
    console.error('Image list handler error:', error);
    res.json([]);
  }
}

async function imageMetaHandler(req: Request, res: Response): Promise<void> {
  const { type, id } = req.query as Record<string, string>;
  try {
    if (!type || !id) { res.json({ location: '', title: '', subtitle: '' }); return; }
    const metaPath = path.join(mediaDir, type, `${id}.json`);
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath);
      res.json(meta);
    } else {
      res.json({ location: '', title: '', subtitle: '' });
    }
  } catch { res.json({ location: '', title: '', subtitle: '' }); }
}

async function imageHandler(req: Request, res: Response): Promise<void> {
  const { type, id, width, height, noCache } = req.query as Record<string, string>;
  if (!type || !id) { res.status(400).json({ message: "Missing 'type' or 'id' query parameters." }); return; }
  const useCache = !noCache || noCache === 'false';
  const cacheKey = `${new URLSearchParams(req.query as Record<string, string>).toString()}.jpg`;
  const imageCacheDir = path.join(mediaDir, 'cache');
  const cachePath = path.join(imageCacheDir, cacheKey);
  try {
    if (useCache && (await fs.pathExists(cachePath))) { res.sendFile(cachePath); return; }
    const sourceDir = path.join(mediaDir, type);
    if (!(await fs.pathExists(sourceDir))) { res.status(404).json({ message: 'Image source directory not found.' }); return; }
    const files = await fs.readdir(sourceDir) as string[];
    const filename = files.find((f: string) => f.startsWith(id + '.'));
    if (!filename) { res.status(404).json({ message: 'Image not found.' }); return; }
    let imageProcessor = sharp(path.join(sourceDir, filename));
    const parsedWidth = parseInt(width, 10);
    const parsedHeight = parseInt(height, 10);
    if (!isNaN(parsedWidth) && !isNaN(parsedHeight)) {
      imageProcessor = imageProcessor.resize({ width: parsedWidth, height: parsedHeight, fit: 'cover', position: 'center' });
    }
    const imageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();
    if (useCache) {
      try { await fs.ensureDir(imageCacheDir); await fs.writeFile(cachePath, imageBuffer); }
      catch (cacheError) { console.error('Failed to write image cache:', cacheError); }
    }
    res.set('Content-Type', 'image/jpeg');
    res.send(imageBuffer);
  } catch (error: unknown) {
    console.error('Image handler error:', error);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') { res.status(404).json({ message: 'Image source not found.' }); }
    else { res.status(500).json({ message: 'Internal Server Error' }); }
  }
}

// ─── Transit providers ───────────────────────────────────────────────────────

/** Navitia (open-source, navitia.io) — covers 40+ countries, requires NAVITIA_TOKEN env var */
async function fetchDeparturesNavitia(config: TransitConfig, now: momentTz.Moment): Promise<readonly Departure[]> {
  const token = process.env['NAVITIA_TOKEN'];
  const region = config.navitiaRegion;
  if (!region) throw new Error('navitiaRegion is required for navitia provider');
  if (!token) {
    console.error(`Navitia departures for stop ${config.stopId} skipped: NAVITIA_TOKEN is not set.`);
    return [];
  }
  const url = `https://api.navitia.io/v1/coverage/${region}/stop_areas/${encodeURIComponent(config.stopId)}/departures?count=${config.maxDepartures * 3}&depth=1&disable_disruption=false`;
  const resp = await externalAxios.get<{
    departures: Array<{
      stop_date_time: {
        departure_date_time: string;       // format: YYYYMMDDTHHmmss
        base_departure_date_time?: string;
      };
      route: {
        direction: { stop_point: { name: string } };
        line: { code: string; color?: string; text_color?: string };
      };
    }>;
  }>(url, { auth: { username: token, password: '' } });

  const departures: Departure[] = resp.data.departures.map((d) => {
    const { timezone } = getServerConfig();
    const parseNavitiaDate = (s: string) =>
      momentTz.tz(s, 'YYYYMMDDTHHmmss', timezone);
    const expected = parseNavitiaDate(d.stop_date_time.departure_date_time);
    const scheduled = d.stop_date_time.base_departure_date_time
      ? parseNavitiaDate(d.stop_date_time.base_departure_date_time)
      : expected.clone();
    const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
    const isDelayed = expected.diff(scheduled, 'seconds') > 30;
    return {
      line: d.route.line.code,
      lineColor: d.route.line.color ?? config.lineColor,
      lineTextColor: d.route.line.text_color ?? config.lineTextColor,
      destination: d.route.direction.stop_point.name,
      scheduledDeparture: scheduled.format(),
      expectedDeparture: expected.format(),
      displayTime: expected.format('HH:mm'),
      minutesUntilDeparture: minutesUntil,
      status: (isDelayed ? 'delayed' : 'onTime') as 'onTime' | 'delayed' | 'unknown',
    };
  })
  .filter((d) => d.minutesUntilDeparture >= 0)
  .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
  .slice(0, config.maxDepartures);
  return departures;
}

/** PRIM (Île-de-France Mobilités) SIRI Stop Monitoring */
async function fetchDeparturesPrim(config: TransitConfig, now: momentTz.Moment): Promise<readonly Departure[]> {
  const apiKey = process.env['PRIM_API_KEY'];
  if (!apiKey) {
    console.error(`PRIM departures for stop ${config.stopId} skipped: PRIM_API_KEY is not set.`);
    return [];
  }
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(config.stopId)}`;
  const resp = await externalAxios.get(url, { headers: { apikey: apiKey } });
  type Visit = { MonitoredVehicleJourney: { DestinationName?: Array<{ value: string }>; JourneyNote?: Array<{ value: string }>; MonitoredCall: { AimedDepartureTime: string; ExpectedDepartureTime?: string; DepartureStatus?: string } } };
  const visits: Visit[] = (resp.data as { Siri?: { ServiceDelivery?: { StopMonitoringDelivery?: Array<{ MonitoredStopVisit?: Visit[] }> } } })?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
  const { destinationFilter } = config;
  const { timezone } = getServerConfig();
  return visits
    .map((visit) => {
      const journey = visit.MonitoredVehicleJourney;
      const call = journey.MonitoredCall;
      // Parse and re-format through momentTz so the string always carries the
      // server timezone offset (e.g. +02:00).  PRIM may send bare local-time
      // strings without an offset, which would be misinterpreted by UTC clients.
      const scheduledMoment = momentTz.tz(call.AimedDepartureTime, timezone);
      const expectedMoment = call.ExpectedDepartureTime
        ? momentTz.tz(call.ExpectedDepartureTime, timezone)
        : scheduledMoment.clone();
      const rawMinutes = Math.round(expectedMoment.diff(now, 'minutes'));
      const minutesUntilDeparture = Math.max(0, rawMinutes);
      const rawStatus = call.DepartureStatus;
      const status: 'onTime' | 'delayed' | 'unknown' = rawStatus === 'onTime' ? 'onTime' : rawStatus === 'delayed' ? 'delayed' : 'unknown';
      return { line: config.lineLabel, missionCode: journey.JourneyNote?.[0]?.value, destination: journey.DestinationName?.[0]?.value ?? config.direction, scheduledDeparture: scheduledMoment.format(), expectedDeparture: expectedMoment.format(), displayTime: expectedMoment.format('HH:mm'), minutesUntilDeparture, status };
    })
    .filter((d) => !destinationFilter || d.destination.toLowerCase().includes(destinationFilter.toLowerCase()))
    .filter((_, i, arr) => {
      // Re-derive raw minutes from the formatted string for an accurate past-filter
      // (minutesUntilDeparture is clamped to 0 so can't be used directly)
      const dep = arr[i];
      return momentTz.parseZone(dep.expectedDeparture).diff(now, 'minutes') >= 0;
    })
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, config.maxDepartures);
}

/** BKK Futár REST API (Budapest) — no API key required */
async function fetchDeparturesBkk(config: TransitConfig, now: momentTz.Moment): Promise<readonly Departure[]> {
  const url = `https://futar.bkk.hu/api/query/v1/ws/otp/api/0/departures-for-stop?stopId=${encodeURIComponent(config.stopId)}&minutesBefore=0&minutesAfter=120&limit=${config.maxDepartures * 3}`;
  const resp = await externalAxios.get<{
    data: {
      entry: {
        stopTimes: Array<{
          tripId: string;
          departureTime?: number;
          predictedDepartureTime?: number;
        }>;
        references: {
          trips: Record<string, { routeId: string; tripHeadsign?: string }>;
          routes: Record<string, { shortName: string; color?: string; textColor?: string }>;
        };
      };
    };
  }>(url);
  const { stopTimes, references } = resp.data.data.entry;
  const { timezone } = getServerConfig();
  const departures: Departure[] = stopTimes
    .filter((st) => st.departureTime !== undefined)
    .map((st) => {
      const trip = references.trips[st.tripId];
      const route = trip ? references.routes[trip.routeId] : undefined;
      const scheduled = momentTz.unix(st.departureTime!).tz(timezone);
      const expected = st.predictedDepartureTime
        ? momentTz.unix(st.predictedDepartureTime).tz(timezone)
        : scheduled.clone();
      const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
      const isDelayed = st.predictedDepartureTime !== undefined && st.predictedDepartureTime !== st.departureTime;
      return {
        line: route?.shortName ?? config.lineLabel,
        destination: trip?.tripHeadsign ?? config.direction,
        scheduledDeparture: scheduled.format(),
        expectedDeparture: expected.format(),
        displayTime: expected.format('HH:mm'),
        minutesUntilDeparture: minutesUntil,
        status: (isDelayed ? 'delayed' : 'onTime') as 'onTime' | 'delayed' | 'unknown',
      };
    })
    .filter((d) => d.minutesUntilDeparture >= 0)
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, config.maxDepartures);
  return departures;
}

/** Generic GTFS-RT TripUpdates feed.
 *  Requires `gtfsRtUrl` in config and a stop_id from the static GTFS. */
async function fetchDeparturesGtfsRt(config: TransitConfig, now: momentTz.Moment): Promise<readonly Departure[]> {
  const { gtfsRtUrl, stopId } = config;
  if (!gtfsRtUrl) throw new Error('gtfsRtUrl is required for gtfs-rt provider');
  const resp = await externalAxios.get(gtfsRtUrl, { responseType: 'arraybuffer' });
  const feed = transit_realtime.FeedMessage.decode(
    new Uint8Array(resp.data as ArrayBuffer),
  );
  const departures: Departure[] = [];
  const { timezone } = getServerConfig();
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (stu.stopId !== stopId) continue;
      const scheduledTs = (stu.departure?.time ?? stu.arrival?.time);
      if (scheduledTs === undefined || scheduledTs === null) continue;
      const scheduledSec = typeof scheduledTs === 'number' ? scheduledTs : (scheduledTs as { low: number }).low;
      const delayMs = ((stu.departure?.delay ?? 0) as number) * 1000;
      const scheduled = momentTz.unix(scheduledSec).tz(timezone);
      const expected = scheduled.clone().add(delayMs, 'ms');
      const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
      departures.push({
        line: config.lineLabel,
        destination: config.direction,
        scheduledDeparture: scheduled.format(),
        expectedDeparture: expected.format(),
        displayTime: expected.format('HH:mm'),
        minutesUntilDeparture: minutesUntil,
        status: delayMs > 0 ? 'delayed' : 'onTime',
      });
    }
  }
  return departures
    .filter((d) => d.minutesUntilDeparture >= 0)
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, config.maxDepartures);
}

async function fetchDepartures(config: TransitConfig): Promise<readonly Departure[]> {
  const now = momentTz.tz(getServerConfig().timezone);
  switch (config.provider) {
    case 'navitia': return fetchDeparturesNavitia(config, now);
    case 'bkk':     return fetchDeparturesBkk(config, now);
    case 'gtfs-rt': return fetchDeparturesGtfsRt(config, now);
    case 'prim':
    default:        return fetchDeparturesPrim(config, now);
  }
}

async function calendarHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { calendar, timezone } = getServerConfig();
    if (!calendar.isEnabled || !calendar.icsUrl) { res.json([]); return; }
    if (calendarCache.data && Date.now() < calendarCache.expiresAt) { res.json(calendarCache.data); return; }
    const resp = await externalAxios.get<string>(calendar.icsUrl);
    const icalModule = await import('node-ical');
    // CJS modules wrapped by dynamic import expose exports on .default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseICS: (data: string) => ReturnType<typeof import('node-ical')['parseICS']> = (icalModule as any).parseICS ?? (icalModule as any).default?.parseICS;
    const parsed = parseICS(resp.data);
    const today = momentTz.tz(timezone).startOf('day');
    const maxDate = today.clone().add(calendar.daysAhead, 'days').endOf('day');
    const allEvents: Array<CalendarEventEntry & { date: string }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEvent = (vEvent: any, startDate: Date, endDate: Date): void => {
      const start = momentTz.tz(startDate, timezone);
      if (!start.isBetween(today, maxDate, undefined, '[]')) return;
      const isAllDay = vEvent.datetype === 'date';
      const end = momentTz.tz(endDate, timezone);
      allEvents.push({
        date: start.format('YYYY-MM-DD'),
        title: (vEvent.summary as string | undefined) ?? 'Untitled',
        startTime: isAllDay ? '' : start.format('HH:mm'),
        endTime: isAllDay ? '' : end.format('HH:mm'),
        location: (vEvent.location as string | undefined) ?? '',
        isAllDay,
      });
    };

    for (const key of Object.keys(parsed)) {
      const event = parsed[key];
      if (!event || event.type !== 'VEVENT') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vEvent = event as any;
      const startDate: Date = vEvent.start as Date;
      const endDate: Date = (vEvent.end as Date | undefined) ?? startDate;

      if (!vEvent.rrule) { addEvent(vEvent, startDate, endDate); continue; }

      // Recurring event: node-ical only keeps the master's original DTSTART, which is
      // often in the past, so expand the rrule to find occurrences within the display
      // window instead of relying on the single start/end above.
      const durationMs = endDate.getTime() - startDate.getTime();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const overridesByDay: Record<string, any> = vEvent.recurrences ?? {};
      const exdateDays = excludedCalendarDays(vEvent.exdate ?? {}, timezone);
      const occurrences: Date[] = vEvent.rrule.between(today.toDate(), maxDate.toDate(), true);
      for (const occStart of occurrences) {
        const dayKey = calendarDayKey(occStart, timezone);
        if (exdateDays.has(dayKey)) continue;
        const override = overridesByDay[dayKey];
        if (override) {
          if (override.status === 'CANCELLED') continue;
          addEvent(override, override.start as Date, (override.end as Date | undefined) ?? (override.start as Date));
        } else {
          addEvent(vEvent, occStart, new Date(occStart.getTime() + durationMs));
        }
      }
    }
    allEvents.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return a.startTime.localeCompare(b.startTime);
    });
    const groupedMap = new Map<string, CalendarEventEntry[]>();
    for (const event of allEvents) {
      if (!groupedMap.has(event.date)) groupedMap.set(event.date, []);
      groupedMap.get(event.date)!.push({ title: event.title, startTime: event.startTime, endTime: event.endTime, location: event.location, isAllDay: event.isAllDay });
    }
    const days: CalendarDay[] = Array.from(groupedMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => {
        const dayMoment = momentTz.tz(date, 'YYYY-MM-DD', timezone);
        const diffDays = dayMoment.diff(today, 'days');
        const dayLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : dayMoment.format('dddd');
        return { date, dayLabel, events };
      });
    calendarCache.data = days;
    calendarCache.expiresAt = Date.now() + 15 * 60 * 1000;
    res.json(days);
  } catch (error) {
    console.error('Calendar handler error:', error);
    if (calendarCache.data) { res.json(calendarCache.data); } else { res.json([]); }
  }
}

// ─── Media pack definitions ───────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const GALLERY_MAX = 10;

interface MediaPack {
  readonly name: string;
  /** Absolute path to the folder containing image files. */
  readonly contentDir: string;
  /** Absolute path to a metadata.csv (id,title,text), or null for packs with no captions. */
  readonly metadataFile: string | null;
  /** How long resized images for this pack remain valid in the cache (milliseconds). */
  readonly cacheTtlMs: number;
}

interface MediaPackConfig {
  readonly name: string;
  readonly metadataFile?: string | null;
  readonly cacheExpiryTimeHours?: number;
}

async function readMediaPacks(): Promise<readonly MediaPack[]> {
  const config = await fs.readJson(configFilePath).catch(() => ({})) as {
    displaySettings?: { media?: { packs?: readonly MediaPackConfig[] } };
  };
  const configured = config.displaySettings?.media?.packs ?? [];
  const names = configured.length > 0
    ? configured
    : await discoverMediaPackConfigs();

  return names
    .filter((pack) => pack.name === path.basename(pack.name))
    .map((pack) => ({
      name: pack.name,
      contentDir: path.join(mediaDir, pack.name, 'content'),
      metadataFile: pack.metadataFile === null
        ? null
        : path.join(mediaDir, pack.name, 'metadata.csv'),
      cacheTtlMs: positiveHoursToMilliseconds(pack.cacheExpiryTimeHours, 24),
    }));
}

async function discoverMediaPackConfigs(): Promise<readonly MediaPackConfig[]> {
  if (!(await fs.pathExists(mediaDir))) return [];
  const entries = await fs.readdir(mediaDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'cache')
    .map((entry) => ({ name: entry.name }));
}

function positiveHoursToMilliseconds(value: number | undefined, fallback: number): number {
  const hours = Number.isFinite(value) && value! > 0 ? value! : fallback;
  return hours * 60 * 60 * 1000;
}

// ─── Cache pruning ────────────────────────────────────────────────────────────

async function pruneCache(): Promise<void> {
  const cacheDir = path.join(mediaDir, 'cache');
  if (!(await fs.pathExists(cacheDir))) return;

  const packs = await readMediaPacks();
  // Build a map of pack-name-prefix → ttlMs for fast lookup
  const ttlByPack = new Map<string, number>(packs.map((p) => [p.name, p.cacheTtlMs]));
  // Files whose pack cannot be identified get the strictest TTL of all packs
  const fallbackTtl = packs.length > 0
    ? Math.min(...packs.map((p) => p.cacheTtlMs))
    : positiveHoursToMilliseconds(undefined, 24);

  let pruned = 0;
  const now = Date.now();
  const files = (await fs.readdir(cacheDir)) as string[];
  await Promise.all(
    files.map(async (filename) => {
      const filePath = path.join(cacheDir, filename);
      try {
        const { mtimeMs } = await fs.stat(filePath);
        // Cache filenames are: <pack>_<stem>_<WxH>.jpg — extract pack from the first segment
        const packName = filename.split('_')[0];
        const ttl = ttlByPack.get(packName) ?? fallbackTtl;
        if (now - mtimeMs > ttl) {
          await fs.remove(filePath);
          pruned++;
        }
      } catch {
        // ignore stat/remove errors for individual files
      }
    }),
  );

  if (pruned > 0) console.log(`Cache prune: removed ${pruned} expired file(s) from ${cacheDir}`);
}

// Run once at startup then every hour
pruneCache().catch((e) => console.error('Initial cache prune failed:', e));
setInterval(() => pruneCache().catch((e) => console.error('Cache prune failed:', e)), 60 * 60 * 1000);

// ─── CSV metadata loader ──────────────────────────────────────────────────────

/** Per-pack metadata cache, keyed by pack name. */
interface MetadataCache {
  map: Map<string, { title: string; subtitle: string }>;
  mtimeMs: number;
}
const metadataCaches = new Map<string, MetadataCache>();

async function loadPackMetadata(
  packName: string,
  metadataFile: string,
): Promise<Map<string, { title: string; subtitle: string }>> {
  let fileMtime = 0;
  try {
    const stat = await fs.stat(metadataFile);
    fileMtime = stat.mtimeMs;
  } catch {
    // file doesn't exist yet — treat as empty
  }

  const cached = metadataCaches.get(packName);
  if (cached && cached.mtimeMs === fileMtime) return cached.map;

  const map = new Map<string, { title: string; subtitle: string }>();
  if (!(await fs.pathExists(metadataFile))) {
    metadataCaches.set(packName, { map, mtimeMs: fileMtime });
    return map;
  }

  const content = await fs.readFile(metadataFile, 'utf-8');
  const lines = content.split(/\r?\n/);
  // Header: id,title,text
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Minimal CSV parse — handles quoted fields containing commas
    const parts: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        if (inQuote && line[c + 1] === '"') { cur += '"'; c++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        parts.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    if (parts.length < 2) continue;
    const id = parts[0].trim();
    const title = parts[1].trim();
    const subtitle = parts.length >= 3 ? parts[2].trim() : '';
    if (id) map.set(id, { title, subtitle });
  }

  metadataCaches.set(packName, { map, mtimeMs: fileMtime });
  return map;
}

// ─── Gallery handler ──────────────────────────────────────────────────────────

export interface GalleryResponse {
  readonly title: string;
  readonly text: string;
  readonly images: readonly string[];
  readonly imageMeta: readonly { readonly title: string; readonly subtitle: string }[];
}

async function galleryHandler(_req: Request, res: Response): Promise<void> {
  try {
    const appCfg = await fs.readJson(configFilePath).catch(() => ({} as Record<string, unknown>)) as {
      animationSettings?: { gallerySize?: number };
      contentSettings?: { galleryTitle?: string; gallerySubtitle?: string };
    };
    const galleryMax = appCfg.animationSettings?.gallerySize ?? GALLERY_MAX;
    const packs = await readMediaPacks();

    // Collect all candidate images across all packs
    interface Candidate {
      pack: MediaPack;
      filename: string;
    }
    const candidates: Candidate[] = [];

    for (const pack of packs) {
      if (!(await fs.pathExists(pack.contentDir))) continue;
      const files = (await fs.readdir(pack.contentDir)) as string[];
      for (const f of files) {
        if (IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())) {
          candidates.push({ pack, filename: f });
        }
      }
    }

    // Fisher-Yates shuffle across the merged pool, then slice
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const selected = candidates.slice(0, galleryMax);

    const images: string[] = [];
    const imageMeta: { title: string; subtitle: string }[] = [];

    for (const { pack, filename } of selected) {
      // URL: /media/<pack>/content/<filename>  — served by express.static on /media
      images.push(`/media/${pack.name}/content/${filename}`);

      if (pack.metadataFile) {
        const meta = await loadPackMetadata(pack.name, pack.metadataFile);
        const id = path.basename(filename, path.extname(filename));
        imageMeta.push(meta.get(id) ?? { title: '', subtitle: '' });
      } else {
        imageMeta.push({ title: '', subtitle: '' });
      }
    }

    const response: GalleryResponse = {
      title: appCfg.contentSettings?.galleryTitle ?? '',
      text: appCfg.contentSettings?.gallerySubtitle ?? '',
      images,
      imageMeta,
    };
    res.json(response);
  } catch (error) {
    console.error('Gallery handler error:', error);
    const fallback: GalleryResponse = { title: '', text: '', images: [], imageMeta: [] };
    res.json(fallback);
  }
}

// ─── Resize + cache handler ───────────────────────────────────────────────────

async function resizeHandler(req: Request, res: Response): Promise<void> {
  const { file, w, h } = req.query as Record<string, string>;

  if (!file || !w || !h) {
    res.status(400).json({ message: 'Missing file, w, or h parameters.' });
    return;
  }

  // Sanitise: the file param is a pack-relative path like "<pack>/content/<filename>"
  // Split on '/', validate each segment, reassemble under mediaDir.
  const segments = file.split('/').map((s) => s.trim());
  if (
    segments.length !== 3 ||
    segments.some((s) => !s || s === '..' || s === '.') ||
    segments[1] !== 'content'
  ) {
    res.status(400).json({ message: 'Invalid file parameter.' });
    return;
  }
  const [packName, , filename] = segments;
  const safeFilename = path.basename(filename);
  if (!safeFilename || safeFilename !== filename || safeFilename.startsWith('.')) {
    res.status(400).json({ message: 'Invalid file parameter.' });
    return;
  }

  const width = Math.round(Number(w));
  const height = Math.round(Number(h));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    res.status(400).json({ message: 'Invalid dimensions.' });
    return;
  }

  const sourcePath = path.join(mediaDir, packName, 'content', safeFilename);
  if (!(await fs.pathExists(sourcePath))) {
    res.status(404).json({ message: 'Source file not found.' });
    return;
  }

  const packs = await readMediaPacks();
  const pack = packs.find((p) => p.name === packName);
  if (!pack) {
    res.status(400).json({ message: 'Unknown media pack.' });
    return;
  }

  const cacheDir = path.join(mediaDir, 'cache');
  const stem = path.basename(safeFilename, path.extname(safeFilename));
  const cacheFile = `${packName}_${stem}_${width}x${height}.jpg`;
  const cachePath = path.join(cacheDir, cacheFile);

  try {
    // Check cache validity: file exists AND not older than this pack's TTL
    if (await fs.pathExists(cachePath)) {
      const { mtimeMs } = await fs.stat(cachePath);
      if (Date.now() - mtimeMs < pack.cacheTtlMs) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('X-Cache', 'HIT');
        res.sendFile(cachePath);
        return;
      }
    }

    // Resize
    await fs.ensureDir(cacheDir);
    const buffer = await sharp(sourcePath)
      .resize({ width, height, fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();

    await fs.writeFile(cachePath, buffer);

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Cache', 'MISS');
    res.send(buffer);
  } catch (error) {
    console.error('Resize handler error:', error);
    // Fall back to serving the original untouched file
    res.sendFile(sourcePath);
  }
}

// ─── API routes ────────────────────────────────────────────────────────────────

app.use(express.json());
// Dynamic JSON responses must always be revalidated — browsers reopening a stale
// tab/session must not reuse a heuristically-cached config/gallery/messages payload.
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const messagesFilePath = process.env['MESSAGES_FILE']
  ? path.resolve(process.env['MESSAGES_FILE'])
  : path.join(mediaDir, 'messages.json');
let messageSocketServer: WebSocketServer | null = null;

interface MessagePolicy {
  readonly maxTextLength: number;
  readonly maxLifetimeDays: number;
  readonly retentionDays: number;
}

function readMessagePolicy(): MessagePolicy {
  const config = fs.readJsonSync(configFilePath, { throws: false }) as {
    appSettings?: { messages?: Partial<MessagePolicy> };
  } | null;
  const messages = config?.appSettings?.messages;
  return {
    maxTextLength: positiveInteger(messages?.maxTextLength, 2048),
    maxLifetimeDays: positiveInteger(messages?.maxLifetimeDays, 7),
    retentionDays: positiveInteger(messages?.retentionDays, 30),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

interface TransitRouteConfig extends TransitConfig {
  readonly id: string;
  readonly availableFrom?: string | null;
  readonly availableUntil?: string | null;
}

interface RuntimeTransitSettings {
  readonly isEnabled: boolean;
  readonly entries: readonly TransitRouteConfig[];
}

async function readTransitSettings(): Promise<RuntimeTransitSettings> {
  const config = await fs.readJson(configFilePath).catch(() => ({})) as {
    appSettings?: { transit?: Partial<RuntimeTransitSettings> };
  };
  const persisted = config.appSettings?.transit;
  const sourceEntries = persisted && Array.isArray(persisted.entries) ? persisted.entries : [];
  const seenIds = new Set<string>();
  const entries = sourceEntries
    .filter((entry): entry is TransitRouteConfig => Boolean(
      entry
      && entry.id
      && entry.provider
      && entry.stopId
      && entry.lineLabel,
    ))
    .map((entry, index) => {
      const preferredId = entry.id?.trim() || `transit-${index + 1}`;
      const id = seenIds.has(preferredId) ? `${preferredId}-${index + 1}` : preferredId;
      seenIds.add(id);
      return { ...entry, id };
    });
  return {
    isEnabled: persisted?.isEnabled === true,
    entries,
  };
}

function isTransitRouteAvailable(route: TransitRouteConfig): boolean {
  const { timezone } = getServerConfig();
  const today = momentTz.tz(timezone).startOf('day');
  if (route.availableFrom && today.isBefore(momentTz.tz(route.availableFrom, timezone))) return false;
  if (route.availableUntil && !today.isBefore(momentTz.tz(route.availableUntil, timezone))) return false;
  return true;
}

function clearTransitCaches(): void {
  transitCaches.clear();
}

async function readMessages(): Promise<StoredMessage[]> {
  const messages = await fs.readJson(messagesFilePath).catch(() => [] as StoredMessage[]);
  if (!Array.isArray(messages)) return [];

  const retentionMs = readMessagePolicy().retentionDays * 24 * 60 * 60 * 1000;
  const purgeBefore = Date.now() - retentionMs;
  const retained = messages.filter((message): message is StoredMessage =>
    typeof message?.id === 'string'
    && typeof message?.text === 'string'
    && typeof message?.createdAt === 'string'
    && typeof message?.updatedAt === 'string'
    && typeof message?.expiresAt === 'string'
    && Date.parse(message.expiresAt) >= purgeBefore,
  );

  if (retained.length !== messages.length) await writeMessages(retained);
  return retained;
}

async function writeMessages(messages: readonly StoredMessage[]): Promise<void> {
  const temporaryPath = `${messagesFilePath}.tmp`;
  await fs.outputJson(temporaryPath, messages, { spaces: 2 });
  await fs.move(temporaryPath, messagesFilePath, { overwrite: true });
}

async function purgeExpiredMessages(): Promise<number> {
  const messages = await readMessages();
  const now = Date.now();
  const retained = messages.filter((message) => Date.parse(message.expiresAt) > now);
  const deletedCount = messages.length - retained.length;
  if (deletedCount > 0) await writeMessages(retained);
  return deletedCount;
}

async function broadcastActiveMessages(): Promise<void> {
  if (!messageSocketServer) return;
  const messages = (await readMessages()).filter((message) => Date.parse(message.expiresAt) > Date.now());
  const payload = JSON.stringify({ type: 'messages.changed', messages });
  messageSocketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function parseMessageInput(body: unknown): { text: string; expiresAt: string } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as { text?: unknown; expiresAt?: unknown };
  if (typeof value.text !== 'string' || typeof value.expiresAt !== 'string') return null;

  const text = value.text.trim();
  const expiresAtMs = Date.parse(value.expiresAt);
  const policy = readMessagePolicy();
  if (!text || text.length > policy.maxTextLength || !Number.isFinite(expiresAtMs)) return null;
  const maxMessageLifetimeMs = policy.maxLifetimeDays * 24 * 60 * 60 * 1000;
  if (expiresAtMs > Date.now() + maxMessageLifetimeMs) return null;
  return { text, expiresAt: new Date(expiresAtMs).toISOString() };
}

app.get('/api/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await fs.readJson(configFilePath);
    const transit = await readTransitSettings();
    res.json({
      ...config,
      appSettings: { ...config.appSettings, transit },
    });
  } catch {
    res.status(404).json({ message: 'Config file not found.' });
  }
});

app.post('/api/config', async (req: Request, res: Response): Promise<void> => {
  try {
    await fs.writeJson(configFilePath, req.body, { spaces: 2 });
    clearTransitCaches();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to write config:', error);
    res.status(500).json({ message: 'Failed to save config.' });
  }
});

app.get('/api/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const messages = await readMessages();
    const result = req.query['active'] === 'true'
      ? messages.filter((message) => Date.parse(message.expiresAt) > Date.now())
      : messages;
    const now = Date.now();
    res.json(result.sort((a, b) => {
      const activeDifference = Number(Date.parse(b.expiresAt) > now) - Number(Date.parse(a.expiresAt) > now);
      return activeDifference || Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    }));
  } catch (error) {
    console.error('Failed to read messages:', error);
    res.status(500).json({ message: 'Failed to read messages.' });
  }
});

app.post('/api/messages', async (req: Request, res: Response): Promise<void> => {
  const input = parseMessageInput(req.body);
  if (!input) {
    res.status(400).json({ message: 'Text and a valid expiration within one week are required.' });
    return;
  }

  try {
    const now = new Date().toISOString();
    const message: StoredMessage = {
      id: randomBytes(12).toString('hex'),
      text: input.text,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    const messages = await readMessages();
    await writeMessages([...messages, message]);
    await broadcastActiveMessages();
    res.status(201).json(message);
  } catch (error) {
    console.error('Failed to create message:', error);
    res.status(500).json({ message: 'Failed to create message.' });
  }
});

app.put('/api/messages/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const input = parseMessageInput(req.body);
  if (!input) {
    res.status(400).json({ message: 'Text and a valid expiration within one week are required.' });
    return;
  }

  try {
    const messages = await readMessages();
    const index = messages.findIndex((message) => message.id === req.params.id);
    if (index < 0) { res.status(404).json({ message: 'Message not found.' }); return; }

    const updated: StoredMessage = {
      ...messages[index],
      text: input.text,
      expiresAt: input.expiresAt,
      updatedAt: new Date().toISOString(),
    };
    messages[index] = updated;
    await writeMessages(messages);
    await broadcastActiveMessages();
    res.json(updated);
  } catch (error) {
    console.error('Failed to update message:', error);
    res.status(500).json({ message: 'Failed to update message.' });
  }
});

app.delete('/api/messages/expired', async (_req: Request, res: Response): Promise<void> => {
  try {
    const deletedCount = await purgeExpiredMessages();
    if (deletedCount > 0) await broadcastActiveMessages();
    res.json({ deletedCount });
  } catch (error) {
    console.error('Failed to purge expired messages:', error);
    res.status(500).json({ message: 'Failed to purge expired messages.' });
  }
});

app.delete('/api/messages', async (_req: Request, res: Response): Promise<void> => {
  try {
    const deletedCount = (await readMessages()).length;
    await writeMessages([]);
    if (deletedCount > 0) await broadcastActiveMessages();
    res.json({ deletedCount });
  } catch (error) {
    console.error('Failed to clear messages:', error);
    res.status(500).json({ message: 'Failed to clear messages.' });
  }
});

app.delete('/api/messages/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const messages = await readMessages();
    const index = messages.findIndex((message) => message.id === req.params.id);
    if (index < 0) { res.status(404).json({ message: 'Message not found.' }); return; }

    const now = new Date().toISOString();
    const deleted: StoredMessage = { ...messages[index], expiresAt: now, updatedAt: now };
    messages[index] = deleted;
    await writeMessages(messages);
    await broadcastActiveMessages();
    res.json(deleted);
  } catch (error) {
    console.error('Failed to expire message:', error);
    res.status(500).json({ message: 'Failed to expire message.' });
  }
});

app.get('/api/clock', clockHandler);
app.get('/api/solar/next-event', solarHandler);
app.get('/api/weather', weatherHandler);
app.get('/api/weather/forecast', weatherForecastHandler);
app.get('/api/weather/world', worldWeatherHandler);
app.get('/api/image/list', imageListHandler);
app.get('/api/image/meta', imageMetaHandler);
app.get('/api/image', imageHandler);
app.get('/api/transit/routes', async (_req: Request, res: Response): Promise<void> => {
  const settings = await readTransitSettings();
  if (!settings.isEnabled) { res.json([]); return; }

  const result = await Promise.all(settings.entries.filter(isTransitRouteAvailable).map(async (route) => {
    const cache = transitCaches.get(route.id) ?? { data: null, expiresAt: 0 };
    transitCaches.set(route.id, cache);
    try {
      if (!cache.data || Date.now() >= cache.expiresAt) {
        cache.data = await fetchDepartures(route);
        cache.expiresAt = Date.now() + 2 * 60 * 1000;
        // Surface unexpectedly-empty successful fetches — likely a stale destinationFilter/lineRef.
        if (cache.data.length === 0) {
          console.warn(`Transit route ${route.id} (${route.provider}, stop ${route.stopId}) returned 0 departures.`);
        }
      }
    } catch (error) {
      const message = (error as Error)?.message ?? error;
      console.error(`Transit route ${route.id} error:`, message);
    }
    return { id: route.id, departures: cache.data ?? [] };
  }));
  res.json(result);
});
app.get('/api/calendar', calendarHandler);
app.get('/api/gallery', galleryHandler);
app.get('/api/resize', resizeHandler);

// ─── Static + Angular SSR (must come AFTER API routes) ────────────────────────

// Serve files directly from the media directory at /media/*
app.use('/media', express.static(mediaDir, { maxAge: '1h' }));
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('screensaver.config.json')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.get('*', (req: Request, res: Response) => {
  res.render(indexHtml, {
    req,
    providers: [{ provide: APP_BASE_HREF, useValue: req.baseUrl }],
  });
});

const port = process.env['PORT'] || 4000;
const httpServer = app.listen(port, () => {
  console.log(`Node Express server listening on http://localhost:${port}`);
});

messageSocketServer = new WebSocketServer({ server: httpServer, path: '/api/messages/live' });
messageSocketServer.on('connection', async (socket) => {
  try {
    const messages = (await readMessages()).filter((message) => Date.parse(message.expiresAt) > Date.now());
    socket.send(JSON.stringify({ type: 'messages.changed', messages }));
  } catch (error) {
    console.error('Failed to initialize messages WebSocket:', error);
  }
});
