import { fakeAsync, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import moment from 'moment';
import { ClockService } from './clock.service';

describe('ClockService', () => {
  it('uses one time snapshot for local and timezone displays', fakeAsync(() => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    http.get.and.returnValue(of({ time: new Date().toISOString(), timezone: 'Europe/Paris' }));
    const service = new ClockService(http, 'browser' as unknown as object);
    tick(1);
    tick(1500);

    const displayedTime = moment(service.time(), 'YYYY-MM-DD HH:mm:ss').valueOf();
    expect(Math.abs(service.nowMs() - displayedTime)).toBeLessThan(1000);
    service.ngOnDestroy();
  }));
});