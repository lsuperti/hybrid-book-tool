import { Component, inject, Renderer2, afterNextRender, viewChild, viewChildren, ElementRef, signal, input, Injector, effect, OnDestroy } from '@angular/core';
import { HorizontalSplit } from '../../layout/horizontal-split/horizontal-split';
import { VerticalSplit } from "../../layout/vertical-split/vertical-split";
import { WarningCard } from '../../common/warning-card/warning-card';
import { MediaFiles } from '../../../services/media-files/media-files';
import { PdfViewerFrame } from '../../common/pdf-viewer/pdf-viewer-frame';
import { PDFNotificationService, PDFPageProxy, TextContent, type IPDFViewerApplication } from 'ngx-extended-pdf-viewer'
import { TextSegmentationService } from '../../../services/text-segmentation/text-segmentation';

@Component({
  selector: 'app-ingest',
  imports: [HorizontalSplit, VerticalSplit, WarningCard, PdfViewerFrame],
  templateUrl: './ingest.html',
  styleUrl: './ingest.scss',
})
export class Ingest implements OnDestroy {
  protected readonly mediaFilesService = inject(MediaFiles);
  private readonly renderer2 = inject(Renderer2);
  private readonly injector = inject(Injector);
  private readonly pdfNotificationService = inject(PDFNotificationService);
  private readonly textSegmentationService = inject(TextSegmentationService);
  
  public readonly visible = input.required<boolean>();
  private readonly mediaFilesUploadArea = viewChild.required<ElementRef<HTMLDivElement>>('mediaFilesUploadArea');
  private readonly mediaFilesUploadLink = viewChild.required<ElementRef<HTMLAnchorElement>>('mediaFilesUploadLink');
  protected readonly draggingOverMediaFilesUploadArea = signal(false);
  protected readonly textRecordUploadArea = viewChild.required<ElementRef<HTMLDivElement>>('textRecordUploadArea');
  private readonly textRecordUploadLink = viewChild.required<ElementRef<HTMLAnchorElement>>('textRecordUploadLink');
  protected readonly draggingOverTextRecordUploadArea = signal(false);
  private readonly removeMediaFileButton = viewChildren<ElementRef<HTMLButtonElement>>('removeMediaFileButton');
  
  protected readonly mediaFiles = this.mediaFilesService.mediaFiles;
  private readonly unlisteners: (() => void)[] = [];
  
  private PDFViewerApplication?: IPDFViewerApplication;

  constructor() {
    afterNextRender(() => {
      const dropArea = this.mediaFilesUploadArea().nativeElement;
      if (dropArea) {
        this.unlisteners.push(this.renderer2.listen(dropArea, 'dragenter', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverMediaFilesUploadArea.set(true);
        }));

        this.unlisteners.push(this.renderer2.listen(dropArea, 'dragover', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverMediaFilesUploadArea.set(true);
        }));

        this.unlisteners.push(this.renderer2.listen(dropArea, 'dragleave', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverMediaFilesUploadArea.set(false);
        }));

        this.unlisteners.push(this.renderer2.listen(dropArea, 'drop', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverMediaFilesUploadArea.set(false);
          if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(event.dataTransfer.files);
            this.mediaFilesService.addMediaFiles(droppedFiles);
          }
        }));
      }

      const textRecordDropArea = this.textRecordUploadArea().nativeElement;
      if (textRecordDropArea) {
        this.unlisteners.push(this.renderer2.listen(textRecordDropArea, 'dragenter', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverTextRecordUploadArea.set(true);
        }));

        this.unlisteners.push(this.renderer2.listen(textRecordDropArea, 'dragover', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverTextRecordUploadArea.set(true);
        }));

        this.unlisteners.push(this.renderer2.listen(textRecordDropArea, 'dragleave', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverTextRecordUploadArea.set(false);
        }));

        this.unlisteners.push(this.renderer2.listen(textRecordDropArea, 'drop', (event: DragEvent) => {
          event.preventDefault();
          this.draggingOverTextRecordUploadArea.set(false);
          if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(event.dataTransfer.files);
            // Handle only the first file for the text record, as we expect a single text record file
            const textRecordFile = droppedFiles[0];
            this.setTextRecord(textRecordFile);
          }
        }));
      }

      // Set up keyboard accessibility for the media files upload link
      const mediaFilesUploadLinkElement = this.mediaFilesUploadLink().nativeElement;
      this.unlisteners.push(this.renderer2.listen(mediaFilesUploadLinkElement, 'keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          mediaFilesUploadLinkElement.click();
        }

      }));

      // Set up keyboard accessibility for the text record upload link
      const textRecordUploadLinkElement = this.textRecordUploadLink().nativeElement;
      this.unlisteners.push(this.renderer2.listen(textRecordUploadLinkElement, 'keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          textRecordUploadLinkElement.click();
        }
      }));

    });
    
    effect(() => {
      this.PDFViewerApplication = this.pdfNotificationService.onPDFJSInitSignal();
    });
  }

  protected onMediaFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    
    if (inputElement.files && inputElement.files.length > 0) {
      const selectedFiles = Array.from(inputElement.files);
      this.mediaFilesService.addMediaFiles(selectedFiles);
      inputElement.value = '';
    }
  }

  protected removeMediaFile(mediaFileId: string): void {
    let mediaFileToRefocus: string | null = null;
    const removedMediaFileIndex = this.mediaFiles().findIndex(mediaFile => mediaFile.id === mediaFileId);
    
    if (removedMediaFileIndex !== -1) {
      // If the removed media file is not the last one, focus on the next media file in the list
      if (removedMediaFileIndex < this.mediaFiles().length - 1) {
        mediaFileToRefocus = this.mediaFiles()[removedMediaFileIndex + 1].id;
      } else {
        // If the removed media file is the last one, focus on the previous media file in the list, if it wasn't the only one
        if (removedMediaFileIndex > 0) {
          mediaFileToRefocus = this.mediaFiles()[removedMediaFileIndex - 1].id;
        }
      }
    }

    if (mediaFileToRefocus) {
      afterNextRender(() => {
        const buttonToFocus = this.removeMediaFileButton().find(button => button.nativeElement.getAttribute('data-media-file-id') === mediaFileToRefocus);
        
        if (buttonToFocus) {
          buttonToFocus.nativeElement.focus();
        }
      }, { injector: this.injector });
    }
    
    this.mediaFilesService.removeMediaFile(mediaFileId);
  }

  protected onTextRecordFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (inputElement.files && inputElement.files.length > 0) {
      const selectedFiles = Array.from(inputElement.files);
      // Handle only the first file for the text record, as we expect a single text record file
      const textRecordFile = selectedFiles[0];
      inputElement.value = '';
      
      this.setTextRecord(textRecordFile);
    }
  }

  protected async onPagesLoaded(): Promise<void> {
    const pdfInstance = this.PDFViewerApplication?.pdfDocument;
    const content: TextContent[] = new Array(pdfInstance?.numPages || 0).fill(null);
    
    await Promise.all(
      Array.from({ length: pdfInstance?.numPages || 0 }, (_, index) => index + 1).map(async (pageNumber) => {
        const page: PDFPageProxy | undefined = await pdfInstance?.getPage(pageNumber);
        const textContent: TextContent | undefined = await page?.getTextContent({ disableCombineTextItems: false, includeMarkedContent: true });
        
        if (textContent) {
          content[pageNumber - 1] = textContent;
        }
      })
    );

    this.textSegmentationService.segmentText(content);
  }

  private setTextRecord(textRecordFile: File | null) {
    this.mediaFilesService.setTextRecord(textRecordFile);

    if (!(this.mediaFilesService.textRecord()?.type !== 'application/pdf')) {
      // Notify the text segmentation service that work is upcoming, so it can set its status to 'loading'. When the the
      // pages load the onPagesLoaded method will start the text segmentation handled by the text segmentation service.
      this.textSegmentationService.workUpcoming();
    }
  }

  ngOnDestroy() {
    this.unlisteners.forEach(unlisten => unlisten());
  }
}
