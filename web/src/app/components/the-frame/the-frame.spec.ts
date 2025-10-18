import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TheFrame } from './the-frame.component';

describe('TheFrame', () => {
  let component: TheFrame;
  let fixture: ComponentFixture<TheFrame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TheFrame]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TheFrame);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
