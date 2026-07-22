import { TestBed } from '@angular/core/testing';

import { TextSegmentationService } from './text-segmentation';


describe('TextSegmentationService', () => {
  let service: TextSegmentationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TextSegmentationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
