import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { ImageCycleService } from '../../services/image-cycle.service';
import { FormatDateTimePipe } from '../../pipes/format-date-time.pipe';

@Component({
  selector: 'app-cover-page',
  templateUrl: './cover-page.html',
  styleUrl: './cover-page.scss',
  standalone: true,
  imports: [FormatDateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverPageComponent {
  readonly clockService = inject(ClockService);
  readonly imageCycleService = inject(ImageCycleService);
}
