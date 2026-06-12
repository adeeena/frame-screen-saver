import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

// ─── Config model ─────────────────────────────────────────────────────────────

export interface AnimationSettings {
  stillImageTimeoutMs: number;
  coverPageTimeoutMs: number;
  columnsPageTimeoutMs: number;
  frameChangeAfterCycles: number;
  autoReloadIntervalHours: number;
  /** How many images to include in each gallery shuffle (default 10). */
  gallerySize: number;
}

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
  source: string;
  metadata: string;
}

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
  apiKey: string | null;
  units: 'metric' | 'imperial';
}

export interface TransitSettings {
  isEnabled: boolean;
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
}

export interface CalendarSettings {
  isEnabled: boolean;
  icsUrl: string;
  daysAhead: number;
  maxDisplayDays: number;
}

export interface AppSettings {
  location: LocationSettings;
  timezone: string;
  timeFormat: string;
  dateFormat: string;
  weather: WeatherSettings;
  transit: TransitSettings;
  calendar: CalendarSettings;
}

export interface ScreensaverConfig {
  animationSettings: AnimationSettings;
  displaySettings: DisplaySettings;
  appSettings: AppSettings;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ScreensaverConfigService {
  private readonly _config$ = new BehaviorSubject<ScreensaverConfig | null>(null);
  private readonly _saveStatus$ = new BehaviorSubject<'idle' | 'saving' | 'saved' | 'error'>('idle');

  readonly config$: Observable<ScreensaverConfig | null> = this._config$.asObservable();

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.load();
  }

  config(): ScreensaverConfig | null { return this._config$.value; }
  saveStatus(): 'idle' | 'saving' | 'saved' | 'error' { return this._saveStatus$.value; }

  load(): void {
    this.http.get<ScreensaverConfig>('/screensaver.config.json').subscribe({
      next: (cfg) => this._config$.next(cfg),
      error: (err) => console.error('Failed to load screensaver.config.json', err),
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
