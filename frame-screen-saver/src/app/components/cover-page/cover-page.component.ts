import { NgxSplideModule } from 'ngx-splide';
import { Component, inject } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { FormatDateTimePipe } from '../../pipes/format-date-time.pipe';

@Component({
  selector: 'app-cover-page',
  templateUrl: './cover-page.html',
  styleUrl: './cover-page.scss',
  imports: [ NgxSplideModule, FormatDateTimePipe ],
  standalone: true
})
export class CoverPageComponent {
  public clockService = inject(ClockService);
}
