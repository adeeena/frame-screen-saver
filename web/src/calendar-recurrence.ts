import momentTz from 'moment-timezone';

export function calendarDayKey(date: Date, timezone: string): string {
  return momentTz(date).tz(timezone).format('YYYY-MM-DD');
}

export function excludedCalendarDays(
  exclusions: Readonly<Record<string, Date>>,
  timezone: string,
): ReadonlySet<string> {
  return new Set(Object.values(exclusions).map((date) => calendarDayKey(date, timezone)));
}