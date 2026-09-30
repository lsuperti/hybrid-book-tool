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
  public static readonly DEFAULT_SEGMENT_THUMBNAIL_SIZE = 128;
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
   * Map of cached segment thumbnails keyed by segment ID.
   */
  private readonly storedSegmentThumbnails = new Map<string, { mediaFileId: string, url: string }>();

  /**
   * The time between thumbnails from the previous filmstrip generation request, used to detect zoom changes.
   */
  private previousTimeBetweenThumbnails: number | null = null;

  /**
   * Active Mediabunny Input being decoded for filmstrip thumbnails, tracked to support instant abortion.
   */
  private activeFilmstripInput: Input | null = null;

  /**
   * Promise of the currently active filmstrip generation task, used to serialize decoding pipelines.
   */
  private activeFilmstripTask: Promise<void> | null = null;

  /**
   * Cancellation callback for the currently active filmstrip generation task.
   */
  private activeFilmstripCancel: (() => void) | null = null;

  /**
   * Monotonically increasing ID of the current filmstrip generation task.
   */
  private activeFilmstripTaskId = 0;

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
   * Generates thumbnail URLs for the given video segment requests.
   *
   * Each thumbnail is captured at the pristine first frame of the segment (its exact startTime).
   *
   * @param requests The array of segment thumbnail generation requests.
   * @param options The options for segment thumbnail generation.
   * @returns An `Observable` that emits the results of the segment thumbnail generation.
   */
  public generateSegmentThumbnailUrls(
    requests: readonly SegmentThumbnailGenerationRequest[],
    options?: SegmentThumbnailGenerationOptions,
  ): Observable<SegmentThumbnailGenerationResult> {
    return new Observable<SegmentThumbnailGenerationResult>((subscriber) => {
      let isCancelled = false;
      const activeInputs = new Set<Input>();

      const cancelThis = () => {
        isCancelled = true;
        for (const input of activeInputs) {
          try {
            input.dispose();
          } catch {
            // Ignore error from aborted input
          }
        }
        activeInputs.clear();
      };

      const concurrency = options?.concurrency ?? Thumbnail.DEFAULT_CONCURRENCY;

      from(requests).pipe(
        mergeMap(
          (request) => {
            if (isCancelled) {
              return of<SegmentThumbnailGenerationResult>({
                segmentId: request.segmentId,
                mediaFileId: request.mediaFileId,
                error: new Error('Segment thumbnail generation cancelled.'),
              });
            }
            return from(
              this.generateSegmentThumbnail(
                request.file,
                request.startTime,
                request.thumbnailSize,
                () => isCancelled,
                (input: Input) => {
                  if (isCancelled) {
                    try {
                      input.dispose();
                    } catch {
                      // Ignore error
                    }
                  } else {
                    activeInputs.add(input);
                  }
                },
                (input: Input) => {
                  activeInputs.delete(input);
                },
              ),
            ).pipe(
              map((blob) => {
                const url = URL.createObjectURL(blob);
                this.storeSegmentThumbnail(request.segmentId, request.mediaFileId, url);
                return {
                  segmentId: request.segmentId,
                  mediaFileId: request.mediaFileId,
                  thumbnailUrl: url,
                };
              }),
              catchError((error: unknown) => of({
                segmentId: request.segmentId,
                mediaFileId: request.mediaFileId,
                error: this.normalizeError(error),
              })),
            );
          },
          concurrency,
        ),
      )
        .subscribe({
          next: (result) => {
            if (!isCancelled) {
              subscriber.next(result);
            }
          },
          error: (err) => {
            if (!isCancelled) {
              subscriber.error(err);
            }
          },
          complete: () => {
            if (!isCancelled) {
              subscriber.complete();
            }
          },
        });

      return () => {
        cancelThis();
      };
    });
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

      const cancelThis = () => {
        isCancelled = true;
        if (this.activeFilmstripInput) {
          try {
            this.activeFilmstripInput.dispose();
          } catch {
            // Ignore error from aborted input
          }
          this.activeFilmstripInput = null;
        }
      };

      // Cancel any prior active generation task
      if (this.activeFilmstripCancel) {
        this.activeFilmstripCancel();
      }
      this.activeFilmstripCancel = cancelThis;

      const priorTask = this.activeFilmstripTask;
      const currentTaskId = ++this.activeFilmstripTaskId;

      const currentTask = (async () => {
        if (priorTask) {
          try {
            await priorTask;
          } catch {
            // Ignore errors from aborted prior tasks
          }
        }

        if (isCancelled) {
          return;
        }

        try {
          await this.processFilmstripThumbnailsRequest(request, subscriber, () => isCancelled);
          if (!isCancelled) {
            subscriber.complete();
          }
        } catch (error) {
          if (!isCancelled) {
            subscriber.error(this.normalizeError(error));
          }
        } finally {
          if (this.activeFilmstripTaskId === currentTaskId) {
            this.activeFilmstripTask = null;
            this.activeFilmstripCancel = null;
          }
        }
      })();

      this.activeFilmstripTask = currentTask;

      return () => {
        cancelThis();
      };
    });
  }

  /**
   * Frees all stored filmstrip thumbnails by revoking their object URLs, clearing the cache,
   * and resetting the recorded zoom interval.
   */
  public freeAllFilmstripThumbnails(): void {
    if (this.activeFilmstripCancel) {
      this.activeFilmstripCancel();
      this.activeFilmstripCancel = null;
    }
    this.activeFilmstripTaskId++;
    this.clearFilmstripCache();
  }

  /**
   * Revokes object URLs and clears the stored filmstrip thumbnails cache.
   */
  private clearFilmstripCache(): void {
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
   * Stores a generated segment thumbnail URL in the internal cache.
   * If a previous thumbnail URL was stored for this segment ID, revokes the old URL first.
   *
   * @param segmentId The segment ID.
   * @param mediaFileId The media file ID.
   * @param url The object URL of the thumbnail.
   */
  private storeSegmentThumbnail(segmentId: string, mediaFileId: string, url: string): void {
    const existing = this.storedSegmentThumbnails.get(segmentId);
    if (existing) {
      URL.revokeObjectURL(existing.url);
    }
    this.storedSegmentThumbnails.set(segmentId, { mediaFileId, url });
  }

  /**
   * Frees the stored thumbnail for a specific segment.
   *
   * @param segmentId The ID of the segment whose thumbnail should be freed.
   */
  public freeSegmentThumbnail(segmentId: string): void {
    const entry = this.storedSegmentThumbnails.get(segmentId);
    if (entry) {
      URL.revokeObjectURL(entry.url);
      this.storedSegmentThumbnails.delete(segmentId);
    }
  }

  /**
   * Frees all stored segment thumbnails for a specific media file.
   *
   * @param mediaFileId The ID of the media file whose segment thumbnails should be freed.
   */
  public freeSegmentThumbnailsForFile(mediaFileId: string): void {
    for (const [segmentId, entry] of this.storedSegmentThumbnails.entries()) {
      if (entry.mediaFileId === mediaFileId) {
        URL.revokeObjectURL(entry.url);
        this.storedSegmentThumbnails.delete(segmentId);
      }
    }
  }

  /**
   * Frees all generated segment thumbnails.
   */
  public freeAllSegmentThumbnails(): void {
    for (const entry of this.storedSegmentThumbnails.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.storedSegmentThumbnails.clear();
  }

  /**
   * Frees all generated thumbnails tracked by the service to be used during destruction or reset.
   */
  public freeAllThumbnails(): void {
    this.freeAllFilmstripThumbnails();
    this.freeAllSegmentThumbnails();
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
      this.clearFilmstripCache();
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
    if (isCancelled() || timestamps.length === 0) {
      return;
    }

    const input = new Input({
      source: new BlobSource(fileSection.file),
      formats: ALL_FORMATS,
    });
    this.activeFilmstripInput = input;

    try {
      if (isCancelled()) {
        return;
      }

      const videoTrack = await input.getPrimaryVideoTrack();
      if (isCancelled()) {
        return;
      }
      if (!videoTrack) {
        throw new Error('File has no video track.');
      }

      const codec = await videoTrack.getCodec();
      if (isCancelled()) {
        return;
      }
      if (codec === null) {
        throw new Error('Unsupported video codec.');
      }

      const canDecode = await videoTrack.canDecode();
      if (isCancelled()) {
        return;
      }
      if (!canDecode) {
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
      if (isCancelled()) {
        return;
      }
      const duration = Math.max(0, lastTimestamp - firstTimestamp);

      const clampedTimestamps = timestamps.map((t) => (duration > 0
        ? Math.min(lastTimestamp, Math.max(firstTimestamp, firstTimestamp + t))
        : firstTimestamp));

      const sink = new CanvasSink(videoTrack, {
        width,
        height,
        fit: 'fill',
        poolSize: 1,
      });

      let timestampIndex = 0;

      if (typeof sink.canvasesAtTimestamps === 'function') {
        for await (const wrappedCanvas of sink.canvasesAtTimestamps(clampedTimestamps)) {
          if (isCancelled()) {
            break;
          }

          const targetTimestamp = timestamps[timestampIndex++];
          if (!wrappedCanvas) {
            if (!isCancelled()) {
              subscriber.next({
                mediaFileId: fileSection.mediaFileId,
                timestamp: targetTimestamp,
                error: new Error('Failed to extract thumbnail canvas.'),
              });
            }
            continue;
          }

          const blob = await this.canvasToBlob(wrappedCanvas.canvas);
          if (isCancelled()) {
            break;
          }
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
          if (isCancelled()) {
            break;
          }
          if (!wrappedCanvas) {
            subscriber.next({
              mediaFileId: fileSection.mediaFileId,
              timestamp: targetTimestamp,
              error: new Error('Failed to extract thumbnail canvas.'),
            });
            continue;
          }

          const blob = await this.canvasToBlob(wrappedCanvas.canvas);
          if (isCancelled()) {
            break;
          }
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
      if (this.activeFilmstripInput === input) {
        this.activeFilmstripInput = null;
      }
      try {
        input.dispose();
      } catch {
        // Ignore errors from disposing already-disposed inputs
      }
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
        poolSize: 1,
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
   * Generates a single thumbnail for a video segment at its exact start timestamp.
   *
   * Unlike file thumbnails, segment thumbnails never skip early frames to avoid container weirdness;
   * they extract the pristine first frame of the segment at its exact startTime.
   *
   * @param file The video file.
   * @param startTime The start timestamp in seconds of the segment (relative to video start).
   * @param thumbnailSize The desired size for the thumbnail in pixels.
   * @param isCancelled Optional callback returning whether thumbnail generation has been cancelled.
   * @param onInputCreated Optional callback invoked when Mediabunny Input is instantiated.
   * @param onInputDisposed Optional callback invoked when Mediabunny Input is about to be disposed.
   * @returns A promise that resolves to the generated thumbnail as a Blob.
   */
  private async generateSegmentThumbnail(
    file: File,
    startTime = 0,
    thumbnailSize = NaN,
    isCancelled?: () => boolean,
    onInputCreated?: (input: Input) => void,
    onInputDisposed?: (input: Input) => void,
  ): Promise<Blob> {
    if (isCancelled?.()) {
      throw new Error('Segment thumbnail generation cancelled.');
    }

    thumbnailSize = this.resolveThumbnailSize(
      isNaN(thumbnailSize) ? Thumbnail.DEFAULT_SEGMENT_THUMBNAIL_SIZE : thumbnailSize,
    );

    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    onInputCreated?.(input);

    try {
      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }

      const videoTrack = await input.getPrimaryVideoTrack();
      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }

      if (!videoTrack) {
        throw new Error('File has no video track.');
      }

      if (await videoTrack.getCodec() === null) {
        throw new Error('Unsupported video codec.');
      }

      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }

      if (!(await videoTrack.canDecode())) {
        throw new Error('Unable to decode the video track.');
      }

      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }

      const displayWidth = await videoTrack.getDisplayWidth();
      const displayHeight = await videoTrack.getDisplayHeight();
      const width = displayWidth < displayHeight
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayWidth / displayHeight);
      const height = displayHeight < displayWidth
        ? thumbnailSize
        : Math.floor(thumbnailSize * displayHeight / displayWidth);

      const firstTimestamp = (await videoTrack.getFirstTimestamp()) ?? 0;
      const lastTimestamp = (await videoTrack.computeDuration()) ?? 0;
      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }
      const duration = Math.max(0, lastTimestamp - firstTimestamp);

      // Extract pristine first frame of the segment: exactly at firstTimestamp + startTime, clamped to track duration
      const targetTimestamp = duration > 0
        ? Math.min(lastTimestamp, Math.max(firstTimestamp, firstTimestamp + Math.max(0, startTime)))
        : firstTimestamp;

      const sink = new CanvasSink(videoTrack, {
        width,
        height,
        fit: 'fill',
        poolSize: 1,
      });

      const wrappedCanvas = await sink.getCanvas(targetTimestamp);
      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }

      if (!wrappedCanvas) {
        throw new Error('Failed to extract segment thumbnail from video.');
      }

      const blob = await this.canvasToBlob(wrappedCanvas.canvas);
      if (isCancelled?.()) {
        throw new Error('Segment thumbnail generation cancelled.');
      }
      if (!blob) {
        throw new Error('Failed to convert segment thumbnail canvas to blob.');
      }

      return blob;
    } finally {
      onInputDisposed?.(input);
      try {
        input.dispose();
      } catch {
        // Ignore error from already disposed input
      }
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

/**
 * Represents a request to generate a segment thumbnail.
 */
export interface SegmentThumbnailGenerationRequest {
  segmentId: string,
  mediaFileId: string,
  file: File,
  startTime: number,
  thumbnailSize?: number,
}

/**
 * Options for segment thumbnail generation batch execution.
 */
export interface SegmentThumbnailGenerationOptions {
  concurrency?: number,
}

/**
 * Represents a successful segment thumbnail generation result.
 */
export interface SegmentThumbnailGenerationSuccess {
  segmentId: string,
  mediaFileId: string,
  thumbnailUrl: string,
}

/**
 * Represents a failed segment thumbnail generation result.
 */
export interface SegmentThumbnailGenerationFailure {
  segmentId: string,
  mediaFileId: string,
  error: Error,
}

/**
 * The result of a segment thumbnail generation request, either success or failure.
 */
export type SegmentThumbnailGenerationResult =
  SegmentThumbnailGenerationSuccess |
  SegmentThumbnailGenerationFailure;
