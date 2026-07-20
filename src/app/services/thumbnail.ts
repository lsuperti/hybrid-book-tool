import { Injectable } from '@angular/core';
import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import { catchError, from, map, mergeMap, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Thumbnail {
  public generateThumbnailUrls(
    requests: readonly ThumbnailGenerationRequest[],
    options?: ThumbnailGenerationOptions
  ): Observable<ThumbnailGenerationResult> {
    return from(requests).pipe(
      mergeMap((request) =>
        from(this.generateThumbnail(request.file, request.thumbnailSize, request.targetTimestampInSeconds)).pipe(
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

  public async generateThumbnail(file: File, thumbnailSize: number = 128, targetTimestampInSeconds: number = 5): Promise<Blob> {
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

    // Compute width and height of the thumbnails such that the larger dimension is equal to THUMBNAIL_SIZE
    const displayWidth = await videoTrack.getDisplayWidth();
    const displayHeight = await videoTrack.getDisplayHeight();
    const width = displayWidth > displayHeight
      ? thumbnailSize
      : Math.floor(thumbnailSize * displayWidth / displayHeight);
    const height = displayHeight > displayWidth
      ? thumbnailSize
      : Math.floor(thumbnailSize * displayHeight / displayWidth);
    
    const firstTimestamp = await videoTrack.getFirstTimestamp();
    const lastTimestamp = await videoTrack.computeDuration();
    const targetTimestamp = firstTimestamp + (lastTimestamp - firstTimestamp) * targetTimestampInSeconds / lastTimestamp;
    
    // Create a CanvasSink for extracting resized frames from the video track
    const sink = new CanvasSink(videoTrack, {
      width: Math.floor(width * window.devicePixelRatio),
      height: Math.floor(height * window.devicePixelRatio),
      fit: 'fill',
    });

    const wrappedCanvas = await sink.getCanvas(targetTimestamp);
    
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
  targetTimestampInSeconds?: number;
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
