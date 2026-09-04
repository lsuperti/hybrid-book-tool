import { Service, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Thumbnail, type FileThumbnailGenerationResult } from '../thumbnail/thumbnail';

@Service()
export class MediaFiles {
  private readonly thumbnailService = inject(Thumbnail);
  private readonly destroyRef = inject(DestroyRef);

  public readonly mediaFiles = signal<MediaFile[]>([]);
  private readonly generatedThumbnailUrls = new Set<string>();

  public readonly textRecord = signal<TextRecord>({ file: null, type: null, url: null });

  constructor() {
    this.destroyRef.onDestroy(() => {
      // Revoke all generated thumbnail URLs
      for (const thumbnailUrl of this.generatedThumbnailUrls) {
        URL.revokeObjectURL(thumbnailUrl);
      }
      this.generatedThumbnailUrls.clear();

      // Revoke all media file URLs
      for (const mediaFile of this.mediaFiles()) {
        if (mediaFile.url) {
          URL.revokeObjectURL(mediaFile.url);
        }
      }

      // Revoke text record URL
      const currentTextRecordUrl = this.textRecord().url;
      if (currentTextRecordUrl) {
        URL.revokeObjectURL(currentTextRecordUrl);
      }
    });
  }

  /**
   * Adds new media files to the list.
   * 
   * @param files The array of `File` objects to be added as media files.
   */
  public addMediaFiles(files: File[]): void {
    const newMediaFiles: MediaFile[] = files.map((file) => ({
      id: this.createMediaFileId(),
      file,
      name: file.name,
      thumbnail: null,
      url: URL.createObjectURL(file),
    }));

    this.mediaFiles.update((currentFiles) => [...currentFiles, ...newMediaFiles]);

    this.thumbnailService
      .generateFileThumbnailUrls(newMediaFiles.map((mediaFile) => ({
        mediaFileId: mediaFile.id,
        file: mediaFile.file,
      })))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.handleThumbnailGenerationResult(result));
  }

  /**
   * Removes a media file from the list by its ID and revokes any associated object URLs to free up memory.
   * 
   * @param mediaFileId The ID of the media file to be removed.
   */
  public removeMediaFile(mediaFileId: string): void {
    const mediaFileToRemove = this.mediaFiles().find((mediaFile) => mediaFile.id === mediaFileId);

    if (mediaFileToRemove && mediaFileToRemove.thumbnail) {
      URL.revokeObjectURL(mediaFileToRemove.thumbnail);
      this.generatedThumbnailUrls.delete(mediaFileToRemove.thumbnail);
    }

    if (mediaFileToRemove && mediaFileToRemove.url) {
      URL.revokeObjectURL(mediaFileToRemove.url);
    }

    this.thumbnailService.freeFilmstripThumbnailsForFile(mediaFileId);

    this.mediaFiles.update((currentFiles) => currentFiles.filter((mediaFile) => mediaFile.id !== mediaFileId));
  }

  /**
   * Sets the text record.
   * 
   * @param file The `File` object representing the text record to be set. `null` indicates that it should be set to
   * have no text record.
   */
  public setTextRecord(file: File | null): void {
    const previousUrl = this.textRecord().url;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    if (!file) {
      this.textRecord.set({ file: null, type: null, url: null });
      return;
    }

    if (file.type !== 'application/pdf') {
      this.textRecord.set({ file, type: 'invalid', url: null });
      return;
    }

    const url = URL.createObjectURL(file);
    this.textRecord.set({ file, type: 'application/pdf', url });
  }

  /**
   * Handles the result of a thumbnail generation request.
   * 
   * @param result The result of the thumbnail generation request, sent by the `Thumbnail` service.
   * @throws Will throw an error if the thumbnail generation failed.
   */
  private handleThumbnailGenerationResult(result: FileThumbnailGenerationResult): void {
    if ('error' in result) {
      throw new Error(`Failed to generate thumbnail for media file "${result.mediaFileId}".`, { cause: result.error });
    }

    const targetFile = this.mediaFiles().find((mediaFile) => mediaFile.id === result.mediaFileId);
    if (!targetFile) {
      URL.revokeObjectURL(result.thumbnailUrl);
      return;
    }

    if (targetFile.thumbnail) {
      URL.revokeObjectURL(targetFile.thumbnail);
      this.generatedThumbnailUrls.delete(targetFile.thumbnail);
    }

    this.generatedThumbnailUrls.add(result.thumbnailUrl);

    this.mediaFiles.update(
      (currentFiles) => currentFiles.map(
        (mediaFile) => (mediaFile.id === result.mediaFileId
          ? {
            ...mediaFile,
            thumbnail: result.thumbnailUrl,
          }
          : mediaFile)
      )
    );
  }

  /**
   * Creates a unique ID for a new media file.
   * 
   * @returns The ID created.
   */
  private createMediaFileId(): MediaFileId {
    return `media-${
      Date.now()
    }-${
      Math.random()
        .toString(36)
        .slice(2, 8)
    }` as MediaFileId;
  }
}

declare const brandSymbol: unique symbol;
export type Branded<Base, BrandName> = Base & {
  readonly [brandSymbol]: BrandName,
};

export type MediaFileId = Branded<string, 'MediaFileId'>;
export interface MediaFile {
  id: MediaFileId,
  file: File,
  name: string,
  url: string | null,
  thumbnail: string | null,
}

export interface TextRecord {
  file: File | null,
  type: 'application/pdf' | 'invalid' | null,
  url: string | null,
}
