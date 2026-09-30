import { TestBed } from '@angular/core/testing';
import { VideoSegmentationService, type VideoSegment } from './video-segmentation';
import { MediaFiles, type MediaFile, type MediaFileId } from '../media-files/media-files';
import { Thumbnail } from '../thumbnail/thumbnail';
import { signal } from '@angular/core';
import { of, Observable } from 'rxjs';

describe('VideoSegmentationService', () => {
  let service: VideoSegmentationService;
  let mockMediaFiles: { mediaFiles: ReturnType<typeof signal<MediaFile[]>> };
  let mockThumbnail: {
    generateSegmentThumbnailUrls: ReturnType<typeof vi.fn>,
    freeSegmentThumbnail: ReturnType<typeof vi.fn>,
    freeSegmentThumbnailsForFile: ReturnType<typeof vi.fn>,
    freeFilmstripThumbnailsForFile: ReturnType<typeof vi.fn>,
    freeAllSegmentThumbnails: ReturnType<typeof vi.fn>,
  };

  beforeEach(() => {
    mockMediaFiles = {
      mediaFiles: signal<MediaFile[]>([]),
    };

    mockThumbnail = {
      generateSegmentThumbnailUrls: vi.fn(() => of({
        segmentId: 'seg-1',
        thumbnailUrl: 'blob:segment-thumb',
      })),
      freeSegmentThumbnail: vi.fn(),
      freeSegmentThumbnailsForFile: vi.fn(),
      freeFilmstripThumbnailsForFile: vi.fn(),
      freeAllSegmentThumbnails: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        VideoSegmentationService,
        { provide: MediaFiles, useValue: mockMediaFiles },
        { provide: Thumbnail, useValue: mockThumbnail },
      ],
    });

    service = TestBed.inject(VideoSegmentationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('formatTimestamp', () => {
    it('should format seconds into MM:SS format', () => {
      expect(service.formatTimestamp(0)).toBe('00:00');
      expect(service.formatTimestamp(5)).toBe('00:05');
      expect(service.formatTimestamp(65)).toBe('01:05');
      expect(service.formatTimestamp(599)).toBe('09:59');
    });

    it('should format hours when duration is 3600 seconds or greater', () => {
      expect(service.formatTimestamp(3600)).toBe('01:00:00');
      expect(service.formatTimestamp(3665)).toBe('01:01:05');
    });

    it('should handle negative, non-finite, and NaN values safely', () => {
      expect(service.formatTimestamp(-10)).toBe('00:00');
      expect(service.formatTimestamp(NaN)).toBe('00:00');
      expect(service.formatTimestamp(Infinity)).toBe('00:00');
    });
  });

  describe('segment creation and synchronization', () => {
    it('should create an initial full-length segment when a media file is added', async () => {
      const mockFile = new File(['dummy content'], 'aula.mp4', { type: 'video/mp4' });
      const mediaFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: mockFile,
        name: 'aula.mp4',
        url: 'blob:test',
        thumbnail: 'blob:thumb',
      };

      // Mock inspectVideoFile by setting cached duration directly
      service['fileDurations'].set('media-1' as MediaFileId, 120);

      mockMediaFiles.mediaFiles.set([mediaFile]);
      TestBed.flushEffects();

      // Wait a tick for async inspect
      await new Promise((resolve) => setTimeout(resolve, 10));

      const segments = service.segments();
      expect(segments.length).toBe(1);
      expect(segments[0].fileId).toBe('media-1' as MediaFileId);
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].endTime).toBe(120);
      expect(segments[0].name).toContain('aula.mp4 (00:00 \u2013 02:00)');
      expect(service.correlatedSegments().length).toBe(1);
    });

    it('should clean up segments when a media file is removed', async () => {
      const mediaFile1: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([], 'v1.mp4'),
        name: 'v1.mp4',
        url: null,
        thumbnail: null,
      };
      const mediaFile2: MediaFile = {
        id: 'media-2' as MediaFileId,
        file: new File([], 'v2.mp4'),
        name: 'v2.mp4',
        url: null,
        thumbnail: null,
      };

      service['fileDurations'].set('media-1' as MediaFileId, 60);
      service['fileDurations'].set('media-2' as MediaFileId, 80);

      mockMediaFiles.mediaFiles.set([mediaFile1, mediaFile2]);
      TestBed.flushEffects();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(service.segments().length).toBe(2);

      mockMediaFiles.mediaFiles.set([mediaFile2]);
      TestBed.flushEffects();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(service.segments().length).toBe(1);
      expect(service.segments()[0].fileId).toBe('media-2' as MediaFileId);
      expect(service.correlatedSegments().length).toBe(1);
      expect(mockThumbnail.freeSegmentThumbnailsForFile).toHaveBeenCalledWith('media-1');
      expect(mockThumbnail.freeFilmstripThumbnailsForFile).toHaveBeenCalledWith('media-1');
    });
  });

  describe('splitSegment', () => {
    beforeEach(async () => {
      const mediaFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([], 'video.mp4'),
        name: 'video.mp4',
        url: null,
        thumbnail: null,
      };
      service['fileDurations'].set('media-1' as MediaFileId, 100);
      mockMediaFiles.mediaFiles.set([mediaFile]);
      TestBed.flushEffects();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should split an existing segment into two contiguous segments at the given timestamp', () => {
      service.splitSegment('media-1' as MediaFileId, 40);

      const segments = service.segments();
      expect(segments.length).toBe(2);
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].endTime).toBe(40);
      expect(segments[1].startTime).toBe(40);
      expect(segments[1].endTime).toBe(100);

      // Verify names updated
      expect(segments[0].name).toContain('(00:00 \u2013 00:40)');
      expect(segments[1].name).toContain('(00:40 \u2013 01:40)');

      // Verify correlation order contains both
      const correlated = service.correlatedSegments();
      expect(correlated.length).toBe(2);
      expect(correlated[0].id).toBe(segments[0].id);
      expect(correlated[1].id).toBe(segments[1].id);
    });

    it('should create a 1-second segment when splitting in an unsegmented gap', () => {
      // Delete existing segment to create gap
      const segId = service.segments()[0].id!;
      service.deleteSegment(segId);
      expect(service.segments().length).toBe(0);

      const created = service.splitSegment('media-1' as MediaFileId, 25);
      expect(created).toBeTruthy();
      expect(created?.startTime).toBe(25);
      expect(created?.endTime).toBe(26);

      const segments = service.segments();
      expect(segments.length).toBe(1);
      expect(segments[0].name).toContain('(00:25 \u2013 00:26)');
    });

    it('should clamp new segment in unsegmented gap to avoid overlap with next segment', () => {
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 30,
          endTime: 50,
          thumbnail: null,
        },
      ]);

      const created = service.splitSegment('media-1' as MediaFileId, 29.5);
      expect(created).toBeTruthy();
      expect(created?.startTime).toBe(29.5);
      expect(created?.endTime).toBe(30);
    });
  });

  describe('deleteSegment', () => {
    it('should delete a segment by id from both segments and correlationOrder', () => {
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 0,
          endTime: 30,
          thumbnail: null,
        },
        {
          id: 'seg-2',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 2',
          startTime: 30,
          endTime: 60,
          thumbnail: null,
        },
      ]);
      service.correlationOrder.set(['seg-1', 'seg-2']);

      service.deleteSegment('seg-1');

      expect(service.segments().length).toBe(1);
      expect(service.segments()[0].id).toBe('seg-2');
      expect(service.correlationOrder()).toEqual(['seg-2']);
      expect(service.correlatedSegments().length).toBe(1);
    });
  });

  describe('joinSegments and join eligibility', () => {
    beforeEach(() => {
      service['fileDurations'].set('media-1' as MediaFileId, 100);
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 0,
          endTime: 20,
          thumbnail: 'blob:thumb-1',
        },
        {
          id: 'seg-2',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 2',
          startTime: 30,
          endTime: 60,
          thumbnail: 'blob:thumb-2',
        },
        {
          id: 'seg-3',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 3',
          startTime: 60,
          endTime: 90,
          thumbnail: 'blob:thumb-3',
        },
      ]);
      service.correlationOrder.set(['seg-1', 'seg-2', 'seg-3']);
    });

    it('should return joinable segments when playhead is in the gap between two segments', () => {
      const joinable = service.getJoinableSegments('media-1' as MediaFileId, 25);
      expect(joinable).toBeTruthy();
      expect(joinable?.left.id).toBe('seg-1');
      expect(joinable?.right.id).toBe('seg-2');
      expect(service.canJoinSegments('media-1' as MediaFileId, 25)).toBe(true);
    });

    it('should return joinable segments when playhead is at touching boundary between segments', () => {
      const joinable = service.getJoinableSegments('media-1' as MediaFileId, 60);
      expect(joinable).toBeTruthy();
      expect(joinable?.left.id).toBe('seg-2');
      expect(joinable?.right.id).toBe('seg-3');
      expect(service.canJoinSegments('media-1' as MediaFileId, 60)).toBe(true);
    });

    it('should return joinable segments when playhead is near end of a segment', () => {
      // seg-1 is [0, 20], timestamp 19.5 is within JOIN_NEAR_THRESHOLD (1s) of endTime 20
      const joinable = service.getJoinableSegments('media-1' as MediaFileId, 19.5);
      expect(joinable).toBeTruthy();
      expect(joinable?.left.id).toBe('seg-1');
      expect(joinable?.right.id).toBe('seg-2');
      expect(service.canJoinSegments('media-1' as MediaFileId, 19.5)).toBe(true);
    });

    it('should return joinable segments when playhead is near start of a segment', () => {
      // seg-2 is [30, 60], timestamp 30.5 is within JOIN_NEAR_THRESHOLD (1s) of startTime 30
      const joinable = service.getJoinableSegments('media-1' as MediaFileId, 30.5);
      expect(joinable).toBeTruthy();
      expect(joinable?.left.id).toBe('seg-1');
      expect(joinable?.right.id).toBe('seg-2');
      expect(service.canJoinSegments('media-1' as MediaFileId, 30.5)).toBe(true);
    });

    it('should reject join when playhead is in the middle of a segment', () => {
      // seg-2 is [30, 60], timestamp 45 is far from start (30) and end (60)
      const joinable = service.getJoinableSegments('media-1' as MediaFileId, 45);
      expect(joinable).toBeNull();
      expect(service.canJoinSegments('media-1' as MediaFileId, 45)).toBe(false);
    });

    it('should reject join when playhead is before the first segment or after the last segment', () => {
      // Make gap before first segment
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 10,
          endTime: 30,
          thumbnail: null,
        },
        {
          id: 'seg-2',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 2',
          startTime: 40,
          endTime: 60,
          thumbnail: null,
        },
      ]);

      // Timestamp 5 is before first segment (no preceding segment)
      expect(service.canJoinSegments('media-1' as MediaFileId, 5)).toBe(false);

      // Timestamp 80 is after last segment (no subsequent segment)
      expect(service.canJoinSegments('media-1' as MediaFileId, 80)).toBe(false);
    });

    it('should merge two segments together, preserving left segment ID and freeing right segment thumbnail', () => {
      const joined = service.joinSegments('media-1' as MediaFileId, 25);
      expect(joined).toBeTruthy();
      expect(joined?.id).toBe('seg-1');
      expect(joined?.startTime).toBe(0);
      expect(joined?.endTime).toBe(60);
      expect(joined?.thumbnail).toBe('blob:thumb-1');

      // Verify segments list
      const segments = service.segments();
      expect(segments.length).toBe(2);
      expect(segments[0].id).toBe('seg-1');
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].endTime).toBe(60);
      expect(segments[1].id).toBe('seg-3');

      // Verify right segment thumbnail was freed
      expect(mockThumbnail.freeSegmentThumbnail).toHaveBeenCalledWith('seg-2');

      // Verify correlationOrder was updated
      expect(service.correlationOrder()).toEqual(['seg-1', 'seg-3']);
      expect(service.correlatedSegments().length).toBe(2);
    });

    it('should return null when attempting to join where conditions are not met', () => {
      const result = service.joinSegments('media-1' as MediaFileId, 45);
      expect(result).toBeNull();
      expect(service.segments().length).toBe(3);
    });
  });

  describe('cut eligibility checks', () => {
    beforeEach(() => {
      service['fileDurations'].set('media-1' as MediaFileId, 100);
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 10,
          endTime: 40,
          thumbnail: null,
        },
      ]);
    });

    it('should report canSplitSegment true when strictly inside a valid segment', () => {
      expect(service.canSplitSegment('media-1' as MediaFileId, 20)).toBe(true);
      expect(service.canSplitSegment('media-1' as MediaFileId, 10)).toBe(false);
      expect(service.canSplitSegment('media-1' as MediaFileId, 40)).toBe(false);
      expect(service.canSplitSegment('media-1' as MediaFileId, 5)).toBe(false);
    });

    it('should report canCreateSegmentInGap true when in an unsegmented gap with available duration', () => {
      expect(service.canCreateSegmentInGap('media-1' as MediaFileId, 5)).toBe(true);
      expect(service.canCreateSegmentInGap('media-1' as MediaFileId, 50)).toBe(true);
      expect(service.canCreateSegmentInGap('media-1' as MediaFileId, 20)).toBe(false);
      expect(service.canCreateSegmentInGap('media-1' as MediaFileId, 100)).toBe(false);
    });
  });

  describe('updateSegmentStart and updateSegmentEnd', () => {
    beforeEach(() => {
      service['fileDurations'].set('media-1' as MediaFileId, 100);
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1 (00:00 \u2013 00:30)',
          startTime: 0,
          endTime: 30,
          thumbnail: null,
        },
        {
          id: 'seg-2',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 2 (00:40 \u2013 00:70)',
          startTime: 40,
          endTime: 70,
          thumbnail: null,
        },
      ]);
    });

    it('should update segment start time clamped to previous segment end time', () => {
      // Trying to drag start below previous segment (30s)
      service.updateSegmentStart('seg-2', 20);
      expect(service.segments()[1].startTime).toBe(30);

      // Normal drag
      service.updateSegmentStart('seg-2', 35);
      expect(service.segments()[1].startTime).toBe(35);

      // Dragging too close to its own end time
      service.updateSegmentStart('seg-2', 75);
      expect(service.segments()[1].startTime).toBeCloseTo(70 - 0.033, 2);
    });

    it('should update segment end time clamped to next segment start time', () => {
      // Trying to drag end past next segment (40s)
      service.updateSegmentEnd('seg-1', 50);
      expect(service.segments()[0].endTime).toBe(40);

      // Normal drag
      service.updateSegmentEnd('seg-1', 35);
      expect(service.segments()[0].endTime).toBe(35);

      // Dragging too close to its own start time
      service.updateSegmentEnd('seg-1', -10);
      expect(service.segments()[0].endTime).toBeCloseTo(0 + 0.033, 2);
    });
  });

  describe('temporal order vs correlation order separation', () => {
    it('should maintain canonical segments in temporal order even when correlation order changes', () => {
      const seg1: VideoSegment = {
        id: 'seg-1',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 1',
        startTime: 0,
        endTime: 20,
        thumbnail: null,
      };
      const seg2: VideoSegment = {
        id: 'seg-2',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 2',
        startTime: 20,
        endTime: 40,
        thumbnail: null,
      };
      const seg3: VideoSegment = {
        id: 'seg-3',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 3',
        startTime: 40,
        endTime: 60,
        thumbnail: null,
      };

      service.segments.set([seg1, seg2, seg3]);
      service.correlationOrder.set(['seg-1', 'seg-2', 'seg-3']);

      // Move segment down in correlation: seg-1 moves after seg-2
      service.moveSegmentDown(0);

      // Correlated order is changed
      const correlated = service.correlatedSegments();
      expect(correlated[0].id).toBe('seg-2');
      expect(correlated[1].id).toBe('seg-1');
      expect(correlated[2].id).toBe('seg-3');

      // Canonical temporal segments order is completely undisturbed!
      const temporal = service.segments();
      expect(temporal[0].id).toBe('seg-1');
      expect(temporal[1].id).toBe('seg-2');
      expect(temporal[2].id).toBe('seg-3');
    });
  });

  describe('segment thumbnail management', () => {
    it('should generate thumbnails for initial segments when media files are added', async () => {
      const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
      const mediaFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: mockFile,
        name: 'video.mp4',
        url: 'blob:video',
        thumbnail: null,
      };

      service['fileDurations'].set('media-1' as MediaFileId, 100);
      mockMediaFiles.mediaFiles.set([mediaFile]);
      TestBed.flushEffects();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockThumbnail.generateSegmentThumbnailUrls).toHaveBeenCalled();
      const calls = mockThumbnail.generateSegmentThumbnailUrls.mock.calls;
      expect(calls[0][0][0].startTime).toBe(0);
      expect(calls[0][0][0].mediaFileId).toBe('media-1');
    });

    it('should request thumbnail for new segment on splitSegment', () => {
      const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
      const mediaFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: mockFile,
        name: 'video.mp4',
        url: 'blob:video',
        thumbnail: null,
      };

      mockMediaFiles.mediaFiles.set([mediaFile]);
      service['fileDurations'].set('media-1' as MediaFileId, 100);
      service.segments.set([{
        id: 'seg-1',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 1',
        startTime: 0,
        endTime: 100,
        thumbnail: 'blob:seg-1-thumb',
      }]);

      mockThumbnail.generateSegmentThumbnailUrls.mockClear();
      service.splitSegment('media-1' as MediaFileId, 40);

      expect(mockThumbnail.generateSegmentThumbnailUrls).toHaveBeenCalled();
      const callArg = mockThumbnail.generateSegmentThumbnailUrls.mock.calls[0][0];
      expect(callArg[0].startTime).toBe(40);
    });

    it('should free thumbnail when deleteSegment is called', () => {
      service.segments.set([{
        id: 'seg-1',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 1',
        startTime: 0,
        endTime: 100,
        thumbnail: 'blob:seg-1-thumb',
      }]);

      service.deleteSegment('seg-1');
      expect(mockThumbnail.freeSegmentThumbnail).toHaveBeenCalledWith('seg-1');
    });

    it('should debounce thumbnail generation on updateSegmentStart', () => {
      vi.useFakeTimers();
      try {
        const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
        const mediaFile: MediaFile = {
          id: 'media-1' as MediaFileId,
          file: mockFile,
          name: 'video.mp4',
          url: 'blob:video',
          thumbnail: null,
        };

        mockMediaFiles.mediaFiles.set([mediaFile]);
        service['fileDurations'].set('media-1' as MediaFileId, 100);
        service.segments.set([{
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 0,
          endTime: 100,
          thumbnail: 'blob:seg-1-thumb',
        }]);

        mockThumbnail.generateSegmentThumbnailUrls.mockClear();
        service.updateSegmentStart('seg-1', 10);
        service.updateSegmentStart('seg-1', 15);
        service.updateSegmentStart('seg-1', 20);

        expect(mockThumbnail.generateSegmentThumbnailUrls).not.toHaveBeenCalled();
        vi.advanceTimersByTime(250);
        expect(mockThumbnail.generateSegmentThumbnailUrls).toHaveBeenCalledTimes(1);
        const callArg = mockThumbnail.generateSegmentThumbnailUrls.mock.calls[0][0];
        expect(callArg[0].startTime).toBe(20);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel prior in-flight subscription when requestSegmentThumbnail is called again', () => {
      const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
      const mediaFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: mockFile,
        name: 'video.mp4',
        url: 'blob:video',
        thumbnail: null,
      };

      mockMediaFiles.mediaFiles.set([mediaFile]);
      service.segments.set([{
        id: 'seg-1',
        fileId: 'media-1' as MediaFileId,
        name: 'Seg 1',
        startTime: 0,
        endTime: 100,
        thumbnail: null,
      }]);

      let unsubscribed = false;
      const fakeObservable = new Observable(() => {
        return () => {
          unsubscribed = true;
        };
      });
      mockThumbnail.generateSegmentThumbnailUrls.mockReturnValue(fakeObservable);

      service.requestSegmentThumbnail('seg-1');
      expect(unsubscribed).toBe(false);

      service.requestSegmentThumbnail('seg-1');
      expect(unsubscribed).toBe(true);
    });
  });

  describe('findSegmentAtTime', () => {
    beforeEach(() => {
      service.segments.set([
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 1',
          startTime: 0,
          endTime: 30,
          thumbnail: null,
        },
        {
          id: 'seg-2',
          fileId: 'media-1' as MediaFileId,
          name: 'Seg 2',
          startTime: 40,
          endTime: 70,
          thumbnail: null,
        },
      ]);
    });

    it('should find segment covering the timestamp', () => {
      expect(service.findSegmentAtTime('media-1' as MediaFileId, 15)?.id).toBe('seg-1');
      expect(service.findSegmentAtTime('media-1' as MediaFileId, 45)?.id).toBe('seg-2');
    });

    it('should return null if timestamp is in an unsegmented gap or out of bounds', () => {
      expect(service.findSegmentAtTime('media-1' as MediaFileId, 35)).toBeNull();
      expect(service.findSegmentAtTime('media-1' as MediaFileId, 100)).toBeNull();
      expect(service.findSegmentAtTime('media-2' as MediaFileId, 15)).toBeNull();
    });

    it('should match the last segment at its exact end boundary', () => {
      expect(service.findSegmentAtTime('media-1' as MediaFileId, 70)?.id).toBe('seg-2');
    });
  });
});
