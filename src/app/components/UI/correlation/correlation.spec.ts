import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Correlation } from './correlation';
import { MediaFiles, type MediaFileId } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService } from '../../../services/video-segmentation/video-segmentation';
import { By } from '@angular/platform-browser';
import { WarningCard } from '../../common/warning-card/warning-card';

describe('Correlation', () => {
  let component: Correlation;
  let fixture: ComponentFixture<Correlation>;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;
  let videoSegmentationService: VideoSegmentationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Correlation],
    }).compileComponents();

    fixture = TestBed.createComponent(Correlation);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    videoSegmentationService = TestBed.inject(VideoSegmentationService);
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

  describe('Keyboard Navigation Highlight', () => {
    let list: HTMLOListElement;
    let segmentItem: HTMLLIElement;
    let mainButton: HTMLButtonElement;
    let upButton: HTMLButtonElement;
    let downButton: HTMLButtonElement;

    beforeEach(() => {
      list = document.createElement('ol');
      list.className = 'correlation-list';

      segmentItem = document.createElement('li');
      segmentItem.className = 'correlation-item';

      mainButton = document.createElement('button');
      mainButton.className = 'segment-text-button';
      mainButton.setAttribute('data-segment-id', 'seg-1');
      mainButton.setAttribute('data-segment-page', '3');

      upButton = document.createElement('button');
      upButton.className = 'up-button';

      downButton = document.createElement('button');
      downButton.className = 'down-button';

      segmentItem.appendChild(mainButton);
      segmentItem.appendChild(upButton);
      segmentItem.appendChild(downButton);
      list.appendChild(segmentItem);
      document.body.appendChild(list);
    });

    afterEach(() => {
      document.body.removeChild(list);
    });

    it('should highlight segment when focusing on a segment button', () => {
      mainButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });
    });

    it('should highlight segment when focusing on an up button in the same item', () => {
      upButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });
    });

    it('should highlight segment when focusing on a down button in the same item', () => {
      downButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });
    });

    it('should unhover segment when focus leaves the correlation list', () => {
      // First highlight it
      mainButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });

      // Create an outside element and focus it
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);
      outsideElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(component['hoveredSegmentPdfJsId']()).toBeNull();
      document.body.removeChild(outsideElement);
    });

    it('should unhover segment when focus leaves the document entirely', () => {
      // First highlight it
      mainButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });

      // Dispatch focusout with no related target
      document.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
      expect(component['hoveredSegmentPdfJsId']()).toBeNull();
    });
  });
});

