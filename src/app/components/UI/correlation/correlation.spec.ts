import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Correlation } from './correlation';
import { MediaFiles, type MediaFileId } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentation } from '../../../services/video-segmentation/video-segmentation';
import { By } from '@angular/platform-browser';
import { WarningCard } from '../../common/warning-card/warning-card';

describe('Correlation', () => {
  let component: Correlation;
  let fixture: ComponentFixture<Correlation>;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;
  let videoSegmentationService: VideoSegmentation;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Correlation],
    }).compileComponents();

    fixture = TestBed.createComponent(Correlation);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    videoSegmentationService = TestBed.inject(VideoSegmentation);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display error card when text record is invalid, taking precedence over segment warnings', () => {
    mediaFilesService.textRecord.set({ file: new File([], 'test.txt'), type: 'invalid', url: null });
    textSegmentationService.segments.set([]);
    videoSegmentationService.segments.set([]);
    fixture.detectChanges();

    const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
    const topWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topWarningCard).toBeTruthy();
    expect(topWarningCard?.componentInstance.type()).toBe('error');
    expect(topWarningCard?.componentInstance.message()).toBe('Registro de texto inválido.');
  });

  it('should display warning card when both text and video segments are empty', () => {
    mediaFilesService.textRecord.set({ file: null, type: null, url: null });
    textSegmentationService.segments.set([]);
    videoSegmentationService.segments.set([]);
    fixture.detectChanges();

    const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
    const topWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topWarningCard).toBeTruthy();
    expect(topWarningCard?.componentInstance.type()).toBe('warning');
    expect(topWarningCard?.componentInstance.message()).toBe('Não há segmentos de texto nem de vídeo.');
  });

  it('should display warning card when only text segments are empty', () => {
    mediaFilesService.textRecord.set({ file: null, type: null, url: null });
    textSegmentationService.segments.set([]);
    videoSegmentationService.segments.set([{ fileId: 'media-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 10, thumbnail: null }]);
    fixture.detectChanges();

    const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
    const topWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topWarningCard).toBeTruthy();
    expect(topWarningCard?.componentInstance.type()).toBe('warning');
    expect(topWarningCard?.componentInstance.message()).toBe('Não há segmentos de texto.');
  });

  it('should display warning card when only video segments are empty', () => {
    mediaFilesService.textRecord.set({ file: null, type: null, url: null });
    const mockTextSegment: TextSegment = {
      sequentialId: 0,
      pdfJsId: 'pdfjs-0',
      page: 1,
      text: 'Segment text',
      excluded: false,
      linkedChildren: [],
    };
    textSegmentationService.segments.set([mockTextSegment]);
    videoSegmentationService.segments.set([]);
    fixture.detectChanges();

    const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
    const topWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topWarningCard).toBeTruthy();
    expect(topWarningCard?.componentInstance.type()).toBe('warning');
    expect(topWarningCard?.componentInstance.message()).toBe('Não há segmentos de vídeo.');
  });

  it('should not display a top warning card when both text and video segments are present', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    const mockTextSegment: TextSegment = {
      sequentialId: 0,
      pdfJsId: 'pdfjs-0',
      page: 1,
      text: 'Segment text',
      excluded: false,
      linkedChildren: [],
    };
    textSegmentationService.segments.set([mockTextSegment]);
    videoSegmentationService.segments.set([{ fileId: 'media-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 10, thumbnail: null }]);
    fixture.detectChanges();

    const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
    const topWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topWarningCard).toBeUndefined();
  });
});

