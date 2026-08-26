import { Component, signal } from '@angular/core';
import { Ingest } from '../ingest/ingest';
import { TextSegmentation } from '../text-segmentation/text-segmentation';
import { VideoSegmentation } from '../video-segmentation/video-segmentation';
import { Correlation } from '../correlation/correlation';
import { Export } from '../export/export';

@Component({
  selector: 'app-workflow',
  imports: [Ingest, TextSegmentation, VideoSegmentation, Correlation, Export],
  templateUrl: './workflow.html',
  styleUrl: './workflow.scss',
})
export class Workflow {
  protected readonly currentTab = signal<Tab>('ingest');

  protected tabButtonClick(tab: Tab): void {
    this.currentTab.set(tab);
  }
}

type Tab = 'ingest' | 'text-segmentation' | 'video-segmentation' | 'correlation' | 'export';
