import { Service, inject, signal, effect } from '@angular/core';
import { MediaFiles, type MediaFileId } from '../media-files/media-files';

@Service()
export class VideoSegmentationService {
  private mediaFilesService = inject(MediaFiles);

  public segments = signal<VideoSegment[]>([]);
  
  constructor() {
    // STUB: We will have proper video segmentation logic in the video segmentation component, for now we just create a
    // segment for each media file with a start at the start and an end at infinity.
    effect(() => {
      const mediaFiles = this.mediaFilesService.mediaFiles();
      
      const newSegments: VideoSegment[] = mediaFiles.map((mediaFile) => ({
        fileId: mediaFile.id,
        name: `Segmento de ${mediaFile.name} (-∞ \u2013 +∞)`,
        startTime: -Infinity,
        endTime: Infinity,
        thumbnail: mediaFile.thumbnail,
      }));
      
      this.segments.set(newSegments);
    });
  }

  public moveSegmentUp(index: number): void {
    if (index <= 0 || index >= this.segments().length) {
      return;
    }

    const segments = [...this.segments()];
    [segments[index - 1], segments[index]] = [segments[index], segments[index - 1]];
    this.segments.set(segments);
  }

  public moveSegmentDown(index: number): void {
    if (index < 0 || index >= this.segments().length - 1) {
      return;
    }

    const segments = [...this.segments()];
    [segments[index], segments[index + 1]] = [segments[index + 1], segments[index]];
    this.segments.set(segments);
  }
}

export interface VideoSegment {
  fileId: MediaFileId;
  name: string;
  startTime: number;
  endTime: number;
  thumbnail: string | null;
}
