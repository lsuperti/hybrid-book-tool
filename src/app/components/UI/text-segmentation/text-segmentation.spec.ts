import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextSegmentation } from './text-segmentation';

describe('TextSegmentation', () => {
  let component: TextSegmentation;
  let fixture: ComponentFixture<TextSegmentation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextSegmentation],
    }).compileComponents();

    fixture = TestBed.createComponent(TextSegmentation);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
