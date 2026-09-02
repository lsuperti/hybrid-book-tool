import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { firstValueFrom, toArray } from 'rxjs';
import { vi } from 'vitest';
import * as mediabunny from 'mediabunny';

import {
  Thumbnail,
  type ThumbnailGenerationRequest,
  type ThumbnailGenerationSuccess,
  type ThumbnailGenerationFailure,
} from './thumbnail';

describe('Thumbnail', () => {
  let service: Thumbnail;
  let mockTrack: mediabunny.InputVideoTrack;
  let mockWrappedCanvas: mediabunny.WrappedCanvas;
  let mockCanvasElement: HTMLCanvasElement;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let inputDisposeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let urlCounter = 0;
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      urlCounter++;
      return `blob:http://localhost/thumbnail-${urlCounter}`;
    });

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

    TestBed.configureTestingModule({});
    service = TestBed.inject(Thumbnail);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('generateThumbnailUrls', () => {
    it('should complete with an empty result list when given empty requests', async () => {
      const results = await firstValueFrom(service.generateThumbnailUrls([]).pipe(toArray()));
      expect(results).toEqual([]);
    });

    it('should successfully generate thumbnail URLs for video files', async () => {
      const fakeFile1 = new File(['data1'], 'video1.mp4', { type: 'video/mp4' });
      const fakeFile2 = new File(['data2'], 'video2.mp4', { type: 'video/mp4' });

      const requests: ThumbnailGenerationRequest[] = [
        { mediaFileId: 'mf-1', file: fakeFile1 },
        { mediaFileId: 'mf-2', file: fakeFile2 },
      ];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(2);

      const res1 = results[0] as ThumbnailGenerationSuccess;
      const res2 = results[1] as ThumbnailGenerationSuccess;

      expect(res1.mediaFileId).toBe('mf-1');
      expect(res1.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');

      expect(res2.mediaFileId).toBe('mf-2');
      expect(res2.thumbnailUrl).toBe('blob:http://localhost/thumbnail-2');

      expect(inputDisposeSpy).toHaveBeenCalledTimes(2);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should respect custom thumbnailSize and targetTimestamp in requests', async () => {
      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });

      const requests: ThumbnailGenerationRequest[] = [
        {
          mediaFileId: 'mf-custom',
          file: fakeFile,
          thumbnailSize: 256,
          targetTimestamp: 15,
        },
      ];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-custom');
      expect(res.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');
    });

    it('should handle portrait videos where displayHeight > displayWidth', async () => {
      vi.mocked(mockTrack.getDisplayWidth).mockResolvedValue(720);
      vi.mocked(mockTrack.getDisplayHeight).mockResolvedValue(1280);

      const fakeFile = new File(['data'], 'portrait.mp4', { type: 'video/mp4' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-portrait', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-portrait');
    });

    it('should clamp target timestamp when video is shorter than requested timestamp', async () => {
      vi.mocked(mockTrack.getFirstTimestamp).mockResolvedValue(0);
      vi.mocked(mockTrack.computeDuration).mockResolvedValue(2);

      const fakeFile = new File(['data'], 'short.mp4', { type: 'video/mp4' });
      const requests: ThumbnailGenerationRequest[] = [
        { mediaFileId: 'mf-short', file: fakeFile, targetTimestamp: 10 },
      ];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationSuccess;
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
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-offscreen', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));
      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-offscreen');
      expect(res.thumbnailUrl).toBe('blob:http://localhost/thumbnail-1');
    });

    it('should emit failure when file has no video track', async () => {
      vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack').mockResolvedValue(null);

      const fakeFile = new File(['data'], 'audio.mp3', { type: 'audio/mp3' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-audio', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-audio');
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error.message).toBe('File has no video track.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when video track has unsupported codec', async () => {
      vi.mocked(mockTrack.getCodec).mockResolvedValue(null);

      const fakeFile = new File(['data'], 'video.unknown', { type: 'video/unknown' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-codec', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-codec');
      expect(res.error.message).toBe('Unsupported video codec.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when video track cannot be decoded', async () => {
      vi.mocked(mockTrack.canDecode).mockResolvedValue(false);

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-decode', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-decode');
      expect(res.error.message).toBe('Unable to decode the video track.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should emit failure when getCanvas returns null', async () => {
      vi.spyOn(mediabunny.CanvasSink.prototype, 'getCanvas').mockResolvedValue(null);

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-no-canvas', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
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
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-blob-fail', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
      expect(res.mediaFileId).toBe('mf-blob-fail');
      expect(res.error.message).toBe('Failed to convert thumbnail canvas to blob.');
      expect(inputDisposeSpy).toHaveBeenCalled();
    });

    it('should normalize non-Error thrown objects', async () => {
      vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack').mockRejectedValue('String error message');

      const fakeFile = new File(['data'], 'video.mp4', { type: 'video/mp4' });
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-string-err', file: fakeFile }];

      const results = await firstValueFrom(service.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationFailure;
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
      const requests: ThumbnailGenerationRequest[] = [{ mediaFileId: 'mf-server', file: fakeFile }];

      const results = await firstValueFrom(serverService.generateThumbnailUrls(requests).pipe(toArray()));

      expect(results.length).toBe(1);
      const res = results[0] as ThumbnailGenerationSuccess;
      expect(res.mediaFileId).toBe('mf-server');
    });
  });
});
