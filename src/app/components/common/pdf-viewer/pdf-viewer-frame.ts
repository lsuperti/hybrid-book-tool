import { ChangeDetectionStrategy, Component, inject, input, output, signal, PLATFORM_ID, Renderer2, OnDestroy } from '@angular/core';
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
export class PdfViewerFrame implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer = inject(Renderer2);
  
  public readonly src = input.required<string>();
  public readonly name = input.required<string>();
  public readonly pagesLoaded = output<PagesLoadedEvent>();

  protected readonly isBrowser = isPlatformBrowser(this.platformId);
  protected readonly page = signal<number>(1);
  private readonly unlisteners: (() => void)[] = [];

  constructor() {
    if (this.isBrowser) {
      this.unlisteners.push(
        this.renderer.listen('window', 'message', (event: MessageEvent) => {
          if (event.source !== window.parent) {
            return;
          }
          
          if (event.data?.type === 'pdf-viewer-jump-to-page') {
            this.page.set(event.data.pageNumber);
          }
        })
      );
    }
  }

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

  ngOnDestroy(): void {
    this.unlisteners.forEach(unlisten => unlisten());
  }
}
