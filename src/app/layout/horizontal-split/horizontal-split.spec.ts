import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HorizontalSplit } from './horizontal-split';

describe('HorizontalSplit', () => {
  let component: HorizontalSplit;
  let fixture: ComponentFixture<HorizontalSplit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HorizontalSplit],
    }).compileComponents();

    fixture = TestBed.createComponent(HorizontalSplit);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
