import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
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
  styleUrl: './config-page.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigPageComponent implements OnInit {
  private readonly router = inject(Router);
  readonly configService = inject(ScreensaverConfigService);

  readonly activeSection = signal<ConfigSection>('animation');
  readonly draft = signal<ScreensaverConfig | null>(null);

  readonly sections: { id: ConfigSection; label: string; icon: string }[] = [
    { id: 'animation', label: 'Animation', icon: '◷' },
    { id: 'display',   label: 'Display',   icon: '⬜' },
    { id: 'location',  label: 'Location & Time', icon: '◎' },
    { id: 'weather',   label: 'Weather',   icon: '☁' },
    { id: 'transit',   label: 'Transit',   icon: '⇌' },
    { id: 'calendar',  label: 'Calendar',  icon: '⬚' },
  ];

  readonly saveStatus = this.configService.saveStatus;

  ngOnInit(): void {
    const cfg = this.configService.config();
    if (cfg) {
      this.draft.set(structuredClone(cfg));
    } else {
      // Config not yet loaded — wait for it
      const interval = setInterval(() => {
        const c = this.configService.config();
        if (c) {
          this.draft.set(structuredClone(c));
          clearInterval(interval);
        }
      }, 100);
    }
  }

  close(): void {
    this.router.navigate(['/']);
  }

  save(): void {
    const d = this.draft();
    if (d) this.configService.save(d);
  }

  reset(): void {
    const cfg = this.configService.config();
    if (cfg) this.draft.set(structuredClone(cfg));
  }

  // ─── Section patch helpers ─────────────────────────────────────────────────

  patchAnimation(changes: Partial<AnimationSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      animationSettings: { ...d.animationSettings, ...changes },
    });
  }

  patchDisplay(changes: Partial<DisplaySettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      displaySettings: { ...d.displaySettings, ...changes },
    });
  }

  patchColors(changes: Partial<ColorSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      displaySettings: {
        ...d.displaySettings,
        colors: { ...d.displaySettings.colors, ...changes },
      },
    });
  }

  patchMedia(changes: Partial<MediaSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      displaySettings: {
        ...d.displaySettings,
        media: { ...d.displaySettings.media, ...changes },
      },
    });
  }

  patchLocation(changes: Partial<LocationSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      appSettings: {
        ...d.appSettings,
        location: { ...d.appSettings.location, ...changes },
      },
    });
  }

  patchAppTime(changes: { timezone?: string; timeFormat?: string; dateFormat?: string }): void {
    this.draft.update(d => !d ? d : {
      ...d,
      appSettings: { ...d.appSettings, ...changes },
    });
  }

  patchWeather(changes: Partial<WeatherSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      appSettings: {
        ...d.appSettings,
        weather: { ...d.appSettings.weather, ...changes },
      },
    });
  }

  patchTransit(changes: Partial<TransitSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      appSettings: {
        ...d.appSettings,
        transit: { ...d.appSettings.transit, ...changes },
      },
    });
  }

  patchCalendar(changes: Partial<CalendarSettings>): void {
    this.draft.update(d => !d ? d : {
      ...d,
      appSettings: {
        ...d.appSettings,
        calendar: { ...d.appSettings.calendar, ...changes },
      },
    });
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

  patchWeatherUnits(event: Event): void {
    const v = (event.target as HTMLSelectElement).value as 'metric' | 'imperial';
    this.patchWeather({ units: v });
  }
}
