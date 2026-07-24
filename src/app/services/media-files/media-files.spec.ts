import { TestBed } from '@angular/core/testing';

import { MediaFiles } from './media-files';

describe('MediaFiles', () => {
  let service: MediaFiles;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MediaFiles);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
