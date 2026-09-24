import { PLATFORM_ID } from '@angular/core';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ScreensaverConfig, ScreensaverConfigService } from './screensaver-config.service';

describe('ScreensaverConfigService display settings', () => {
  let httpMock: HttpTestingController;
  let service: ScreensaverConfigService;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ScreensaverConfigService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    title = TestBed.inject(Title);
    service = TestBed.inject(ScreensaverConfigService);
  });

  afterEach(() => {
    httpMock.verify();
    const rootStyle = document.documentElement.style;
    [
      '--accent',
      '--accent-dim',
      '--text-primary',
      '--font-clock',
      '--font-display',
      '--font-body',
      '--grain-opacity',
      '--overlay-opacity',
    ].forEach((property) => rootStyle.removeProperty(property));
  });

  it('applies display settings when configuration loads', () => {
    httpMock.expectOne('/api/config').flush(configFixture());

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--accent')).toBe('#123456');
    expect(rootStyle.getPropertyValue('--accent-dim')).toBe('rgba(18, 52, 86, 0.55)');
    expect(rootStyle.getPropertyValue('--text-primary')).toBe('#abcdef');
    expect(rootStyle.getPropertyValue('--font-clock')).toBe('Clock Face');
    expect(rootStyle.getPropertyValue('--font-display')).toBe('Heading Face');
    expect(rootStyle.getPropertyValue('--font-body')).toBe('Body Face');
    expect(rootStyle.getPropertyValue('--grain-opacity')).toBe('0');
    expect(rootStyle.getPropertyValue('--overlay-opacity')).toBe('0.4');
    expect(title.getTitle()).toBe('Configured title');
  });

  it('reapplies display settings after saving', () => {
    const initial = configFixture();
    httpMock.expectOne('/api/config').flush(initial);
    const updated: ScreensaverConfig = {
      ...initial,
      contentSettings: { ...initial.contentSettings, documentTitle: 'Updated title' },
      displaySettings: {
        ...initial.displaySettings,
        isGrainEffectEnabled: true,
        opacity: 0.8,
        colors: { accent: '#654321', secondary: '#fedcba' },
        fontSettings: { clock: 'New Clock', headers: 'New Heading', default: 'New Body' },
      },
    };

    service.save(updated);
    httpMock.expectOne('/api/config').flush({ success: true });

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--accent')).toBe('#654321');
    expect(rootStyle.getPropertyValue('--text-primary')).toBe('#fedcba');
    expect(rootStyle.getPropertyValue('--font-clock')).toBe('New Clock');
    expect(rootStyle.getPropertyValue('--font-display')).toBe('New Heading');
    expect(rootStyle.getPropertyValue('--font-body')).toBe('New Body');
    expect(rootStyle.getPropertyValue('--grain-opacity')).toBe('0.55');
    expect(rootStyle.getPropertyValue('--overlay-opacity')).toBe('0.8');
    expect(title.getTitle()).toBe('Updated title');
  });
});

function configFixture(): ScreensaverConfig {
  return {
    animationSettings: {
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
    },
    contentSettings: {
      productName: 'Display',
      documentTitle: 'Configured title',
      galleryTitle: '',
      gallerySubtitle: '',
    },
    displaySettings: {
      isGrainEffectEnabled: false,
      opacity: 0.4,
      colors: { accent: '#123456', secondary: '#abcdef' },
      fontSettings: { clock: 'Clock Face', headers: 'Heading Face', default: 'Body Face' },
      media: { packs: [] },
    },
    appSettings: {
      locale: 'en',
      location: { city: '', region: '', latitude: 0, longitude: 0 },
      timezone: 'UTC',
      timeFormat: 'HH:mm',
      dateFormat: 'dddd, MMMM D',
      weather: { provider: 'met.no', units: 'metric' },
      transit: { isEnabled: false, entries: [] },
      calendar: { isEnabled: false, daysAhead: 7, maxDisplayDays: 2 },
      worldClock: { cities: [] },
      messages: { maxTextLength: 2048, maxLifetimeDays: 7, retentionDays: 30, itemsPerPage: 3 },
    },
  };
}