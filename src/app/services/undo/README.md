# Undo/Redo Architecture & Core Service

The `UndoRedoService` provides an extensible, memory-efficient, and reactive Undo/Redo system for the Hybrid Book
Creation Tool. It enables every user action across all five workflow phases (Ingest, Text Segmentation, Video
Segmentation, Correlation, and Export) to be reversed and restored with minimal overhead and zero data loss.

---

## 1. Architectural Philosophy

### Hybrid Command-Memento Pattern
Rather than taking naive global snapshots of the entire application state tree (which would quickly exhaust memory
and cause GC pauses), or enforcing rigid micro-commands that can diverge from complex multi-step side-effects, the
system uses a **Hybrid Command-Memento Architecture**:

1. **Self-Contained Commands (`UndoCommand`)**:
   - Each action encapsulates its own execution, reversal (`undo()`), and re-application (`redo()`).
2. **Lightweight Mementos**:
   - Commands store discrete, JSON-serializable snapshots (e.g. `TextSegment[]`, `VideoSegment[]`, `string[]` order,
     or `BookImprintMetadata`) representing only the delta or affected domain state.
3. **Reference-Tracked File Pooling**:
   - Large binary objects (`File` instances) are pooled by ID in `FileRegistry` rather than cloned in commands.
4. **On-Demand Ephemeral Regeneration**:
   - Object URLs, canvas framebuffers, filmstrip caches, and preview thumbnails are excluded from commands. Restoring
     a state re-requests thumbnail previews on demand via the `Thumbnail` service.

---

## 2. Core Service Capabilities

### Reactive Status Signals
The service exposes reactive Angular Signals to synchronize user interfaces (e.g. enabling/disabling toolbar buttons):
- `canUndo = computed<boolean>(...)`: `true` when the undo stack contains at least one command.
- `canRedo = computed<boolean>(...)`: `true` when the redo stack contains at least one command.
- `lastUndoDescription = computed<string | null>(...)`: Human-readable label for the next undo action (e.g. tooltip).
- `lastRedoDescription = computed<string | null>(...)`: Human-readable label for the next redo action.
- `isOperating = signal<boolean>(false)`: Lock flag active while `undo()` or `redo()` runs, preventing re-entrancy.

### History Limits, Eviction & Cleanup (`destroy`)
To prevent unbounded memory growth over prolonged editing sessions:
- The undo stack is capped at a maximum capacity (default: 50 commands).
- When the stack exceeds the limit, the oldest command is evicted (`shift()`) and its optional `destroy()` hook is invoked.
- Executing a new command via `execute()` purges the redo stack, calling `destroy()` on all discarded redo commands.
- Calling `clear()` purges both stacks and invokes `destroy()` on all contained commands.
- Commands implement `destroy?(): void` to release retained handles in `FileRegistry` or unsubscribe temporary listeners.

### Continuous Action Coalescing (`mergeWith`)
Certain interactions fire continuous events rapidly (such as typing into a metadata text field, scrubbing timeline
handles, or nudging boundaries via keyboard arrows).
- Commands can implement the optional `mergeWith(nextCommand: UndoCommand): boolean` hook.
- When `execute(command)` is called, the service checks if the topmost undo command can absorb `command`.
- If `top.mergeWith(command)` returns `true`, the topmost command updates its target state in-place, and no new entry
  is added to the stack.
- This results in a single, clean undo step for an entire typing burst or drag session.

### Transactions & Atomic Rollback (`runInTransaction`)
When a high-level user action triggers cascading changes across multiple domains (e.g., removing a media file which
also cleans up associated video segments):
- `runInTransaction(description, category, asyncFn)` executes the block.
- All atomic commands dispatched within the block are collected into a `CompoundUndoCommand`.
- If an unhandled error occurs during execution, all executed sub-commands are immediately rolled back in reverse order
  via `undo()`, their `destroy?.()` hooks are invoked, and the transaction is aborted without polluting the undo stack.
- On success, undoing the composite action runs all sub-commands in reverse order; redoing runs them forward.

---

## 3. Command Lifecycle Diagram

```
User Action
    │
    ▼
execute(command)
    │
    ├─► isOperating()? ──────────► Discard (ignore re-entrant calls)
    │
    ├─► In Transaction? ─────────► Push to transaction command queue
    │
    ├─► top.mergeWith(cmd)? ─────► Update top command in place (Coalesced)
    │
    └─► New Command:
            ├─ Push to undoStack (evict oldest if > maxHistoryLength)
            └─ Clear redoStack
```

---

## 4. Guide: Implementing a New Domain Command

To create an undoable action in any domain service or component:

```typescript
import { UndoCommand, UndoCommandCategory } from './undo-state.interface';

export class ExampleDomainCommand implements UndoCommand {
  public readonly description = 'Descrição amigável da ação';
  public readonly category: UndoCommandCategory = 'text-segmentation';

  constructor(
    private readonly beforeState: MyStateSnapshot,
    private readonly afterState: MyStateSnapshot,
    private readonly domainService: MyDomainService
  ) {}

  public undo(): void {
    this.domainService.restoreState(this.beforeState);
  }

  public redo(): void {
    this.domainService.restoreState(this.afterState);
  }

  public mergeWith?(nextCommand: UndoCommand): boolean {
    if (nextCommand instanceof ExampleDomainCommand) {
      // Coalesce if needed
      return true;
    }
    return false;
  }

  public destroy?(): void {
    // Release retained handles or cleanup temporary subscriptions
  }
}
```
