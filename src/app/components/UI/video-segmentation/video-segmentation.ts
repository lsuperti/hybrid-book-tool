import { Component, inject, signal, computed, input, effect } from '@angular/core';
import { Split } from '../../layout/split/split';
import { InfoCard } from '../../common/info-card/info-card';
import { MediaFiles, type MediaFileId, type MediaFile } from '../../../services/media-files/media-files';
import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { VideoPlayer } from '../../common/video-player/video-player';
import { Timeline } from './timeline/timeline';

@Component({
  selector: 'app-video-segmentation',
  imports: [Split, InfoCard, VideoPlayer, Timeline],
  templateUrl: './video-segmentation.html',
  styleUrl: './video-segmentation.scss',
})
export class VideoSegmentation {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly videoSegmentationService = inject(VideoSegmentationService);

  public readonly visible = input.required<boolean>();

  public readonly currentTime = signal<number>(0);
  public readonly isPlaying = signal<boolean>(false);
  public readonly isScrubbing = signal<boolean>(false);
  public readonly activeMediaFileId = signal<MediaFileId | null>(null);

  private hasInitializedPlayhead = false;

  constructor() {
    effect(() => {
      const segments = this.videoSegmentationService.segments();
      if (segments.length === 0) {
        this.hasInitializedPlayhead = false;
        this.activeMediaFileId.set(null);
        this.currentTime.set(0);
      } else if (!this.hasInitializedPlayhead && segments[0].id) {
        this.hasInitializedPlayhead = true;
        this.activeMediaFileId.set(segments[0].fileId);
        this.currentTime.set(segments[0].startTime);
      }
    });
  }

  protected readonly activeMediaFile = computed<MediaFile | null>(() => {
    const files = this.mediaFilesService.mediaFiles();
    const id = this.activeMediaFileId();
    if (id) {
      const match = files.find((f) => f.id === id);
      if (match) {
        return match;
      }
    }
    return files[0] ?? null;
  });

  public readonly activeSegment = computed<VideoSegment | null>(() => {
    const fileId = this.activeMediaFile()?.id;
    if (!fileId) {
      return null;
    }
    return this.videoSegmentationService.findSegmentAtTime(fileId, this.currentTime());
  });

  protected onSegmentSelected(segment: VideoSegment): void {
    if (this.activeSegment()?.id !== segment.id) {
      this.activeMediaFileId.set(segment.fileId);
      this.currentTime.set(segment.startTime);
    }
  }
}
