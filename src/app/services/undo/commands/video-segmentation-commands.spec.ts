import { vi } from 'vitest';
import {
  SplitSegmentCommand,
  JoinSegmentsCommand,
  DeleteSegmentCommand,
  UpdateSegmentBoundaryCommand,
} from './video-segmentation-commands';
import {
  type VideoSegmentationService,
  type VideoSegment,
} from '../../video-segmentation/video-segmentation';
import { type MediaFileId } from '../../media-files/media-files';

describe('Video Segmentation Commands', () => {
  let mockService: {
    restoreSegmentationState: ReturnType<typeof vi.fn>,
  };

  const seg1: VideoSegment = {
    id: 'seg-1',
    fileId: 'media-1' as MediaFileId,
    name: 'Seg 1',
    startTime: 0,
    endTime: 5,
    thumbnail: null,
  };

  const seg2: VideoSegment = {
    id: 'seg-2',
    fileId: 'media-1' as MediaFileId,
    name: 'Seg 2',
    startTime: 5,
    endTime: 10,
    thumbnail: null,
  };

  beforeEach(() => {
    mockService = {
      restoreSegmentationState: vi.fn(),
    };
  });

  describe('SplitSegmentCommand', () => {
    it('should restore previous state on undo and split state on redo', () => {
      const cmd = new SplitSegmentCommand(
        [seg1],
        ['seg-1'],
        [seg1, seg2],
        ['seg-1', 'seg-2'],
        mockService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1], ['seg-1']);

      cmd.redo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1, seg2], ['seg-1', 'seg-2']);
    });
  });

  describe('JoinSegmentsCommand', () => {
    it('should restore separated segments on undo and joined segments on redo', () => {
      const merged: VideoSegment = {
        ...seg1,
        endTime: 10,
      };

      const cmd = new JoinSegmentsCommand(
        [seg1, seg2],
        ['seg-1', 'seg-2'],
        [merged],
        ['seg-1'],
        mockService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1, seg2], ['seg-1', 'seg-2']);

      cmd.redo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([merged], ['seg-1']);
    });
  });

  describe('DeleteSegmentCommand', () => {
    it('should restore deleted segment on undo and delete on redo', () => {
      const cmd = new DeleteSegmentCommand(
        [seg1, seg2],
        ['seg-1', 'seg-2'],
        [seg1],
        ['seg-1'],
        mockService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1, seg2], ['seg-1', 'seg-2']);

      cmd.redo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1], ['seg-1']);
    });
  });

  describe('UpdateSegmentBoundaryCommand', () => {
    it('should restore previous boundary on undo and re-apply on redo', () => {
      const updatedSeg1: VideoSegment = { ...seg1, endTime: 6 };

      const cmd = new UpdateSegmentBoundaryCommand(
        [seg1],
        ['seg-1'],
        [updatedSeg1],
        ['seg-1'],
        'seg-1',
        'end',
        mockService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([seg1], ['seg-1']);

      cmd.redo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([updatedSeg1], ['seg-1']);
    });

    it('should coalesce consecutive boundary commands for the same segment edge', () => {
      const updated1: VideoSegment = { ...seg1, endTime: 6 };
      const updated2: VideoSegment = { ...seg1, endTime: 7 };

      const cmd1 = new UpdateSegmentBoundaryCommand(
        [seg1],
        ['seg-1'],
        [updated1],
        ['seg-1'],
        'seg-1',
        'end',
        mockService as unknown as VideoSegmentationService
      );

      const cmd2 = new UpdateSegmentBoundaryCommand(
        [updated1],
        ['seg-1'],
        [updated2],
        ['seg-1'],
        'seg-1',
        'end',
        mockService as unknown as VideoSegmentationService
      );

      const merged = cmd1.mergeWith(cmd2);
      expect(merged).toBe(true);

      cmd1.redo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith([updated2], ['seg-1']);
    });

    it('should sanitize ephemeral thumbnail URLs to null in snapshots', () => {
      const segWithThumb: VideoSegment = { ...seg1, thumbnail: 'blob:http://localhost/thumb-123' };
      const cmd = new SplitSegmentCommand(
        [segWithThumb],
        ['seg-1'],
        [segWithThumb, seg2],
        ['seg-1', 'seg-2'],
        mockService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockService.restoreSegmentationState).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'seg-1', thumbnail: null })],
        ['seg-1']
      );
    });
  });
});
