import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoSegmentation } from './video-segmentation';

describe('VideoSegmentation', () => {
  let component: VideoSegmentation;
  let fixture: ComponentFixture<VideoSegmentation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoSegmentation],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoSegmentation);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
