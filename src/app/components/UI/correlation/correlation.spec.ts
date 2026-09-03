import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Correlation } from './correlation';
import { MediaFiles, type MediaFileId } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { By } from '@angular/platform-browser';
import { InfoCard } from '../../common/info-card/info-card';

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

    const InfoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const topInfoCard = InfoCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topInfoCard).toBeTruthy();
    expect(topInfoCard?.componentInstance.type()).toBe('error');
    expect(topInfoCard?.componentInstance.message()).toBe('Registro de texto inválido.');
  });

  it('should display warning card when both text and video segments are empty', () => {
    mediaFilesService.textRecord.set({ file: null, type: null, url: null });
    textSegmentationService.segments.set([]);
    videoSegmentationService.segments.set([]);
    fixture.detectChanges();

    const InfoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const topInfoCard = InfoCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topInfoCard).toBeTruthy();
    expect(topInfoCard?.componentInstance.type()).toBe('warning');
    expect(topInfoCard?.componentInstance.message()).toBe('Não há segmentos de texto nem de vídeo.');
  });

  it('should display warning card when only text segments are empty', () => {
    mediaFilesService.textRecord.set({ file: null, type: null, url: null });
    textSegmentationService.segments.set([]);
    videoSegmentationService.segments.set([{
      fileId: 'media-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 10, thumbnail: null
    }]);
    fixture.detectChanges();

    const InfoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const topInfoCard = InfoCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topInfoCard).toBeTruthy();
    expect(topInfoCard?.componentInstance.type()).toBe('warning');
    expect(topInfoCard?.componentInstance.message()).toBe('Não há segmentos de texto.');
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

    const InfoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const topInfoCard = InfoCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topInfoCard).toBeTruthy();
    expect(topInfoCard?.componentInstance.type()).toBe('warning');
    expect(topInfoCard?.componentInstance.message()).toBe('Não há segmentos de vídeo.');
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
    videoSegmentationService.segments.set([{
      fileId: 'media-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 10, thumbnail: null
    }]);
    fixture.detectChanges();

    const InfoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const topInfoCard = InfoCards.find((card) => card.nativeElement.hasAttribute('top'));
    expect(topInfoCard).toBeUndefined();
  });

  describe('Full Text Concatenation', () => {
    it('should return segment text when linkedChildren is empty', () => {
      const segment: TextSegment = {
        sequentialId: 0,
        pdfJsId: 'pdfjs-0',
        page: 1,
        text: 'Hello world',
        excluded: false,
        linkedChildren: [],
      };
      expect(component['getFullText'](segment)).toBe('Hello world');
    });

    it('should join child texts with space when child does not end with space-excluded character', () => {
      const child: TextSegment = {
        sequentialId: 1,
        pdfJsId: 'pdfjs-1',
        page: 1,
        text: 'there',
        excluded: false,
        linkedChildren: [],
      };
      const segment: TextSegment = {
        sequentialId: 0,
        pdfJsId: 'pdfjs-0',
        page: 1,
        text: 'Hello',
        excluded: false,
        linkedChildren: [child],
      };
      expect(component['getFullText'](segment)).toBe('Hello there');
    });

    it('should not add space when previous text ends with a space-excluded character', () => {
      const child: TextSegment = {
        sequentialId: 1,
        pdfJsId: 'pdfjs-1',
        page: 1,
        text: 'world',
        excluded: false,
        linkedChildren: [],
      };
      const segment: TextSegment = {
        sequentialId: 0,
        pdfJsId: 'pdfjs-0',
        page: 1,
        text: 'Hello-',
        excluded: false,
        linkedChildren: [child],
      };
      expect(component['getFullText'](segment)).toBe('Hello- world');
    });
  });

  describe('Segment and Video Actions', () => {
    it('should call videoSegmentationService.moveSegmentUp when onUpButtonClick is invoked', () => {
      const moveUpSpy = vi.spyOn(videoSegmentationService, 'moveSegmentUp');
      component['onUpButtonClick'](2);
      expect(moveUpSpy).toHaveBeenCalledWith(2);
    });

    it('should call videoSegmentationService.moveSegmentDown when onDownButtonClick is invoked', () => {
      const moveDownSpy = vi.spyOn(videoSegmentationService, 'moveSegmentDown');
      component['onDownButtonClick'](1);
      expect(moveDownSpy).toHaveBeenCalledWith(1);
    });

    it('should set selectedSegmentPdfJsId on onSegmentButtonClick', () => {
      component['onSegmentButtonClick']({ pdfJsId: 'seg-1', page: 1 });
      expect(component['selectedSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 1 });

      component['onSegmentButtonClick'](null);
      expect(component['selectedSegmentPdfJsId']()).toBeNull();
    });

    it('should set navigateToMarkedContentInViewer on onSegmentButtonDoubleClick', () => {
      component['onSegmentButtonDoubleClick']({ pdfJsId: 'seg-2', page: 2 });
      expect(component['navigateToMarkedContentInViewer']()).toEqual({ pdfJsId: 'seg-2', page: 2 });
    });

    it('should scroll matching segment button into view on onNavigateToMarkedContent', () => {
      const mockElement = document.createElement('button');
      mockElement.setAttribute('data-segment-id', 'seg-3');
      const scrollSpy = vi.fn();
      mockElement.scrollIntoView = scrollSpy;

      Object.defineProperty(component, 'segmentTextButtons', {
        value: () => [{ nativeElement: mockElement }],
      });

      component['onNavigateToMarkedContent']({ pdfJsId: 'seg-3', page: 1 });
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });
  });

  describe('Computed Rows and Selected Video Segment', () => {
    it('should pair text and video segments into correlationRows, filtering out excluded text segments', () => {
      const textSeg1: TextSegment = {
        sequentialId: 0,
        pdfJsId: 'seg-1',
        page: 1,
        text: 'Text 1',
        excluded: false,
        linkedChildren: [],
      };
      const textSeg2: TextSegment = {
        sequentialId: 1,
        pdfJsId: 'seg-2',
        page: 1,
        text: 'Excluded Text',
        excluded: true,
        linkedChildren: [],
      };
      const videoSeg1: VideoSegment = {
        fileId: 'vid-1' as MediaFileId,
        name: 'Video 1',
        startTime: 0,
        endTime: 5,
        thumbnail: null,
      };

      textSegmentationService.segments.set([textSeg1, textSeg2]);
      videoSegmentationService.segments.set([videoSeg1]);

      const rows = component['correlationRows']();
      expect(rows.length).toBe(1);
      expect(rows[0].textSegment?.pdfJsId).toBe('seg-1');
      expect(rows[0].videoSegment?.fileId).toBe('vid-1');
    });

    it('should compute selectedVideoSegment matching the selected text segment', () => {
      const textSeg1: TextSegment = {
        sequentialId: 0,
        pdfJsId: 'seg-1',
        page: 1,
        text: 'Text 1',
        excluded: false,
        linkedChildren: [],
      };
      const videoSeg1: VideoSegment = {
        fileId: 'vid-1' as MediaFileId,
        name: 'Video 1',
        startTime: 0,
        endTime: 5,
        thumbnail: null,
      };

      textSegmentationService.segments.set([textSeg1]);
      videoSegmentationService.segments.set([videoSeg1]);
      component['selectedSegmentPdfJsId'].set({ pdfJsId: 'seg-1', page: 1 });

      expect(component['selectedVideoSegment']()?.fileId).toBe('vid-1');
    });
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
