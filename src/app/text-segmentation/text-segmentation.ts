import { Component, inject, signal } from '@angular/core';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';
import { WarningCard } from '../warning-card/warning-card';
import { MediaFiles } from '../services/media-files';
import { TextSegmentationService, type TextSegment } from '../services/text-segmentation';

@Component({
  selector: 'app-text-segmentation',
  imports: [HorizontalSplit, WarningCard],
  templateUrl: './text-segmentation.html',
  styleUrl: './text-segmentation.scss',
})
export class TextSegmentation {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly textSegmentationService = inject(TextSegmentationService);
  protected selectedSegmentIndex = signal<number>(0);

  protected toggleSegmentLinked(segment: TextSegment) {
    this.textSegmentationService.toggleSegmentLinked(segment);
  }
}
