import { vi } from 'vitest';
import {
  AddMediaFilesCommand,
  RemoveMediaFileCommand,
  SetTextRecordCommand,
} from './media-commands';
import { type MediaFiles, type MediaFile, type MediaFileId } from '../../media-files/media-files';
import { type VideoSegmentationService, type VideoSegment } from '../../video-segmentation/video-segmentation';
import { type TextSegmentationService, type TextSegment } from '../../text-segmentation/text-segmentation';
import { type FileRegistry } from '../file-registry/file-registry';

describe('Media Ingest Commands', () => {
  let mockMediaFiles: {
    removeMediaFile: ReturnType<typeof vi.fn>,
    restoreMediaFile: ReturnType<typeof vi.fn>,
    setTextRecord: ReturnType<typeof vi.fn>,
  };

  let mockVideoSegmentation: {
    segments: ReturnType<typeof vi.fn>,
    correlationOrder: ReturnType<typeof vi.fn>,
    restoreSegmentationState: ReturnType<typeof vi.fn>,
  };

  let mockTextSegmentation: {
    restoreSegments: ReturnType<typeof vi.fn>,
    workUpcoming: ReturnType<typeof vi.fn>,
  };

  beforeEach(() => {
    mockMediaFiles = {
      removeMediaFile: vi.fn(),
      restoreMediaFile: vi.fn(),
      setTextRecord: vi.fn(),
    };

    mockVideoSegmentation = {
      segments: vi.fn(() => []),
      correlationOrder: vi.fn(() => []),
      restoreSegmentationState: vi.fn(),
    };

    mockTextSegmentation = {
      restoreSegments: vi.fn(),
      workUpcoming: vi.fn(),
    };
  });

  describe('AddMediaFilesCommand', () => {
    it('should remove added files on undo and restore them on redo', () => {
      const dummyFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([''], 'test.mp4'),
        name: 'test.mp4',
        thumbnail: null,
        url: null,
      };

      const cmd = new AddMediaFilesCommand(
        [dummyFile],
        mockMediaFiles as unknown as MediaFiles
      );

      cmd.undo();
      expect(mockMediaFiles.removeMediaFile).toHaveBeenCalledWith('media-1');

      cmd.redo();
      expect(mockMediaFiles.restoreMediaFile).toHaveBeenCalledWith(dummyFile);
    });

    it('should retain files on undo and release on destroy if undone', () => {
      const dummyFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([''], 'test.mp4'),
        name: 'test.mp4',
        thumbnail: null,
        url: null,
      };

      const mockRegistry = {
        retain: vi.fn(),
        release: vi.fn(),
      };

      const cmd = new AddMediaFilesCommand(
        [dummyFile],
        mockMediaFiles as unknown as MediaFiles,
        mockRegistry as unknown as FileRegistry
      );

      cmd.undo();
      expect(mockRegistry.retain).toHaveBeenCalledWith('media-1');

      cmd.destroy();
      expect(mockRegistry.release).toHaveBeenCalledWith('media-1');
    });
  });

  describe('RemoveMediaFileCommand', () => {
    it('should restore removed file and associated video segments on undo', () => {
      const dummyFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([''], 'test.mp4'),
        name: 'test.mp4',
        thumbnail: null,
        url: null,
      };

      const associatedSegments: VideoSegment[] = [
        {
          id: 'seg-1',
          fileId: 'media-1' as MediaFileId,
          name: 'Segmento 1',
          startTime: 0,
          endTime: 10,
          thumbnail: null,
        },
      ];

      const cmd = new RemoveMediaFileCommand(
        dummyFile,
        2,
        mockMediaFiles as unknown as MediaFiles,
        associatedSegments,
        ['seg-1'],
        mockVideoSegmentation as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockMediaFiles.restoreMediaFile).toHaveBeenCalledWith(dummyFile, 2);
      expect(mockVideoSegmentation.restoreSegmentationState).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'seg-1' }),
        ]),
        ['seg-1']
      );

      cmd.redo();
      expect(mockMediaFiles.removeMediaFile).toHaveBeenCalledWith('media-1');
      expect(mockVideoSegmentation.restoreSegmentationState).toHaveBeenCalled();
    });

    it('should retain file on construction and release on destroy', () => {
      const dummyFile: MediaFile = {
        id: 'media-1' as MediaFileId,
        file: new File([''], 'test.mp4'),
        name: 'test.mp4',
        thumbnail: null,
        url: null,
      };

      const mockRegistry = {
        retain: vi.fn(),
        release: vi.fn(),
      };

      const cmd = new RemoveMediaFileCommand(
        dummyFile,
        0,
        mockMediaFiles as unknown as MediaFiles,
        [],
        [],
        undefined,
        mockRegistry as unknown as FileRegistry
      );

      expect(mockRegistry.retain).toHaveBeenCalledWith('media-1');

      cmd.destroy();
      expect(mockRegistry.release).toHaveBeenCalledWith('media-1');
    });
  });

  describe('SetTextRecordCommand', () => {
    it('should revert to previous text record and segments on undo and re-apply on redo', () => {
      const prevFile = new File(['prev'], 'prev.pdf', { type: 'application/pdf' });
      const newFile = new File(['new'], 'new.pdf', { type: 'application/pdf' });
      const prevSegments: TextSegment[] = [
        {
          sequentialId: 0,
          pdfJsId: 'pdf-1',
          page: 1,
          text: 'Hello',
          excluded: false,
          linkedChildren: [],
        },
      ];

      const cmd = new SetTextRecordCommand(
        prevFile,
        newFile,
        mockMediaFiles as unknown as MediaFiles,
        prevSegments,
        [],
        mockTextSegmentation as unknown as TextSegmentationService
      );

      cmd.undo();
      expect(mockMediaFiles.setTextRecord).toHaveBeenCalledWith(prevFile);
      expect(mockTextSegmentation.restoreSegments).toHaveBeenCalledWith(prevSegments);

      cmd.redo();
      expect(mockMediaFiles.setTextRecord).toHaveBeenCalledWith(newFile);
      expect(mockTextSegmentation.workUpcoming).toHaveBeenCalled();
    });

    it('should restore empty segments on undo if previous segments was empty', () => {
      const newFile = new File(['new'], 'new.pdf', { type: 'application/pdf' });

      const cmd = new SetTextRecordCommand(
        null,
        newFile,
        mockMediaFiles as unknown as MediaFiles,
        [],
        [],
        mockTextSegmentation as unknown as TextSegmentationService
      );

      cmd.undo();
      expect(mockMediaFiles.setTextRecord).toHaveBeenCalledWith(null);
      expect(mockTextSegmentation.restoreSegments).toHaveBeenCalledWith([]);
    });

    it('should clear segments on redo if newFile is null (clearing text record)', () => {
      const prevFile = new File(['prev'], 'prev.pdf', { type: 'application/pdf' });
      const prevSegments: TextSegment[] = [
        {
          sequentialId: 0,
          pdfJsId: 'pdf-1',
          page: 1,
          text: 'Hello',
          excluded: false,
          linkedChildren: [],
        },
      ];

      const cmd = new SetTextRecordCommand(
        prevFile,
        null,
        mockMediaFiles as unknown as MediaFiles,
        prevSegments,
        [],
        mockTextSegmentation as unknown as TextSegmentationService
      );

      cmd.redo();
      expect(mockMediaFiles.setTextRecord).toHaveBeenCalledWith(null);
      expect(mockTextSegmentation.restoreSegments).toHaveBeenCalledWith([]);
    });

    it('should retain files on creation and release on destroy', () => {
      const prevFile = new File(['prev'], 'prev.pdf', { type: 'application/pdf' });
      const newFile = new File(['new'], 'new.pdf', { type: 'application/pdf' });

      const mockRegistry = {
        retain: vi.fn(),
        release: vi.fn(),
      };

      const cmd = new SetTextRecordCommand(
        prevFile,
        newFile,
        mockMediaFiles as unknown as MediaFiles,
        [],
        [],
        mockTextSegmentation as unknown as TextSegmentationService,
        mockRegistry as unknown as FileRegistry
      );

      expect(mockRegistry.retain).toHaveBeenCalledWith(prevFile);
      expect(mockRegistry.retain).toHaveBeenCalledWith(newFile);

      cmd.destroy();
      expect(mockRegistry.release).toHaveBeenCalledWith(prevFile);
      expect(mockRegistry.release).toHaveBeenCalledWith(newFile);
    });
  });
});
