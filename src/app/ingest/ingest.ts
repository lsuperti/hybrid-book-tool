import { Component, inject, Renderer2, afterNextRender, viewChild, ElementRef, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { HorizontalSplit } from '../layout/horizontal-split/horizontal-split';
import { MediaFiles } from './media-files';

@Component({
  selector: 'app-ingest',
  imports: [HorizontalSplit],
  templateUrl: './ingest.html',
  styleUrl: './ingest.scss',
})
export class Ingest {
  protected readonly mediaFilesService = inject(MediaFiles);
  private readonly renderer2 = inject(Renderer2);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly mediaFiles = this.mediaFilesService.mediaFiles;
  private readonly unlisteners: (() => void)[] = [];
  private readonly mediaFilesUploadArea = viewChild.required<ElementRef<HTMLDivElement>>('mediaFilesUploadArea');
  private readonly mediaFilesUploadLink = viewChild.required<ElementRef<HTMLAnchorElement>>('mediaFilesUploadLink');
  protected readonly draggingOverMediaFilesUploadArea = signal(false);
  protected readonly textRecordUploadArea = viewChild.required<ElementRef<HTMLDivElement>>('textRecordUploadArea');
  private readonly textRecordUploadLink = viewChild.required<ElementRef<HTMLAnchorElement>>('textRecordUploadLink');
  protected readonly draggingOverTextRecordUploadArea = signal(false);

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
            this.mediaFilesService.setTextRecord(textRecordFile);
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
  }

  ngOnDestroy() {
    this.unlisteners.forEach(unlisten => unlisten());
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
    this.mediaFilesService.removeMediaFile(mediaFileId);
  }

  protected onTextRecordFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (inputElement.files && inputElement.files.length > 0) {
      const selectedFiles = Array.from(inputElement.files);
      // Handle only the first file for the text record, as we expect a single text record file
      const textRecordFile = selectedFiles[0];
      this.mediaFilesService.setTextRecord(textRecordFile);
      inputElement.value = '';
    }
  }
}
