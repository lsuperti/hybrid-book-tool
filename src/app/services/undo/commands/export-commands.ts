import {
  type UndoCommand,
  type UndoCommandCategory,
} from '../undo-state.interface';
import { type BookImprintMetadata } from '../../../components/UI/export/export';

/**
 * Command recording edits to the publication export metadata form.
 * Coalesces consecutive keystrokes occurring within 800ms.
 */
export class UpdateExportMetadataCommand implements UndoCommand {
  public readonly description = 'Editar metadados da publicação';
  public readonly category: UndoCommandCategory = 'export';
  private lastEditTime = Date.now();

  constructor(
    private readonly beforeMetadata: BookImprintMetadata,
    private afterMetadata: BookImprintMetadata,
    private readonly applyFn: (metadata: BookImprintMetadata) => void
  ) {
  }

  /**
   * Reverts publication metadata form to prior state.
   */
  public undo(): void {
    this.applyFn(this.beforeMetadata);
  }

  /**
   * Re-applies the edited publication metadata.
   */
  public redo(): void {
    this.applyFn(this.afterMetadata);
  }

  /**
   * Coalesces rapid consecutive typing bursts into a single undo command.
   */
  public mergeWith(nextCommand: UndoCommand): boolean {
    if (nextCommand instanceof UpdateExportMetadataCommand) {
      const now = Date.now();
      if (now - this.lastEditTime < 800) {
        this.afterMetadata = nextCommand.afterMetadata;
        this.lastEditTime = now;
        return true;
      }
    }
    return false;
  }
}
