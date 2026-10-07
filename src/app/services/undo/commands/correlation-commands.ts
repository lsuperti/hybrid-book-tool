import {
  type UndoCommand,
  type UndoCommandCategory,
} from '../undo-state.interface';
import { VideoSegmentationService } from '../../video-segmentation/video-segmentation';

/**
 * Command recording a reordering of video segments in the correlation list.
 */
export class ReorderCorrelationCommand implements UndoCommand {
  public readonly description = 'Reordenar segmentos na correlação';
  public readonly category: UndoCommandCategory = 'correlation';

  constructor(
    private readonly beforeOrder: readonly string[],
    private readonly afterOrder: readonly string[],
    private readonly videoSegmentationService: VideoSegmentationService
  ) {
  }

  /**
   * Reverts correlation order back to the state prior to reordering.
   */
  public undo(): void {
    this.videoSegmentationService.restoreCorrelationOrder(this.beforeOrder);
  }

  /**
   * Re-applies the reordered correlation sequence.
   */
  public redo(): void {
    this.videoSegmentationService.restoreCorrelationOrder(this.afterOrder);
  }
}
