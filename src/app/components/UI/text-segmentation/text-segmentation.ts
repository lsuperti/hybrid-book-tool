import {
  Component,
  inject,
  viewChildren,
  viewChild,
  ElementRef,
  afterNextRender,
  Injector,
  input,
  signal,
  effect,
  Renderer2,
  OnDestroy
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';
import { Split } from '../../layout/split/split';
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';

import {
  TextSegmentationService,
  type TextSegment,
  type PdfJsAccessibleTextSegment
} from '../../../services/text-segmentation/text-segmentation';

import { PdfViewer } from '../../common/pdf-viewer/pdf-viewer';

@Component({
  selector: 'app-text-segmentation',
  imports: [Split, WarningCard, PdfViewer, NgTemplateOutlet],
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
  private readonly linkButtons = viewChildren<ElementRef<HTMLButtonElement>>('linkButton');
  private readonly upButtons = viewChildren<ElementRef<HTMLButtonElement>>('upButton');
  private readonly downButtons = viewChildren<ElementRef<HTMLButtonElement>>('downButton');
  private readonly excludeButtons = viewChildren<ElementRef<HTMLButtonElement>>('excludeButton');
  private readonly includeButtons = viewChildren<ElementRef<HTMLButtonElement>>('includeButton');
  private readonly segmentsList = viewChild<ElementRef<HTMLOListElement>>('segmentsList');

  private readonly unlisteners: (() => void)[] = [];
  private mouseWasInSegmentsList = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor() {
    this.unlisteners.push(this.renderer2.listen('document', 'mousemove', (event: MouseEvent) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;

      this.hoverFromMousePosition();

      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const isInSegmentsList = hoveredElement?.closest('.segments-sublist') !== null;

      if (!isInSegmentsList && this.mouseWasInSegmentsList) {
        this.hoveredSegmentPdfJsId.set(null);
      }

      this.mouseWasInSegmentsList = isInSegmentsList;
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

    effect((onCleanup) => {
      this.mediaFilesService.textRecord();
      this.textSegmentationService.status();

      const list = this.segmentsList();
      if (list?.nativeElement) {
        const unlisten = this.renderer2.listen(list.nativeElement, 'scroll', () => {
          this.hoverFromMousePosition();
        });
        onCleanup(() => unlisten());
      }
    });

    // Since we are handling the highlighting of segments on mousemove events and they don't fire outside of the
    // document or over the PDF viewer, since it is an iframe, we remove the highlight when the mouse leaves the list.
    // It would be possible to move the mouse fast enough to leave the list and enter the iframe or leave the document
    // without firing a mousemove event, so we need to handle that case.
    effect((onCleanup) => {
      const list = this.segmentsList();
      if (list) {
        const unlisten = this.renderer2.listen(list.nativeElement, 'mouseleave', () => {
          this.hoveredSegmentPdfJsId.set(null);
          this.mouseWasInSegmentsList = false;
        });
        onCleanup(() => unlisten());
      }
    });
  }

  /**
   * Toggles the linking of a segment to its predecessor. Restores focus to the clicked button after render.
   *
   * @param segment The text segment to toggle linking for.
   */
  protected onLinkButtonClick(segment: TextSegment) {
    this.textSegmentationService.toggleSegmentLinking(segment.pdfJsId);

    // Since the segments lists have been rebuilt in the DOM with the linking change, the focus in the button gets lost,
    // which is terrible for accessibility. So we need to restore the focus to the button that was clicked.
    afterNextRender(() => {
      const buttonToFocus = this.linkButtons()
        .find((button) => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Moves a segment up in the segmentation hierarchy or list. Restores focus to the up button after render.
   *
   * @param segment The text segment to move up.
   */
  protected onUpButtonClick(segment: TextSegment) {
    this.textSegmentationService.moveSegmentUp(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.upButtons()
        .find((button) => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Moves a segment down in the segmentation hierarchy or list. Restores focus to the down button after render.
   *
   * @param segment The text segment to move down.
   */
  protected onDownButtonClick(segment: TextSegment) {
    this.textSegmentationService.moveSegmentDown(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.downButtons()
        .find((button) => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Excludes a segment from segmentation. Restores focus to the corresponding include button after render.
   *
   * @param segment The text segment to exclude.
   */
  protected onExcludeButtonClick(segment: TextSegment) {
    this.textSegmentationService.excludeSegment(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.includeButtons()
        .find((button) => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Includes a previously excluded segment back into segmentation. Restores focus to the exclude button after render.
   *
   * @param segment The text segment to include.
   */
  protected onIncludeButtonClick(segment: TextSegment) {
    this.textSegmentationService.includeSegment(segment.pdfJsId);

    afterNextRender(() => {
      const buttonToFocus = this.excludeButtons()
        .find((button) => button.nativeElement.getAttribute('data-segment-id') === segment.pdfJsId);
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Selects a segment when clicked.
   *
   * @param segment The PDF.js accessible text segment information.
   */
  protected onSegmentButtonClick(segment: PdfJsAccessibleTextSegment) {
    this.selectedSegmentPdfJsId.set(segment);
  }

  /**
   * Triggers navigation to the marked content in the PDF viewer when double-clicked.
   *
   * @param segment The PDF.js accessible text segment information to navigate to.
   */
  protected onSegmentButtonDoubleClick(segment: PdfJsAccessibleTextSegment) {
    this.navigateToMarkedContentInViewer.set(segment);
  }

  /**
   * Scrolls the segment item into view in the list when navigated to from the PDF viewer.
   *
   * @param markedContent The PDF.js accessible text segment to scroll into view.
   */
  protected onNavigateToMarkedContent(markedContent: PdfJsAccessibleTextSegment) {
    this.segmentItems().forEach((item) => {
      if (item.nativeElement.getAttribute('data-segment-id') === markedContent.pdfJsId) {
        item.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /**
   * Determines and updates the hovered segment based on current mouse coordinates.
   */
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

  /**
   * Cleans up all registered event listeners on component destruction.
   */
  ngOnDestroy() {
    this.unlisteners.forEach((unlisten) => unlisten());
  }
}
