import { TestBed } from '@angular/core/testing';
import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from '@angular/core';
import { firstValueFrom, toArray } from 'rxjs';
import { vi } from 'vitest';
import * as mediabunny from 'mediabunny';

import {
  Thumbnail,
  type FileThumbnailGenerationRequest,
  type FileThumbnailGenerationSuccess,
  type FileThumbnailGenerationFailure,
  type FilmstripThumbnailsRequest,
  type FilmstripThumbnailSuccess,
  type FilmstripThumbnailFailure,
  type FilmstripThumbnailResult,
} from './thumbnail';

describe('Thumbnail', () => {
  let service: Thumbnail;
  let mockTrack: mediabunny.InputVideoTrack;
  let mockWrappedCanvas: mediabunny.WrappedCanvas;
  let mockCanvasElement: HTMLCanvasElement;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let inputDisposeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let urlCounter = 0;
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      urlCounter++;
      return `blob:http://localhost/thumbnail-${urlCounter}`;
    });
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    mockCanvasElement = {
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
        callback(new Blob(['fake-png-data'], { type: 'image/png' }));
      }),
    } as unknown as HTMLCanvasElement;

    mockWrappedCanvas = {
      canvas: mockCanvasElement,
      timestamp: 5,
      duration: 1 / 30,
    };

    mockTrack = Object.assign(Object.create(mediabunny.InputVideoTrack.prototype), {
      getCodec: vi.fn().mockResolvedValue('avc1'),
      canDecode: vi.fn().mockResolvedValue(true),
      getDisplayWidth: vi.fn().mockResolvedValue(1920),
      getDisplayHeight: vi.fn().mockResolvedValue(1080),
      getFirstTimestamp: vi.fn().mockResolvedValue(0),
      computeDuration: vi.fn().mockResolvedValue(60),
    });

    vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack')
      .mockResolvedValue(mockTrack as unknown as mediabunny.InputVideoTrack);
    inputDisposeSpy = vi.spyOn(mediabunny.Input.prototype, 'dispose').mockImplementation(() => undefined);

    vi.spyOn(mediabunny.CanvasSink.prototype, 'getCanvas')
      .mockResolvedValue(mockWrappedCanvas as unknown as mediabunny.WrappedCanvas);

    vi.spyOn(mediabunny.CanvasSink.prototype, 'canvasesAtTimestamps')
      .mockImplementation(async function* (
        timestamps: Parameters<mediabunny.CanvasSink['canvasesAtTimestamps']>[0],
      ) {
        for await (const t of timestamps) {
          yield {
            canvas: mockCanvasElement,
            timestamp: t,
            duration: 1 / 30,
          } as mediabunny.WrappedCanvas;
        }
      });

    TestBed.configureTestingModule({});
    service = TestBed.inject(Thumbnail);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('generateFileThumbnailUrls', () => {
    it('should complete with an empty result list when given empty requests', async () => {
      const results = await firstValueFrom(service.generateFileThumbnailUrls([]).pipe(toArray()));
      expect(results).toEqual([]);
    });

    it('should successfully generate thumbnail URLs for video files', async () => {
      const fakeFile1 = new File(['data1'], 'video1.mp4', { type: 'video/mp4' });
      const fakeFile2 = new File(['data2'], 'video2.mp4', { type: 'video/mp4' });

      const requests: FileThumbnailGenerationRequest[] = [
        { mediaFileId: 'mf-1', file: fakeFile1 },
        { mediaFileId: 'mf-2', file: fakeFile2 },
      ];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(2);

      const res1 = results[0] as FileThumbnailGenerationSuccess;
      const res2 = results[1] as FileThumbnailGenerationSuccess;

      expect(res1.mediaFileId).toBe('mf-1');
      expect(res1.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');

      expect(res2.mediaFileId).toBe('mf-2');
      expect(res2.thumbnailUrl).toBe('blob:http://localhost/thumbnail-2');

      expect(inputDisposeSpy).toHaveBeenCalledTimes(2);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should respect custom thumbnailSize and targetTimestamp in requests', async () => {
      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });

      const requests: FileThumbnailGenerationRequest[] = [
        {
          mediaFileId: 'mf-custom',
          file: fakeFile,
          thumbnailSize: 256,
          targetTimestamp: 15,
        },
      ];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-custom');
      expect(res.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');
    });

    it('should handle portrait videos where displayHeight > displayWidth', async () => {
      vi.mocked(mockTrack.getDisplayWidth).mockResolvedValue(720);
      vi.mocked(mockTrack.getDisplayHeight).mockResolvedValue(1280);

      const fakeFile = new File(['data'], 'portrait.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-portrait', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-portrait');
    });

    it('should clamp target timestamp when video is shorter than requested timestamp', async () => {
      vi.mocked(mockTrack.getFirstTimestamp).mockResolvedValue(0);
      vi.mocked(mockTrack.computeDuration).mockResolvedValue(2);

      const fakeFile = new File(['data'], 'short.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [
        { mediaFileId: 'mf-short', file: fakeFile, targetTimestamp: 10 },
      ];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-short');
    });

    it('should handle OffscreenCanvas when convertToBlob is available', async () => {
      const offscreenCanvasMock = {
        convertToBlob: vi.fn().mockResolvedValue(new Blob(['offscreen-blob'], { type: 'image/png' })),
      };

      vi.spyOn(mediabunny.CanvasSink.prototype, 'getCanvas').mockResolvedValue({
        canvas: offscreenCanvasMock as unknown as OffscreenCanvas,
        timestamp: 5,
        duration: 1 / 30,
      });

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-offscreen', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));
      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-offscreen');
      expect(res.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');
    });

    it('should emit failure when file has no video track', async () => {
      vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack').mockResolvedValue(null);

      const fakeFile = new File(['data'], 'audio.mp3', { type: 'audio/mp3' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-audio', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-audio');
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error.message).toBe('File has no video track.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when video track has unsupported codec', async () => {
      vi.mocked(mockTrack.getCodec).mockResolvedValue(null);

      const fakeFile = new File(['data'], 'video.unknown', { type: 'video/unknown' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-codec', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-codec');
      expect(res.error.message).toBe('Unsupported video codec.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when video track cannot be decoded', async () => {
      vi.mocked(mockTrack.canDecode).mockResolvedValue(false);

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-decode', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-decode');
      expect(res.error.message).toBe('Unable to decode the video track.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when getCanvas returns null', async () => {
      vi.spyOn(mediabunny.CanvasSink.prototype, 'getCanvas').mockResolvedValue(null);

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-no-canvas', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-no-canvas');
      expect(res.error.message).toBe('Failed to extract thumbnail from video.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when canvas fails to convert to blob', async () => {
      mockCanvasElement = {
        toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
          callback(null);
        }),
      } as unknown as HTMLCanvasElement;

      vi.spyOn(mediabunny.CanvasSink.prototype, 'getCanvas').mockResolvedValue({
        canvas: mockCanvasElement,
        timestamp: 5,
        duration: 1 / 30,
      });

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-blob-fail', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-blob-fail');
      expect(res.error.message).toBe('Failed to convert thumbnail canvas to blob.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should normalize non-Error thrown objects', async () => {
      vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack').mockRejectedValue('String error message');

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-string-err', file: fakeFile }];

      const results = await firstValueFrom(service.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-string-err');
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error.message).toBe('String error message');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should fallback to default thumbnail size when platform is server', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
      });
      const serverService = TestBed.inject(Thumbnail);

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: FileThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-server', file: fakeFile }];

      const results = await firstValueFrom(serverService.generateFileThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as FileThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-server');
    });
  });

  describe('generateFilmstripThumbnails', () => {
    it('should generate and stream filmstrip thumbnails for a single file section', async () => {
      const fakeFile = new File(['video-data'], 'filmstrip.mp4', { type: 'video/mp4' });
      const request: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [
          {
            mediaFileId: 'file-1',
            file: fakeFile,
            startTime: 0,
            endTime: 4,
          },
        ],
      };

      const emitted: FilmstripThumbnailResult[] = [];
      await new Promise<void>((resolve, reject) => {
        service.generateFilmstripThumbnails(request).subscribe({
          next: (res) => emitted.push(res),
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      // Timestamps 0, 2, 4
      expect(emitted.length).toBe(3);
      expect(emitted[0]).toEqual({
        mediaFileId: 'file-1',
        timestamp: 0,
        thumbnailUrl: 'blob:http://localhost/thumbnail-1',
      });
      expect(emitted[1]).toEqual({
        mediaFileId: 'file-1',
        timestamp: 2,
        thumbnailUrl: 'blob:http://localhost/thumbnail-2',
      });
      expect(emitted[2]).toEqual({
        mediaFileId: 'file-1',
        timestamp: 4,
        thumbnailUrl: 'blob:http://localhost/thumbnail-3',
      });
    });

    it('should generate thumbnails for multiple files in a single request', async () => {
      const fakeFile1 = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });
      const fakeFile2 = new File(['v2'], 'v2.mp4', { type: 'video/mp4' });

      const request: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [
          {
            mediaFileId: 'f1',
            file: fakeFile1,
            startTime: 0,
            endTime: 1,
          },
          {
            mediaFileId: 'f2',
            file: fakeFile2,
            startTime: 5,
            endTime: 6,
          },
        ],
      };

      const results = await firstValueFrom(service.generateFilmstripThumbnails(request).pipe(toArray()));

      expect(results.length).toBe(4);
      expect(results.map((r) => ('thumbnailUrl' in r ? r.mediaFileId : null))).toEqual(['f1', 'f1', 'f2', 'f2']);
      expect(results.map((r) => ('thumbnailUrl' in r ? r.timestamp : null))).toEqual([0, 1, 5, 6]);
    });

    it('should reuse cached thumbnails and not regenerate when interval is very close', async () => {
      const fakeFile = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });

      // First request: timestamps 0, 2, 4
      const req1: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'file-cache', file: fakeFile, startTime: 0, endTime: 4 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req1).pipe(toArray()));
      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);

      createObjectURLSpy.mockClear();

      // Second request (scrolling along timeline): interval 2, timestamps 2, 4, 6
      const req2: FilmstripThumbnailsRequest = {
        // Within INTERVAL_TOLERANCE (0.001)
        timeBetweenThumbnails: 2.0005,
        files: [{ mediaFileId: 'file-cache', file: fakeFile, startTime: 2, endTime: 6 }],
      };
      const results2 = await firstValueFrom(service.generateFilmstripThumbnails(req2).pipe(toArray()));

      expect(results2.length).toBe(3);

      // Timestamps 2 and 4 should be reused; only timestamp 6 is newly generated
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect((results2[0] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-2');
      expect((results2[1] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-3');
      expect((results2[2] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-4');

      // Verify old thumbnail 0 was NOT revoked or discarded
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });

    it('should retain cached thumbnails for files not included in requests at the same zoom level', async () => {
      const fakeFileA = new File(['vA'], 'vA.mp4', { type: 'video/mp4' });
      const fakeFileB = new File(['vB'], 'vB.mp4', { type: 'video/mp4' });

      // Request 1: generate thumbnails for fileA (timestamps 0, 2, 4)
      const req1: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'fileA', file: fakeFileA, startTime: 0, endTime: 4 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req1).pipe(toArray()));
      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);

      createObjectURLSpy.mockClear();
      revokeObjectURLSpy.mockClear();

      // Request 2: generate thumbnails for fileB (timestamps 0, 2) at the SAME zoom level (fileA is omitted)
      const req2: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'fileB', file: fakeFileB, startTime: 0, endTime: 2 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req2).pipe(toArray()));

      // fileB's thumbnails generated, fileA's thumbnails NOT revoked
      expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      createObjectURLSpy.mockClear();

      // Request 3: request fileA again (timestamps 2, 4) at the SAME zoom level (fileB is omitted)
      const req3: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'fileA', file: fakeFileA, startTime: 2, endTime: 4 }],
      };
      const results3 = await firstValueFrom(service.generateFilmstripThumbnails(req3).pipe(toArray()));

      // Both timestamps for fileA are served from cache; 0 new thumbnails generated, fileB NOT revoked
      expect(results3.length).toBe(2);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(0);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      expect((results3[0] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-2');
      expect((results3[1] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-3');
    });

    it('should salvage matching thumbnails and free unsalvageable ones when zoom level changes', async () => {
      const fakeFile = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });

      // Request 1 (zoom 1s): timestamps 0, 1, 2, 3, 4
      const req1: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [{ mediaFileId: 'file-zoom', file: fakeFile, startTime: 0, endTime: 4 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req1).pipe(toArray()));
      expect(createObjectURLSpy).toHaveBeenCalledTimes(5);

      // Thumbnails 1-5 correspond to timestamps 0, 1, 2, 3, 4
      createObjectURLSpy.mockClear();
      revokeObjectURLSpy.mockClear();

      // Request 2 (zoom out to 2s): timestamps 0, 2, 4
      // Timestamps 0, 2, 4 can be salvaged from old cache!
      // Timestamps 1, 3 cannot be salvaged and MUST be freed!
      const req2: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'file-zoom', file: fakeFile, startTime: 0, endTime: 4 }],
      };
      const results2 = await firstValueFrom(service.generateFilmstripThumbnails(req2).pipe(toArray()));

      // All requested timestamps (0, 2, 4) were salvaged, so 0 new thumbnails created
      expect(createObjectURLSpy).toHaveBeenCalledTimes(0);
      expect(results2.length).toBe(3);

      // Timestamps 1 and 3 should have been revoked
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumbnail-2');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumbnail-4');
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);

      // Verify emitted URLs match the salvaged URLs
      expect((results2[0] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');
      expect((results2[1] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-3');
      expect((results2[2] as FilmstripThumbnailSuccess).thumbnailUrl).toBe('blob:http://localhost/thumbnail-5');
    });

    it('should free cached thumbnails of files not included in request when zoom changes', async () => {
      const fakeFile1 = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });
      const fakeFile2 = new File(['v2'], 'v2.mp4', { type: 'video/mp4' });

      // First request: file1 and file2 at zoom 1s
      const req1: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [
          { mediaFileId: 'fileA', file: fakeFile1, startTime: 0, endTime: 1 },
          { mediaFileId: 'fileB', file: fakeFile2, startTime: 0, endTime: 1 },
        ],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req1).pipe(toArray()));

      revokeObjectURLSpy.mockClear();

      // Second request: zoom changes to 2s, but fileB is not in the request
      const req2: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'fileA', file: fakeFile1, startTime: 0, endTime: 2 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req2).pipe(toArray()));

      // All thumbnails for fileB (which cannot be salvaged) and fileA's timestamp 1 should be revoked
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumbnail-3');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/thumbnail-4');
    });

    it('should free everything and error on invalid or non-positive timeBetweenThumbnails', async () => {
      const fakeFile = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });

      // First generate some thumbnails
      const req1: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [{ mediaFileId: 'f-invalid', file: fakeFile, startTime: 0, endTime: 2 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req1).pipe(toArray()));

      revokeObjectURLSpy.mockClear();

      // Send invalid interval
      const reqInvalid: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: -1,
        files: [{ mediaFileId: 'f-invalid', file: fakeFile, startTime: 0, endTime: 2 }],
      };

      await expect(
        firstValueFrom(service.generateFilmstripThumbnails(reqInvalid)),
      ).rejects.toThrow('Invalid timeBetweenThumbnails: must be a positive number.');

      // Should have freed all cached thumbnails
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('should handle file decoding errors without failing other files in the request', async () => {
      const validFile = new File(['valid'], 'valid.mp4', { type: 'video/mp4' });
      const badFile = new File(['bad'], 'bad.mp4', { type: 'video/mp4' });

      let callCount = 0;
      vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Corrupt video track in bad file.');
          }
          return mockTrack as unknown as mediabunny.InputVideoTrack;
        });

      const request: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [
          { mediaFileId: 'good-file', file: validFile, startTime: 0, endTime: 1 },
          { mediaFileId: 'bad-file', file: badFile, startTime: 0, endTime: 1 },
        ],
      };

      const results = await firstValueFrom(service.generateFilmstripThumbnails(request).pipe(toArray()));

      const successes = results.filter((r): r is FilmstripThumbnailSuccess => 'thumbnailUrl' in r);
      const failures = results.filter((r): r is FilmstripThumbnailFailure => 'error' in r);

      expect(successes.length).toBe(2);
      expect(successes.every((s) => s.mediaFileId === 'good-file')).toBe(true);

      expect(failures.length).toBe(1);
      expect(failures[0].mediaFileId).toBe('bad-file');
      expect(failures[0].error.message).toContain('Corrupt video track');
    });

    it('should stop processing and abort when unsubscribed early', async () => {
      const fakeFile = new File(['video'], 'video.mp4', { type: 'video/mp4' });
      const request: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [{ mediaFileId: 'cancel-file', file: fakeFile, startTime: 0, endTime: 10 }],
      };

      const emitted: FilmstripThumbnailResult[] = [];
      const sub = service.generateFilmstripThumbnails(request).subscribe((res) => {
        emitted.push(res);
        if (emitted.length === 2) {
          sub.unsubscribe();
        }
      });

      // Allow microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(emitted.length).toBe(2);
    });

    it('should fallback to getCanvas when canvasesAtTimestamps is not defined', async () => {
      const original = mediabunny.CanvasSink.prototype.canvasesAtTimestamps;
      const sinkProto = mediabunny.CanvasSink.prototype as unknown as { canvasesAtTimestamps: unknown };
      sinkProto.canvasesAtTimestamps = undefined;

      const fakeFile = new File(['fallback'], 'fallback.mp4', { type: 'video/mp4' });
      const request: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 1,
        files: [{ mediaFileId: 'fb-file', file: fakeFile, startTime: 0, endTime: 1 }],
      };

      const results = await firstValueFrom(service.generateFilmstripThumbnails(request).pipe(toArray()));
      expect(results.length).toBe(2);

      // Restore
      sinkProto.canvasesAtTimestamps = original;
    });
  });

  describe('resource cleanup methods', () => {
    it('should free all filmstrip thumbnails with freeAllFilmstripThumbnails', async () => {
      const fakeFile = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });
      const req: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'clean-all', file: fakeFile, startTime: 0, endTime: 4 }],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req).pipe(toArray()));

      revokeObjectURLSpy.mockClear();
      service.freeAllFilmstripThumbnails();

      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(3);

      // Subsequent request at same interval cannot reuse freed thumbnails
      createObjectURLSpy.mockClear();
      await firstValueFrom(service.generateFilmstripThumbnails(req).pipe(toArray()));
      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it('should free only thumbnails of the specified file with freeFilmstripThumbnailsForFile', async () => {
      const fakeFile1 = new File(['v1'], 'v1.mp4', { type: 'video/mp4' });
      const fakeFile2 = new File(['v2'], 'v2.mp4', { type: 'video/mp4' });
      const req: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [
          { mediaFileId: 'file-keep', file: fakeFile1, startTime: 0, endTime: 2 },
          { mediaFileId: 'file-drop', file: fakeFile2, startTime: 0, endTime: 2 },
        ],
      };
      await firstValueFrom(service.generateFilmstripThumbnails(req).pipe(toArray()));

      revokeObjectURLSpy.mockClear();
      service.freeFilmstripThumbnailsForFile('file-drop');

      // file-drop had 2 thumbnails (0 and 2)
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);

      // file-keep thumbnails are still present in cache
      createObjectURLSpy.mockClear();
      const reqKeep: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'file-keep', file: fakeFile1, startTime: 0, endTime: 2 }],
      };
      const resultsKeep = await firstValueFrom(service.generateFilmstripThumbnails(reqKeep).pipe(toArray()));
      expect(createObjectURLSpy).toHaveBeenCalledTimes(0);
      expect(resultsKeep.length).toBe(2);
    });

    it('should free all thumbnails on injector destruction via DestroyRef', async () => {
      const parentInjector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([Thumbnail], parentInjector);
      const scopedService = childInjector.get(Thumbnail);

      const fakeFile = new File(['scoped'], 'scoped.mp4', { type: 'video/mp4' });
      const req: FilmstripThumbnailsRequest = {
        timeBetweenThumbnails: 2,
        files: [{ mediaFileId: 'scoped-file', file: fakeFile, startTime: 0, endTime: 2 }],
      };
      await firstValueFrom(scopedService.generateFilmstripThumbnails(req).pipe(toArray()));

      revokeObjectURLSpy.mockClear();
      childInjector.destroy();

      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    });
  });
});
