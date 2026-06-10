export type TransitProvider = 'prim' | 'bkk' | 'gtfs-rt' | 'navitia';

export interface TransitConfig {
  /**
   * Which provider to use for real-time departure data.
   * - 'prim'   : Île-de-France Mobilités SIRI Stop Monitoring (requires PRIM_API_KEY env var)
   * - 'bkk'    : Budapest BKK Futár REST API (no key required)
   * - 'gtfs-rt': Generic GTFS-RT TripUpdates feed (requires gtfsRtUrl)
   */
  readonly provider: TransitProvider;

  /** Stop identifier in the provider's format.
   *  prim:    'STIF:StopArea:SP:46886:' (StopArea) or 'STIF:StopPoint:Q:xxxxx:' (StopPoint)
   *  bkk:     'BKK:F01234'
   *  gtfs-rt: stop_id from the static GTFS stops.txt
   */
  readonly stopId: string;

  /** Human-readable station label shown in the UI */
  readonly stopLabel: string;

  /** Line short name shown in the badge (e.g. 'N', 'M4', 'RER A') */
  readonly lineLabel: string;

  /** Badge background color (hex without #) */
  readonly lineColor: string;

  /** Badge text/foreground color (hex without #) */
  readonly lineTextColor: string;

  /** Direction / headsign text shown next to the badge */
  readonly direction: string;

  /** Maximum number of departures to return */
  readonly maxDepartures: number;

  // ── Provider-specific options ──────────────────────────────────────────────

  /** navitia: region/coverage identifier, e.g. 'fr-idf', 'fr-se', 'be', 'de' */
  readonly navitiaRegion?: string;

  /** gtfs-rt: URL of the GTFS-RT TripUpdates protobuf feed */
  readonly gtfsRtUrl?: string;

  /** prim: SIRI LineRef to filter by (leave undefined for all lines at stop) */
  readonly primLineRef?: string;

  /** bkk: routeId filter (leave undefined for all lines at stop) */
  readonly bkkRouteId?: string;

  /** Filter departures to only those whose destination contains this string (case-insensitive) */
  readonly destinationFilter?: string;
}

export interface ServerConfig {
  readonly timezone: string;
  readonly location: { readonly latitude: number; readonly longitude: number };
  readonly images: { readonly baseUrl: string; readonly cacheBaseUrl: string };
  readonly transit: TransitConfig;
  readonly calendar: {
    readonly icsUrl: string;
    readonly daysAhead: number;
    /** How many days to show in the UI (today counts as 1) */
    readonly maxDisplayDays: number;
  };
}

export const serverConfig: ServerConfig = {
  timezone: 'Europe/Paris',
  location: { latitude: 48.917, longitude: 1.867 },
  images: {
    baseUrl: '/Users/adena/temp/images',
    cacheBaseUrl: '/Users/adena/temp/image-cache',
  },
  transit: {
    provider: 'prim',
    stopId: 'STIF:StopArea:SP:46886:',
    stopLabel: 'Maule',
    lineLabel: 'N',
    lineColor: '00A88F',
    lineTextColor: 'ffffff',
    direction: 'Paris Montparnasse',
    maxDepartures: 2,
    primLineRef: 'STIF:Line::C01736:',
    destinationFilter: 'Paris',
  },
  calendar: {
    icsUrl:
      'https://p120-caldav.icloud.com/published/2/ODA5NDI3MjY1NzgwOTQyN_PaDSAeorgfGRZec0t_w2eGNFwUrhTAMxnRqnbfs9fccszMSmIzKMVyZlBrarSDyvDb3G21sL8LxJVVY36jD9A',
    daysAhead: 7,
    maxDisplayDays: 2,
  },
};

