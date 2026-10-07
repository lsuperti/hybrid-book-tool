import { Service, signal, computed, inject, DestroyRef } from '@angular/core';
import {
  type UndoCommand,
  type UndoCommandCategory,
  type UndoHistoryOptions,
} from './undo-state.interface';

/**
 * Compound undo command grouping multiple atomic commands into a single transactional entry.
 */
export class CompoundUndoCommand implements UndoCommand {
  constructor(
    public readonly description: string,
    public readonly category: UndoCommandCategory,
    public readonly subCommands: readonly UndoCommand[]
  ) {
  }

  /**
   * Reverts all sub-commands in reverse order of execution.
   */
  public async undo(): Promise<void> {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo();
    }
  }

  /**
   * Re-applies all sub-commands in forward order of execution.
   */
  public async redo(): Promise<void> {
    for (const cmd of this.subCommands) {
      await cmd.redo();
    }
  }

  /**
   * Discards all grouped sub-commands and triggers their cleanup hooks.
   */
  public destroy?(): void {
    for (const cmd of this.subCommands) {
      cmd.destroy?.();
    }
  }
}

/**
 * Central orchestrator for the application-wide Undo/Redo command stacks.
 * Manages history eviction, command merging/coalescing, transactional grouping,
 * and reactive status signals (canUndo, canRedo, operation lock).
 */
@Service()
export class UndoRedoService {
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  private maxHistoryLength = 50;

  /** Signal holding the current undo command stack. */
  public readonly undoStack = signal<readonly UndoCommand[]>([]);

  /** Signal holding the current redo command stack. */
  public readonly redoStack = signal<readonly UndoCommand[]>([]);

  /** Whether an undo operation is currently available. */
  public readonly canUndo = computed(() => this.undoStack().length > 0);

  /** Whether a redo operation is currently available. */
  public readonly canRedo = computed(() => this.redoStack().length > 0);

  /** Description of the topmost undo command, or null if none available. */
  public readonly lastUndoDescription = computed(() => this.undoStack().at(-1)?.description ?? null);

  /** Description of the topmost redo command, or null if none available. */
  public readonly lastRedoDescription = computed(() => this.redoStack().at(-1)?.description ?? null);

  /** Lock indicating an undo or redo action is actively running to prevent re-entrancy. */
  public readonly isOperating = signal<boolean>(false);

  private currentTransaction: {
    description: string,
    category: UndoCommandCategory,
    commands: UndoCommand[],
  } | null = null;

  constructor() {
    this.destroyRef?.onDestroy(() => {
      this.clear();
    });
  }

  /**
   * Configures history stack options such as maximum capacity.
   *
   * @param options History configuration options.
   */
  public configure(options: UndoHistoryOptions): void {
    if (options.maxHistoryLength && options.maxHistoryLength > 0) {
      this.maxHistoryLength = options.maxHistoryLength;
      this.truncateHistoryIfNeeded();
    }
  }

  /**
   * Executes and records a new undoable command.
   * If a transaction is active, the command is collected into that transaction.
   * If the command can coalesce with the topmost undo item, it is merged without growing the stack.
   *
   * @param command The command to record.
   */
  public execute(command: UndoCommand): void {
    if (this.isOperating()) {
      return;
    }

    if (this.currentTransaction) {
      this.currentTransaction.commands.push(command);
      return;
    }

    const currentUndo = [...this.undoStack()];
    const topCommand = currentUndo.at(-1);

    if (topCommand?.mergeWith && topCommand.mergeWith(command)) {
      // Coalesced into existing command; re-emit signal to update any subscribers
      this.undoStack.set([...currentUndo]);
      this.clearRedoStack();
      return;
    }

    currentUndo.push(command);
    if (currentUndo.length > this.maxHistoryLength) {
      const evicted = currentUndo.shift();
      evicted?.destroy?.();
    }

    this.undoStack.set(currentUndo);
    this.clearRedoStack();
  }

  /**
   * Reverts the most recent command on the undo stack.
   *
   * @returns A promise that resolves when the undo operation completes.
   */
  public async undo(): Promise<void> {
    if (!this.canUndo() || this.isOperating()) {
      return;
    }

    const currentUndo = [...this.undoStack()];
    const commandToUndo = currentUndo.pop()!;
    this.undoStack.set(currentUndo);

    this.isOperating.set(true);
    try {
      await commandToUndo.undo();
      this.redoStack.update((redo) => [...redo, commandToUndo]);
    } catch (error: unknown) {
      // On failure, restore command back to undo stack
      this.undoStack.update((undo) => [...undo, commandToUndo]);
      throw error;
    } finally {
      this.isOperating.set(false);
    }
  }

  /**
   * Re-applies the most recent reverted command on the redo stack.
   *
   * @returns A promise that resolves when the redo operation completes.
   */
  public async redo(): Promise<void> {
    if (!this.canRedo() || this.isOperating()) {
      return;
    }

    const currentRedo = [...this.redoStack()];
    const commandToRedo = currentRedo.pop()!;
    this.redoStack.set(currentRedo);

    this.isOperating.set(true);
    try {
      await commandToRedo.redo();
      this.undoStack.update((undo) => [...undo, commandToRedo]);
    } catch (error: unknown) {
      // On failure, restore command back to redo stack
      this.redoStack.update((redo) => [...redo, commandToRedo]);
      throw error;
    } finally {
      this.isOperating.set(false);
    }
  }

  /**
   * Groups all commands executed within the callback into a single atomic CompoundUndoCommand.
   *
   * @param description Human-readable description for the composite action.
   * @param category Domain category of the transaction.
   * @param fn Callback executing the domain actions.
   * @returns A promise resolving when the transaction finishes.
   */
  public async runInTransaction(
    description: string,
    category: UndoCommandCategory,
    fn: () => void | Promise<void>
  ): Promise<void> {
    if (this.currentTransaction) {
      await fn();
      return;
    }

    this.currentTransaction = {
      description,
      category,
      commands: [],
    };

    let errorOccurred = false;
    try {
      await fn();
    } catch (err) {
      errorOccurred = true;
      const tx = this.currentTransaction;
      if (tx) {
        for (let i = tx.commands.length - 1; i >= 0; i--) {
          try {
            await tx.commands[i].undo();
          } catch {
            // Ignore rollback errors during failure handling
          }
          tx.commands[i].destroy?.();
        }
      }
      throw err;
    } finally {
      const tx = this.currentTransaction;
      this.currentTransaction = null;

      if (!errorOccurred && tx && tx.commands.length > 0) {
        if (tx.commands.length === 1) {
          this.execute(tx.commands[0]);
        } else {
          this.execute(new CompoundUndoCommand(tx.description, tx.category, tx.commands));
        }
      }
    }
  }

  /**
   * Clears all commands from both the undo and redo stacks, invoking their destroy hooks.
   */
  public clear(): void {
    for (const cmd of this.undoStack()) {
      cmd.destroy?.();
    }
    this.clearRedoStack();
    this.undoStack.set([]);
  }

  /**
   * Clears the redo stack and invokes destroy hooks on discarded redo commands.
   */
  private clearRedoStack(): void {
    const redo = this.redoStack();
    if (redo.length > 0) {
      for (const cmd of redo) {
        cmd.destroy?.();
      }
      this.redoStack.set([]);
    }
  }

  /**
   * Truncates the undo stack if it exceeds maximum capacity, calling destroy hooks on evicted entries.
   */
  private truncateHistoryIfNeeded(): void {
    const current = [...this.undoStack()];
    if (current.length > this.maxHistoryLength) {
      const evicted = current.slice(0, current.length - this.maxHistoryLength);
      for (const cmd of evicted) {
        cmd.destroy?.();
      }
      const truncated = current.slice(current.length - this.maxHistoryLength);
      this.undoStack.set(truncated);
    }
  }
}
