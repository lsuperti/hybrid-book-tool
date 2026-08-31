import { TestBed } from '@angular/core/testing';

import { VideoSegmentationService } from './video-segmentation';

describe('VideoSegmentationService', () => {
  let service: VideoSegmentationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoSegmentationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
