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

  public removeMediaFile(mediaFileId: string): void {
    const mediaFileToRemove = this.mediaFiles()
      .find((mediaFile) => mediaFile.id === mediaFileId);
      
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

  public setTextRecord(file: File | null): void {
    const type = file ? (file.type === 'application/pdf' ? 'application/pdf' : 'invalid') : null;

    if (file && file.type !== 'application/pdf') {
      this.textRecord.set({ file: file, type: 'invalid', url: null });
      return;
    }

    const unsafeUrl = file ? URL.createObjectURL(file) : null;
    const url = unsafeUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(unsafeUrl) as string : null;
    
    if (this.textRecord() && typeof this.textRecord().url === 'string') {
      URL.revokeObjectURL(this.textRecord().url as string);
    }
    
    this.textRecord.set({ file, type, url });
  }

  private handleThumbnailGenerationResult(result: ThumbnailGenerationResult): void {
    if ('error' in result) {
      console.error(`Failed to generate thumbnail for media file "${result.mediaFileId}".`, result.error);
      return;
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

  private createMediaFileId(): string {
    return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export interface MediaFile {
  id: string;
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