import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';
import { ScreensaverConfig, ScreensaverConfigService } from './screensaver-config.service';

interface TranslationCatalog {
  readonly defaultLocale: string;
  readonly translations: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type TranslationParams = Readonly<Record<string, string | number>>;

@Injectable({ providedIn: 'root' })
export class TranslationService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private catalog: TranslationCatalog = { defaultLocale: 'en', translations: {} };
  private locale = 'en';

  constructor(
    private readonly http: HttpClient,
    private readonly configService: ScreensaverConfigService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    if (!isPlatformBrowser(platformId)) return;

    this.http.get<TranslationCatalog>('/translations.json')
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe((catalog) => { this.catalog = catalog; });

    this.configService.config$
      .pipe(
        filter((config): config is ScreensaverConfig => config !== null),
        takeUntil(this.destroy$),
      )
      .subscribe((config) => {
        this.locale = config.appSettings.locale || this.catalog.defaultLocale;
        document.documentElement.lang = this.locale;
      });
  }

  translate(key: string, params?: TranslationParams): string {
    const locale = this.locale.toLowerCase();
    const language = locale.split('-')[0];
    const value = this.catalog.translations[locale]?.[key]
      ?? this.catalog.translations[language]?.[key]
      ?? this.catalog.translations[this.catalog.defaultLocale]?.[key]
      ?? key;

    if (!params) return value;
    return value.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_match, name: string) =>
      params[name] === undefined ? `{{${name}}}` : String(params[name]));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}