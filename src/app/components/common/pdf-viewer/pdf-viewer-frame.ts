import { ChangeDetectionStrategy, Component, inject, input, output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgxExtendedPdfViewerModule, type PagesLoadedEvent, type TextLayerRenderedEvent } from 'ngx-extended-pdf-viewer';

@Component({
  selector: 'app-pdf-viewer-frame',
  templateUrl: './pdf-viewer-frame.html',
  styleUrls: ['./pdf-viewer-frame.scss'],
  standalone: true,
  imports: [NgxExtendedPdfViewerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewerFrame {
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly isBrowser = isPlatformBrowser(this.platformId);

  public readonly src = input.required<string>();
  public readonly name = input.required<string>();
  public readonly pagesLoaded = output<PagesLoadedEvent>();

  // These methods are called when the viewer informs about its lifecycle. They send a messages to the parent window
  // about that. Since the viewer is never loaded in the server, this method will only be called in the browser. So we
  // don't need to check for the platform here.
  protected onPagesLoaded(event: PagesLoadedEvent): void {
    this.pagesLoaded.emit(event);

    window.parent.postMessage({
      type: 'pdf-viewer-pages-loaded',
      name: this.name(),
      pagesCount: event.pagesCount,
    }, document.location.origin);
  }
  
  protected onTextLayerRendered(event: TextLayerRenderedEvent): void {
    window.parent.postMessage({
      type: 'pdf-viewer-text-layer-rendered',
      name: this.name(),
      pageNumber: event.pageNumber,
    }, document.location.origin);
  }
}
