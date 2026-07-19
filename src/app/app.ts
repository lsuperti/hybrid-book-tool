import { Component, signal } from '@angular/core';
import { Ingest } from './ingest/ingest';
import { TextSegmentation } from './text-segmentation/text-segmentation';
import { VideoSegmentation } from './video-segmentation/video-segmentation';
import { Correlation } from './correlation/correlation';
import { Export } from './export/export';

@Component({
  selector: 'app-root',
  imports: [Ingest, TextSegmentation, VideoSegmentation, Correlation, Export],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App { 
  protected currentTab = signal<Tab>('ingest');
  
  protected tabButtonClick(tab: Tab): void {
    this.currentTab.set(tab);
  }
}

type Tab = 'ingest' | 'text-segmentation' | 'video-segmentation' | 'correlation' | 'export';