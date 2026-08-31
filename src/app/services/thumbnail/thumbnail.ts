import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import { catchError, from, map, mergeMap, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Thumbnail {
  private readonly platformId = inject(PLATFORM_ID);
  private static readonly DEFAULT_THUMBNAIL_SIZE = 128;

  /**
   * Generates thumbnail URLs for the given requests.
   *
   * @param requests The array of thumbnail generation requests.
   * @param options The options for the thumbnail generation.
   * @returns An `Observable` that emits the results of the thumbnail generation.
   */
  public generateThumbnailUrls(
    requests: readonly ThumbnailGenerationRequest[],
    options?: ThumbnailGenerationOptions
  ): Observable<ThumbnailGenerationResult> {
    return from(requests).pipe(
      mergeMap((request) =>
        from(this.generateThumbnail(request.file, request.targetTimestamp, request.thumbnailSize)).pipe(
          map((blob) => ({
            mediaFileId: request.mediaFileId,
            thumbnailUrl: URL.createObjectURL(blob)
          })),
          catchError((error: unknown) =>
            of({
              mediaFileId: request.mediaFileId,
              error: this.normalizeError(error)
            })
          )
        ),
        options?.concurrency ?? 3
      )
    );
  }

  /**
   * Generates a thumbnail for the given file.
   * 
   * @param file The file for which to generate a thumbnail.
   * @param thumbnailSize The size of the thumbnail in pixels.
   * @param targetTimestamp The timestamp in seconds at which to extract the thumbnail.
   * @returns A promise that resolves to the generated thumbnail as a `Blob`.
   * @throws Will throw an error if a problem with the video stream prevents thumbnail generation, or if the thumbnail
   * could not be extracted or converted to a blob.
   */
  private async generateThumbnail(file: File, targetTimestamp = 5, thumbnailSize = NaN): Promise<Blob> {
    // Adjust thumbnail size to fit larger scalings if running in a browser environment and it is not specified.
    if (isPlatformBrowser(this.platformId) && isNaN(thumbnailSize)) {
      thumbnailSize = Math.floor(Thumbnail.DEFAULT_THUMBNAIL_SIZE * window.devicePixelRatio);
    } else {
      thumbnailSize = Thumbnail.DEFAULT_THUMBNAIL_SIZE;
    }

    // Initialize Mediabunny with a local file blob source
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS
    });

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

    // Compute width and height of the thumbnails such that the smaller dimension is equal to the specified thumbnail
    // size, and the larger dimension is scaled proportionally to maintain the aspect ratio.
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
    const targetTimestampMediaBunny = firstTimestamp + (lastTimestamp - firstTimestamp) * targetTimestamp / lastTimestamp;
    
    // Create a CanvasSink for extracting resized frames from the video track
    const sink = new CanvasSink(videoTrack, {
      width: Math.floor(width * window.devicePixelRatio),
      height: Math.floor(height * window.devicePixelRatio),
      fit: 'fill',
    });

    const wrappedCanvas = await sink.getCanvas(targetTimestampMediaBunny);
    
    if (!wrappedCanvas) {
      throw new Error('Failed to extract thumbnail from video.');
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      (wrappedCanvas.canvas as HTMLCanvasElement).toBlob((b) => resolve(b), 'image/png');
    });

    if (!blob) {
      throw new Error('Failed to convert thumbnail canvas to blob.');
    }

    return blob;
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

export interface ThumbnailGenerationRequest {
  mediaFileId: string;
  file: File;
  thumbnailSize?: number;
  targetTimestamp?: number;
}

export interface ThumbnailGenerationOptions {
  concurrency?: number;
}

export interface ThumbnailGenerationSuccess {
  mediaFileId: string;
  thumbnailUrl: string;
}

export interface ThumbnailGenerationFailure {
  mediaFileId: string;
  error: Error;
}

export type ThumbnailGenerationResult = ThumbnailGenerationSuccess | ThumbnailGenerationFailure;
