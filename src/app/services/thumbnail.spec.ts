import { TestBed } from '@angular/core/testing';

import { Thumbnail } from './thumbnail';

describe('Thumbnail', () => {
  let service: Thumbnail;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Thumbnail);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
