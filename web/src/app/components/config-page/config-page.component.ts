import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import {
  ScreensaverConfigService,
  ScreensaverConfig,
  AnimationSettings,
  DisplaySettings,
  ColorSettings,
  MediaSettings,
  MediaPackSettings,
  LocationSettings,
  WeatherSettings,
  TransitSettings,
  TransitRouteSettings,
  CalendarSettings,
  WorldClockCity,
  WorldClockSettings,
  ContentSettings,
  MessageSettings,
} from '../../services/screensaver-config.service';

export type ConfigSection =
  | 'general'
  | 'animation'
  | 'display'
  | 'location'
  | 'worldClock'
  | 'weather'
  | 'transit'
  | 'calendar';

@Component({
  selector: 'app-config-page',
  templateUrl: './config-page.html',
  styleUrls: ['./config-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class ConfigPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly sections: { id: ConfigSection; labelKey: string; icon: string }[] = [
    { id: 'general', labelKey: 'nav.general', icon: 'settings' },
    { id: 'animation', labelKey: 'nav.animation', icon: 'film' },
    { id: 'display', labelKey: 'nav.display', icon: 'monitor' },
    { id: 'location', labelKey: 'nav.locationTime', icon: 'map-pin' },
    { id: 'worldClock', labelKey: 'nav.worldClock', icon: 'globe' },
    { id: 'weather', labelKey: 'nav.weather', icon: 'cloud' },
    { id: 'transit', labelKey: 'nav.transit', icon: 'repeat' },
    { id: 'calendar', labelKey: 'nav.calendar', icon: 'calendar' },
  ];

  activeSection: ConfigSection = 'general';
  draft: ScreensaverConfig | null = null;

  constructor(
    private readonly router: Router,
    readonly configService: ScreensaverConfigService,
  ) {}

  saveStatus(): 'idle' | 'saving' | 'saved' | 'error' {
    return this.configService.saveStatus();
  }

  ngOnInit(): void {
    this.configService.config$
      .pipe(
        filter((c): c is ScreensaverConfig => c !== null),
        take(1),
        takeUntil(this.destroy$),
      )
      .subscribe((cfg) => {
        this.draft = JSON.parse(JSON.stringify(cfg));
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.router.navigate(['/']);
  }

  save(): void {
    if (this.draft) this.configService.save(this.draft);
  }

  reset(): void {
    const cfg = this.configService.config();
    if (cfg) this.draft = JSON.parse(JSON.stringify(cfg));
  }

  // ─── Section patch helpers ─────────────────────────────────────────────────

  patchAnimation(changes: Partial<AnimationSettings>): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, animationSettings: { ...this.draft.animationSettings, ...changes } };
  }

  patchContent(changes: Partial<ContentSettings>): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, contentSettings: { ...this.draft.contentSettings, ...changes } };
  }

  patchLocale(event: Event): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: { ...this.draft.appSettings, locale: this.strVal(event) },
    };
  }

  patchMessages(changes: Partial<MessageSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: {
        ...this.draft.appSettings,
        messages: { ...this.draft.appSettings.messages, ...changes },
      },
    };
  }

  patchDisplay(changes: Partial<DisplaySettings>): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, displaySettings: { ...this.draft.displaySettings, ...changes } };
  }

  patchColors(changes: Partial<ColorSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      displaySettings: { ...this.draft.displaySettings, colors: { ...this.draft.displaySettings.colors, ...changes } },
    };
  }

  patchMedia(changes: Partial<MediaSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      displaySettings: { ...this.draft.displaySettings, media: { ...this.draft.displaySettings.media, ...changes } },
    };
  }

  addMediaPack(): void {
    if (!this.draft) return;
    const pack: MediaPackSettings = {
      name: `pack-${this.draft.displaySettings.media.packs.length + 1}`,
      metadataFile: null,
      cacheExpiryTimeHours: 24,
    };
    this.patchMedia({ packs: [...this.draft.displaySettings.media.packs, pack] });
  }

  patchMediaPack(index: number, changes: Partial<MediaPackSettings>): void {
    if (!this.draft) return;
    const packs = this.draft.displaySettings.media.packs.map((pack, packIndex) =>
      packIndex === index ? { ...pack, ...changes } : pack,
    );
    this.patchMedia({ packs });
  }

  removeMediaPack(index: number): void {
    if (!this.draft) return;
    const packs = this.draft.displaySettings.media.packs.filter((_, packIndex) => packIndex !== index);
    this.patchMedia({ packs });
  }

  patchLocation(changes: Partial<LocationSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: { ...this.draft.appSettings, location: { ...this.draft.appSettings.location, ...changes } },
    };
  }

  patchAppTime(changes: { timezone?: string; timeFormat?: string; dateFormat?: string }): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, appSettings: { ...this.draft.appSettings, ...changes } };
  }

  patchWorldClock(changes: Partial<WorldClockSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: {
        ...this.draft.appSettings,
        worldClock: { ...this.draft.appSettings.worldClock, ...changes },
      },
    };
  }

  addWorldClockCity(): void {
    if (!this.draft) return;
    const city: WorldClockCity = {
      name: '',
      latitude: 0,
      longitude: 0,
      role: 'compact',
    };
    this.patchWorldClock({ cities: [...this.draft.appSettings.worldClock.cities, city] });
  }

  patchWorldClockCity(index: number, changes: Partial<WorldClockCity>): void {
    if (!this.draft) return;
    const cities = this.draft.appSettings.worldClock.cities.map((city, cityIndex) => {
      if (changes.role === 'featured' && cityIndex !== index && city.role === 'featured') {
        return { ...city, role: 'compact' as const, timezone: undefined };
      }
      return cityIndex === index ? { ...city, ...changes } : city;
    });
    this.patchWorldClock({ cities });
  }

  removeWorldClockCity(index: number): void {
    if (!this.draft) return;
    const cities = this.draft.appSettings.worldClock.cities.filter((_, cityIndex) => cityIndex !== index);
    this.patchWorldClock({ cities });
  }

  patchWeather(changes: Partial<WeatherSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: { ...this.draft.appSettings, weather: { ...this.draft.appSettings.weather, ...changes } },
    };
  }

  patchTransit(changes: Partial<TransitSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: { ...this.draft.appSettings, transit: { ...this.draft.appSettings.transit, ...changes } },
    };
  }

  addTransitEntry(): void {
    if (!this.draft) return;
    const transit = this.draft.appSettings.transit;
    const id = `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: TransitRouteSettings = {
      id,
      provider: 'prim',
      stopId: '',
      stopLabel: '',
      lineLabel: '',
      lineColor: '666666',
      lineTextColor: 'ffffff',
      direction: '',
      maxDepartures: 3,
      primLineRef: null,
      navitiaRegion: null,
      gtfsRtUrl: null,
      destinationFilter: null,
      availableFrom: null,
      availableUntil: null,
    };
    this.patchTransit({ entries: [...transit.entries, entry] });
  }

  patchTransitEntry(entryId: string, changes: Partial<TransitRouteSettings>): void {
    if (!this.draft) return;
    const entries = this.draft.appSettings.transit.entries.map((entry) =>
      entry.id === entryId ? { ...entry, ...changes } : entry,
    );
    this.patchTransit({ entries });
  }

  removeTransitEntry(entryId: string): void {
    if (!this.draft) return;
    const entries = this.draft.appSettings.transit.entries.filter((entry) => entry.id !== entryId);
    this.patchTransit({ entries });
  }

  patchCalendar(changes: Partial<CalendarSettings>): void {
    if (!this.draft) return;
    this.draft = {
      ...this.draft,
      appSettings: { ...this.draft.appSettings, calendar: { ...this.draft.appSettings.calendar, ...changes } },
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  strVal(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  numVal(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  millisecondsVal(event: Event): number {
    return Math.round(this.numVal(event) * 1000);
  }

  boolVal(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  nullableStr(event: Event): string | null {
    const v = (event.target as HTMLInputElement).value.trim();
    return v === '' ? null : v;
  }

  patchFontSetting(key: 'clock' | 'headers' | 'default', event: Event): void {
    if (!this.draft) return;
    const val = this.strVal(event);
    this.patchDisplay({
      fontSettings: { ...this.draft.displaySettings.fontSettings, [key]: val },
    });
  }

  patchWeatherUnits(event: Event): void {
    const v = (event.target as HTMLSelectElement).value as 'metric' | 'imperial';
    this.patchWeather({ units: v });
  }

  worldClockRoleVal(event: Event): 'compact' | 'featured' {
    return (event.target as HTMLSelectElement).value === 'featured' ? 'featured' : 'compact';
  }
}
