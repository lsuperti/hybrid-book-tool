import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { PdfViewerFrame } from './pdf-viewer-frame';

@Component({
  selector: 'app-pdf-viewer-route',
  imports: [PdfViewerFrame],
  templateUrl: './pdf-viewer-route.html',
  styleUrl: './pdf-viewer-route.scss',
})
export class PdfViewerRoute {
  private readonly route = inject(ActivatedRoute);

  protected readonly src = toSignal(
    this.route.queryParamMap.pipe(map((queryParams) => queryParams.get('pdf-viewer-src'))),
    { initialValue: null }
  );

  protected readonly name = toSignal(
    this.route.queryParamMap.pipe(map((queryParams) => queryParams.get('pdf-viewer-name'))),
    { initialValue: null }
  );
}
