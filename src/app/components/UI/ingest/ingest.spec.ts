import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { signal } from '@angular/core';
import { PDFNotificationService, type IPDFViewerApplication, type TextContent } from 'ngx-extended-pdf-viewer';

import { Ingest } from './ingest';
import {
  Thumbnail,
  type FileThumbnailGenerationRequest,
  type FileThumbnailGenerationResult
} from '../../../services/thumbnail/thumbnail';
import { TextSegmentationService } from '../../../services/text-segmentation/text-segmentation';
import { MediaFiles } from '../../../services/media-files/media-files';

describe('Ingest', () => {
  let component: Ingest;
  let fixture: ComponentFixture<Ingest>;
  let thumbnailStub: ThumbnailStub;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;
  let pdfNotificationServiceStub: PdfNotificationServiceStub;

  beforeEach(async () => {
    thumbnailStub = new ThumbnailStub();
    pdfNotificationServiceStub = new PdfNotificationServiceStub();

    await TestBed.configureTestingModule({
      imports: [Ingest],
      providers: [
        {
          provide: Thumbnail,
          useValue: thumbnailStub
        },
        {
          provide: PDFNotificationService,
          useValue: pdfNotificationServiceStub
        }
      ]
    }).compileComponents();

    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);

    fixture = TestBed.createComponent(Ingest);
    fixture.componentRef.setInput('visible', true);
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

  it('should handle media files drag and drop events', () => {
    const dragEventMock = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [new File(['bytes'], 'dropped-video.mp4', { type: 'video/mp4' })]
      }
    } as unknown as DragEvent;

    component['onMediaFilesDragEnter'](dragEventMock);
    expect(component['draggingOverMediaFilesUploadArea']()).toBe(true);

    component['onMediaFilesDragLeave'](dragEventMock);
    expect(component['draggingOverMediaFilesUploadArea']()).toBe(false);

    component['onMediaFilesDragOver'](dragEventMock);
    expect(component['draggingOverMediaFilesUploadArea']()).toBe(true);

    component['onMediaFilesDrop'](dragEventMock);
    expect(component['draggingOverMediaFilesUploadArea']()).toBe(false);
    expect(mediaFilesService.mediaFiles()).toHaveLength(1);
    expect(mediaFilesService.mediaFiles()[0].name).toBe('dropped-video.mp4');
  });

  it('should remove media files and manage refocus logic', () => {
    const file1 = new File(['1'], 'video1.mp4', { type: 'video/mp4' });
    const file2 = new File(['2'], 'video2.mp4', { type: 'video/mp4' });
    const file3 = new File(['3'], 'video3.mp4', { type: 'video/mp4' });

    mediaFilesService.addMediaFiles([file1, file2, file3]);
    const files = mediaFilesService.mediaFiles();
    expect(files).toHaveLength(3);

    // Remove middle file
    component['removeMediaFile'](files[1].id);
    expect(mediaFilesService.mediaFiles()).toHaveLength(2);
    expect(mediaFilesService.mediaFiles().map((f) => f.name)).toEqual(['video1.mp4', 'video3.mp4']);

    // Remove last file
    const remainingFiles = mediaFilesService.mediaFiles();
    component['removeMediaFile'](remainingFiles[1].id);
    expect(mediaFilesService.mediaFiles()).toHaveLength(1);
    expect(mediaFilesService.mediaFiles()[0].name).toBe('video1.mp4');
  });

  it('should handle text record file selection and drag/drop for PDF and non-PDF files', () => {
    const workUpcomingSpy = vi.spyOn(textSegmentationService, 'workUpcoming');

    const pdfFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });
    const inputElement = document.createElement('input');
    Object.defineProperty(inputElement, 'files', {
      value: [pdfFile],
      configurable: true
    });

    component['onTextRecordFileSelected']({ target: inputElement } as unknown as Event);
    expect(mediaFilesService.textRecord().file).toBe(pdfFile);
    expect(mediaFilesService.textRecord().type).toBe('application/pdf');
    expect(workUpcomingSpy).toHaveBeenCalledTimes(1);

    // Test drag and drop with non-PDF file
    const txtFile = new File(['text content'], 'notes.txt', { type: 'text/plain' });
    const dragEventMock = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [txtFile]
      }
    } as unknown as DragEvent;

    component['onTextRecordDragEnter'](dragEventMock);
    expect(component['draggingOverTextRecordUploadArea']()).toBe(true);

    component['onTextRecordDragLeave'](dragEventMock);
    expect(component['draggingOverTextRecordUploadArea']()).toBe(false);

    component['onTextRecordDragOver'](dragEventMock);
    expect(component['draggingOverTextRecordUploadArea']()).toBe(true);

    component['onTextRecordDrop'](dragEventMock);
    expect(component['draggingOverTextRecordUploadArea']()).toBe(false);
    expect(mediaFilesService.textRecord().type).toBe('invalid');
  });

  it('should extract text content and call segmentText on pagesLoaded', async () => {
    const segmentTextSpy = vi.spyOn(textSegmentationService, 'segmentText');

    const mockTextContent = {
      items: []
    } as unknown as TextContent;

    const mockPdfDoc = {
      numPages: 2,
      getPage: vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue(mockTextContent)
      })
    };

    component['PDFViewerApplication'] = {
      pdfDocument: mockPdfDoc
    } as unknown as IPDFViewerApplication;

    await component['onPagesLoaded']();

    expect(mockPdfDoc.getPage).toHaveBeenCalledWith(1);
    expect(mockPdfDoc.getPage).toHaveBeenCalledWith(2);
    expect(segmentTextSpy).toHaveBeenCalledWith([mockTextContent, mockTextContent]);
  });
});

/**
 * Stub service for thumbnail generation in tests.
 */
class ThumbnailStub {
  public readonly requests: FileThumbnailGenerationRequest[][] = [];
  public readonly results$ = new Subject<FileThumbnailGenerationResult>();

  /**
   * Generates thumbnail URLs for incoming requests.
   *
   * @param requests List of requests.
   * @returns Observable stream of thumbnail generation results.
   */
  public generateThumbnailUrls(
    requests: readonly FileThumbnailGenerationRequest[]
  ): Observable<FileThumbnailGenerationResult> {
    this.requests.push([...requests]);
    return this.results$.asObservable();
  }

  /**
   * Generates file thumbnail URLs for incoming requests.
   *
   * @param requests List of requests.
   * @returns Observable stream of thumbnail generation results.
   */
  public generateFileThumbnailUrls(
    requests: readonly FileThumbnailGenerationRequest[]
  ): Observable<FileThumbnailGenerationResult> {
    return this.generateThumbnailUrls(requests);
  }

  /**
   * Stub method for freeing filmstrip thumbnails of a file.
   *
   * @param _mediaFileId The media file ID.
   */
  public freeFilmstripThumbnailsForFile(_mediaFileId: string): void {
    // No-op for stub
  }

  /**
   * Stub method for freeing all segment thumbnails.
   */
  public freeAllSegmentThumbnails(): void {
    // No-op for stub
  }

  /**
   * Stub method for freeing a segment thumbnail.
   *
   * @param _segmentId The segment ID.
   */
  public freeSegmentThumbnail(_segmentId: string): void {
    // No-op for stub
  }

  /**
   * Stub method for freeing segment thumbnails for a file.
   *
   * @param _mediaFileId The media file ID.
   */
  public freeSegmentThumbnailsForFile(_mediaFileId: string): void {
    // No-op for stub
  }
}

/**
 * Stub service for PDFNotificationService in tests.
 */
class PdfNotificationServiceStub {
  public readonly onPDFJSInitSignal = signal<IPDFViewerApplication | undefined>(undefined);
}
