import { calendarDayKey, excludedCalendarDays } from './calendar-recurrence';

describe('calendar recurrence dates', () => {
  it('matches an iCloud all-day exclusion shifted to the previous UTC date', () => {
    const timezone = 'Europe/Paris';
    const occurrence = new Date('2026-09-24T00:00:00.000Z');
    const exclusions = {
      '2026-09-23': new Date('2026-09-23T22:00:00.000Z'),
    };

    expect(calendarDayKey(occurrence, timezone)).toBe('2026-09-24');
    expect(excludedCalendarDays(exclusions, timezone).has(calendarDayKey(occurrence, timezone))).toBeTrue();
  });
});