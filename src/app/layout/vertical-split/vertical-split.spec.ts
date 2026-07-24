import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerticalSplit } from './vertical-split';

describe('VerticalSplit', () => {
  let component: VerticalSplit;
  let fixture: ComponentFixture<VerticalSplit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerticalSplit],
    }).compileComponents();

    fixture = TestBed.createComponent(VerticalSplit);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resizeBarAriaLabel', 'Resize bar');

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
