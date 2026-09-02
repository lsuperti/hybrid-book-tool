import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { TextSegmentation } from './text-segmentation';
import { MediaFiles } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { WarningCard } from '../../common/warning-card/warning-card';

describe('TextSegmentation', () => {
  let component: TextSegmentation;
  let fixture: ComponentFixture<TextSegmentation>;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextSegmentation],
    }).compileComponents();

    fixture = TestBed.createComponent(TextSegmentation);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Warning Cards', () => {
    it('should display error warning card when text record is invalid', () => {
      mediaFilesService.textRecord.set({ file: new File([], 'test.txt'), type: 'invalid', url: null });
      fixture.detectChanges();

      const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
      const leftWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('left'));
      expect(leftWarningCard).toBeTruthy();
      expect(leftWarningCard?.componentInstance.type()).toBe('error');
      expect(leftWarningCard?.componentInstance.message()).toBe('Registro de texto inválido.');
    });

    it('should display warning card when text record is not selected', () => {
      mediaFilesService.textRecord.set({ file: null, type: null, url: null });
      fixture.detectChanges();

      const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
      const leftWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('left'));
      expect(leftWarningCard).toBeTruthy();
      expect(leftWarningCard?.componentInstance.type()).toBe('warning');
      expect(leftWarningCard?.componentInstance.message()).toBe('Registro de texto não selecionado.');
    });

    it('should display loading segments card when segmentation status is loading', () => {
      mediaFilesService.textRecord.set({ file: new File([], 'doc.pdf'), type: 'application/pdf', url: 'blob:test' });
      textSegmentationService.status.set('loading');
      fixture.detectChanges();

      const warningCards = fixture.debugElement.queryAll(By.directive(WarningCard));
      const leftWarningCard = warningCards.find((card) => card.nativeElement.hasAttribute('left'));
      expect(leftWarningCard).toBeTruthy();
      expect(leftWarningCard?.componentInstance.type()).toBe('loading-segments');
      expect(leftWarningCard?.componentInstance.message()).toBe('Extraindo texto do registro de texto...');
    });
  });

  describe('Segment Actions', () => {
    const mockSegments: TextSegment[] = [
      {
        sequentialId: 0,
        pdfJsId: 'seg-1',
        page: 1,
        text: 'Parent segment 1',
        excluded: false,
        linkedChildren: [
          {
            sequentialId: 1,
            pdfJsId: 'seg-2',
            page: 1,
            text: 'Child segment 1',
            excluded: false,
            linkedChildren: [],
          },
        ],
      },
      {
        sequentialId: 2,
        pdfJsId: 'seg-3',
        page: 2,
        text: 'Parent segment 2',
        excluded: true,
        linkedChildren: [],
      },
    ];

    beforeEach(() => {
      mediaFilesService.textRecord.set({ file: new File([], 'doc.pdf'), type: 'application/pdf', url: 'blob:test' });
      textSegmentationService.status.set('idle');
      textSegmentationService.segments.set(JSON.parse(JSON.stringify(mockSegments)));
      fixture.detectChanges();
    });

    it('should toggle segment linking on link button click', () => {
      const spy = vi.spyOn(textSegmentationService, 'toggleSegmentLinking');
      component['onLinkButtonClick'](mockSegments[1]);
      expect(spy).toHaveBeenCalledWith('seg-3');
    });

    it('should move segment up on up button click', () => {
      const spy = vi.spyOn(textSegmentationService, 'moveSegmentUp');
      component['onUpButtonClick'](mockSegments[1]);
      expect(spy).toHaveBeenCalledWith('seg-3');
    });

    it('should move segment down on down button click', () => {
      const spy = vi.spyOn(textSegmentationService, 'moveSegmentDown');
      component['onDownButtonClick'](mockSegments[0]);
      expect(spy).toHaveBeenCalledWith('seg-1');
    });

    it('should exclude segment on exclude button click', () => {
      const spy = vi.spyOn(textSegmentationService, 'excludeSegment');
      component['onExcludeButtonClick'](mockSegments[0]);
      expect(spy).toHaveBeenCalledWith('seg-1');
    });

    it('should include segment on include button click', () => {
      const spy = vi.spyOn(textSegmentationService, 'includeSegment');
      component['onIncludeButtonClick'](mockSegments[1]);
      expect(spy).toHaveBeenCalledWith('seg-3');
    });

    it('should select segment on click and navigate on double click', () => {
      component['onSegmentButtonClick']({ pdfJsId: 'seg-1', page: 1 });
      expect(component['selectedSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 1 });

      component['onSegmentButtonDoubleClick']({ pdfJsId: 'seg-1', page: 1 });
      expect(component['navigateToMarkedContentInViewer']()).toEqual({ pdfJsId: 'seg-1', page: 1 });
    });

    it('should scroll segment into view when onNavigateToMarkedContent is triggered', () => {
      const scrollSpy = vi.fn();
      const mockElement = {
        nativeElement: {
          getAttribute: (attr: string) => (attr === 'data-segment-id' ? 'seg-1' : null),
          scrollIntoView: scrollSpy,
        },
      };
      (component as unknown as { segmentItems: () => typeof mockElement[] }).segmentItems = () => [mockElement];

      component['onNavigateToMarkedContent']({ pdfJsId: 'seg-1', page: 1 });
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });
  });

  describe('Keyboard Navigation Highlight', () => {
    let list: HTMLOListElement;
    let segmentItem: HTMLLIElement;
    let mainButton: HTMLButtonElement;
    let linkButton: HTMLButtonElement;

    beforeEach(() => {
      list = document.createElement('ol');
      list.className = 'segments-list';

      segmentItem = document.createElement('li');
      segmentItem.setAttribute('data-segment-id', 'seg-1');
      segmentItem.setAttribute('data-segment-page', '3');
      segmentItem.className = 'parent-segment-item';

      mainButton = document.createElement('button');
      mainButton.className = 'segment-button';

      linkButton = document.createElement('button');
      linkButton.className = 'link-button';

      segmentItem.appendChild(mainButton);
      segmentItem.appendChild(linkButton);
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

    it('should unhover segment when focusing on a link button', () => {
      // First highlight it
      mainButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toEqual({ pdfJsId: 'seg-1', page: 3 });

      // Focus link button
      linkButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(component['hoveredSegmentPdfJsId']()).toBeNull();
    });

    it('should unhover segment when focus leaves the segments list', () => {
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
