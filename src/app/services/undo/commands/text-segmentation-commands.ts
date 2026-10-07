import {
  type UndoCommand,
  type UndoCommandCategory,
} from '../undo-state.interface';
import {
  TextSegmentationService,
  type TextSegment,
} from '../../text-segmentation/text-segmentation';

/**
 * Command recording a structural change in the text segmentation tree (linking, inclusion, ordering).
 */
export class TextSegmentationCommand implements UndoCommand {
  public readonly category: UndoCommandCategory = 'text-segmentation';

  constructor(
    public readonly description: string,
    private readonly beforeSegments: readonly TextSegment[],
    private readonly afterSegments: readonly TextSegment[],
    private readonly textSegmentationService: TextSegmentationService
  ) {
  }

  /**
   * Reverts the text segments hierarchy to the state prior to the user mutation.
   */
  public undo(): void {
    this.textSegmentationService.restoreSegments(this.beforeSegments);
  }

  /**
   * Re-applies the user mutation to the text segments hierarchy.
   */
  public redo(): void {
    this.textSegmentationService.restoreSegments(this.afterSegments);
  }
}
