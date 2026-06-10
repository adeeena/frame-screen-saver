import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ClockService } from '../../services/clock.service';
import { SolarService } from '../../services/solar.service';
import { WeatherService } from '../../services/weather.service';
import { TrainService } from '../../services/train.service';
import { CalendarService } from '../../services/calendar.service';
import { ImageCycleService } from '../../services/image-cycle.service';

@Component({
  selector: 'app-debug-overlay',
  templateUrl: './debug-overlay.html',
  styleUrl: './debug-overlay.scss',
  standalone: true,
  imports: [JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DebugOverlayComponent {
  readonly close = output<void>();

  readonly clockService = inject(ClockService);
  readonly solarService = inject(SolarService);
  readonly weatherService = inject(WeatherService);
  readonly trainService = inject(TrainService);
  readonly calendarService = inject(CalendarService);
  readonly imageCycleService = inject(ImageCycleService);
}

