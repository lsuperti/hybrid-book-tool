import { Service, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Thumbnail, type FileThumbnailGenerationResult } from '../thumbnail/thumbnail';
import { FileRegistry } from '../undo/file-registry/file-registry';

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

  private readonly fileRegistry = inject(FileRegistry, { optional: true });

  /**
   * Adds new media files to the list.
   * 
   * @param files The array of `File` objects to be added as media files.
   * @returns The created `MediaFile` objects.
   */
  public addMediaFiles(files: File[]): MediaFile[] {
    const newMediaFiles: MediaFile[] = files.map((file) => {
      const id = this.createMediaFileId();
      this.fileRegistry?.register(file, id);
      return {
        id,
        file,
        name: file.name,
        thumbnail: null,
        url: URL.createObjectURL(file),
      };
    });

    this.mediaFiles.update((currentFiles) => [...currentFiles, ...newMediaFiles]);

    this.thumbnailService
      .generateFileThumbnailUrls(newMediaFiles.map((mediaFile) => ({
        mediaFileId: mediaFile.id,
        file: mediaFile.file,
      })))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.handleThumbnailGenerationResult(result));

    return newMediaFiles;
  }

  /**
   * Removes a media file from the list by its ID and revokes any associated object URLs to free up memory.
   * 
   * @param mediaFileId The ID of the media file to be removed.
   * @returns The removed file and its previous index, or null if not found.
   */
  public removeMediaFile(mediaFileId: string): { removedFile: MediaFile, index: number } | null {
    const currentIndex = this.mediaFiles().findIndex((mediaFile) => mediaFile.id === mediaFileId);
    if (currentIndex === -1) {
      return null;
    }
    const mediaFileToRemove = this.mediaFiles()[currentIndex];

    if (mediaFileToRemove.thumbnail) {
      URL.revokeObjectURL(mediaFileToRemove.thumbnail);
      this.generatedThumbnailUrls.delete(mediaFileToRemove.thumbnail);
    }

    if (mediaFileToRemove.url) {
      URL.revokeObjectURL(mediaFileToRemove.url);
    }

    this.fileRegistry?.release(mediaFileId);
    this.thumbnailService.freeFilmstripThumbnailsForFile(mediaFileId);

    this.mediaFiles.update((currentFiles) => currentFiles.filter((mediaFile) => mediaFile.id !== mediaFileId));

    return { removedFile: mediaFileToRemove, index: currentIndex };
  }

  /**
   * Restores a previously removed media file at an optional index and refreshes its preview.
   *
   * @param mediaFile The media file to restore.
   * @param index Optional target index to insert the file at.
   */
  public restoreMediaFile(mediaFile: MediaFile, index?: number): void {
    const restored: MediaFile = {
      ...mediaFile,
      thumbnail: null,
      url: URL.createObjectURL(mediaFile.file),
    };

    this.fileRegistry?.register(mediaFile.file, mediaFile.id);

    this.mediaFiles.update((current) => {
      const copy = [...current];
      if (typeof index === 'number' && index >= 0 && index <= copy.length) {
        copy.splice(index, 0, restored);
      } else {
        copy.push(restored);
      }
      return copy;
    });

    this.thumbnailService
      .generateFileThumbnailUrls([{
        mediaFileId: restored.id,
        file: restored.file,
      }])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.handleThumbnailGenerationResult(result));
  }

  /**
   * Restores a complete collection of media files, refreshing URLs and thumbnails.
   *
   * @param files Array of media files to restore.
   */
  public restoreMediaFiles(files: readonly MediaFile[]): void {
    for (const file of this.mediaFiles()) {
      if (file.thumbnail) {
        URL.revokeObjectURL(file.thumbnail);
        this.generatedThumbnailUrls.delete(file.thumbnail);
      }
      if (file.url) {
        URL.revokeObjectURL(file.url);
      }
      this.fileRegistry?.release(file.id);
    }

    const restored: MediaFile[] = files.map((file) => {
      this.fileRegistry?.register(file.file, file.id);
      return {
        ...file,
        thumbnail: null,
        url: URL.createObjectURL(file.file),
      };
    });

    this.mediaFiles.set(restored);

    if (restored.length > 0) {
      this.thumbnailService
        .generateFileThumbnailUrls(restored.map((mediaFile) => ({
          mediaFileId: mediaFile.id,
          file: mediaFile.file,
        })))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((result) => this.handleThumbnailGenerationResult(result));
    }
  }

  /**
   * Sets the text record.
   * 
   * @param file The `File` object representing the text record to be set. `null` indicates that it should be set to
   * have no text record.
   */
  public setTextRecord(file: File | null): void {
    const previous = this.textRecord();
    if (previous.url) {
      URL.revokeObjectURL(previous.url);
    }
    if (previous.file) {
      this.fileRegistry?.release(previous.file);
    }

    if (!file) {
      this.textRecord.set({ file: null, type: null, url: null });
      return;
    }

    this.fileRegistry?.register(file);

    if (file.type !== 'application/pdf') {
      this.textRecord.set({ file, type: 'invalid', url: null });
      return;
    }

    const url = URL.createObjectURL(file);
    this.textRecord.set({ file, type: 'application/pdf', url });
  }

  /**
   * Restores the text record state, registering the underlying file in FileRegistry.
   *
   * @param record The text record to restore.
   */
  public restoreTextRecord(record: TextRecord | null): void {
    this.setTextRecord(record?.file ?? null);
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
