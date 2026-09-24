import { PLATFORM_ID } from '@angular/core';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ScreensaverConfig, ScreensaverConfigService } from './screensaver-config.service';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  it('uses locale, language, and default fallbacks', () => {
    const config$ = new BehaviorSubject<ScreensaverConfig | null>(null);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TranslationService,
        { provide: ScreensaverConfigService, useValue: { config$ } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const service = TestBed.inject(TranslationService);
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('/translations.json').flush({
      defaultLocale: 'en',
      translations: {
        en: { greeting: 'Hello {{name}}', fallback: 'Fallback' },
        fr: { greeting: 'Bonjour {{name}}' },
      },
    });

    config$.next({ appSettings: { locale: 'fr-FR' } } as unknown as ScreensaverConfig);

    expect(service.translate('greeting', { name: 'Ada' })).toBe('Bonjour Ada');
    expect(service.translate('fallback')).toBe('Fallback');
    expect(service.translate('missing.key')).toBe('missing.key');
  });
});