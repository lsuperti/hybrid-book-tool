import { Component, inject, signal } from '@angular/core';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from '../layout/vertical-split/vertical-split';
import { WarningCard } from "../warning-card/warning-card";
import { MediaFiles } from '../services/media-files';

@Component({
  selector: 'app-video-segmentation',
  imports: [HorizontalSplit, VerticalSplit, WarningCard],
  templateUrl: './video-segmentation.html',
  styleUrl: './video-segmentation.scss',
})
export class VideoSegmentation {
  protected readonly mediaFilesService = inject(MediaFiles);
  
  protected readonly selectedSegmentIndex = signal<number>(0);
  
  protected onSegmentSelected(index: number) {
    this.selectedSegmentIndex.set(index);
  }
}
