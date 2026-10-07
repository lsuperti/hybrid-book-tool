import {
  Component,
  inject,
  input,
  computed,
  signal,
  viewChildren,
  viewChild,
  ElementRef,
  Renderer2,
  OnDestroy,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Split } from '../../layout/split/split';
import { InfoCard } from '../info-card/info-card';
import { VideoPlayer } from '../video-player/video-player';
import { PdfViewer } from '../pdf-viewer/pdf-viewer';
import { MediaFiles } from '../../../services/media-files/media-files';
import {
  TextSegmentationService,
  type TextSegment,
  type PdfJsAccessibleTextSegment,
} from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService } from '../../../services/video-segmentation/video-segmentation';

/**
 * Consolidated viewer for the hybrid book preview, showing synchronized multimedia playback,
 * phrase-based text navigation, and accessible PDF text records.
 */
@Component({
  selector: 'app-viewer',
  imports: [CommonModule, Split, InfoCard, VideoPlayer, PdfViewer],
  templateUrl: './viewer.html',
  styleUrl: './viewer.scss',
})
export class Viewer implements OnDestroy {
  protected readonly mediaFilesService = inject(MediaFiles);
  protected readonly textSegmentationService = inject(TextSegmentationService);
  protected readonly videoSegmentationService = inject(VideoSegmentationService);
  private readonly renderer2 = inject(Renderer2);

  public readonly visible = input<boolean>(true);

  protected readonly hoveredSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly selectedSegmentPdfJsId = signal<PdfJsAccessibleTextSegment | null>(null);
  protected readonly navigateToMarkedContentInViewer = signal<PdfJsAccessibleTextSegment | null>(null);

  private readonly segmentButtons = viewChildren<ElementRef<HTMLButtonElement>>('segmentButton');
  private readonly segmentsList = viewChild<ElementRef<HTMLOListElement>>('segmentsList');

  private readonly unlisteners: (() => void)[] = [];
  private mouseWasInList = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor() {
    this.unlisteners.push(
      this.renderer2.listen('document', 'mousemove', (event: MouseEvent) => {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;

        this.hoverFromMousePosition();

        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const isInList = hoveredElement?.closest('.viewer-segment-button') !== null;

        if (!isInList && this.mouseWasInList) {
          this.hoveredSegmentPdfJsId.set(null);
        }

        this.mouseWasInList = isInList;
      })
    );

    this.unlisteners.push(
      this.renderer2.listen('document', 'focusin', (event: FocusEvent) => {
        const target = event.target as HTMLElement | null;
        if (target) {
          const item = target.closest('.viewer-segment-item');
          if (item) {
            const button = item.querySelector('.viewer-segment-button');
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
      })
    );

    this.unlisteners.push(
      this.renderer2.listen('document', 'focusout', (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget as HTMLElement | null;
        if (!relatedTarget) {
          this.hoveredSegmentPdfJsId.set(null);
        }
      })
    );

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

      // Automatically select the first non-excluded text segment when available and nothing is selected.
      const segments = this.textSegments();
      const currentSelected = untracked(() => this.selectedSegmentPdfJsId());

      if (segments.length === 0) {
        if (currentSelected !== null) {
          this.selectedSegmentPdfJsId.set(null);
        }
      } else if (
        currentSelected === null ||
        !segments.some((s) => s.pdfJsId === currentSelected.pdfJsId)
      ) {
        this.selectedSegmentPdfJsId.set({ pdfJsId: segments[0].pdfJsId, page: segments[0].page });
      }
    });

    effect((onCleanup) => {
      const list = this.segmentsList();
      if (list) {
        const unlisten = this.renderer2.listen(list.nativeElement, 'mouseleave', () => {
          this.hoveredSegmentPdfJsId.set(null);
          this.mouseWasInList = false;
        });
        onCleanup(() => unlisten());
      }
    });

    effect(() => {
      const selected = this.selectedSegmentPdfJsId();
      if (selected) {
        const buttons = this.segmentButtons();
        const button = buttons.find((b) => b.nativeElement.getAttribute('data-segment-id') === selected.pdfJsId);
        if (button && typeof button.nativeElement.scrollIntoView === 'function') {
          button.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }

  /**
   * Filtered non-excluded text segments representing individual phrases in the hybrid book.
   */
  protected readonly textSegments = computed(() => {
    return this.textSegmentationService.segments().filter((segment) => !segment.excluded);
  });

  /**
   * Correlated video segment matching the currently selected text segment index.
   */
  protected readonly selectedVideoSegment = computed(() => {
    const selected = this.selectedSegmentPdfJsId();
    if (!selected) {
      return null;
    }

    const segments = this.textSegments();
    const videoSegments = this.videoSegmentationService.correlatedSegments();
    const index = segments.findIndex((seg) => seg.pdfJsId === selected.pdfJsId);

    if (index >= 0 && index < videoSegments.length) {
      return videoSegments[index];
    }

    return null;
  });

  /**
   * Concatenates the text of a parent segment and all its linked child segments into a single string.
   *
   * @param segment The parent text segment containing text and linked children.
   * @returns The full joined text of the segment and its linked children.
   */
  protected getFullText(segment: TextSegment): string {
    let fullText = segment.text;

    for (const child of segment.linkedChildren) {
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
   * Handles click events on a text segment button, setting it as the currently selected segment.
   *
   * @param segment The accessible PDF.js segment data representing the clicked segment.
   */
  protected onSegmentClick(segment: TextSegment): void {
    this.selectedSegmentPdfJsId.set({ pdfJsId: segment.pdfJsId, page: segment.page });
  }

  /**
   * Handles double click events on a text segment button, navigating to the corresponding marked content
   * in the PDF viewer.
   *
   * @param segment The accessible PDF.js segment data representing the double-clicked segment.
   */
  protected onSegmentDoubleClick(segment: TextSegment): void {
    this.selectedSegmentPdfJsId.set({ pdfJsId: segment.pdfJsId, page: segment.page });
    this.navigateToMarkedContentInViewer.set({ pdfJsId: segment.pdfJsId, page: segment.page });
  }

  /**
   * Scrolls the corresponding text segment button into view when navigated from the PDF viewer.
   *
   * @param markedContent The accessible PDF.js segment data to scroll into view.
   */
  protected onNavigateToMarkedContent(markedContent: PdfJsAccessibleTextSegment): void {
    this.segmentButtons().forEach((item) => {
      if (item.nativeElement.getAttribute('data-segment-id') === markedContent.pdfJsId) {
        if (typeof item.nativeElement.scrollIntoView === 'function') {
          item.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  /**
   * Determines which segment button is currently under the mouse cursor based on mouse coordinates
   * and updates the hovered segment state.
   */
  private hoverFromMousePosition(): void {
    const hoveredElement = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;

    if (hoveredElement) {
      const button = hoveredElement.closest('button.viewer-segment-button') as HTMLElement | null;
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
