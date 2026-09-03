import {
  Component,
  inject,
  afterNextRender,
  viewChildren,
  ElementRef,
  signal,
  input,
  Injector,
  effect
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Split } from '../../layout/split/split';
import { InfoCard } from '../../common/info-card/info-card';
import { MediaFiles } from '../../../services/media-files/media-files';
import { PdfViewerFrame } from '../../common/pdf-viewer/pdf-viewer-frame';
import { PDFNotificationService, PDFPageProxy, TextContent, type IPDFViewerApplication } from 'ngx-extended-pdf-viewer';
import { TextSegmentationService } from '../../../services/text-segmentation/text-segmentation';

@Component({
  selector: 'app-ingest',
  imports: [Split, InfoCard, PdfViewerFrame, NgTemplateOutlet],
  templateUrl: './ingest.html',
  styleUrl: './ingest.scss',
})
export class Ingest {
  protected readonly mediaFilesService = inject(MediaFiles);
  private readonly injector = inject(Injector);
  private readonly pdfNotificationService = inject(PDFNotificationService);
  private readonly textSegmentationService = inject(TextSegmentationService);

  public readonly visible = input.required<boolean>();

  protected readonly draggingOverMediaFilesUploadArea = signal(false);
  protected readonly draggingOverTextRecordUploadArea = signal(false);
  private readonly removeMediaFileButton = viewChildren<ElementRef<HTMLButtonElement>>('removeMediaFileButton');

  protected readonly mediaFiles = this.mediaFilesService.mediaFiles;
  protected readonly textRecord = this.mediaFilesService.textRecord;

  private PDFViewerApplication?: IPDFViewerApplication;

  constructor() {
    effect(() => {
      this.PDFViewerApplication = this.pdfNotificationService.onPDFJSInitSignal();
    });
  }

  /**
   * Handles dragenter events on the media files upload area.
   *
   * @param event The drag event.
   */
  protected onMediaFilesDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverMediaFilesUploadArea.set(true);
  }

  /**
   * Handles dragover events on the media files upload area.
   *
   * @param event The drag event.
   */
  protected onMediaFilesDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverMediaFilesUploadArea.set(true);
  }

  /**
   * Handles dragleave events on the media files upload area.
   *
   * @param event The drag event.
   */
  protected onMediaFilesDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverMediaFilesUploadArea.set(false);
  }

  /**
   * Handles drop events on the media files upload area.
   *
   * @param event The drag event containing dropped files.
   */
  protected onMediaFilesDrop(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverMediaFilesUploadArea.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(event.dataTransfer.files);
      this.mediaFilesService.addMediaFiles(droppedFiles);
    }
  }

  /**
   * Handles dragenter events on the text record upload area.
   *
   * @param event The drag event.
   */
  protected onTextRecordDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverTextRecordUploadArea.set(true);
  }

  /**
   * Handles dragover events on the text record upload area.
   *
   * @param event The drag event.
   */
  protected onTextRecordDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverTextRecordUploadArea.set(true);
  }

  /**
   * Handles dragleave events on the text record upload area.
   *
   * @param event The drag event.
   */
  protected onTextRecordDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverTextRecordUploadArea.set(false);
  }

  /**
   * Handles drop events on the text record upload area.
   *
   * @param event The drag event containing dropped files.
   */
  protected onTextRecordDrop(event: DragEvent): void {
    event.preventDefault();
    this.draggingOverTextRecordUploadArea.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(event.dataTransfer.files);
      
      // Handle only the first file for the text record, as we expect a single text record file.
      const textRecordFile = droppedFiles[0];
      this.setTextRecord(textRecordFile);
    }
  }

  /**
   * Handles media file selection from the file input element.
   *
   * @param event The change event from the file input element.
   */
  protected onMediaFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;

    if (inputElement.files && inputElement.files.length > 0) {
      const selectedFiles = Array.from(inputElement.files);
      this.mediaFilesService.addMediaFiles(selectedFiles);
      inputElement.value = '';
    }
  }

  /**
   * Removes a media file by its ID and manages accessibility focus for remaining delete buttons.
   *
   * @param mediaFileId The unique ID of the media file to remove.
   */
  protected removeMediaFile(mediaFileId: string): void {
    let mediaFileToRefocus: string | null = null;
    const removedMediaFileIndex = this.mediaFiles().findIndex((mediaFile) => mediaFile.id === mediaFileId);

    if (removedMediaFileIndex !== -1) {
      // If the removed media file is not the last one, focus on the next media file in the list.
      if (removedMediaFileIndex < this.mediaFiles().length - 1) {
        mediaFileToRefocus = this.mediaFiles()[removedMediaFileIndex + 1].id;
      } else {
        // If the removed media file is the last one, focus on the previous media file in the list, if it wasn't the
        // only one.
        if (removedMediaFileIndex > 0) {
          mediaFileToRefocus = this.mediaFiles()[removedMediaFileIndex - 1].id;
        }
      }
    }

    if (mediaFileToRefocus) {
      afterNextRender(() => {
        const buttonToFocus = this.removeMediaFileButton()
          .find((button) => button.nativeElement.getAttribute('data-media-file-id') === mediaFileToRefocus);

        if (buttonToFocus) {
          buttonToFocus.nativeElement.focus();
        }
      }, { injector: this.injector });
    }

    this.mediaFilesService.removeMediaFile(mediaFileId);
  }

  /**
   * Handles text record file selection from the file input element.
   *
   * @param event The change event from the file input element.
   */
  protected onTextRecordFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (inputElement.files && inputElement.files.length > 0) {
      const selectedFiles = Array.from(inputElement.files);
      
      // Handle only the first file for the text record, as we expect a single text record file.
      const textRecordFile = selectedFiles[0];
      inputElement.value = '';

      this.setTextRecord(textRecordFile);
    }
  }

  /**
   * Extracts text content from all pages of the loaded PDF and starts the text segmentation process.
   */
  protected async onPagesLoaded(): Promise<void> {
    const pdfInstance = this.PDFViewerApplication?.pdfDocument;
    const content: TextContent[] = new Array(pdfInstance?.numPages || 0).fill(null);

    await Promise.all(
      Array.from({ length: pdfInstance?.numPages || 0 }, (_, index) => index + 1).map(async (pageNumber) => {
        const page: PDFPageProxy | undefined = await pdfInstance?.getPage(pageNumber);
        const textContent: TextContent | undefined =
          await page?.getTextContent({ disableCombineTextItems: false, includeMarkedContent: true });

        if (textContent) {
          content[pageNumber - 1] = textContent;
        }
      })
    );

    this.textSegmentationService.segmentText(content);
  }

  /**
   * Sets the text record file on the media files service and notifies the text segmentation service
   * if the file is a PDF.
   *
   * @param textRecordFile The selected text record file, or null to clear it.
   */
  private setTextRecord(textRecordFile: File | null): void {
    this.mediaFilesService.setTextRecord(textRecordFile);

    if (this.mediaFilesService.textRecord()?.type === 'application/pdf') {
      // Notify the text segmentation service that work is upcoming, so it can set its status to 'loading'. When the
      // pages load the onPagesLoaded method will start the text segmentation handled by the text segmentation service.
      this.textSegmentationService.workUpcoming();
    }
  }
}
