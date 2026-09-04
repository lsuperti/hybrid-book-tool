import { Service, inject, PLATFORM_ID, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import { catchError, from, map, mergeMap, Observable, of, type Observer } from 'rxjs';

/**
 * Service for generating file thumbnails and filmstrip thumbnails from video files.
 */
@Service()
export class Thumbnail {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  public static readonly DEFAULT_FILE_THUMBNAIL_SIZE = 128;
  public static readonly DEFAULT_FILMSTRIP_THUMBNAIL_SIZE = 64;
  public static readonly DEFAULT_CONCURRENCY = 3;

  /**
   * Maximum allowed difference in seconds to consider two thumbnail intervals as the same zoom level.
   */
  public static readonly INTERVAL_TOLERANCE = 0.001;

  /**
   * Maximum allowed difference in seconds to consider two timestamps as matching the same thumbnail.
   */
  public static readonly TIMESTAMP_TOLERANCE = 0.05;

  /**
   * Map of cached filmstrip thumbnails keyed by media file ID.
   */
  private readonly storedFilmstripThumbnails = new Map<string, StoredFilmstripThumbnail[]>();

  /**
   * The time between thumbnails from the previous filmstrip generation request, used to detect zoom changes.
   */
  private previousTimeBetweenThumbnails: number | null = null;

  constructor() {
    this.destroyRef?.onDestroy(() => {
      this.freeAllThumbnails();
    });
  }

  /**
   * Generates thumbnail URLs for the given video file requests.
   *
   * @param requests The array of file thumbnail generation requests.
   * @param options The options for the thumbnail generation.
   * @returns An `Observable` that emits the results of the thumbnail generation.
   */
  public generateFileThumbnailUrls(
    requests: readonly FileThumbnailGenerationRequest[],
    options?: FileThumbnailGenerationOptions,
  ): Observable<FileThumbnailGenerationResult> {
    return from(requests).pipe(
      mergeMap(
        (request) => from(
          this.generateFileThumbnail(request.file, request.targetTimestamp, request.thumbnailSize),
        ).pipe(
          map((blob) => ({
            mediaFileId: request.mediaFileId,
            thumbnailUrl: URL.createObjectURL(blob),
          })),
          catchError(
            (error: unknown) => of({
              mediaFileId: request.mediaFileId,
              error: this.normalizeError(error),
            }),
          ),
        ),
        options?.concurrency ?? Thumbnail.DEFAULT_CONCURRENCY,
      ),
    );
  }

  /**
   * Generates and streams filmstrip thumbnail URLs for multiple video files across specified time intervals.
   *
   * Results are emitted asynchronously as each thumbnail is generated or retrieved from cache.
   * If the time between thumbnails matches previous generation requests (within tolerance),
   * existing thumbnails are retained and reused. If the interval differs, salvageable thumbnails
   * are preserved while unsalvageable ones are freed from memory.
   *
   * @param request The filmstrip thumbnails request specifying the interval and target file sections.
   * @returns An `Observable` that emits individual thumbnail results as they are produced.
   */
  public generateFilmstripThumbnails(
    request: FilmstripThumbnailsRequest,
  ): Observable<FilmstripThumbnailResult> {
    return new Observable<FilmstripThumbnailResult>((subscriber) => {
      let isCancelled = false;

      (async () => {
        try {
          await this.processFilmstripThumbnailsRequest(request, subscriber, () => isCancelled);
          if (!isCancelled) {
            subscriber.complete();
          }
        } catch (error) {
          if (!isCancelled) {
            subscriber.error(this.normalizeError(error));
          }
        }
      })();

      return () => {
        isCancelled = true;
      };
    });
  }

  /**
   * Frees all stored filmstrip thumbnails by revoking their object URLs, clearing the cache,
   * and resetting the recorded zoom interval.
   */
  public freeAllFilmstripThumbnails(): void {
    for (const thumbnails of this.storedFilmstripThumbnails.values()) {
      for (const item of thumbnails) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    }
    this.storedFilmstripThumbnails.clear();
    this.previousTimeBetweenThumbnails = null;
  }

  /**
   * Frees stored filmstrip thumbnails for a specific media file by revoking their object URLs
   * and removing the file entry from the cache.
   *
   * @param mediaFileId The ID of the media file whose filmstrip thumbnails should be freed.
   */
  public freeFilmstripThumbnailsForFile(mediaFileId: string): void {
    const thumbnails = this.storedFilmstripThumbnails.get(mediaFileId);
    if (thumbnails) {
      for (const item of thumbnails) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
      this.storedFilmstripThumbnails.delete(mediaFileId);
    }
  }

  /**
   * Frees all generated thumbnails tracked by the service to be used during destruction or reset.
   */
  public freeAllThumbnails(): void {
    this.freeAllFilmstripThumbnails();
  }

  /**
   * Processes a filmstrip thumbnail generation request by coordinating cache reuse, salvaging,
   * frame decoding, and streaming emissions.
   *
   * @param request The filmstrip generation request.
   * @param subscriber The observer receiving streaming results.
   * @param isCancelled Callback returning whether the subscription was cancelled.
   */
  private async processFilmstripThumbnailsRequest(
    request: FilmstripThumbnailsRequest,
    subscriber: Observer<FilmstripThumbnailResult>,
    isCancelled: () => boolean,
  ): Promise<void> {
    // In unclear or invalid interval cases, free everything and reset state
    if (typeof request.timeBetweenThumbnails !== 'number' ||
      isNaN(request.timeBetweenThumbnails) ||
      request.timeBetweenThumbnails <= 0
    ) {
      this.freeAllFilmstripThumbnails();
      throw new Error('Invalid timeBetweenThumbnails: must be a positive number.');
    }

    const isSameZoom = this.isSameZoomLevel(request.timeBetweenThumbnails);
    const effectiveInterval = isSameZoom && this.previousTimeBetweenThumbnails !== null
      ? this.previousTimeBetweenThumbnails
      : request.timeBetweenThumbnails;
    const thumbnailSize = this.resolveThumbnailSize(
      request.thumbnailSize ?? Thumbnail.DEFAULT_FILMSTRIP_THUMBNAIL_SIZE,
    );

    // Compute requested timestamps per file
    const fileTimestampsMap = new Map<string, number[]>();
    for (const fileReq of request.files) {
      const timestamps = this.calculateRequestedTimestamps(
        fileReq.startTime,
        fileReq.endTime,
        effectiveInterval,
      );
      fileTimestampsMap.set(fileReq.mediaFileId, timestamps);
    }

    if (isSameZoom) {
      // Same zoom level: keep all existing thumbnails across all files; reuse ones matching requested timestamps
      for (const fileReq of request.files) {
        if (isCancelled()) {
          return;
        }

        const requestedTimestamps = fileTimestampsMap.get(fileReq.mediaFileId) ?? [];
        const cachedList = this.storedFilmstripThumbnails.get(fileReq.mediaFileId) ?? [];
        const missingTimestamps: number[] = [];

        for (const t of requestedTimestamps) {
          const matched = cachedList.find((item) => Math.abs(item.timestamp - t) <= Thumbnail.TIMESTAMP_TOLERANCE);
          if (matched) {
            subscriber.next({
              mediaFileId: fileReq.mediaFileId,
              timestamp: t,
              thumbnailUrl: matched.thumbnailUrl,
            });
          } else {
            missingTimestamps.push(t);
          }
        }

        if (missingTimestamps.length > 0) {
          await this.generateFilmstripThumbnailsForFile(
            fileReq,
            missingTimestamps,
            thumbnailSize,
            subscriber,
            isCancelled,
          );
        }
      }
    } else {
      // Different zoom level: salvage matching thumbnails and free all unsalvageable ones
      const salvagedMap = new Map<string, StoredFilmstripThumbnail[]>();
      const matchedMap = new Map<string, Set<number>>();

      for (const [cachedFileId, cachedList] of this.storedFilmstripThumbnails.entries()) {
        const requestedTimestamps = fileTimestampsMap.get(cachedFileId);

        if (!requestedTimestamps) {
          // File is not part of this request; free all its cached thumbnails
          for (const item of cachedList) {
            URL.revokeObjectURL(item.thumbnailUrl);
          }
        } else {
          const salvagedForFile: StoredFilmstripThumbnail[] = [];
          const matchedTimestamps = new Set<number>();

          for (const cachedItem of cachedList) {
            const matchedTimestamp = requestedTimestamps.find(
              (t) => !matchedTimestamps.has(t) && Math.abs(cachedItem.timestamp - t) <= Thumbnail.TIMESTAMP_TOLERANCE,
            );

            if (matchedTimestamp !== undefined) {
              salvagedForFile.push(cachedItem);
              matchedTimestamps.add(matchedTimestamp);
            } else {
              URL.revokeObjectURL(cachedItem.thumbnailUrl);
            }
          }

          if (salvagedForFile.length > 0) {
            salvagedMap.set(cachedFileId, salvagedForFile);
          }
          matchedMap.set(cachedFileId, matchedTimestamps);
        }
      }

      // Replace cache with salvaged thumbnails and record new interval
      this.storedFilmstripThumbnails.clear();
      for (const [fileId, list] of salvagedMap.entries()) {
        this.storedFilmstripThumbnails.set(fileId, list);
      }
      this.previousTimeBetweenThumbnails = request.timeBetweenThumbnails;

      // Emit salvaged thumbnails immediately and generate missing ones
      for (const fileReq of request.files) {
        if (isCancelled()) {
          return;
        }

        const requestedTimestamps = fileTimestampsMap.get(fileReq.mediaFileId) ?? [];
        const cachedList = this.storedFilmstripThumbnails.get(fileReq.mediaFileId) ?? [];
        const matchedTimestamps = matchedMap.get(fileReq.mediaFileId) ?? new Set<number>();
        const missingTimestamps: number[] = [];

        for (const t of requestedTimestamps) {
          if (matchedTimestamps.has(t)) {
            const matchedItem = cachedList.find(
              (item) => Math.abs(item.timestamp - t) <= Thumbnail.TIMESTAMP_TOLERANCE,
            );
            if (matchedItem) {
              subscriber.next({
                mediaFileId: fileReq.mediaFileId,
                timestamp: t,
                thumbnailUrl: matchedItem.thumbnailUrl,
              });
            } else {
              missingTimestamps.push(t);
            }
          } else {
            missingTimestamps.push(t);
          }
        }

        if (missingTimestamps.length > 0) {
          await this.generateFilmstripThumbnailsForFile(
            fileReq,
            missingTimestamps,
            thumbnailSize,
            subscriber,
            isCancelled,
          );
        }
      }
    }
  }

  /**
   * Generates missing filmstrip thumbnails for a specific file using Mediabunny.
   *
   * @param fileSection The file section information.
   * @param timestamps The timestamps to generate thumbnails for.
   * @param thumbnailSize The desired size for the thumbnails.
   * @param subscriber The subscriber receiving generated thumbnails.
   * @param isCancelled Callback returning whether the operation was cancelled.
   */
  private async generateFilmstripThumbnailsForFile(
    fileSection: FilmstripFileSection,
    timestamps: readonly number[],
    thumbnailSize: number,
    subscriber: Observer<FilmstripThumbnailResult>,
    isCancelled: () => boolean,
  ): Promise<void> {
    const input = new Input({
      source: new BlobSource(fileSection.file),
      formats: ALL_FORMATS,
    });

    try {
      const videoTrack = await input.getPrimaryVideoTrack();

      if (!videoTrack) {
        throw new Error('File has no video track.');
      }

      if (await videoTrack.getCodec() === null) {
        throw new Error('Unsupported video codec.');
      }

      if (!(await videoTrack.canDecode())) {
        throw new Error('Unable to decode the video track.');
      }

      const displayWidth = await videoTrack.getDisplayWidth();
      const displayHeight = await videoTrack.getDisplayHeight();
      const width = displayWidth < displayHeight
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayWidth / displayHeight);
      const height = displayHeight < displayWidth
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayHeight / displayWidth);

      const firstTimestamp = await videoTrack.getFirstTimestamp();
      const lastTimestamp = await videoTrack.computeDuration();
      const duration = Math.max(0, lastTimestamp - firstTimestamp);

      const clampedTimestamps = timestamps.map((t) => (duration > 0
        ? Math.min(lastTimestamp, Math.max(firstTimestamp, firstTimestamp + t))
        : firstTimestamp));

      const sink = new CanvasSink(videoTrack, {
        width,
        height,
        fit: 'fill',
      });

      let timestampIndex = 0;

      if (typeof sink.canvasesAtTimestamps === 'function') {
        for await (const wrappedCanvas of sink.canvasesAtTimestamps(clampedTimestamps)) {
          if (isCancelled()) {
            break;
          }

          const targetTimestamp = timestamps[timestampIndex++];
          if (!wrappedCanvas) {
            subscriber.next({
              mediaFileId: fileSection.mediaFileId,
              timestamp: targetTimestamp,
              error: new Error('Failed to extract thumbnail canvas.'),
            });
            continue;
          }

          const blob = await this.canvasToBlob(wrappedCanvas.canvas);
          if (!blob) {
            subscriber.next({
              mediaFileId: fileSection.mediaFileId,
              timestamp: targetTimestamp,
              error: new Error('Failed to convert thumbnail canvas to blob.'),
            });
            continue;
          }

          const thumbnailUrl = URL.createObjectURL(blob);
          this.storeFilmstripThumbnail(fileSection.mediaFileId, targetTimestamp, thumbnailUrl);

          subscriber.next({
            mediaFileId: fileSection.mediaFileId,
            timestamp: targetTimestamp,
            thumbnailUrl,
          });
        }
      } else {
        // Fallback for environments or mocks providing single getCanvas
        for (const clampedT of clampedTimestamps) {
          if (isCancelled()) {
            break;
          }

          const targetTimestamp = timestamps[timestampIndex++];
          const wrappedCanvas = await sink.getCanvas(clampedT);
          if (!wrappedCanvas) {
            subscriber.next({
              mediaFileId: fileSection.mediaFileId,
              timestamp: targetTimestamp,
              error: new Error('Failed to extract thumbnail canvas.'),
            });
            continue;
          }

          const blob = await this.canvasToBlob(wrappedCanvas.canvas);
          if (!blob) {
            subscriber.next({
              mediaFileId: fileSection.mediaFileId,
              timestamp: targetTimestamp,
              error: new Error('Failed to convert thumbnail canvas to blob.'),
            });
            continue;
          }

          const thumbnailUrl = URL.createObjectURL(blob);
          this.storeFilmstripThumbnail(fileSection.mediaFileId, targetTimestamp, thumbnailUrl);

          subscriber.next({
            mediaFileId: fileSection.mediaFileId,
            timestamp: targetTimestamp,
            thumbnailUrl,
          });
        }
      }
    } catch (error) {
      if (!isCancelled()) {
        subscriber.next({
          mediaFileId: fileSection.mediaFileId,
          error: this.normalizeError(error),
        });
      }
    } finally {
      input.dispose();
    }
  }

  /**
   * Stores a generated filmstrip thumbnail into the internal cache.
   *
   * @param mediaFileId The media file ID.
   * @param timestamp The timestamp of the thumbnail.
   * @param thumbnailUrl The generated object URL.
   */
  private storeFilmstripThumbnail(mediaFileId: string, timestamp: number, thumbnailUrl: string): void {
    const list = this.storedFilmstripThumbnails.get(mediaFileId) ?? [];
    list.push({ mediaFileId, timestamp, thumbnailUrl });
    this.storedFilmstripThumbnails.set(mediaFileId, list);
  }

  /**
   * Generates a single thumbnail for the given file.
   *
   * @param file The file for which to generate a thumbnail.
   * @param targetTimestamp The timestamp in seconds at which to extract the thumbnail.
   * @param thumbnailSize The size of the thumbnail in pixels.
   * @returns A promise that resolves to the generated thumbnail as a `Blob`.
   * @throws Will throw an error if a problem with the video stream prevents thumbnail generation, or if the thumbnail
   * could not be extracted or converted to a blob.
   */
  private async generateFileThumbnail(file: File, targetTimestamp = 5, thumbnailSize = NaN): Promise<Blob> {
    thumbnailSize = this.resolveThumbnailSize(thumbnailSize);

    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });

    try {
      const videoTrack = await input.getPrimaryVideoTrack();

      if (!videoTrack) {
        throw new Error('File has no video track.');
      }

      if (await videoTrack.getCodec() === null) {
        throw new Error('Unsupported video codec.');
      }

      if (!(await videoTrack.canDecode())) {
        throw new Error('Unable to decode the video track.');
      }

      const displayWidth = await videoTrack.getDisplayWidth();
      const displayHeight = await videoTrack.getDisplayHeight();
      const width = displayWidth < displayHeight
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayWidth / displayHeight);
      const height = displayHeight < displayWidth
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayHeight / displayWidth);

      const firstTimestamp = await videoTrack.getFirstTimestamp();
      const lastTimestamp = await videoTrack.computeDuration();
      const duration = Math.max(0, lastTimestamp - firstTimestamp);
      const targetTimestampMediaBunny = duration > 0
        ? Math.min(lastTimestamp, Math.max(firstTimestamp, firstTimestamp + targetTimestamp))
        : firstTimestamp;

      const sink = new CanvasSink(videoTrack, {
        width,
        height,
        fit: 'fill',
      });

      const wrappedCanvas = await sink.getCanvas(targetTimestampMediaBunny);

      if (!wrappedCanvas) {
        throw new Error('Failed to extract thumbnail from video.');
      }

      const blob = await this.canvasToBlob(wrappedCanvas.canvas);
      if (!blob) {
        throw new Error('Failed to convert thumbnail canvas to blob.');
      }

      return blob;
    } finally {
      input.dispose();
    }
  }

  /**
   * Converts an `HTMLCanvasElement` or `OffscreenCanvas` to a `Blob`.
   *
   * @param canvas The canvas to convert.
   * @returns A promise that resolves to the `Blob`, or null if conversion fails.
   */
  private async canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
    if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
      return await canvas.convertToBlob({ type: 'image/png' });
    }

    if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
      return await new Promise<Blob | null>((resolve) => {
        (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), 'image/png');
      });
    }

    return null;
  }

  /**
   * Calculates the requested sequence of timestamps from start to end with the specified step interval.
   *
   * @param startTime The start timestamp in seconds.
   * @param endTime The end timestamp in seconds.
   * @param step The time between timestamps in seconds.
   * @returns The list of calculated timestamps.
   */
  private calculateRequestedTimestamps(startTime: number, endTime: number, step: number): number[] {
    if (startTime > endTime || step <= 0) {
      return [];
    }

    const timestamps: number[] = [];
    let current = startTime;

    // Tiny epsilon to avoid floating-point omissions at the boundary
    while (current <= endTime + 1e-6) {
      timestamps.push(current);
      current += step;
    }

    return timestamps;
  }

  /**
   * Resolves the thumbnail size adjusted for device pixel ratio in browser environments.
   *
   * @param size The requested size in pixels, or NaN to use default.
   * @returns The resolved pixel size.
   */
  private resolveThumbnailSize(size?: number): number {
    if (size === undefined || isNaN(size)) {
      size = Thumbnail.DEFAULT_FILE_THUMBNAIL_SIZE;
    }

    const devicePixelRatio = isPlatformBrowser(this.platformId) && typeof window !== 'undefined'
      ? (window.devicePixelRatio || 1)
      : 1;

    return Math.floor(size * devicePixelRatio);
  }

  /**
   * Checks whether a new interval matches the previous interval within the zoom tolerance.
   *
   * @param interval The new interval between thumbnails.
   * @returns True if the zoom level is considered unchanged; false otherwise.
   */
  private isSameZoomLevel(interval: number): boolean {
    if (this.previousTimeBetweenThumbnails === null) {
      return false;
    }

    return Math.abs(interval - this.previousTimeBetweenThumbnails) <= Thumbnail.INTERVAL_TOLERANCE;
  }

  /**
   * Normalizes an error to an `Error` instance.
   *
   * @param error The error to normalize.
   * @returns The normalized error.
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }
}

/**
 * Represents a request to generate a file thumbnail for a media file.
 */
export interface FileThumbnailGenerationRequest {
  mediaFileId: string,
  file: File,
  thumbnailSize?: number,
  targetTimestamp?: number,
}

/**
 * Options for file thumbnail generation batch execution.
 */
export interface FileThumbnailGenerationOptions {
  concurrency?: number,
}

/**
 * Represents a successful file thumbnail generation result.
 */
export interface FileThumbnailGenerationSuccess {
  mediaFileId: string,
  thumbnailUrl: string,
}

/**
 * Represents a failed file thumbnail generation result.
 */
export interface FileThumbnailGenerationFailure {
  mediaFileId: string,
  error: Error,
}

/**
 * The result of a file thumbnail generation request, either success or failure.
 */
export type FileThumbnailGenerationResult = FileThumbnailGenerationSuccess | FileThumbnailGenerationFailure;

/**
 * Specifies a section of a video file for filmstrip thumbnail generation.
 */
export interface FilmstripFileSection {
  mediaFileId: string,
  file: File,
  startTime: number,
  endTime: number,
}

/**
 * Represents a request to generate filmstrip thumbnails for one or more files.
 */
export interface FilmstripThumbnailsRequest {
  timeBetweenThumbnails: number,
  files: readonly FilmstripFileSection[],
  thumbnailSize?: number,
}

/**
 * Represents a successful filmstrip thumbnail generation result.
 */
export interface FilmstripThumbnailSuccess {
  mediaFileId: string,
  timestamp: number,
  thumbnailUrl: string,
}

/**
 * Represents a failed filmstrip thumbnail generation result.
 */
export interface FilmstripThumbnailFailure {
  mediaFileId: string,
  timestamp?: number,
  error: Error,
}

/**
 * The result of generating a filmstrip thumbnail.
 */
export type FilmstripThumbnailResult = FilmstripThumbnailSuccess | FilmstripThumbnailFailure;

/**
 * Stored filmstrip thumbnail metadata.
 */
export interface StoredFilmstripThumbnail {
  mediaFileId: string,
  timestamp: number,
  thumbnailUrl: string,
}
