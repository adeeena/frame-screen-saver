import { formatExpiryCountdown, nextTransitOpening } from './transport-page.component';
import { TransitRouteSettings } from '../../services/screensaver-config.service';

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
      route('e-1', 'E', 'Épône - Mézières', '2027-02-27'),
      route('e-2', 'E', 'Épône - Mézières', '2027-02-27'),
    ], Date.parse('2026-09-18T12:00:00Z'));

    expect(opening).toEqual({ lineLabel: 'E', stopLabel: 'Épône - Mézières', days: 162 });
  });

  it('ignores routes that are already available', () => {
    expect(nextTransitOpening([
      route('active', 'N', 'Maule', '2026-01-01'),
    ], Date.parse('2026-09-18T12:00:00Z'))).toBeNull();
  });
});