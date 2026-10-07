import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Viewer } from './viewer';
import { MediaFiles, type MediaFileId } from '../../../services/media-files/media-files';
import { TextSegmentationService, type TextSegment } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService, type VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { InfoCard } from '../info-card/info-card';
import { VideoPlayer } from '../video-player/video-player';
import { PdfViewer } from '../pdf-viewer/pdf-viewer';

describe('Viewer', () => {
  let component: Viewer;
  let fixture: ComponentFixture<Viewer>;
  let mediaFilesService: MediaFiles;
  let textSegmentationService: TextSegmentationService;
  let videoSegmentationService: VideoSegmentationService;

  const mockTextSegment1: TextSegment = {
    sequentialId: 0,
    pdfJsId: 'pdfjs-0',
    page: 1,
    text: 'Primeiro segmento',
    excluded: false,
    linkedChildren: [],
  };

  const mockTextSegment2: TextSegment = {
    sequentialId: 1,
    pdfJsId: 'pdfjs-1',
    page: 1,
    text: 'Segundo segmento',
    excluded: false,
    linkedChildren: [],
  };

  const mockVideoSegment1: VideoSegment = {
    fileId: 'media-1' as MediaFileId,
    name: 'Vídeo 1',
    startTime: 0,
    endTime: 10,
    thumbnail: null,
  };

  const mockVideoSegment2: VideoSegment = {
    fileId: 'media-1' as MediaFileId,
    name: 'Vídeo 2',
    startTime: 10,
    endTime: 20,
    thumbnail: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viewer],
    }).compileComponents();

    fixture = TestBed.createComponent(Viewer);
    component = fixture.componentInstance;
    mediaFilesService = TestBed.inject(MediaFiles);
    textSegmentationService = TestBed.inject(TextSegmentationService);
    videoSegmentationService = TestBed.inject(VideoSegmentationService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display warning card when video segments are empty', () => {
    videoSegmentationService.segments.set([]);
    textSegmentationService.segments.set([mockTextSegment1]);
    fixture.detectChanges();

    const infoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const videoWarning = infoCards.find((card) => card.componentInstance.message() === 'Não há segmentos de vídeo.');
    expect(videoWarning).toBeTruthy();
    expect(videoWarning?.componentInstance.type()).toBe('warning');
  });

  it('should display warning card when text segments are empty', () => {
    videoSegmentationService.segments.set([mockVideoSegment1]);
    textSegmentationService.segments.set([]);
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    fixture.detectChanges();

    const infoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const textWarning = infoCards.find((card) => card.componentInstance.message() === 'Não há segmentos de texto.');
    expect(textWarning).toBeTruthy();
    expect(textWarning?.componentInstance.type()).toBe('warning');
  });

  it('should display error card when text record is invalid', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'invalid', url: null });
    fixture.detectChanges();

    const infoCards = fixture.debugElement.queryAll(By.directive(InfoCard));
    const textError = infoCards.find((card) => card.componentInstance.message() === 'Registro de texto inválido.');
    expect(textError).toBeTruthy();
    expect(textError?.componentInstance.type()).toBe('error');
  });

  it('should render video player, segments list, and pdf viewer when data is present', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    textSegmentationService.segments.set([mockTextSegment1, mockTextSegment2]);
    videoSegmentationService.segments.set([mockVideoSegment1, mockVideoSegment2]);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(VideoPlayer))).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(PdfViewer))).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.viewer-segments-list')).toBeTruthy();
  });

  it('should concatenate full text with linked children in getFullText', () => {
    const child: TextSegment = {
      sequentialId: 2,
      pdfJsId: 'pdfjs-child',
      page: 1,
      text: 'continuação',
      excluded: false,
      linkedChildren: [],
    };
    const parent: TextSegment = {
      ...mockTextSegment1,
      linkedChildren: [child],
    };

    expect(component['getFullText'](parent)).toBe('Primeiro segmento continuação');
  });

  it('should select first text segment automatically when available', async () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    textSegmentationService.segments.set([mockTextSegment1, mockTextSegment2]);
    videoSegmentationService.segments.set([mockVideoSegment1, mockVideoSegment2]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['selectedSegmentPdfJsId']()).toEqual({
      pdfJsId: mockTextSegment1.pdfJsId,
      page: mockTextSegment1.page,
    });
    expect(component['selectedVideoSegment']()).toEqual(mockVideoSegment1);
  });

  it('should update selectedSegmentPdfJsId and video segment on segment button click', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    textSegmentationService.segments.set([mockTextSegment1, mockTextSegment2]);
    videoSegmentationService.segments.set([mockVideoSegment1, mockVideoSegment2]);
    fixture.detectChanges();

    component['onSegmentClick'](mockTextSegment2);
    fixture.detectChanges();

    expect(component['selectedSegmentPdfJsId']()).toEqual({
      pdfJsId: mockTextSegment2.pdfJsId,
      page: mockTextSegment2.page,
    });
    expect(component['selectedVideoSegment']()).toEqual(mockVideoSegment2);
  });

  it('should NOT change selectedVideoSegment when hovering over phrases', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    textSegmentationService.segments.set([mockTextSegment1, mockTextSegment2]);
    videoSegmentationService.segments.set([mockVideoSegment1, mockVideoSegment2]);
    fixture.detectChanges();

    component['onSegmentClick'](mockTextSegment1);
    fixture.detectChanges();
    expect(component['selectedVideoSegment']()).toEqual(mockVideoSegment1);

    component['hoveredSegmentPdfJsId'].set({
      pdfJsId: mockTextSegment2.pdfJsId,
      page: mockTextSegment2.page,
    });
    fixture.detectChanges();

    expect(component['selectedVideoSegment']()).toEqual(mockVideoSegment1);
    expect(component['selectedSegmentPdfJsId']()?.pdfJsId).toBe(mockTextSegment1.pdfJsId);
  });

  it('should navigate to marked content on segment button double click', () => {
    component['onSegmentDoubleClick'](mockTextSegment2);

    expect(component['navigateToMarkedContentInViewer']()).toEqual({
      pdfJsId: mockTextSegment2.pdfJsId,
      page: mockTextSegment2.page,
    });
  });

  it('should scroll corresponding button into view on navigateToMarkedContent', () => {
    mediaFilesService.textRecord.set({ file: null, type: 'application/pdf', url: 'blob:test' });
    textSegmentationService.segments.set([mockTextSegment1, mockTextSegment2]);
    videoSegmentationService.segments.set([mockVideoSegment1, mockVideoSegment2]);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.viewer-segment-button');
    expect(buttons.length).toBe(2);

    const scrollIntoViewSpy = vi.fn();
    buttons[1].scrollIntoView = scrollIntoViewSpy;

    component['onNavigateToMarkedContent']({
      pdfJsId: mockTextSegment2.pdfJsId,
      page: mockTextSegment2.page,
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });
});
