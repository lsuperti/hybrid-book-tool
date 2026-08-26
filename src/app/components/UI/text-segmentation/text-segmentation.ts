import { Component, inject, viewChildren, viewChild, ElementRef, afterNextRender, Injector, input, signal, Renderer2, effect, OnDestroy } from '@angular/core';
import { HorizontalSplit } from '../../layout/horizontal-split/horizontal-split';
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment, type PdfJsAccessibleTextSegment } from '../../../services/text-segmentation/text-segmentation';
import { PdfViewer } from "../../common/pdf-viewer/pdf-viewer";

@Component({
  selector: 'app-text-segmentation',
  imports: [HorizontalSplit, WarningCard, PdfViewer],
  templateUrl: './text-segmentation.html',
  styleUrl: './text-segmentation.scss',
})
export class TextSegmentation implements OnDestroy {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly textSegmentationService = inject(TextSegmentationService);
  private readonly injector = inject(Injector);
  private readonly renderer2 = inject(Renderer2);
  
  public readonly visible = input.required<boolean>();
  
  protected readonly hoveredSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly selectedSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly navigateToMarkedContentInViewer = signal<PdfJsAccessibleTextSegment | null>(null);
  private readonly segmentItems = viewChildren<ElementRef<HTMLDivElement>>('segmentItem');
  private linkButtons = viewChildren<ElementRef<HTMLButtonElement>>('linkButton');
  private upButtons = viewChildren<ElementRef<HTMLButtonElement>>('upButton');
  private downButtons = viewChildren<ElementRef<HTMLButtonElement>>('downButton');
  private excludeButtons = viewChildren<ElementRef<HTMLButtonElement>>('excludeButton');
  private includeButtons = viewChildren<ElementRef<HTMLButtonElement>>('includeButton');
  private readonly segmentsList = viewChild<ElementRef<HTMLOListElement>>('segmentsList');
  private readonly unlisteners: (() => void)[] = [];
  private segmentListScrollUnlistener: (() => void) | null = null;
  private wasInSegmentsList = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor() {
    this.unlisteners.push(this.renderer2.listen('document', 'mousemove', (event: MouseEvent) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      
      this.hoverFromMousePosition();
      
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const isInSegmentsList = hoveredElement?.closest('.segments-list') !== null;
      
      if (!isInSegmentsList && this.wasInSegmentsList) {
        this.hoveredSegmentPdfJsId.set(null);
      }


      this.wasInSegmentsList = isInSegmentsList;
    }));

    this.unlisteners.push(this.renderer2.listen('document', 'focusin', (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const isInSegmentsList = target.closest('.segments-list') !== null;
        if (isInSegmentsList) {
          const button = target.closest('button');
          if (button) {
            if (button.classList.contains('link-button')) {
              this.hoveredSegmentPdfJsId.set(null);
            } else {
              const segmentItem = button.closest('[data-segment-page]') as HTMLElement | null;
              if (segmentItem) {
                const pdfJsId = segmentItem.getAttribute('data-segment-id');
                const page = segmentItem.getAttribute('data-segment-page');
                if (pdfJsId && page) {
                  this.hoveredSegmentPdfJsId.set({ pdfJsId, page: parseInt(page, 10) });
                } else {
                  this.hoveredSegmentPdfJsId.set(null);
                }
              } else {
                this.hoveredSegmentPdfJsId.set(null);
              }
            }
          } else {
            this.hoveredSegmentPdfJsId.set(null);
          }
        } else {
          this.hoveredSegmentPdfJsId.set(null);
        }
      }
    }));

    this.unlisteners.push(this.renderer2.listen('document', 'focusout', (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (!relatedTarget) {
        this.hoveredSegmentPdfJsId.set(null);
      }
    }));

    effect(() => {
      this.mediaFilesService.textRecord();
      this.textSegmentationService.status();

      if (this.segmentListScrollUnlistener) {
        this.segmentListScrollUnlistener();
        this.segmentListScrollUnlistener = null;
      }
      
      if (this.segmentsList()?.nativeElement) {
        this.segmentListScrollUnlistener = this.renderer2.listen(this.segmentsList()!.nativeElement, 'scroll', () => {
          this.hoverFromMousePosition();
        });
      }
    });
  }
  
  protected onLinkButtonClick(segment: TextSegment) {
    this.textSegmentationService.toggleSegmentLinking(segment.pdfJsId);

    // Since the segments lists have been rebuilt in the DOM with the linking change, the focus in the button gets lost,
    // which is terrible for accessibility. So we need to restore the focus to the button that was clicked.
    afterNextRender(() => {      
      const buttonToFocus = this.linkButtons().find(button => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  protected onUpButtonClick(segment: TextSegment) {
    this.textSegmentationService.moveSegmentUp(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.upButtons().find(button => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  protected onDownButtonClick(segment: TextSegment) {
    this.textSegmentationService.moveSegmentDown(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.downButtons().find(button => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  protected onExcludeButtonClick(segment: TextSegment) {
    this.textSegmentationService.excludeSegment(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.includeButtons().find(button => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  protected onIncludeButtonClick(segment: TextSegment) {
    this.textSegmentationService.includeSegment(segment.pdfJsId);
    
    afterNextRender(() => {
      const buttonToFocus = this.excludeButtons().find(button => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  protected onSegmentButtonClick(segment: PdfJsAccessibleTextSegment) {
    this.selectedSegmentPdfJsId.set(segment);
  }

  protected onSegmentButtonDoubleClick(segment: PdfJsAccessibleTextSegment) {
    this.navigateToMarkedContentInViewer.set(segment);
  }

  protected onNavigateToMarkedContent(markedContent: PdfJsAccessibleTextSegment) {
    this.segmentItems().forEach(item => {
      if (item.nativeElement.getAttribute('data-segment-id') === markedContent.pdfJsId) {
        item.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  private hoverFromMousePosition() {
    const hoveredElement = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;
      
    if (hoveredElement) {
      const segmentItem = hoveredElement.closest('[data-segment-id]') as HTMLElement | null;
      if (segmentItem) {
        const pdfJsId = segmentItem.getAttribute('data-segment-id');
        const page = segmentItem.getAttribute('data-segment-page');
        if (pdfJsId && page) {
          const topBackground = hoveredElement.classList.contains('segment-top-background');

          if (topBackground) {
            this.hoveredSegmentPdfJsId.set(this.textSegmentationService.previousInFlattenedList(pdfJsId) || null);
          } else {
            this.hoveredSegmentPdfJsId.set({ pdfJsId, page: parseInt(page, 10) });
          }
        }
      }
    }
  }

  ngOnDestroy() {
    this.unlisteners.forEach(unlisten => unlisten());

    if (this.segmentListScrollUnlistener) {
      this.segmentListScrollUnlistener();
    }
  }
}
