import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { ImageCycleService } from '../../services/image-cycle.service';

@Component({
  selector: 'app-cover-page',
  templateUrl: './cover-page.html',
  styleUrls: ['./cover-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class CoverPageComponent {
  constructor(
    readonly clockService: ClockService,
    readonly imageCycleService: ImageCycleService,
  ) {}
}
