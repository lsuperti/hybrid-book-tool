import { Component, inject } from '@angular/core';
import { HorizontalSplit } from '../../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from '../../layout/vertical-split/vertical-split';
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';
import { TextSegmentationService } from '../../../services/text-segmentation/text-segmentation';

@Component({
  selector: 'app-correlation',
  imports: [HorizontalSplit, VerticalSplit, WarningCard],
  templateUrl: './correlation.html',
  styleUrl: './correlation.scss',
})
export class Correlation {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly textSegmentationService = inject(TextSegmentationService);
}
