import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';

@Pipe({
  name: 'formatDateTime',
  standalone: true,
})
export class FormatDateTimePipe implements PipeTransform {
  // We can instantiate DatePipe directly
  private datePipe = new DatePipe('en-US');

  transform(
    value: string | Date | null | undefined,
    format: string = 'shortTime'
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const dateValue = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value;
    
    let formatString: string;
    switch (format) {
      case 'shortTime':
        // 'hh:mm a' corresponds to a zero-padded 12-hour clock with an AM/PM marker (e.g., 09:30 PM)
        formatString = 'hh:mm a';
        break;
      default:
        formatString = format;
    }
    return this.datePipe.transform(dateValue, formatString);
  }
}
