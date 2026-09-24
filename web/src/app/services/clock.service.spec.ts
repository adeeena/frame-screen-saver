import { fakeAsync, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import moment from 'moment';
import { ClockService } from './clock.service';

describe('ClockService', () => {
  it('uses one time snapshot for local and timezone displays', fakeAsync(() => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    http.get.and.returnValue(of({ time: new Date().toISOString(), timezone: 'UTC' }));
    const service = new ClockService(http, 'browser' as unknown as object);
    tick(1);
    const initialNowMs = service.nowMs();
    const millisecondsUntilNextMinute = 60 * 1000 - (initialNowMs % (60 * 1000));

    tick(millisecondsUntilNextMinute - 2);
    expect(service.nowMs()).toBe(initialNowMs);

    tick(2);
    expect(service.nowMs()).toBeGreaterThan(initialNowMs);

    const displayedTime = moment(service.time(), 'YYYY-MM-DD HH:mm:ss').valueOf();
    expect(Math.abs(service.nowMs() - displayedTime)).toBeLessThan(1000);
    service.ngOnDestroy();
  }));
});