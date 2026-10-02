import { formatExpiryCountdown, nextTransitOpening, TransportPageComponent } from './transport-page.component';
import { ScreensaverConfigService, TransitRouteSettings } from '../../services/screensaver-config.service';

describe('formatExpiryCountdown', () => {
  const nowMs = Date.parse('2026-09-18T12:00:00Z');

  it('shows only minutes below one hour', () => {
    expect(formatExpiryCountdown('2026-09-18T12:42:00Z', nowMs)).toBe('expires in 42min');
  });

  it('shows hours and minutes below one day', () => {
    expect(formatExpiryCountdown('2026-09-19T11:05:00Z', nowMs)).toBe('expires in 23h 5min');
  });

  it('shows days, hours, and minutes from one day', () => {
    expect(formatExpiryCountdown('2026-09-19T14:03:00Z', nowMs)).toBe('expires in 1d 2h 3min');
  });
});

describe('nextTransitOpening', () => {
  const route = (id: string, lineLabel: string, stopLabel: string, availableFrom: string | null): TransitRouteSettings => ({
    id,
    provider: 'prim',
    stopId: 'stop',
    stopLabel,
    lineLabel,
    lineColor: '000000',
    lineTextColor: 'ffffff',
    direction: 'destination',
    maxDepartures: 2,
    primLineRef: null,
    navitiaRegion: null,
    gtfsRtUrl: null,
    destinationFilter: null,
    availableFrom,
    availableUntil: null,
  });

  it('groups the earliest routes sharing an opening date', () => {
    const opening = nextTransitOpening([
      route('later', 'T', 'Later', '2027-05-01'),
      route('future-1', 'X', 'Central Station', '2027-02-27'),
      route('future-2', 'X', 'Central Station', '2027-02-27'),
    ], Date.parse('2026-09-18T12:00:00Z'));

    expect(opening).toEqual({ lineLabel: 'X', stopLabel: 'Central Station', days: 162 });
  });

  it('ignores routes that are already available', () => {
    expect(nextTransitOpening([
      route('active', 'A', 'Central Station', '2026-01-01'),
    ], Date.parse('2026-09-18T12:00:00Z'))).toBeNull();
  });
});

describe('TransportPageComponent page sequence', () => {
  const entries = Array.from({ length: 4 }, (_, index) => ({ id: `route-${index}` })) as TransitRouteSettings[];
  const component = new TransportPageComponent(
    {} as any,
    { config: () => ({ appSettings: { transit: { isEnabled: true, entries } } }) } as unknown as ScreensaverConfigService,
    {} as any,
    {} as any,
  );

  it('shows only two-route transit pages when there are no messages', () => {
    component.messagePages = [[]];
    component.currentMessagePage = 1;

    expect(component.pageCount()).toBe(2);
    expect(component.isMessagePage()).toBe(false);
    expect(component.transportEntriesPage()).toEqual(entries.slice(2));
  });

  it('shows message pages after transit while keeping the outgoing routes mounted', () => {
    component.messagePages = [[{} as any], [{} as any]];
    component.currentMessagePage = 2;

    expect(component.pageCount()).toBe(4);
    expect(component.isMessagePage()).toBe(true);
    expect(component.currentMessagePageIndex()).toBe(0);
    expect(component.transportEntriesPage()).toEqual(entries.slice(2));

    component.currentMessagePage = 3;
    expect(component.currentMessagePageIndex()).toBe(1);
  });
});