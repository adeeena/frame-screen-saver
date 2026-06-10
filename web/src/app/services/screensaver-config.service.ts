import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';

// ─── Config model ─────────────────────────────────────────────────────────────

export interface AnimationSettings {
  stillImageTimeoutMs: number;
  coverPageTimeoutMs: number;
  columnsPageTimeoutMs: number;
  frameChangeAfterCycles: number;
  autoReloadIntervalHours: number;
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
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  readonly config = signal<ScreensaverConfig | null>(null);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.load();
  }

  load(): void {
    this.http.get<ScreensaverConfig>('/screensaver.config.json').subscribe({
      next: (cfg) => this.config.set(cfg),
      error: (err) => console.error('Failed to load screensaver.config.json', err),
    });
  }

  save(cfg: ScreensaverConfig): void {
    this.saveStatus.set('saving');
    this.http.post<{ success: boolean }>('/api/config', cfg).subscribe({
      next: () => {
        this.config.set(cfg);
        this.saveStatus.set('saved');
        setTimeout(() => this.saveStatus.set('idle'), 2000);
      },
      error: (err) => {
        console.error('Failed to save config', err);
        this.saveStatus.set('error');
        setTimeout(() => this.saveStatus.set('idle'), 3000);
      },
    });
  }
}
