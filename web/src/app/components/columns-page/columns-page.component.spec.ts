import { ColumnsPageComponent } from './columns-page.component';
import { ClockService } from '../../services/clock.service';
import { CalendarService } from '../../services/calendar.service';
import { ScreensaverConfigService } from '../../services/screensaver-config.service';
import { WeatherService } from '../../services/weather.service';
import { TransportPageComponent } from '../transport-page/transport-page.component';
import moment from 'moment';

describe('ColumnsPageComponent agenda visibility', () => {
  it('keeps ongoing events until their end time has passed', () => {
    let nowMs = new Date(2026, 10, 12, 12, 0).getTime();
    const days = [{
      date: moment(nowMs).format('YYYY-MM-DD'),
      dayLabel: 'Today',
      events: [
        { title: 'Finished', startTime: '10:00', endTime: '11:59', location: '', isAllDay: false },
        { title: 'Ongoing', startTime: '11:00', endTime: '13:00', location: '', isAllDay: false },
        { title: 'Upcoming', startTime: '14:00', endTime: '15:00', location: '', isAllDay: false },
        { title: 'All day', startTime: '', endTime: '', location: '', isAllDay: true },
      ],
    }];
    const component = new ColumnsPageComponent(
      { nowMs: () => nowMs } as ClockService,
      { days: () => days } as unknown as CalendarService,
      { config: () => null } as unknown as ScreensaverConfigService,
      {} as WeatherService,
      { id: 'server' },
    );
    const titles = (): string[] => component.candidateDays[0].events.map((event) => event.title);

    expect(titles()).toEqual(['Ongoing', 'Upcoming', 'All day']);

    nowMs = new Date(2026, 10, 12, 13, 0).getTime();
    expect(titles()).toEqual(['Ongoing', 'Upcoming', 'All day']);

    nowMs = new Date(2026, 10, 12, 13, 1).getTime();
    expect(titles()).toEqual(['Upcoming', 'All day']);
  });
});

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