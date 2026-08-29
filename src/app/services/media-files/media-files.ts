import { Service, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Thumbnail, type ThumbnailGenerationResult } from '../thumbnail/thumbnail';
import { DomSanitizer } from '@angular/platform-browser';

@Service()
export class MediaFiles {
  private readonly thumbnailService = inject(Thumbnail);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  
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
    });
  }
  
  /**
   * Adds new media files to the list.
   * 
   * @param files The array of `File` objects to be added as media files.
   */
  public addMediaFiles(files: File[]): void {
    const newMediaFiles: MediaFile[] = files.map(file => ({
      id: this.createMediaFileId(),
      file,
      name: file.name,
      thumbnail: null,
      url: this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(file)) as string
    }));
    
    this.mediaFiles.update(currentFiles => [...currentFiles, ...newMediaFiles]);

    this.thumbnailService
    .generateThumbnailUrls(newMediaFiles.map((mediaFile) => ({
      mediaFileId: mediaFile.id,
      file: mediaFile.file
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
  
    this.mediaFiles.update((currentFiles) =>
      currentFiles.filter((mediaFile) => mediaFile.id !== mediaFileId)
    );
  }

  /**
   * Sets the text record.
   * 
   * @param file The `File` object representing the text record to be set. `null` indicates that it should be set to
   * have no text record.
   */
  public setTextRecord(file: File | null): void {
    const type = file ? (file.type === 'application/pdf' ? 'application/pdf' : 'invalid') : null;

    if (file && file.type !== 'application/pdf') {
      this.textRecord.set({ file: file, type: 'invalid', url: null });
      return;
    }

    const unsafeUrl = file ? URL.createObjectURL(file) : null;
    const url = unsafeUrl ? unsafeUrl as string : null;
    
    if (this.textRecord() && typeof this.textRecord().url === 'string') {
      URL.revokeObjectURL(this.textRecord().url as string);
    }
    
    this.textRecord.set({ file, type, url });
  }

  /**
   * Handles the result of a thumbnail generation request.
   * 
   * @param result The result o the thumbnail generation request, sent by the `Thumbnail` service.
   * @throws Will throw an error if the thumbnail generation failed.
   */
  private handleThumbnailGenerationResult(result: ThumbnailGenerationResult): void {
    if ('error' in result) {
      throw new Error(`Failed to generate thumbnail for media file "${result.mediaFileId}".`, result.error);
    }

    const previousThumbnailUrl = this.mediaFiles()
      .find((mediaFile) => mediaFile.id === result.mediaFileId)
      ?.thumbnail;

    if (previousThumbnailUrl) {
      URL.revokeObjectURL(previousThumbnailUrl);
      this.generatedThumbnailUrls.delete(previousThumbnailUrl);
    }

    this.generatedThumbnailUrls.add(result.thumbnailUrl);

    this.mediaFiles.update((currentFiles) =>
      currentFiles.map((mediaFile) =>
        mediaFile.id === result.mediaFileId
        ? {
          ...mediaFile,
          thumbnail: result.thumbnailUrl
          }
        : mediaFile
      )
    );
  }

  /**
   * Creates a unique ID for a new media file.
   * 
   * @returns The ID created.
   */
  private createMediaFileId(): MediaFileId {
    return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as MediaFileId;
  }
}

declare const brandSymbol: unique symbol;
export type Branded<Base, BrandName> = Base & {
  readonly [brandSymbol]: BrandName;
};

export type MediaFileId = Branded<string, 'MediaFileId'>;
export interface MediaFile {
  id: MediaFileId;
  file: File;
  name: string;
  url: string | null;
  thumbnail: string | null;
}

export interface TextRecord {
  file: File | null;
  type: 'application/pdf' | 'invalid' | null;
  url: string | null;
}