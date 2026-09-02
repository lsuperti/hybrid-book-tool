import { Component, inject, signal, computed, input } from '@angular/core';
import { Split } from '../../layout/split/split';
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';
import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { VideoPlayer } from '../../common/video-player/video-player';

@Component({
  selector: 'app-video-segmentation',
  imports: [Split, WarningCard, VideoPlayer],
  templateUrl: './video-segmentation.html',
  styleUrl: './video-segmentation.scss',
})
export class VideoSegmentation {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly videoSegmentationService = inject(VideoSegmentationService);
  
  public readonly visible = input.required<boolean>();
  protected readonly selectedSegmentIndex = signal<number>(0);
  protected readonly selectedSegment =
    computed<VideoSegment>(() => this.videoSegmentationService.segments()[this.selectedSegmentIndex()]);
  
  protected onSegmentSelected(index: number) {
    this.selectedSegmentIndex.set(index);
  }
}
