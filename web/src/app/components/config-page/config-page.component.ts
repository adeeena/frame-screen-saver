import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ScreensaverConfigService,
  ScreensaverConfig,
  AnimationSettings,
  DisplaySettings,
  ColorSettings,
  MediaSettings,
  LocationSettings,
  WeatherSettings,
  TransitSettings,
  CalendarSettings,
} from '../../services/screensaver-config.service';

export type ConfigSection =
  | 'animation'
  | 'display'
  | 'location'
  | 'weather'
  | 'transit'
  | 'calendar';

@Component({
  selector: 'app-config-page',
  templateUrl: './config-page.html',
  styleUrls: ['./config-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class ConfigPageComponent implements OnInit {
  readonly sections: { id: ConfigSection; label: string; icon: string }[] = [
    { id: 'animation', label: 'Animation', icon: '◷' },
    { id: 'display',   label: 'Display',   icon: '⬜' },
    { id: 'location',  label: 'Location & Time', icon: '◎' },
    { id: 'weather',   label: 'Weather',   icon: '☁' },
    { id: 'transit',   label: 'Transit',   icon: '⇌' },
    { id: 'calendar',  label: 'Calendar',  icon: '⬚' },
  ];

  activeSection: ConfigSection = 'animation';
  draft: ScreensaverConfig | null = null;

  constructor(
    private readonly router: Router,
    readonly configService: ScreensaverConfigService,
  ) {}

  saveStatus(): 'idle' | 'saving' | 'saved' | 'error' {
    return this.configService.saveStatus();
  }

  ngOnInit(): void {
    const cfg = this.configService.config();
    if (cfg) {
      this.draft = JSON.parse(JSON.stringify(cfg));
    } else {
      // Config not yet loaded — wait for it
      const interval = setInterval(() => {
        const c = this.configService.config();
        if (c) {
          this.draft = JSON.parse(JSON.stringify(c));
          clearInterval(interval);
        }
      }, 100);
    }
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
}
