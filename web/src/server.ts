import 'dotenv/config';
import { ngExpressEngine } from '@nguniversal/express-engine';
import { AppServerModule } from './app/app-server.module';
import { APP_BASE_HREF } from '@angular/common';
import express, { Request, Response, NextFunction } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import path from 'path';
import https from 'https';
import momentTz from 'moment-timezone';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs-extra';
import { transit_realtime } from 'gtfs-realtime-bindings';
import { serverConfig } from './server.config';

// Node.js bundles its own CA store which may not include corporate/enterprise root CAs
// that are present in the OS certificate store. Using a dedicated agent for all
// outbound API calls avoids UNABLE_TO_GET_ISSUER_CERT_LOCALLY errors on such machines.
const externalAgent = new https.Agent({ rejectUnauthorized: false });
const externalAxios = axios.create({ httpsAgent: externalAgent });

// ─── Media directory (resolved once at startup) ───────────────────────────────
// Default: up 4 levels from web/dist/frame-screen-saver/server/ → repo root / media
const mediaDir = process.env['MEDIA_DIR']
  ? path.resolve(process.env['MEDIA_DIR'])
  : path.resolve(__dirname, '../../../../media');

const browserDistFolder = join(__dirname, '../browser');
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
}

interface WeatherData {
  readonly temperature: number;
  readonly symbolCode: string;
  readonly weatherLabel: string;
  readonly windSpeed: number;
  readonly windDirection: number;
  readonly uvIndex: number | null;
}

interface Departure {
  readonly line: string;
  readonly lineColor?: string;
  readonly lineTextColor?: string;
  readonly destination: string;
  readonly scheduledDeparture: string;
  readonly expectedDeparture: string;
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
const transitCache: Cache<readonly Departure[]> = { data: null, expiresAt: 0 };
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

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function clockHandler(_req: Request, res: Response): Promise<void> {
  const now = momentTz.tz(serverConfig.timezone);
  res.json({
    time: now.format('YYYY-MM-DD HH:mm:ss'),
    timezone: serverConfig.timezone,
    utcOffset: now.format('Z'),
  });
}

async function solarHandler(_req: Request, res: Response): Promise<void> {
  try {
    const now = momentTz.tz(serverConfig.timezone);
    if (solarCache.data && Date.now() < solarCache.expiresAt) {
      res.json(solarCache.data);
      return;
    }
    const { latitude, longitude } = serverConfig.location;
    const offset = now.format('Z');
    const getSolarData = async (date: string): Promise<{ sunrise: { time: string }; sunset: { time: string } }> => {
      const url = new URL('https://api.met.no/weatherapi/sunrise/3.0/sun');
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('date', date);
      url.searchParams.set('offset', offset);
      const resp = await externalAxios.get(url.toString(), { headers: { 'User-Agent': 'frame-screen-saver/1.0' } });
      return resp.data.properties as { sunrise: { time: string }; sunset: { time: string } };
    };
    const todayData = await getSolarData(now.format('YYYY-MM-DD'));
    const todaySunrise = momentTz(todayData.sunrise.time);
    const todaySunset = momentTz(todayData.sunset.time);
    let nextEventTime: momentTz.Moment;
    let nextEventType: 'sunrise' | 'sunset';
    if (now.isBefore(todaySunrise)) {
      nextEventType = 'sunrise';
      nextEventTime = todaySunrise;
    } else if (now.isBefore(todaySunset)) {
      nextEventType = 'sunset';
      nextEventTime = todaySunset;
    } else {
      const tomorrow = now.clone().add(1, 'day');
      const tomorrowData = await getSolarData(tomorrow.format('YYYY-MM-DD'));
      nextEventType = 'sunrise';
      nextEventTime = momentTz(tomorrowData.sunrise.time);
    }
    const data: SolarData = {
      type: nextEventType,
      time: nextEventTime.format('YYYY-MM-DD HH:mm:ss'),
      utcOffset: nextEventTime.format('Z'),
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
    const { latitude, longitude } = serverConfig.location;
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
    }>(url, { headers: { 'User-Agent': 'frame-screen-saver/1.0' } });
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

async function imageListHandler(_req: Request, res: Response): Promise<void> {
  try {
    const baseUrl = serverConfig.images.baseUrl;
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
    const metaPath = path.join(serverConfig.images.baseUrl, type, `${id}.json`);
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
  const cachePath = path.join(serverConfig.images.cacheBaseUrl, cacheKey);
  try {
    if (useCache && (await fs.pathExists(cachePath))) { res.sendFile(cachePath); return; }
    const sourceDir = path.join(serverConfig.images.baseUrl, type);
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
      try { await fs.ensureDir(serverConfig.images.cacheBaseUrl); await fs.writeFile(cachePath, imageBuffer); }
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
async function fetchDeparturesNavitia(now: momentTz.Moment): Promise<readonly Departure[]> {
  const token = process.env['NAVITIA_TOKEN'];
  const region = serverConfig.transit.navitiaRegion ?? 'fr-idf';
  if (!token) return [];
  const url = `https://api.navitia.io/v1/coverage/${region}/stop_areas/${encodeURIComponent(serverConfig.transit.stopId)}/departures?count=${serverConfig.transit.maxDepartures * 3}&depth=1&disable_disruption=false`;
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
    const parseNavitiaDate = (s: string) =>
      momentTz.tz(s, 'YYYYMMDDTHHmmss', serverConfig.timezone);
    const expected = parseNavitiaDate(d.stop_date_time.departure_date_time);
    const scheduled = d.stop_date_time.base_departure_date_time
      ? parseNavitiaDate(d.stop_date_time.base_departure_date_time)
      : expected.clone();
    const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
    const isDelayed = expected.diff(scheduled, 'seconds') > 30;
    return {
      line: d.route.line.code,
      lineColor: d.route.line.color ?? serverConfig.transit.lineColor,
      lineTextColor: d.route.line.text_color ?? serverConfig.transit.lineTextColor,
      destination: d.route.direction.stop_point.name,
      scheduledDeparture: scheduled.toISOString(),
      expectedDeparture: expected.toISOString(),
      minutesUntilDeparture: minutesUntil,
      status: (isDelayed ? 'delayed' : 'onTime') as 'onTime' | 'delayed' | 'unknown',
    };
  })
  .filter((d) => d.minutesUntilDeparture >= 0)
  .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
  .slice(0, serverConfig.transit.maxDepartures);
  return departures;
}

/** PRIM (Île-de-France Mobilités) SIRI Stop Monitoring */
async function fetchDeparturesPrim(now: momentTz.Moment): Promise<readonly Departure[]> {
  const apiKey = process.env['PRIM_API_KEY'];
  if (!apiKey) return [];
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(serverConfig.transit.stopId)}`;
  const resp = await externalAxios.get(url, { headers: { apikey: apiKey } });
  type Visit = { MonitoredVehicleJourney: { DestinationName?: Array<{ value: string }>; MonitoredCall: { AimedDepartureTime: string; ExpectedDepartureTime?: string; DepartureStatus?: string } } };
  const visits: Visit[] = (resp.data as { Siri?: { ServiceDelivery?: { StopMonitoringDelivery?: Array<{ MonitoredStopVisit?: Visit[] }> } } })?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
  const { destinationFilter } = serverConfig.transit;
  return visits
    .map((visit) => {
      const journey = visit.MonitoredVehicleJourney;
      const call = journey.MonitoredCall;
      const scheduled = call.AimedDepartureTime;
      const expected = call.ExpectedDepartureTime ?? scheduled;
      const minutesUntil = Math.max(0, Math.round(momentTz(expected).diff(now, 'minutes')));
      const rawStatus = call.DepartureStatus;
      const status: 'onTime' | 'delayed' | 'unknown' = rawStatus === 'onTime' ? 'onTime' : rawStatus === 'delayed' ? 'delayed' : 'unknown';
      return { line: serverConfig.transit.lineLabel, destination: journey.DestinationName?.[0]?.value ?? serverConfig.transit.direction, scheduledDeparture: scheduled, expectedDeparture: expected, minutesUntilDeparture: minutesUntil, status };
    })
    .filter((d) => !destinationFilter || d.destination.toLowerCase().includes(destinationFilter.toLowerCase()))
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, serverConfig.transit.maxDepartures);
}

/** BKK Futár REST API (Budapest) — no API key required */
async function fetchDeparturesBkk(now: momentTz.Moment): Promise<readonly Departure[]> {
  const url = `https://futar.bkk.hu/api/query/v1/ws/otp/api/0/departures-for-stop?stopId=${encodeURIComponent(serverConfig.transit.stopId)}&minutesBefore=0&minutesAfter=120&limit=${serverConfig.transit.maxDepartures * 3}`;
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
  const departures: Departure[] = stopTimes
    .filter((st) => st.departureTime !== undefined)
    .map((st) => {
      const trip = references.trips[st.tripId];
      const route = trip ? references.routes[trip.routeId] : undefined;
      const scheduled = momentTz.unix(st.departureTime!).tz(serverConfig.timezone);
      const expected = st.predictedDepartureTime
        ? momentTz.unix(st.predictedDepartureTime).tz(serverConfig.timezone)
        : scheduled.clone();
      const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
      const isDelayed = st.predictedDepartureTime !== undefined && st.predictedDepartureTime !== st.departureTime;
      return {
        line: route?.shortName ?? serverConfig.transit.lineLabel,
        destination: trip?.tripHeadsign ?? serverConfig.transit.direction,
        scheduledDeparture: scheduled.toISOString(),
        expectedDeparture: expected.toISOString(),
        minutesUntilDeparture: minutesUntil,
        status: (isDelayed ? 'delayed' : 'onTime') as 'onTime' | 'delayed' | 'unknown',
      };
    })
    .filter((d) => d.minutesUntilDeparture >= 0)
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, serverConfig.transit.maxDepartures);
  return departures;
}

/** Generic GTFS-RT TripUpdates feed.
 *  Requires `gtfsRtUrl` in config and a stop_id from the static GTFS. */
async function fetchDeparturesGtfsRt(now: momentTz.Moment): Promise<readonly Departure[]> {
  const { gtfsRtUrl, stopId } = serverConfig.transit;
  if (!gtfsRtUrl) throw new Error('gtfsRtUrl is required for gtfs-rt provider');
  const resp = await externalAxios.get(gtfsRtUrl, { responseType: 'arraybuffer' });
  const feed = transit_realtime.FeedMessage.decode(
    new Uint8Array(resp.data as ArrayBuffer),
  );
  const departures: Departure[] = [];
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (stu.stopId !== stopId) continue;
      const scheduledTs = (stu.departure?.time ?? stu.arrival?.time);
      if (scheduledTs === undefined || scheduledTs === null) continue;
      const scheduledSec = typeof scheduledTs === 'number' ? scheduledTs : (scheduledTs as { low: number }).low;
      const delayMs = ((stu.departure?.delay ?? 0) as number) * 1000;
      const scheduled = momentTz.unix(scheduledSec).tz(serverConfig.timezone);
      const expected = scheduled.clone().add(delayMs, 'ms');
      const minutesUntil = Math.max(0, Math.round(expected.diff(now, 'minutes')));
      departures.push({
        line: serverConfig.transit.lineLabel,
        destination: serverConfig.transit.direction,
        scheduledDeparture: scheduled.toISOString(),
        expectedDeparture: expected.toISOString(),
        minutesUntilDeparture: minutesUntil,
        status: delayMs > 0 ? 'delayed' : 'onTime',
      });
    }
  }
  return departures
    .filter((d) => d.minutesUntilDeparture >= 0)
    .sort((a, b) => a.expectedDeparture.localeCompare(b.expectedDeparture))
    .slice(0, serverConfig.transit.maxDepartures);
}

async function transitHandler(_req: Request, res: Response): Promise<void> {
  try {
    if (transitCache.data && Date.now() < transitCache.expiresAt) { res.json(transitCache.data); return; }
    const now = momentTz.tz(serverConfig.timezone);
    let departures: readonly Departure[];
    switch (serverConfig.transit.provider) {
      case 'navitia': departures = await fetchDeparturesNavitia(now); break;
      case 'bkk':     departures = await fetchDeparturesBkk(now); break;
      case 'gtfs-rt': departures = await fetchDeparturesGtfsRt(now); break;
      case 'prim':
      default:        departures = await fetchDeparturesPrim(now); break;
    }
    transitCache.data = departures;
    transitCache.expiresAt = Date.now() + 20 * 60 * 1000;
    res.json(departures);
  } catch (error) {
    const msg = (error as { response?: { status?: number; data?: unknown }; message?: string })?.response?.data ?? (error as Error)?.message ?? error;
    console.error('Transit handler error:', msg);
    if (transitCache.data) { res.json(transitCache.data); } else { res.json([]); }
  }
}

async function calendarHandler(_req: Request, res: Response): Promise<void> {
  try {
    if (calendarCache.data && Date.now() < calendarCache.expiresAt) { res.json(calendarCache.data); return; }
    const resp = await externalAxios.get<string>(serverConfig.calendar.icsUrl);
    const icalModule = await import('node-ical');
    // CJS modules wrapped by dynamic import expose exports on .default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseICS: (data: string) => ReturnType<typeof import('node-ical')['parseICS']> = (icalModule as any).parseICS ?? (icalModule as any).default?.parseICS;
    const parsed = parseICS(resp.data);
    const today = momentTz.tz(serverConfig.timezone).startOf('day');
    const maxDate = today.clone().add(serverConfig.calendar.daysAhead, 'days').endOf('day');
    const allEvents: Array<CalendarEventEntry & { date: string }> = [];
    for (const key of Object.keys(parsed)) {
      const event = parsed[key];
      if (!event || event.type !== 'VEVENT') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vEvent = event as any;
      const startDate: Date = vEvent.start as Date;
      const start = momentTz.tz(startDate, serverConfig.timezone);
      if (!start.isBetween(today, maxDate, undefined, '[]')) continue;
      const isAllDay = (startDate as Date & { dateOnly?: boolean }).dateOnly === true;
      const endDate: Date = (vEvent.end as Date | undefined) ?? startDate;
      const end = momentTz.tz(endDate, serverConfig.timezone);
      allEvents.push({
        date: start.format('YYYY-MM-DD'),
        title: (vEvent.summary as string | undefined) ?? 'Untitled',
        startTime: isAllDay ? '' : start.format('HH:mm'),
        endTime: isAllDay ? '' : end.format('HH:mm'),
        location: (vEvent.location as string | undefined) ?? '',
        isAllDay,
      });
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
        const dayMoment = momentTz.tz(date, 'YYYY-MM-DD', serverConfig.timezone);
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

function buildPacks(): MediaPack[] {
  return [
    {
      name: 'travel',
      contentDir: path.join(mediaDir, 'travel', 'content'),
      metadataFile: path.join(mediaDir, 'travel', 'metadata.csv'),
      cacheTtlMs: 24 * 60 * 60 * 1000, // 24 h
    },
    {
      name: 'mccurry',
      contentDir: path.join(mediaDir, 'mccurry', 'content'),
      metadataFile: null,
      cacheTtlMs: 24 * 60 * 60 * 1000, // 24 h
    },
  ];
}

// ─── Cache pruning ────────────────────────────────────────────────────────────

async function pruneCache(): Promise<void> {
  const cacheDir = path.join(mediaDir, 'cache');
  if (!(await fs.pathExists(cacheDir))) return;

  const packs = buildPacks();
  // Build a map of pack-name-prefix → ttlMs for fast lookup
  const ttlByPack = new Map<string, number>(packs.map((p) => [p.name, p.cacheTtlMs]));
  // Files whose pack cannot be identified get the strictest TTL of all packs
  const fallbackTtl = Math.min(...packs.map((p) => p.cacheTtlMs));

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
const metadataCaches = new Map<string, Map<string, { title: string; subtitle: string }>>();

async function loadPackMetadata(
  packName: string,
  metadataFile: string,
): Promise<Map<string, { title: string; subtitle: string }>> {
  const cached = metadataCaches.get(packName);
  if (cached) return cached;

  const map = new Map<string, { title: string; subtitle: string }>();
  if (!(await fs.pathExists(metadataFile))) return map;

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

  metadataCaches.set(packName, map);
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
    const packs = buildPacks();

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
    const selected = candidates.slice(0, GALLERY_MAX);

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
      title: 'Marbles',
      text: 'Focusing',
      images,
      imageMeta,
    };
    res.json(response);
  } catch (error) {
    console.error('Gallery handler error:', error);
    const fallback: GalleryResponse = { title: 'Marbles', text: 'Focusing', images: [], imageMeta: [] };
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

  const packs = buildPacks();
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

const configFilePath = path.join(browserDistFolder, 'screensaver.config.json');

app.get('/api/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await fs.readJson(configFilePath);
    res.json(config);
  } catch {
    res.status(404).json({ message: 'Config file not found.' });
  }
});

app.post('/api/config', async (req: Request, res: Response): Promise<void> => {
  try {
    await fs.writeJson(configFilePath, req.body, { spaces: 2 });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to write config:', error);
    res.status(500).json({ message: 'Failed to save config.' });
  }
});

app.get('/api/clock', clockHandler);
app.get('/api/solar/next-event', solarHandler);
app.get('/api/weather', weatherHandler);
app.get('/api/image/list', imageListHandler);
app.get('/api/image/meta', imageMetaHandler);
app.get('/api/image', imageHandler);
app.get('/api/transit', transitHandler);
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
app.listen(port, () => {
  console.log(`Node Express server listening on http://localhost:${port}`);
});
