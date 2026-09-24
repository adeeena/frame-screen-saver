import fs from 'fs-extra';
import path from 'path';

export type TransitProvider = 'prim' | 'bkk' | 'gtfs-rt' | 'navitia';

export interface TransitConfig {
  readonly provider: TransitProvider;
  readonly stopId: string;
  readonly stopLabel: string;
  readonly lineLabel: string;
  readonly lineColor: string;
  readonly lineTextColor: string;
  readonly direction: string;
  readonly maxDepartures: number;
  readonly navitiaRegion?: string | null;
  readonly gtfsRtUrl?: string | null;
  readonly primLineRef?: string | null;
  readonly bkkRouteId?: string | null;
  readonly destinationFilter?: string | null;
}

export interface ServerConfig {
  readonly timezone: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly calendar: {
    readonly isEnabled: boolean;
    readonly icsUrl: string;
    readonly daysAhead: number;
    readonly maxDisplayDays: number;
  };
}

interface PersistedConfig {
  readonly appSettings?: {
    readonly timezone?: string;
    readonly location?: {
      readonly latitude?: number;
      readonly longitude?: number;
    };
    readonly calendar?: Partial<ServerConfig['calendar']>;
  };
}

export function getConfigFilePath(): string {
  const configuredPath = process.env['SCREENSAVER_CONFIG_FILE'];
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(__dirname, '../browser/screensaver.config.json');
}

export function getServerConfig(): ServerConfig {
  const persisted = fs.readJsonSync(getConfigFilePath(), { throws: false }) as PersistedConfig | null;
  const appSettings = persisted?.appSettings;
  const calendar = appSettings?.calendar;

  return {
    timezone: process.env['APP_TIMEZONE'] || appSettings?.timezone || 'UTC',
    location: {
      latitude: numberFromEnvironment('APP_LATITUDE', appSettings?.location?.latitude ?? 0),
      longitude: numberFromEnvironment('APP_LONGITUDE', appSettings?.location?.longitude ?? 0),
    },
    calendar: {
      isEnabled: calendar?.isEnabled === true,
      icsUrl: process.env['CALENDAR_ICS_URL'] || '',
      daysAhead: positiveInteger(calendar?.daysAhead, 7),
      maxDisplayDays: positiveInteger(calendar?.maxDisplayDays, 2),
    },
  };
}

function numberFromEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}