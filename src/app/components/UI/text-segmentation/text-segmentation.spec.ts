import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextSegmentation } from './text-segmentation';

describe('TextSegmentation', () => {
  let component: TextSegmentation;
  let fixture: ComponentFixture<TextSegmentation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextSegmentation],
    }).compileComponents();

    fixture = TestBed.createComponent(TextSegmentation);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
