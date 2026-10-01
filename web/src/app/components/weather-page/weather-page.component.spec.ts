import { WeatherPageComponent } from './weather-page.component';
import { WeatherService } from '../../services/weather.service';
import { WeatherForecastService, HourlyForecast } from '../../services/weather-forecast.service';
import { SolarEvent, SolarService } from '../../services/solar.service';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';

describe('WeatherPageComponent night bands', () => {
  it('aligns sunrise to the displayed forecast point scale', () => {
    const component = new WeatherPageComponent(
      {} as WeatherService,
      {} as WeatherForecastService,
      {} as SolarService,
      {} as ScreensaverConfigService,
    );
    const hours = Array.from({ length: 8 }, (_, index): HourlyForecast => ({
      time: new Date(Date.parse('2026-09-24T18:00:00Z') + index * 3 * 60 * 60 * 1000).toISOString(),
      hourLabel: '',
      temperature: 0,
      precipitation: 0,
      cloudCoverage: 0,
      symbolCode: 'clearsky_night',
      uvIndex: null,
    }));
    const events: SolarEvent[] = [
      { type: 'sunset', time: '2026-09-24T17:46:00Z' },
      { type: 'sunrise', time: '2026-09-25T05:43:00Z' },
      { type: 'sunset', time: '2026-09-25T17:44:00Z' },
    ];

    const bands = (component as any).createNightBands(hours, events) as Array<{
      leftPercent: number;
      widthPercent: number;
    }>;

    expect(bands.length).toBe(1);
    expect(bands[0].leftPercent).toBe(0);
    expect(bands[0].widthPercent).toBeCloseTo(55.8, 1);
  });
});

describe('WeatherPageComponent rain bars', () => {
  function componentWithRain(amounts: readonly number[]): WeatherPageComponent {
    const hours: HourlyForecast[] = amounts.reduce<HourlyForecast[]>((forecast, amount, index) => {
      for (let hour = 0; hour < 3; hour++) {
        forecast.push({
          time: new Date(Date.parse('2026-09-24T18:00:00Z') + (index * 3 + hour) * 60 * 60 * 1000).toISOString(),
          hourLabel: '',
          temperature: 0,
          precipitation: hour === 0 ? amount : 0,
          cloudCoverage: 0,
          symbolCode: 'clearsky_day',
          uvIndex: null,
        });
      }
      return forecast;
    }, []);

    return new WeatherPageComponent(
      {} as WeatherService,
      { hourly: () => hours } as unknown as WeatherForecastService,
      { nextEvent: () => null } as SolarService,
      {} as ScreensaverConfigService,
    );
  }

  it('scales light rain against the visible maximum below 10 mm', () => {
    const component = componentWithRain([5, 2.5]);

    expect(component.barHeight(5)).toBe(50);
    expect(component.barHeight(2.5)).toBe(25);
    expect(component.barHeight(0)).toBe(0);
  });

  it('uses 10 mm as the reference when the visible maximum exceeds it', () => {
    const component = componentWithRain([12, 5]);

    expect(component.barHeight(5)).toBe(25);
    expect(component.barHeight(10)).toBe(50);
    expect(component.barHeight(12)).toBe(50);
  });
});