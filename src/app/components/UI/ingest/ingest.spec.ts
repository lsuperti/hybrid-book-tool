import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';

import { Ingest } from './ingest';
import {
  Thumbnail,
  type ThumbnailGenerationRequest,
  type ThumbnailGenerationResult
} from '../../../services/thumbnail/thumbnail';

describe('Ingest', () => {
  let component: Ingest;
  let fixture: ComponentFixture<Ingest>;
  let thumbnailStub: ThumbnailStub;

  beforeEach(async () => {
    thumbnailStub = new ThumbnailStub();

    await TestBed.configureTestingModule({
      imports: [Ingest],
      providers: [
        {
          provide: Thumbnail,
          useValue: thumbnailStub
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Ingest);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should add media files with null thumbnail and update when thumbnail generation resolves', () => {
    const selectedFile = new File(['video-bytes'], 'video.mp4', { type: 'video/mp4' });
    const inputElement = document.createElement('input');
    inputElement.value = '';
    Object.defineProperty(inputElement, 'files', {
      value: [selectedFile],
      configurable: true
    });

    component['onMediaFileSelected']({ target: inputElement } as unknown as Event);

    const mediaFilesAfterSelection = component['mediaFiles']();
    expect(mediaFilesAfterSelection).toHaveLength(1);
    expect(mediaFilesAfterSelection[0].name).toBe('video.mp4');
    expect(mediaFilesAfterSelection[0].thumbnail).toBeNull();

    expect(thumbnailStub.requests).toHaveLength(1);
    expect(thumbnailStub.requests[0]).toHaveLength(1);
    expect(thumbnailStub.requests[0][0].file).toBe(selectedFile);

    thumbnailStub.results$.next({
      mediaFileId: mediaFilesAfterSelection[0].id,
      thumbnailUrl: 'blob:test-thumbnail-url'
    });

    const mediaFilesAfterThumbnail = component['mediaFiles']();
    expect(mediaFilesAfterThumbnail[0].thumbnail).toBe('blob:test-thumbnail-url');
  });
});

class ThumbnailStub {
  public readonly requests: ThumbnailGenerationRequest[][] = [];
  public readonly results$ = new Subject<ThumbnailGenerationResult>();

  public generateThumbnailUrls(requests: readonly ThumbnailGenerationRequest[]): Observable<ThumbnailGenerationResult> {
    this.requests.push([...requests]);
    return this.results$.asObservable();
  }
}
