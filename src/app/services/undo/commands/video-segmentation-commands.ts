import {
  type UndoCommand,
  type UndoCommandCategory,
} from '../undo-state.interface';
import {
  VideoSegmentationService,
  type VideoSegment,
} from '../../video-segmentation/video-segmentation';

/**
 * Sanitizes video segments for command snapshots, stripping ephemeral thumbnail URLs.
 */
function sanitizeSegments(segments: readonly VideoSegment[]): VideoSegment[] {
  return segments.map((seg) => ({
    ...seg,
    thumbnail: null,
  }));
}

/**
 * Command recording splitting a segment or creating a new segment in an unsegmented gap.
 */
export class SplitSegmentCommand implements UndoCommand {
  public readonly description = 'Dividir segmento de vídeo';
  public readonly category: UndoCommandCategory = 'video-segmentation';
  private readonly beforeSegments: readonly VideoSegment[];
  private readonly afterSegments: readonly VideoSegment[];

  constructor(
    beforeSegments: readonly VideoSegment[],
    private readonly beforeCorrelationOrder: readonly string[],
    afterSegments: readonly VideoSegment[],
    private readonly afterCorrelationOrder: readonly string[],
    private readonly videoSegmentationService: VideoSegmentationService
  ) {
    this.beforeSegments = sanitizeSegments(beforeSegments);
    this.afterSegments = sanitizeSegments(afterSegments);
  }

  /**
   * Reverts segmentation state to prior state before split.
   */
  public undo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.beforeSegments,
      this.beforeCorrelationOrder
    );
  }

  /**
   * Re-applies the split segmentation state.
   */
  public redo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.afterSegments,
      this.afterCorrelationOrder
    );
  }
}

/**
 * Command recording joining two adjacent segments.
 */
export class JoinSegmentsCommand implements UndoCommand {
  public readonly description = 'Unir segmentos de vídeo';
  public readonly category: UndoCommandCategory = 'video-segmentation';
  private readonly beforeSegments: readonly VideoSegment[];
  private readonly afterSegments: readonly VideoSegment[];

  constructor(
    beforeSegments: readonly VideoSegment[],
    private readonly beforeCorrelationOrder: readonly string[],
    afterSegments: readonly VideoSegment[],
    private readonly afterCorrelationOrder: readonly string[],
    private readonly videoSegmentationService: VideoSegmentationService
  ) {
    this.beforeSegments = sanitizeSegments(beforeSegments);
    this.afterSegments = sanitizeSegments(afterSegments);
  }

  /**
   * Reverts segmentation state back to the separated segments.
   */
  public undo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.beforeSegments,
      this.beforeCorrelationOrder
    );
  }

  /**
   * Re-applies the joined segments state.
   */
  public redo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.afterSegments,
      this.afterCorrelationOrder
    );
  }
}

/**
 * Command recording deleting a segment.
 */
export class DeleteSegmentCommand implements UndoCommand {
  public readonly description = 'Excluir segmento de vídeo';
  public readonly category: UndoCommandCategory = 'video-segmentation';
  private readonly beforeSegments: readonly VideoSegment[];
  private readonly afterSegments: readonly VideoSegment[];

  constructor(
    beforeSegments: readonly VideoSegment[],
    private readonly beforeCorrelationOrder: readonly string[],
    afterSegments: readonly VideoSegment[],
    private readonly afterCorrelationOrder: readonly string[],
    private readonly videoSegmentationService: VideoSegmentationService
  ) {
    this.beforeSegments = sanitizeSegments(beforeSegments);
    this.afterSegments = sanitizeSegments(afterSegments);
  }

  /**
   * Reverts segment deletion by restoring the segment and its correlation order.
   */
  public undo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.beforeSegments,
      this.beforeCorrelationOrder
    );
  }

  /**
   * Re-applies the segment deletion.
   */
  public redo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.afterSegments,
      this.afterCorrelationOrder
    );
  }
}

/**
 * Command recording an adjustment to a segment's start or end boundary.
 * Supports continuous coalescing when dragged or nudged via keyboard arrows.
 */
export class UpdateSegmentBoundaryCommand implements UndoCommand {
  public readonly description = 'Ajustar limite do segmento';
  public readonly category: UndoCommandCategory = 'video-segmentation';
  private lastUpdateTime = Date.now();
  private readonly beforeSegments: readonly VideoSegment[];
  private afterSegments: readonly VideoSegment[];

  constructor(
    beforeSegments: readonly VideoSegment[],
    private readonly beforeCorrelationOrder: readonly string[],
    afterSegments: readonly VideoSegment[],
    private afterCorrelationOrder: readonly string[],
    private readonly segmentId: string,
    private readonly edge: 'start' | 'end',
    private readonly videoSegmentationService: VideoSegmentationService
  ) {
    this.beforeSegments = sanitizeSegments(beforeSegments);
    this.afterSegments = sanitizeSegments(afterSegments);
  }

  /**
   * Reverts segment boundaries back to the state before adjustment.
   */
  public undo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.beforeSegments,
      this.beforeCorrelationOrder
    );
  }

  /**
   * Re-applies the boundary adjustment.
   */
  public redo(): void {
    this.videoSegmentationService.restoreSegmentationState(
      this.afterSegments,
      this.afterCorrelationOrder
    );
  }

  /**
   * Coalesces rapid consecutive boundary adjustments for the same segment edge.
   */
  public mergeWith(nextCommand: UndoCommand): boolean {
    if (nextCommand instanceof UpdateSegmentBoundaryCommand) {
      if (
        nextCommand.segmentId === this.segmentId &&
        nextCommand.edge === this.edge
      ) {
        const now = Date.now();
        if (now - this.lastUpdateTime < 800) {
          this.afterSegments = nextCommand.afterSegments;
          this.afterCorrelationOrder = nextCommand.afterCorrelationOrder;
          this.lastUpdateTime = now;
          return true;
        }
      }
    }
    return false;
  }
}
