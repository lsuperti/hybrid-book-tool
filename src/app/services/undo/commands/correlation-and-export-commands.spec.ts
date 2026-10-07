import { vi } from 'vitest';
import { ReorderCorrelationCommand } from './correlation-commands';
import { UpdateExportMetadataCommand } from './export-commands';
import { type VideoSegmentationService } from '../../video-segmentation/video-segmentation';
import { type BookImprintMetadata } from '../../../components/UI/export/export';
import { type UndoCommand } from '../undo-state.interface';

function createMockMetadata(title = 'Initial Title'): BookImprintMetadata {
  return {
    title,
    author: 'Author Name',
    illustrations: 'Illustrator',
    rendering: 'Renderer',
    editorialRevisions: 'Editor',
    performers: 'Performer',
    videoEngineer: 'Video Eng',
    videoEditing: 'Video Edit',
    soundEngineer: 'Sound Eng',
    soundEditor: 'Sound Edit',
    version: '1.0.0',
    published: '2026',
    publisher: 'Test Publisher',
    year: '2026',
    production: 'Test Production',
    originalBook: {
      author: 'Original Author',
      title: 'Original Title',
      publicationNo: '12345',
      published: '2020',
      publisher: 'Original Publisher',
      year: '2020',
      isbn: '978-0-123456-47-2',
      copyright: 'All Rights Reserved',
    },
  };
}

describe('Correlation Commands', () => {
  let mockVideoSegmentationService: {
    restoreCorrelationOrder: ReturnType<typeof vi.fn>,
  };

  beforeEach(() => {
    mockVideoSegmentationService = {
      restoreCorrelationOrder: vi.fn(),
    };
  });

  describe('ReorderCorrelationCommand', () => {
    it('should have correlation category and appropriate description', () => {
      const cmd = new ReorderCorrelationCommand(
        ['seg-1', 'seg-2'],
        ['seg-2', 'seg-1'],
        mockVideoSegmentationService as unknown as VideoSegmentationService
      );

      expect(cmd.category).toBe('correlation');
      expect(cmd.description).toBe('Reordenar segmentos na correlação');
    });

    it('should restore beforeOrder on undo and afterOrder on redo', () => {
      const before = ['seg-1', 'seg-2', 'seg-3'];
      const after = ['seg-3', 'seg-1', 'seg-2'];

      const cmd = new ReorderCorrelationCommand(
        before,
        after,
        mockVideoSegmentationService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockVideoSegmentationService.restoreCorrelationOrder).toHaveBeenCalledWith(before);

      cmd.redo();
      expect(mockVideoSegmentationService.restoreCorrelationOrder).toHaveBeenCalledWith(after);
    });

    it('should handle empty arrays gracefully', () => {
      const cmd = new ReorderCorrelationCommand(
        [],
        [],
        mockVideoSegmentationService as unknown as VideoSegmentationService
      );

      cmd.undo();
      expect(mockVideoSegmentationService.restoreCorrelationOrder).toHaveBeenCalledWith([]);

      cmd.redo();
      expect(mockVideoSegmentationService.restoreCorrelationOrder).toHaveBeenCalledWith([]);
    });
  });
});

describe('Export Commands', () => {
  describe('UpdateExportMetadataCommand', () => {
    let applyFn: ReturnType<typeof vi.fn<(metadata: BookImprintMetadata) => void>>;

    beforeEach(() => {
      vi.useFakeTimers();
      applyFn = vi.fn();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should have export category and appropriate description', () => {
      const before = createMockMetadata('Before');
      const after = createMockMetadata('After');
      const cmd = new UpdateExportMetadataCommand(before, after, applyFn);

      expect(cmd.category).toBe('export');
      expect(cmd.description).toBe('Editar metadados da publicação');
    });

    it('should apply beforeMetadata on undo and afterMetadata on redo', () => {
      const before = createMockMetadata('Before Title');
      const after = createMockMetadata('After Title');
      const cmd = new UpdateExportMetadataCommand(before, after, applyFn);

      cmd.undo();
      expect(applyFn).toHaveBeenCalledWith(before);

      cmd.redo();
      expect(applyFn).toHaveBeenCalledWith(after);
    });

    it('should coalesce rapid updates occurring within 800ms', () => {
      const meta0 = createMockMetadata('Initial');
      const meta1 = createMockMetadata('First typing burst');
      const meta2 = createMockMetadata('Second typing burst');

      const cmd1 = new UpdateExportMetadataCommand(meta0, meta1, applyFn);

      vi.advanceTimersByTime(400);

      const cmd2 = new UpdateExportMetadataCommand(meta1, meta2, applyFn);
      const merged = cmd1.mergeWith(cmd2);

      expect(merged).toBe(true);

      cmd1.redo();
      expect(applyFn).toHaveBeenCalledWith(meta2);
    });

    it('should not coalesce updates occurring after 800ms', () => {
      const meta0 = createMockMetadata('Initial');
      const meta1 = createMockMetadata('Burst 1');
      const meta2 = createMockMetadata('Burst 2');

      const cmd1 = new UpdateExportMetadataCommand(meta0, meta1, applyFn);

      vi.advanceTimersByTime(850);

      const cmd2 = new UpdateExportMetadataCommand(meta1, meta2, applyFn);
      const merged = cmd1.mergeWith(cmd2);

      expect(merged).toBe(false);
    });

    it('should refuse to merge with commands of a different category or type', () => {
      const meta0 = createMockMetadata('Initial');
      const meta1 = createMockMetadata('Burst 1');
      const cmd = new UpdateExportMetadataCommand(meta0, meta1, applyFn);

      const foreignCommand: UndoCommand = {
        description: 'Outro comando',
        category: 'correlation',
        undo: vi.fn(),
        redo: vi.fn(),
      };

      expect(cmd.mergeWith(foreignCommand)).toBe(false);
    });

    it('should reset debounce timer on each consecutive merge', () => {
      const meta0 = createMockMetadata('Initial');
      const meta1 = createMockMetadata('Update 1');
      const meta2 = createMockMetadata('Update 2');
      const meta3 = createMockMetadata('Update 3');

      const cmd1 = new UpdateExportMetadataCommand(meta0, meta1, applyFn);

      vi.advanceTimersByTime(500);
      const cmd2 = new UpdateExportMetadataCommand(meta1, meta2, applyFn);
      expect(cmd1.mergeWith(cmd2)).toBe(true);

      // Advance another 500ms (1000ms from start, but 500ms since last merge)
      vi.advanceTimersByTime(500);
      const cmd3 = new UpdateExportMetadataCommand(meta2, meta3, applyFn);
      expect(cmd1.mergeWith(cmd3)).toBe(true);

      cmd1.redo();
      expect(applyFn).toHaveBeenCalledWith(meta3);
    });
  });
});
