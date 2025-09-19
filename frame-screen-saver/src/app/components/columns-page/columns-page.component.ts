import { NgxSplideModule } from 'ngx-splide';
import { Component, inject } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { FormatDateTimePipe } from '../../pipes/format-date-time.pipe';

@Component({
  selector: 'app-columns-page',
  templateUrl: './columns-page.html',
  styleUrl: './columns-page.scss',
  imports: [ NgxSplideModule, FormatDateTimePipe ],
  standalone: true
})
export class ColumnsPageComponent {
  public clockService = inject(ClockService);
}