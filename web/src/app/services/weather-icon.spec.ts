import { weatherIconName } from './weather-icon';

describe('weatherIconName', () => {
  it('uses the moon for clear and fair night symbols', () => {
    expect(weatherIconName('clearsky_night')).toBe('moon');
    expect(weatherIconName('fair_night')).toBe('moon');
  });

  it('keeps the sun for clear and fair day symbols', () => {
    expect(weatherIconName('clearsky_day')).toBe('sun');
    expect(weatherIconName('fair_day')).toBe('sun');
  });
});