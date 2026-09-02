import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type PagesLoadedEvent, type TextLayerRenderedEvent } from 'ngx-extended-pdf-viewer';
import { PdfViewerFrame } from './pdf-viewer-frame';

describe('PdfViewerFrame', () => {
  let component: PdfViewerFrame;
  let fixture: ComponentFixture<PdfViewerFrame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfViewerFrame],
    }).compileComponents();

    fixture = TestBed.createComponent(PdfViewerFrame);
    fixture.componentRef.setInput('src', 'blob:test-pdf');
    fixture.componentRef.setInput('name', 'test-viewer');
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should post message to window.parent on onPagesLoaded', () => {
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    const mockEvent = { pagesCount: 5 } as PagesLoadedEvent;

    let emitted = false;
    component.pagesLoaded.subscribe((event) => {
      emitted = true;
      expect(event).toBe(mockEvent);
    });

    component['onPagesLoaded'](mockEvent);
    expect(emitted).toBe(true);
    expect(postMessageSpy).toHaveBeenCalledWith({
      type: 'pdf-viewer-pages-loaded',
      name: 'test-viewer',
      pagesCount: 5,
    }, document.location.origin);

    postMessageSpy.mockRestore();
  });

  it('should post message to window.parent on onTextLayerRendered', () => {
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    const mockEvent = { pageNumber: 2 } as TextLayerRenderedEvent;

    component['onTextLayerRendered'](mockEvent);
    expect(postMessageSpy).toHaveBeenCalledWith({
      type: 'pdf-viewer-text-layer-rendered',
      name: 'test-viewer',
      pageNumber: 2,
    }, document.location.origin);

    postMessageSpy.mockRestore();
  });
});
