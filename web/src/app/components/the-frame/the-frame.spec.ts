import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { TheFrameComponent } from './the-frame.component';

describe('TheFrameComponent', () => {
  let component: TheFrameComponent;
  let fixture: ComponentFixture<TheFrameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TheFrameComponent],
      imports: [RouterTestingModule, HttpClientTestingModule],
    })
    .compileComponents();

    fixture = TestBed.createComponent(TheFrameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
