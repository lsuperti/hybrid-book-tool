import { Component } from '@angular/core';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from '../layout/vertical-split/vertical-split';

@Component({
  selector: 'app-video-segmentation',
  imports: [HorizontalSplit, VerticalSplit],
  templateUrl: './video-segmentation.html',
  styleUrl: './video-segmentation.scss',
})
export class VideoSegmentation {}
