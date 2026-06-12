import { Pipe, PipeTransform } from '@angular/core';
import moment from 'moment';

@Pipe({
  name: 'formatDateTime',
})
export class FormatDateTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format: string = 'shortTime'): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // moment.parseZone() respects the UTC offset embedded in ISO strings
    // (e.g. '2026-06-12T13:11:00+02:00' → shows '13:11') whereas Angular
    // DatePipe always converts to browser-local time, which is UTC on a Pi.
    // For bare datetime strings (e.g. clock: '2026-06-12 12:42:00') the server
    // already writes them in the display timezone, so treating them as-is is correct.
    const m = typeof value === 'string'
      ? moment.parseZone(value)
      : moment(value);

    if (!m.isValid()) return null;

    let formatString: string;
    switch (format) {
      case 'shortDateWithDayName':
        formatString = 'ddd, MMM D, YYYY';
        break;
      case 'shortTime':
        formatString = 'hh:mm A';
        break;
      case 'HH:mm':
        formatString = 'HH:mm';
        break;
      case 'fullDate':
        formatString = 'dddd, MMMM D';
        break;
      case 'timeOnly24':
        formatString = 'HH:mm';
        break;
      case 'dayLabel':
        formatString = 'dddd';
        break;
      default:
        formatString = format;
    }

    return m.format(formatString);
  }
}
