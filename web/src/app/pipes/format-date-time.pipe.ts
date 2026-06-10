import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';

@Pipe({
  name: 'formatDateTime',
  standalone: true,
})
export class FormatDateTimePipe implements PipeTransform {
  // We can instantiate DatePipe directly
  private readonly datePipe = new DatePipe('en-US');

  transform(value: string | Date | null | undefined, format: string = 'shortTime'): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const dateValue = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value;

    let formatString: string;
    switch (format) {
      case 'shortDateWithDayName':
        formatString = 'E, MMM d, y';
        break;
      case 'shortTime':
        formatString = 'hh:mm a';
        break;
      case 'HH:mm':
        formatString = 'HH:mm';
        break;
      case 'fullDate':
        formatString = 'EEEE, MMMM d';
        break;
      case 'timeOnly24':
        formatString = 'HH:mm';
        break;
      case 'dayLabel':
        formatString = 'EEEE';
        break;
      default:
        formatString = format;
    }
    return this.datePipe.transform(dateValue, formatString);
  }
}
