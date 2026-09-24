import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Title } from '@angular/platform-browser';

// ─── Config model ─────────────────────────────────────────────────────────────

export interface AnimationSettings {
  stillImageTimeoutMs: number;
  coverPageTimeoutMs: number;
  columnsPageTimeoutMs: number;
  transportPageTimeoutMs: number;
  weatherPageTimeoutMs: number;
  pageTransitionDurationMs: number;
  messagePageTimeoutMs: number;
  frameChangeAfterCycles: number;
  autoReloadIntervalHours: number;
  /** How many images to include in each gallery shuffle (default 10). */
  gallerySize: number;
}

const animationDefaults: AnimationSettings = {
  stillImageTimeoutMs: 5000,
  coverPageTimeoutMs: 10000,
  columnsPageTimeoutMs: 10000,
  transportPageTimeoutMs: 10000,
  weatherPageTimeoutMs: 10000,
  pageTransitionDurationMs: 400,
  messagePageTimeoutMs: 5000,
  frameChangeAfterCycles: 10,
  autoReloadIntervalHours: 6,
  gallerySize: 10,
};

export interface FontSettings {
  clock: string;
  headers: string;
  default: string;
}

export interface ColorSettings {
  accent: string;
  secondary: string;
}

export interface MediaSettings {
  packs: MediaPackSettings[];
}

export interface MediaPackSettings {
  name: string;
  metadataFile: string | null;
  cacheExpiryTimeHours: number;
}

export interface ContentSettings {
  productName: string;
  documentTitle: string;
  galleryTitle: string;
  gallerySubtitle: string;
}

const contentDefaults: ContentSettings = {
  productName: 'Ambient Display',
  documentTitle: 'Ambient Display',
  galleryTitle: '',
  gallerySubtitle: '',
};

export interface DisplaySettings {
  isGrainEffectEnabled: boolean;
  opacity: number;
  fontSettings: FontSettings;
  colors: ColorSettings;
  media: MediaSettings;
}

export interface LocationSettings {
  city: string;
  region: string;
  latitude: number;
  longitude: number;
}

export interface WeatherSettings {
  provider: string;
  units: 'metric' | 'imperial';
}

export interface TransitRouteSettings {
  id: string;
  provider: string;
  stopId: string;
  stopLabel: string;
  lineLabel: string;
  lineColor: string;
  lineTextColor: string;
  direction: string;
  maxDepartures: number;
  primLineRef: string | null;
  navitiaRegion: string | null;
  gtfsRtUrl: string | null;
  destinationFilter: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
}

export interface TransitSettings {
  isEnabled: boolean;
  entries: TransitRouteSettings[];
}

export interface CalendarSettings {
  isEnabled: boolean;
  daysAhead: number;
  maxDisplayDays: number;
}

export interface WorldClockCity {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  role?: 'compact' | 'featured';
}

export interface WorldClockSettings {
  cities: WorldClockCity[];
}

export interface MessageSettings {
  maxTextLength: number;
  maxLifetimeDays: number;
  retentionDays: number;
  itemsPerPage: number;
}

const messageDefaults: MessageSettings = {
  maxTextLength: 2048,
  maxLifetimeDays: 7,
  retentionDays: 30,
  itemsPerPage: 3,
};

export interface AppSettings {
  locale: string;
  location: LocationSettings;
  timezone: string;
  timeFormat: string;
  dateFormat: string;
  weather: WeatherSettings;
  transit: TransitSettings;
  calendar: CalendarSettings;
  worldClock: WorldClockSettings;
  messages: MessageSettings;
}

export interface ScreensaverConfig {
  animationSettings: AnimationSettings;
  displaySettings: DisplaySettings;
  appSettings: AppSettings;
  contentSettings: ContentSettings;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ScreensaverConfigService {
  private readonly _config$ = new BehaviorSubject<ScreensaverConfig | null>(null);
  private readonly _saveStatus$ = new BehaviorSubject<'idle' | 'saving' | 'saved' | 'error'>('idle');

  readonly config$: Observable<ScreensaverConfig | null> = this._config$.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly title: Title,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.load();
  }

  config(): ScreensaverConfig | null { return this._config$.value; }
  content(): ContentSettings { return this._config$.value?.contentSettings ?? contentDefaults; }
  messages(): MessageSettings { return this._config$.value?.appSettings.messages ?? messageDefaults; }
  saveStatus(): 'idle' | 'saving' | 'saved' | 'error' { return this._saveStatus$.value; }

  load(): void {
    this.http.get<ScreensaverConfig>('/api/config').subscribe({
      next: (cfg) => {
        const normalized: ScreensaverConfig = {
          ...cfg,
          animationSettings: { ...animationDefaults, ...cfg.animationSettings },
          contentSettings: { ...contentDefaults, ...cfg.contentSettings },
          displaySettings: {
            ...cfg.displaySettings,
            media: { packs: cfg.displaySettings?.media?.packs ?? [] },
          },
          appSettings: {
            ...cfg.appSettings,
            locale: cfg.appSettings?.locale || 'en',
            worldClock: { cities: cfg.appSettings?.worldClock?.cities ?? [] },
            messages: { ...messageDefaults, ...cfg.appSettings?.messages },
          },
        };
        this.title.setTitle(normalized.contentSettings.documentTitle);
        this._config$.next(normalized);
      },
      error: (err) => console.error('Failed to load screensaver configuration', err),
    });
  }

  save(cfg: ScreensaverConfig): void {
    this._saveStatus$.next('saving');
    this.http.post<{ success: boolean }>('/api/config', cfg).subscribe({
      next: () => {
        this._config$.next(cfg);
        this._saveStatus$.next('saved');
        setTimeout(() => this._saveStatus$.next('idle'), 2000);
      },
      error: (err) => {
        console.error('Failed to save config', err);
        this._saveStatus$.next('error');
        setTimeout(() => this._saveStatus$.next('idle'), 3000);
      },
    });
  }
}
