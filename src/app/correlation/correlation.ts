import { Component } from '@angular/core';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from '../layout/vertical-split/vertical-split';

@Component({
  selector: 'app-correlation',
  imports: [HorizontalSplit, VerticalSplit],
  templateUrl: './correlation.html',
  styleUrl: './correlation.scss',
})
export class Correlation {}
