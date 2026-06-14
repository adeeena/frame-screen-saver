import { ChangeDetectionStrategy, Component, Output, EventEmitter } from '@angular/core';
import { ClockService } from '../../services/clock.service';
import { SolarService } from '../../services/solar.service';
import { WeatherService } from '../../services/weather.service';
import { TrainService } from '../../services/train.service';
import { CalendarService } from '../../services/calendar.service';
import { ImageCycleService } from '../../services/image-cycle.service';

@Component({
  selector: 'app-debug-overlay',
  templateUrl: './debug-overlay.html',
  styleUrls: ['./debug-overlay.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class DebugOverlayComponent {
  @Output() close = new EventEmitter<void>();

  constructor(
    readonly clockService: ClockService,
    readonly solarService: SolarService,
    readonly weatherService: WeatherService,
    readonly trainService: TrainService,
    readonly calendarService: CalendarService,
    readonly imageCycleService: ImageCycleService,
  ) {}
}

