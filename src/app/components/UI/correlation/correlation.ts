import {
  Component,
  inject,
  input,
  computed,
  signal,
  viewChildren,
  viewChild,
  ElementRef,
  afterNextRender,
  Injector,
  Renderer2,
  OnDestroy,
  effect,
  untracked
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';

import { HorizontalSplit } from '../../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from '../../layout/vertical-split/vertical-split';
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';

import {
  TextSegmentationService,
  type TextSegment,
  type PdfJsAccessibleTextSegment
} from '../../../services/text-segmentation/text-segmentation';

import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { PdfViewer } from '../../common/pdf-viewer/pdf-viewer';
import { VideoPlayer } from '../../common/video-player/video-player';

export interface CorrelationRow {
  textSegment: TextSegment | null,
  videoSegment: VideoSegment | null,
  index: number,
}

@Component({
  selector: 'app-correlation',
  imports: [HorizontalSplit, VerticalSplit, WarningCard, PdfViewer, VideoPlayer, NgTemplateOutlet],
  templateUrl: './correlation.html',
  styleUrl: './correlation.scss',
})
export class Correlation implements OnDestroy {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly textSegmentationService = inject(TextSegmentationService);
  protected readonly videoSegmentationService = inject(VideoSegmentationService);
  private readonly injector = inject(Injector);
  private readonly renderer2 = inject(Renderer2);

  public readonly visible = input.required<boolean>();

  protected readonly hoveredSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly selectedSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly navigateToMarkedContentInViewer = signal<PdfJsAccessibleTextSegment | null>(null);

  private readonly segmentTextButtons = viewChildren<ElementRef<HTMLButtonElement>>('segmentTextButton');
  private readonly upButtons = viewChildren<ElementRef<HTMLButtonElement>>('upButton');
  private readonly downButtons = viewChildren<ElementRef<HTMLButtonElement>>('downButton');
  private readonly correlationList = viewChild<ElementRef<HTMLOListElement>>('correlationList');

  private readonly unlisteners: (() => void)[] = [];
  private mouseWasInList = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor() {
    this.unlisteners.push(this.renderer2.listen('document', 'mousemove', (event: MouseEvent) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      
      this.hoverFromMousePosition();
      
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const isInList = hoveredElement?.closest('.segment-text-button') !== null;
      
      if (!isInList && this.mouseWasInList) {
        this.hoveredSegmentPdfJsId.set(null);
      }

      this.mouseWasInList = isInList;
    }));

    this.unlisteners.push(this.renderer2.listen('document', 'focusin', (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const item = target.closest('.correlation-item');
        if (item) {
          const button = item.querySelector('.segment-text-button');
          if (button) {
            const pdfJsId = button.getAttribute('data-segment-id');
            const page = button.getAttribute('data-segment-page');
            if (pdfJsId && page) {
              this.hoveredSegmentPdfJsId.set({ pdfJsId, page: parseInt(page, 10) });
              return;
            }
          }
        }
      }
      this.hoveredSegmentPdfJsId.set(null);
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

      const list = this.correlationList();
      if (list?.nativeElement) {
        const unlisten = this.renderer2.listen(list.nativeElement, 'scroll', () => {
          this.hoverFromMousePosition();
        });
        onCleanup(() => unlisten());
      }

      // If no segment is selected, select the first segment in the list when it becomes available.
      if (untracked(() => this.selectedSegmentPdfJsId()) === null) {
        if (this.textSegmentationService.segments().length > 0) {
          this.selectedSegmentPdfJsId.set(this.textSegmentationService.segments()[0]);
        }
      }
    });

    // Since we are handling the highlighting of segments on mousemove events and they don't fire outside of the
    // document or over the PDF viewer, since it is an iframe, we remove the highlight when the mouse leaves the list.
    // It would be possible to move the mouse fast enough to leave the list and enter the iframe or leave the document
    // without firing a mousemove event, so we need to handle that case.
    effect((onCleanup) => {
      const list = this.correlationList();
      if (list) {
        const unlisten = this.renderer2.listen(list.nativeElement, 'mouseleave', () => {
          this.hoveredSegmentPdfJsId.set(null);
          this.mouseWasInList = false;
        });
        onCleanup(() => unlisten());
      }
    });
  }

  protected readonly correlationRows = computed(() => {
    const textSegments = this.textSegmentationService.segments().filter((segment) => !segment.excluded);
    const videoSegments = this.videoSegmentationService.segments();
    const maxLength = Math.max(textSegments.length, videoSegments.length);
    const rows: CorrelationRow[] = [];
    for (let i = 0; i < maxLength; i++) {
      rows.push({
        textSegment: textSegments[i] || null,
        videoSegment: videoSegments[i] || null,
        index: i,
      });
    }
    return rows;
  });

  protected readonly selectedVideoSegment = computed(() => {
    const selectedTextSegment = this.selectedSegmentPdfJsId();
    const correlationRows = this.correlationRows();

    if (selectedTextSegment) {
      const matchingRow = correlationRows.find((row) => row.textSegment?.pdfJsId === selectedTextSegment.pdfJsId);
      if (matchingRow) {
        return matchingRow.videoSegment;
      }
    }
    
    return null;
  });

  /**
   * Concatenates the text of a parent segment and all its linked child segments into a single string. A space is placed
   * between segments unless the previous child text ends with a space-excluded character.
   * 
   * @param segment The parent text segment containing text and linked children.
   * @returns The full joined text of the segment and its linked children.
   */
  protected getFullText(segment: TextSegment): string {
    let fullText = segment.text;
    
    for (const child of segment.linkedChildren) {
      // We do not add a space if the last character of the child text is a space excluded character.
      if (
        child.text.length > 0 &&
        !TextSegmentationService.SPACE_EXCLUDED_CHARACTERS.includes(child.text[child.text.length - 1])
      ) {
        fullText += ' ' + child.text;
      } else {
        fullText += child.text;
      }
    }
    
    return fullText;
  }

  /**
   * Moves a video segment up by one position in the video segments list and restores keyboard focus to the button at
   * the updated index.
   * 
   * @param index The current index of the video segment to move up.
   */
  protected onUpButtonClick(index: number): void {
    this.videoSegmentationService.moveSegmentUp(index);

    afterNextRender(() => {
      const buttonToFocus = this.upButtons()
        .find((button) => button.nativeElement.getAttribute('data-video-index') === (index - 1).toString());
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Moves a video segment down by one position in the video segments list and restores keyboard focus to the button at
   * the updated index.
   * 
   * @param index The current index of the video segment to move down.
   */
  protected onDownButtonClick(index: number): void {
    this.videoSegmentationService.moveSegmentDown(index);

    afterNextRender(() => {
      const buttonToFocus = this.downButtons()
        .find((button) => button.nativeElement.getAttribute('data-video-index') === (index + 1).toString());
      if (buttonToFocus) {
        buttonToFocus.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  /**
   * Handles click events on a text segment button, setting it as the currently selected segment.
   * 
   * @param segment The accessible PDF.js segment data representing the clicked segment.
   */
  protected onSegmentButtonClick(segment: PdfJsAccessibleTextSegment | null): void {
    this.selectedSegmentPdfJsId.set(segment);
  }

  /**
   * Handles double click events on a text segment button, triggering navigation to the corresponding marked content in
   * the PDF viewer.
   * 
   * @param segment The accessible PDF.js segment data representing the double-clicked segment.
   */
  protected onSegmentButtonDoubleClick(segment: PdfJsAccessibleTextSegment | null): void {
    if (segment !== null) {
      this.navigateToMarkedContentInViewer.set(segment);
    }
  }

  /**
   * Scrolls the corresponding text segment button in the correlation list into view when navigated from the PDF viewer.
   * 
   * @param markedContent The accessible PDF.js segment data to scroll into view.
   */
  protected onNavigateToMarkedContent(markedContent: PdfJsAccessibleTextSegment): void {
    this.segmentTextButtons().forEach((item) => {
      if (item.nativeElement.getAttribute('data-segment-id') === markedContent.pdfJsId) {
        item.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /**
   * Determines which segment button is currently under the mouse cursor based on mouse coordinates and updates the
   * hovered segment state.
   */
  private hoverFromMousePosition(): void {
    const hoveredElement = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;
      
    if (hoveredElement) {
      const button = hoveredElement.closest('button.segment-text-button') as HTMLElement | null;
      if (button) {
        const pdfJsId = button.getAttribute('data-segment-id');
        const page = button.getAttribute('data-segment-page');
        if (pdfJsId && page) {
          this.hoveredSegmentPdfJsId.set({ pdfJsId, page: parseInt(page, 10) });
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.unlisteners.forEach((unlisten) => unlisten());
  }
}
