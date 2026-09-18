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
  /** Line J, Épône-Mzières → Paris Saint-Lazare — to be replaced by the RER E western extension. */
  readonly transitSecondary: TransitConfig;
  /** RER E western extension (Eole) to Épône / Mantes-la-Jolie — not yet open. */
  readonly rerE: {
    /** ISO date the extension is expected to open on this branch (source: rer-eole.fr / SNCF Réseau, subject to change). */
    readonly openingDate: string;
    readonly toMagenta: TransitConfig;
    readonly toSaintLazare: TransitConfig;
  };
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
  // Verified against PRIM SIRI stop-monitoring: StopArea 47882 serves both line N
  // (C01736, to Montparnasse/Mantes-la-Jolie) and line J (C01739, to Saint-Lazare).
  transitSecondary: {
    provider: 'prim',
    stopId: 'STIF:StopArea:SP:47882:',
    stopLabel: 'Épône - Mézières',
    lineLabel: 'J',
    lineColor: 'D5C900',
    lineTextColor: '25303B',
    direction: 'Paris Saint-Lazare',
    maxDepartures: 2,
    primLineRef: 'STIF:Line::C01739:',
    destinationFilter: 'Saint-Lazare',
  },
  rerE: {
    // Per Wikipedia / SNCF Réseau (Sept 2026): phased opening of the western extension
    // to Épône / Mantes-la-Jolie between March 2027 and late 2029 — adjust once confirmed.
    openingDate: '2027-02-27',
    toMagenta: {
      provider: 'prim',
      stopId: 'STIF:StopArea:SP:47882:',
      stopLabel: 'Épône - Mézières',
      lineLabel: 'E',
      lineColor: 'E2007A',
      lineTextColor: 'ffffff',
      direction: 'Magenta',
      maxDepartures: 2,
      destinationFilter: 'Magenta',
    },
    toSaintLazare: {
      provider: 'prim',
      stopId: 'STIF:StopArea:SP:47882:',
      stopLabel: 'Épône - Mézières',
      lineLabel: 'E',
      lineColor: 'E2007A',
      lineTextColor: 'ffffff',
      direction: 'Saint-Lazare',
      maxDepartures: 2,
      destinationFilter: 'Saint-Lazare',
    },
  },
  calendar: {
    icsUrl:
      'https://p120-caldav.icloud.com/published/2/ODA5NDI3MjY1NzgwOTQyN_PaDSAeorgfGRZec0t_w2eGNFwUrhTAMxnRqnbfs9fccszMSmIzKMVyZlBrarSDyvDb3G21sL8LxJVVY36jD9A',
    daysAhead: 7,
    maxDisplayDays: 2,
  },
};

