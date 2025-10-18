import { Component, inject } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { SolarService } from '../../services/solar.service';
import { FormatDateTimePipe } from '../../pipes/format-date-time.pipe';
import { FeatherIconDirective } from '../../directives/feather-icon.directive';


@Component({
  selector: 'app-cover-page',
  templateUrl: './cover-page.html',
  styleUrl: './cover-page.scss',
  imports: [FormatDateTimePipe, FeatherIconDirective],
  standalone: true
})
export class CoverPageComponent {
  public clockService = inject(ClockService);
  public solarService = inject(SolarService);
}
