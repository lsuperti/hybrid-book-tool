import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import * as mediabunny from 'mediabunny';
import { VideoSegmentation } from './video-segmentation';
import { MediaFiles, MediaFile, MediaFileId } from '../../../services/media-files/media-files';
import { VideoSegmentationService, VideoSegment } from '../../../services/video-segmentation/video-segmentation';
import { Thumbnail } from '../../../services/thumbnail/thumbnail';

describe('VideoSegmentation', () => {
  let component: VideoSegmentation;
  let fixture: ComponentFixture<VideoSegmentation>;

  let mockMediaFiles: { mediaFiles: ReturnType<typeof signal<MediaFile[]>> };
  let mockVideoSegmentationService: {
    segments: ReturnType<typeof signal<VideoSegment[]>>,
    getFileDuration: ReturnType<typeof vi.fn>,
    getFileFps: ReturnType<typeof vi.fn>,
    splitSegment: ReturnType<typeof vi.fn>,
    deleteSegment: ReturnType<typeof vi.fn>,
    updateSegmentStart: ReturnType<typeof vi.fn>,
    updateSegmentEnd: ReturnType<typeof vi.fn>,
    formatTimestamp: ReturnType<typeof vi.fn>,
    findSegmentAtTime: ReturnType<typeof vi.fn>,
    canSplitSegment: ReturnType<typeof vi.fn>,
    canCreateSegmentInGap: ReturnType<typeof vi.fn>,
    canJoinSegments: ReturnType<typeof vi.fn>,
    joinSegments: ReturnType<typeof vi.fn>,
  };
  let mockThumbnail: {
    generateFilmstripThumbnails: ReturnType<typeof vi.fn>,
    freeAllFilmstripThumbnails: ReturnType<typeof vi.fn>,
  };

  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as RenderingContext);

    const mockTrack = Object.assign(Object.create(mediabunny.InputVideoTrack.prototype), {
      getFirstTimestamp: vi.fn().mockResolvedValue(0),
      computeDuration: vi.fn().mockResolvedValue(10),
      canDecode: vi.fn().mockResolvedValue(true),
      computeFrameRateMetrics: vi.fn().mockResolvedValue({
        bestGuessFrameRate: 30,
        averageFrameRate: 30,
      }),
    });

    vi.spyOn(mediabunny.Input.prototype, 'getPrimaryVideoTrack')
      .mockResolvedValue(mockTrack as unknown as mediabunny.InputVideoTrack);
    vi.spyOn(mediabunny.Input.prototype, 'dispose').mockImplementation(() => undefined);
    vi.spyOn(mediabunny.VideoSampleSink.prototype, 'getSample').mockImplementation(async (ts = 0) => {
      return {
        squarePixelWidth: 100,
        squarePixelHeight: 100,
        draw: vi.fn(),
        close: vi.fn(),
        timestamp: ts,
        duration: 1 / 30,
        visibleRect: { width: 100, height: 100 },
      } as unknown as mediabunny.VideoSample;
    });

    mockMediaFiles = {
      mediaFiles: signal<MediaFile[]>([]),
    };

    mockVideoSegmentationService = {
      segments: signal<VideoSegment[]>([]),
      getFileDuration: vi.fn().mockReturnValue(10),
      getFileFps: vi.fn().mockReturnValue(30),
      splitSegment: vi.fn(),
      deleteSegment: vi.fn(),
      updateSegmentStart: vi.fn(),
      updateSegmentEnd: vi.fn(),
      formatTimestamp: vi.fn((sec: number) => {
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(Math.floor(sec % 60)).padStart(2, '0');
        return `${m}:${s}`;
      }),
      findSegmentAtTime: vi.fn((fileId: string, time: number) => {
        const segs = mockVideoSegmentationService.segments()
          .filter((s) => s.fileId === fileId)
          .sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const isLast = i === segs.length - 1;
          if (time >= seg.startTime && (time < seg.endTime || (isLast && time <= seg.endTime))) {
            return seg;
          }
        }
        return null;
      }),
      canSplitSegment: vi.fn().mockReturnValue(false),
      canCreateSegmentInGap: vi.fn().mockReturnValue(false),
      canJoinSegments: vi.fn().mockReturnValue(false),
      joinSegments: vi.fn(),
    };

    mockThumbnail = {
      generateFilmstripThumbnails: vi.fn().mockReturnValue(of()),
      freeAllFilmstripThumbnails: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VideoSegmentation],
      providers: [
        { provide: MediaFiles, useValue: mockMediaFiles },
        { provide: VideoSegmentationService, useValue: mockVideoSegmentationService },
        { provide: Thumbnail, useValue: mockThumbnail },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoSegmentation);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty info cards when no media files exist', () => {
    fixture.detectChanges();
    const infoCards = fixture.nativeElement.querySelectorAll('app-info-card');
    expect(infoCards.length).toBeGreaterThan(0);
  });

  it('should render segments and synchronize selection', async () => {
    const file1: MediaFile = {
      id: 'file-1' as MediaFileId,
      name: 'video1.mp4',
      file: new File([''], 'video1.mp4', { type: 'video/mp4' }),
      url: 'blob:video1',
      thumbnail: null,
    };
    mockMediaFiles.mediaFiles.set([file1]);

    const seg1: VideoSegment = {
      id: 'seg-1',
      fileId: 'file-1' as MediaFileId,
      name: 'Segmento 1 [00:00 - 00:05]',
      startTime: 0,
      endTime: 5,
      thumbnail: null,
    };
    const seg2: VideoSegment = {
      id: 'seg-2',
      fileId: 'file-1' as MediaFileId,
      name: 'Segmento 2 [00:05 - 00:10]',
      startTime: 5,
      endTime: 10,
      thumbnail: null,
    };
    mockVideoSegmentationService.segments.set([seg1, seg2]);

    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.video-segments-list-item');
    expect(items.length).toBe(2);

    // Active segment at time 0 is seg1
    expect(component.activeSegment()?.id).toBe('seg-1');
    expect(component.activeMediaFileId()).toBe('file-1');

    // Select second segment
    const button = items[1].querySelector('button');
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.currentTime()).toBe(5);
    expect(component.activeSegment()?.id).toBe('seg-2');

    // Move playhead outside both segments (e.g. at time 12)
    component.currentTime.set(12);
    expect(component.activeSegment()).toBeNull();
  });

  it('should compute activeMediaFile correctly', () => {
    const file1: MediaFile = {
      id: 'file-1' as MediaFileId,
      name: 'video1.mp4',
      file: new File([''], 'video1.mp4', { type: 'video/mp4' }),
      url: 'blob:video1',
      thumbnail: null,
    };
    const file2: MediaFile = {
      id: 'file-2' as MediaFileId,
      name: 'video2.mp4',
      file: new File([''], 'video2.mp4', { type: 'video/mp4' }),
      url: 'blob:video2',
      thumbnail: null,
    };
    mockMediaFiles.mediaFiles.set([file1, file2]);

    expect(component['activeMediaFile']()?.id).toBe('file-1');

    component.activeMediaFileId.set('file-2' as MediaFileId);
    expect(component['activeMediaFile']()?.id).toBe('file-2');
  });

  it('should initialize isScrubbing signal with false', () => {
    expect(component.isScrubbing()).toBe(false);
    component.isScrubbing.set(true);
    expect(component.isScrubbing()).toBe(true);
  });

  it('should reset playhead when segments become empty and re-initialize when segments are added', () => {
    const seg1: VideoSegment = {
      id: 'seg-1',
      fileId: 'file-1' as MediaFileId,
      name: 'Seg 1',
      startTime: 5,
      endTime: 15,
      thumbnail: null,
    };
    mockVideoSegmentationService.segments.set([seg1]);
    fixture.detectChanges();

    expect(component.activeMediaFileId()).toBe('file-1');
    expect(component.currentTime()).toBe(5);

    // Clear segments
    mockVideoSegmentationService.segments.set([]);
    fixture.detectChanges();

    expect(component.activeMediaFileId()).toBeNull();
    expect(component.currentTime()).toBe(0);

    // Add new segment
    const seg2: VideoSegment = {
      id: 'seg-2',
      fileId: 'file-2' as MediaFileId,
      name: 'Seg 2',
      startTime: 10,
      endTime: 20,
      thumbnail: null,
    };
    mockVideoSegmentationService.segments.set([seg2]);
    fixture.detectChanges();

    expect(component.activeMediaFileId()).toBe('file-2');
    expect(component.currentTime()).toBe(10);
  });
});
