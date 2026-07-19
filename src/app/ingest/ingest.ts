import { Component, signal } from '@angular/core';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';

@Component({
  selector: 'app-ingest',
  imports: [HorizontalSplit],
  templateUrl: './ingest.html',
  styleUrl: './ingest.scss',
})
export class Ingest {}
