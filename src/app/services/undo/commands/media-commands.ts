import {
  type UndoCommand,
  type UndoCommandCategory,
} from '../undo-state.interface';
import { MediaFiles, type MediaFile } from '../../media-files/media-files';
import { VideoSegmentationService, type VideoSegment } from '../../video-segmentation/video-segmentation';
import { TextSegmentationService, type TextSegment } from '../../text-segmentation/text-segmentation';
import { FileRegistry } from '../file-registry/file-registry';

/**
 * Command recording the addition of one or more media files to the project.
 */
export class AddMediaFilesCommand implements UndoCommand {
  public readonly description = 'Adicionar arquivos de mídia';
  public readonly category: UndoCommandCategory = 'media';
  private hasUndone = false;

  constructor(
    private readonly addedFiles: readonly MediaFile[],
    private readonly mediaFilesService: MediaFiles,
    private readonly fileRegistry?: FileRegistry | null
  ) {
  }

  /**
   * Reverts the addition by removing the added files from the media files service.
   */
  public undo(): void {
    this.hasUndone = true;
    for (const file of this.addedFiles) {
      this.fileRegistry?.retain(file.id);
      this.mediaFilesService.removeMediaFile(file.id);
    }
  }

  /**
   * Re-applies the addition by restoring the files to the media files service.
   */
  public redo(): void {
    for (const file of this.addedFiles) {
      this.mediaFilesService.restoreMediaFile(file);
      if (this.hasUndone) {
        this.fileRegistry?.release(file.id);
      }
    }
    this.hasUndone = false;
  }

  /**
   * Discards the command and releases any retained file references.
   */
  public destroy(): void {
    if (this.hasUndone) {
      for (const file of this.addedFiles) {
        this.fileRegistry?.release(file.id);
      }
      this.hasUndone = false;
    }
  }
}

/**
 * Command recording the removal of a media file and preserving any associated video segments.
 */
export class RemoveMediaFileCommand implements UndoCommand {
  public readonly description = 'Remover arquivo de mídia';
  public readonly category: UndoCommandCategory = 'media';
  private readonly associatedVideoSegments: readonly VideoSegment[];

  constructor(
    private readonly removedFile: MediaFile,
    private readonly originalIndex: number,
    private readonly mediaFilesService: MediaFiles,
    associatedVideoSegments: readonly VideoSegment[] = [],
    private readonly associatedCorrelationOrder: readonly string[] = [],
    private readonly videoSegmentationService?: VideoSegmentationService,
    private readonly fileRegistry?: FileRegistry | null
  ) {
    this.associatedVideoSegments = associatedVideoSegments.map((s) => ({
      ...s,
      thumbnail: null,
    }));
    this.fileRegistry?.retain(this.removedFile.id);
  }

  /**
   * Reverts removal by re-inserting the media file and restoring its segments.
   */
  public undo(): void {
    this.mediaFilesService.restoreMediaFile(this.removedFile, this.originalIndex);

    if (
      this.videoSegmentationService &&
      this.associatedVideoSegments.length > 0
    ) {
      const currentSegments = this.videoSegmentationService.segments();
      const filtered = currentSegments.filter((s) => s.fileId !== this.removedFile.id);
      const mergedSegments = [...filtered, ...this.associatedVideoSegments];
      this.videoSegmentationService.restoreSegmentationState(
        mergedSegments,
        this.associatedCorrelationOrder.length > 0
          ? [...this.associatedCorrelationOrder]
          : this.videoSegmentationService.correlationOrder()
      );
    }
  }

  /**
   * Re-applies the removal of the media file.
   */
  public redo(): void {
    this.mediaFilesService.removeMediaFile(this.removedFile.id);
    if (this.videoSegmentationService) {
      const remainingSegments = this.videoSegmentationService
        .segments()
        .filter((s) => s.fileId !== this.removedFile.id);
      const remainingOrder = this.videoSegmentationService
        .correlationOrder()
        .filter((id) => remainingSegments.some((s) => s.id === id));
      this.videoSegmentationService.restoreSegmentationState(
        remainingSegments,
        remainingOrder
      );
    }
  }

  /**
   * Discards the command and releases the retained file reference from FileRegistry.
   */
  public destroy(): void {
    this.fileRegistry?.release(this.removedFile.id);
  }
}

/**
 * Command recording setting, replacing, or clearing a PDF text record.
 */
export class SetTextRecordCommand implements UndoCommand {
  public readonly description: string;
  public readonly category: UndoCommandCategory = 'media';

  constructor(
    private readonly previousFile: File | null,
    private readonly newFile: File | null,
    private readonly mediaFilesService: MediaFiles,
    private readonly previousSegments: readonly TextSegment[] = [],
    private readonly newSegments: readonly TextSegment[] = [],
    private readonly textSegmentationService?: TextSegmentationService,
    private readonly fileRegistry?: FileRegistry | null
  ) {
    this.description = newFile ? 'Carregar registro de texto' : 'Limpar registro de texto';
    if (this.previousFile && this.fileRegistry) {
      this.fileRegistry.retain(this.previousFile);
    }
    if (this.newFile && this.fileRegistry) {
      this.fileRegistry.retain(this.newFile);
    }
  }

  /**
   * Reverts the text record to the previous file and restores prior text segments.
   */
  public undo(): void {
    this.mediaFilesService.setTextRecord(this.previousFile);

    if (this.textSegmentationService) {
      this.textSegmentationService.restoreSegments(this.previousSegments ?? []);
    }
  }

  /**
   * Re-applies setting the new text record file.
   */
  public redo(): void {
    this.mediaFilesService.setTextRecord(this.newFile);
    if (this.textSegmentationService) {
      if (this.newFile === null) {
        this.textSegmentationService.restoreSegments([]);
      } else if (this.newSegments.length > 0) {
        this.textSegmentationService.restoreSegments(this.newSegments);
      } else if (this.newFile?.type === 'application/pdf') {
        this.textSegmentationService.workUpcoming();
      }
    }
  }

  /**
   * Discards the command and releases retained files from FileRegistry.
   */
  public destroy(): void {
    if (this.previousFile && this.fileRegistry) {
      this.fileRegistry.release(this.previousFile);
    }
    if (this.newFile && this.fileRegistry) {
      this.fileRegistry.release(this.newFile);
    }
  }
}
