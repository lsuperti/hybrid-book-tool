import { TestBed } from '@angular/core/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { vi } from 'vitest';
import { MediaFiles, type MediaFileId } from './media-files';
import { Thumbnail, type ThumbnailGenerationRequest, type ThumbnailGenerationResult } from '../thumbnail/thumbnail';

describe('MediaFiles', () => {
  let service: MediaFiles;
  let thumbnailStub: ThumbnailStub;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    thumbnailStub = new ThumbnailStub();

    let objectUrlCounter = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      objectUrlCounter++;
      return `blob:http://localhost/test-blob-${objectUrlCounter}`;
    });
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Thumbnail,
          useValue: thumbnailStub,
        },
      ],
    });

    service = TestBed.inject(MediaFiles);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created with initial empty state', () => {
    expect(service).toBeTruthy();
    expect(service.mediaFiles()).toEqual([]);
    expect(service.textRecord()).toEqual({
      file: null,
      type: null,
      url: null,
    });
  });

  describe('addMediaFiles', () => {
    it('should add media files with unique IDs, object URLs, and request thumbnails', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      const file2 = new File(['video-2'], 'video2.mp4', { type: 'video/mp4' });

      service.addMediaFiles([file1, file2]);

      const files = service.mediaFiles();
      expect(files.length).toBe(2);

      expect(files[0].name).toBe('video1.mp4');
      expect(files[0].file).toBe(file1);
      expect(files[0].thumbnail).toBeNull();
      expect(files[0].url).toContain('blob:');
      expect(files[0].id).toMatch(/^media-\d+-[a-z0-9]+$/);

      expect(files[1].name).toBe('video2.mp4');
      expect(files[1].file).toBe(file2);
      expect(files[1].thumbnail).toBeNull();
      expect(files[1].url).toContain('blob:');
      expect(files[1].id).toMatch(/^media-\d+-[a-z0-9]+$/);

      expect(files[0].id).not.toBe(files[1].id);

      expect(thumbnailStub.requests.length).toBe(1);
      expect(thumbnailStub.requests[0]).toEqual([
        { mediaFileId: files[0].id, file: file1 },
        { mediaFileId: files[1].id, file: file2 },
      ]);
    });

    it('should append new media files when called multiple times', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      const file2 = new File(['video-2'], 'video2.mp4', { type: 'video/mp4' });

      service.addMediaFiles([file1]);
      service.addMediaFiles([file2]);

      const files = service.mediaFiles();
      expect(files.length).toBe(2);
      expect(files[0].file).toBe(file1);
      expect(files[1].file).toBe(file2);
    });
  });

  describe('handleThumbnailGenerationResult', () => {
    it('should update media file thumbnail on successful generation', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);
      const fileId = service.mediaFiles()[0].id;

      thumbnailStub.results$.next({
        mediaFileId: fileId,
        thumbnailUrl: 'blob:http://localhost/thumb-1',
      });

      expect(service.mediaFiles()[0].thumbnail).toBe('blob:http://localhost/thumb-1');
    });

    it('should revoke previous thumbnail when a replacement thumbnail is received', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);
      const fileId = service.mediaFiles()[0].id;

      thumbnailStub.results$.next({
        mediaFileId: fileId,
        thumbnailUrl: 'blob:http://localhost/thumb-1',
      });

      thumbnailStub.results$.next({
        mediaFileId: fileId,
        thumbnailUrl: 'blob:http://localhost/thumb-2',
      });

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumb-1');
      expect(service.mediaFiles()[0].thumbnail).toBe('blob:http://localhost/thumb-2');
    });

    it('should revoke generated thumbnail URL if media file was removed before completion', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);
      const fileId = service.mediaFiles()[0].id;

      service.removeMediaFile(fileId);

      thumbnailStub.results$.next({
        mediaFileId: fileId,
        thumbnailUrl: 'blob:http://localhost/orphan-thumb',
      });

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/orphan-thumb');
    });

    it('should throw an error when thumbnail generation returns an error', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);
      const fileId = service.mediaFiles()[0].id;

      const generationError = new Error('Failed to decode track');

      expect(() => {
        service['handleThumbnailGenerationResult']({
          mediaFileId: fileId,
          error: generationError,
        });
      }).toThrow(`Failed to generate thumbnail for media file "${fileId}".`);
    });
  });

  describe('removeMediaFile', () => {
    it('should remove media file and revoke its object URL and thumbnail URL', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);
      const file = service.mediaFiles()[0];

      thumbnailStub.results$.next({
        mediaFileId: file.id,
        thumbnailUrl: 'blob:http://localhost/thumb-1',
      });

      service.removeMediaFile(file.id);

      expect(service.mediaFiles()).toEqual([]);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(file.url);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumb-1');
    });

    it('should do nothing if media file ID is not found', () => {
      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      service.addMediaFiles([file1]);

      service.removeMediaFile('non-existent-id' as MediaFileId);

      expect(service.mediaFiles().length).toBe(1);
    });
  });

  describe('setTextRecord', () => {
    it('should set text record with valid PDF file and create object URL', () => {
      const pdfFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });

      service.setTextRecord(pdfFile);

      const record = service.textRecord();
      expect(record.file).toBe(pdfFile);
      expect(record.type).toBe('application/pdf');
      expect(record.url).toContain('blob:');
    });

    it('should revoke previous text record URL when setting another valid PDF', () => {
      const pdfFile1 = new File(['%PDF-1'], 'doc1.pdf', { type: 'application/pdf' });
      const pdfFile2 = new File(['%PDF-2'], 'doc2.pdf', { type: 'application/pdf' });

      service.setTextRecord(pdfFile1);
      const initialUrl = service.textRecord().url;

      service.setTextRecord(pdfFile2);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(initialUrl);
      expect(service.textRecord().file).toBe(pdfFile2);
      expect(service.textRecord().type).toBe('application/pdf');
    });

    it('should revoke previous URL and set type to invalid when non-PDF is provided', () => {
      const pdfFile = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });
      const txtFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

      service.setTextRecord(pdfFile);
      const initialUrl = service.textRecord().url;

      service.setTextRecord(txtFile);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(initialUrl);
      expect(service.textRecord()).toEqual({
        file: txtFile,
        type: 'invalid',
        url: null,
      });
    });

    it('should revoke previous URL and reset state when null is passed', () => {
      const pdfFile = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });

      service.setTextRecord(pdfFile);
      const initialUrl = service.textRecord().url;

      service.setTextRecord(null);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(initialUrl);
      expect(service.textRecord()).toEqual({
        file: null,
        type: null,
        url: null,
      });
    });
  });

  describe('onDestroy cleanup', () => {
    it('should revoke all media file URLs, generated thumbnail URLs, and text record URL on destroy', () => {
      const parentInjector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([
        MediaFiles,
        {
          provide: Thumbnail,
          useValue: thumbnailStub,
        },
      ], parentInjector);

      const scopedService = childInjector.get(MediaFiles);

      const file1 = new File(['video-1'], 'video1.mp4', { type: 'video/mp4' });
      scopedService.addMediaFiles([file1]);
      const mediaFile = scopedService.mediaFiles()[0];

      thumbnailStub.results$.next({
        mediaFileId: mediaFile.id,
        thumbnailUrl: 'blob:http://localhost/scoped-thumb-1',
      });

      const pdfFile = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });
      scopedService.setTextRecord(pdfFile);
      const textRecordUrl = scopedService.textRecord().url;

      revokeObjectURLSpy.mockClear();

      childInjector.destroy();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/scoped-thumb-1');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(mediaFile.url);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(textRecordUrl);
    });
  });
});

/**
 * Stub service for thumbnail generation in tests.
 */
class ThumbnailStub {
  public readonly requests: ThumbnailGenerationRequest[][] = [];
  public readonly results$ = new Subject<ThumbnailGenerationResult>();

  /**
   * Generates thumbnail URLs for incoming requests.
   *
   * @param requests List of requests.
   * @returns Observable stream of thumbnail generation results.
   */
  public generateThumbnailUrls(
    requests: readonly ThumbnailGenerationRequest[]
  ): Observable<ThumbnailGenerationResult> {
    this.requests.push([...requests]);
    return this.results$.asObservable();
  }
}
