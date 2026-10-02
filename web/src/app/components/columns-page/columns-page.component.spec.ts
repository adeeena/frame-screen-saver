import { ColumnsPageComponent } from './columns-page.component';
import { ClockService } from '../../services/clock.service';
import { CalendarService } from '../../services/calendar.service';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';
import { WeatherService } from '../../services/weather.service';
import { TransportPageComponent } from '../transport-page/transport-page.component';

describe('ColumnsPageComponent page sequence', () => {
  const nowMs = Date.parse('2026-10-02T12:00:00Z');
  let days: any[];
  let component: ColumnsPageComponent;

  beforeEach(() => {
    days = [{ date: '2026-10-15', events: [{ title: '*Birthday' }] }];
    component = new ColumnsPageComponent(
      { nowMs: () => nowMs } as ClockService,
      { days: () => days } as unknown as CalendarService,
      {} as ScreensaverConfigService,
      {} as WeatherService,
      { id: 'server' },
    );
    (component as any).transportContent = { pageCount: () => 3 } as TransportPageComponent;
  });

  it('places transit and messages after agenda and countdown in one pagination sequence', () => {
    expect(component.transportStartIndex()).toBe(2);
    expect(component.pageCount()).toBe(5);

    component.onTransportPageChanged(2);
    expect(component.calendarPage).toBe(4);
    expect(component.isTransportPage()).toBe(true);
  });

  it('skips countdown when there are no countdown events', () => {
    days = [];
    expect(component.transportStartIndex()).toBe(1);
    expect(component.pageCount()).toBe(4);

    component.onTransportPageChanged(0);
    expect(component.calendarPage).toBe(1);
  });

  it('signals completion only while the combined page is active', () => {
    const completed = jasmine.createSpy('completed');
    component.cycleComplete.subscribe(completed);
    component.onTransportCycleComplete();
    expect(completed).not.toHaveBeenCalled();

    component.active = true;
    component.onTransportCycleComplete();
    expect(completed).toHaveBeenCalledTimes(1);
  });
});