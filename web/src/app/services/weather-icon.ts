const WEATHER_ICON_MAP: Readonly<Record<string, string>> = {
  clearsky: 'sun',
  fair: 'sun',
  partlycloudy: 'cloud',
  cloudy: 'cloud',
  fog: 'wind',
  lightrain: 'cloud-drizzle',
  lightrainshowers: 'cloud-drizzle',
  rain: 'cloud-rain',
  rainshowers: 'cloud-rain',
  heavyrain: 'cloud-rain',
  heavyrainshowers: 'cloud-rain',
  lightsnow: 'cloud-snow',
  snow: 'cloud-snow',
  heavysnow: 'cloud-snow',
  sleet: 'cloud-snow',
  lightsleet: 'cloud-snow',
  thunder: 'cloud-lightning',
  rainandthunder: 'cloud-lightning',
} as const;

/** Maps a met.no symbol_code (e.g. 'partlycloudy_day') to a feather icon name. */
export function weatherIconName(symbolCode: string): string {
  const key = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  return WEATHER_ICON_MAP[key] ?? 'cloud';
}
