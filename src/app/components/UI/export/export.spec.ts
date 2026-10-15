import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Export } from './export';
import { ExportService } from '../../../services/export/export';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { type MediaFileId } from '../../../services/media-files/media-files';

describe('Export', () => {
  let component: Export;
  let fixture: ComponentFixture<Export>;
  let exportService: ExportService;
  let textSegmentationService: TextSegmentationService;
  let videoSegmentationService: VideoSegmentationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Export],
      providers: [
        {
          provide: ExportService,
          useValue: {
            exportBook: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Export);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    exportService = TestBed.inject(ExportService);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    videoSegmentationService = TestBed.inject(VideoSegmentationService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the split layout and export button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-split')).toBeTruthy();
    expect(compiled.querySelector('.export-submit-button')).toBeTruthy();
    expect(compiled.querySelector('.preview-container')).toBeTruthy();
  });

  it('should render metadata form fields and subaltern original book section', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#field-title')).toBeTruthy();
    expect(compiled.querySelector('.subaltern-fieldset')).toBeTruthy();
    expect(compiled.querySelector('#field-orig-title')).toBeTruthy();
  });

  it('should call ExportService on export button click and show success message', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');
    expect(button).toBeTruthy();

    button?.click();
    await fixture.whenStable();

    expect(exportService.exportBook).toHaveBeenCalled();

    fixture.detectChanges();
    const successAlert = compiled.querySelector('.export-alert-success');
    expect(successAlert).toBeTruthy();
    expect(successAlert?.textContent).toContain('Livro híbrido exportado com sucesso!');
  });

  it('should show error message when export fails', async () => {
    vi.mocked(exportService.exportBook).mockRejectedValueOnce(
      new Error('Erro de teste ao exportar')
    );

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');

    button?.click();
    await fixture.whenStable();

    fixture.detectChanges();
    const errorAlert = compiled.querySelector('.export-alert-error');
    expect(errorAlert).toBeTruthy();
    expect(errorAlert?.textContent).toContain('Erro de teste ao exportar');
  });

  it('should pass onProgress callback to ExportService and render progress state', async () => {
    let capturedCallback: ((ratio: number) => void) | undefined;
    vi.mocked(exportService.exportBook).mockImplementation(async (_meta, onProgress) => {
      capturedCallback = onProgress;
      if (onProgress) {
        onProgress(0.5);
      }
      return new Blob(['zip'], { type: 'application/zip' });
    });

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');

    button?.click();
    await fixture.whenStable();

    expect(capturedCallback).toBeDefined();
  });

  describe('Segment Mismatch Warning Banner', () => {
    it('should not display mismatch warning banner when counts are equal or empty', () => {
      textSegmentationService.segments.set([]);
      videoSegmentationService.segments.set([]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.segment-mismatch-banner')).toBeNull();
      expect(component['hasSegmentMismatch']()).toBe(false);
    });

    it('should display warning banner when text segments count differs from video segments count', () => {
      const mockTextSegments: TextSegment[] = [
        { sequentialId: 0, pdfJsId: 'text-1', page: 1, text: 'Text 1', excluded: false, linkedChildren: [] },
        { sequentialId: 1, pdfJsId: 'text-2', page: 1, text: 'Text 2', excluded: false, linkedChildren: [] },
        { sequentialId: 2, pdfJsId: 'text-3', page: 1, text: 'Text 3', excluded: false, linkedChildren: [] },
      ];
      const mockVideoSegments: VideoSegment[] = [
        { fileId: 'vid-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 5, thumbnail: null },
      ];

      textSegmentationService.segments.set(mockTextSegments);
      videoSegmentationService.segments.set(mockVideoSegments);
      fixture.detectChanges();

      expect(component['hasSegmentMismatch']()).toBe(true);
      expect(component['alignedSegmentsCount']()).toBe(1);

      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector('.segment-mismatch-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('3 segmentos de texto');
      expect(banner?.textContent).toContain('1 segmento de vídeo');
      expect(banner?.textContent).toContain('Apenas o primeiro segmento alinhado será exportado.');
    });

    it('should display warning banner with singular text and plural video segments', () => {
      const mockTextSegments: TextSegment[] = [
        { sequentialId: 0, pdfJsId: 'text-1', page: 1, text: 'Text 1', excluded: false, linkedChildren: [] },
      ];
      const mockVideoSegments: VideoSegment[] = [
        { fileId: 'vid-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 5, thumbnail: null },
        { fileId: 'vid-2' as MediaFileId, name: 'Video 2', startTime: 5, endTime: 10, thumbnail: null },
        { fileId: 'vid-3' as MediaFileId, name: 'Video 3', startTime: 10, endTime: 15, thumbnail: null },
      ];

      textSegmentationService.segments.set(mockTextSegments);
      videoSegmentationService.segments.set(mockVideoSegments);
      fixture.detectChanges();

      expect(component['hasSegmentMismatch']()).toBe(true);
      expect(component['alignedSegmentsCount']()).toBe(1);

      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector('.segment-mismatch-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('1 segmento de texto');
      expect(banner?.textContent).toContain('3 segmentos de vídeo');
      expect(banner?.textContent).toContain('Apenas o primeiro segmento alinhado será exportado.');
    });

    it('should display warning banner with plural aligned segments text when aligned count is greater than 1', () => {
      const mockTextSegments: TextSegment[] = [
        { sequentialId: 0, pdfJsId: 'text-1', page: 1, text: 'Text 1', excluded: false, linkedChildren: [] },
        { sequentialId: 1, pdfJsId: 'text-2', page: 1, text: 'Text 2', excluded: false, linkedChildren: [] },
        { sequentialId: 2, pdfJsId: 'text-3', page: 1, text: 'Text 3', excluded: false, linkedChildren: [] },
      ];
      const mockVideoSegments: VideoSegment[] = [
        { fileId: 'vid-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 5, thumbnail: null },
        { fileId: 'vid-2' as MediaFileId, name: 'Video 2', startTime: 5, endTime: 10, thumbnail: null },
      ];

      textSegmentationService.segments.set(mockTextSegments);
      videoSegmentationService.segments.set(mockVideoSegments);
      fixture.detectChanges();

      expect(component['hasSegmentMismatch']()).toBe(true);
      expect(component['alignedSegmentsCount']()).toBe(2);

      const compiled = fixture.nativeElement as HTMLElement;
      const banner = compiled.querySelector('.segment-mismatch-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('3 segmentos de texto');
      expect(banner?.textContent).toContain('2 segmentos de vídeo');
      expect(banner?.textContent).toContain('Apenas os primeiros 2 segmentos alinhados serão exportados.');
    });

    it('should exclude excluded text segments when calculating mismatch', () => {
      const mockTextSegments: TextSegment[] = [
        { sequentialId: 0, pdfJsId: 'text-1', page: 1, text: 'Text 1', excluded: false, linkedChildren: [] },
        { sequentialId: 1, pdfJsId: 'text-2', page: 1, text: 'Text 2', excluded: true, linkedChildren: [] },
      ];
      const mockVideoSegments: VideoSegment[] = [
        { fileId: 'vid-1' as MediaFileId, name: 'Video 1', startTime: 0, endTime: 5, thumbnail: null },
      ];

      textSegmentationService.segments.set(mockTextSegments);
      videoSegmentationService.segments.set(mockVideoSegments);
      fixture.detectChanges();

      // Only 1 active text segment and 1 video segment -> counts match, no banner
      expect(component['hasSegmentMismatch']()).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.segment-mismatch-banner')).toBeNull();
    });
  });
});
