import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgZone, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { TheFrameComponent } from './the-frame.component';

describe('TheFrameComponent', () => {
  let component: TheFrameComponent;
  let fixture: ComponentFixture<TheFrameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TheFrameComponent],
      imports: [RouterTestingModule, HttpClientTestingModule],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();

    fixture = TestBed.createComponent(TheFrameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps repeated pointer movement outside Angular', () => {
    const ngZone = TestBed.inject(NgZone);
    const outerFrame = fixture.nativeElement.querySelector('.the-frame__outer') as HTMLElement;
    let zoneEntries = 0;
    const subscription = ngZone.onUnstable.subscribe(() => { zoneEntries += 1; });

    outerFrame.dispatchEvent(new PointerEvent('pointermove'));
    expect(component.showCog).toBeTrue();

    zoneEntries = 0;
    for (let index = 0; index < 20; index++) {
      outerFrame.dispatchEvent(new PointerEvent('pointermove'));
    }

    expect(zoneEntries).toBe(0);
    subscription.unsubscribe();
  });

  it('reloads after a successful automatic server probe', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const reloadSpy = spyOn<any>(component, 'reloadPage');

    (component as any).probeServerAndReload();
    httpMock.expectOne('/api/clock').flush({ time: '2026-09-24 20:00:00' });

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('retries automatic reload after twenty minutes for HTTP and network failures', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const scheduleSpy = spyOn<any>(component, 'scheduleAutoReload');

    (component as any).probeServerAndReload();
    httpMock.expectOne('/api/clock').flush('offline', { status: 404, statusText: 'Not Found' });

    expect(scheduleSpy).toHaveBeenCalledWith(20 * 60 * 1000);

    scheduleSpy.calls.reset();
    (component as any).probeServerAndReload();
    httpMock.expectOne('/api/clock').error(new ErrorEvent('network'));

    expect(scheduleSpy).toHaveBeenCalledWith(20 * 60 * 1000);
  });
});
