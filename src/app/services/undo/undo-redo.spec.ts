import { TestBed } from '@angular/core/testing';
import { UndoRedoService, CompoundUndoCommand } from './undo-redo';
import { type UndoCommand } from './undo-state.interface';

class MockCommand implements UndoCommand {
  public undoCalled = 0;
  public redoCalled = 0;
  public destroyCalled = 0;

  constructor(
    public readonly description: string,
    public readonly category: 'media' | 'text-segmentation' | 'video-segmentation' | 'correlation' | 'export' = 'media'
  ) {
  }

  public undo(): void {
    this.undoCalled++;
  }

  public redo(): void {
    this.redoCalled++;
  }

  public destroy(): void {
    this.destroyCalled++;
  }
}

class MergingMockCommand extends MockCommand {
  public mergeCount = 0;

  public mergeWith(next: UndoCommand): boolean {
    if (next instanceof MergingMockCommand) {
      this.mergeCount++;
      return true;
    }
    return false;
  }
}

describe('UndoRedoService', () => {
  let service: UndoRedoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UndoRedoService);
  });

  it('should initialize with empty stacks and cannot undo or redo', () => {
    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
    expect(service.lastUndoDescription()).toBeNull();
    expect(service.lastRedoDescription()).toBeNull();
  });

  it('should record executed commands and update status signals', () => {
    const cmd1 = new MockCommand('Ação 1');
    service.execute(cmd1);

    expect(service.canUndo()).toBe(true);
    expect(service.canRedo()).toBe(false);
    expect(service.lastUndoDescription()).toBe('Ação 1');

    const cmd2 = new MockCommand('Ação 2');
    service.execute(cmd2);

    expect(service.lastUndoDescription()).toBe('Ação 2');
    expect(service.undoStack().length).toBe(2);
  });

  it('should undo and redo commands in correct order', async () => {
    const cmd1 = new MockCommand('Ação 1');
    const cmd2 = new MockCommand('Ação 2');
    service.execute(cmd1);
    service.execute(cmd2);

    await service.undo();
    expect(cmd2.undoCalled).toBe(1);
    expect(service.canRedo()).toBe(true);
    expect(service.lastRedoDescription()).toBe('Ação 2');
    expect(service.lastUndoDescription()).toBe('Ação 1');

    await service.undo();
    expect(cmd1.undoCalled).toBe(1);
    expect(service.canUndo()).toBe(false);
    expect(service.lastRedoDescription()).toBe('Ação 1');

    await service.redo();
    expect(cmd1.redoCalled).toBe(1);
    expect(service.canUndo()).toBe(true);
    expect(service.lastUndoDescription()).toBe('Ação 1');

    await service.redo();
    expect(cmd2.redoCalled).toBe(1);
    expect(service.canRedo()).toBe(false);
    expect(service.lastUndoDescription()).toBe('Ação 2');
  });

  it('should clear redo stack when a new command is executed', async () => {
    const cmd1 = new MockCommand('Ação 1');
    const cmd2 = new MockCommand('Ação 2');
    service.execute(cmd1);
    service.execute(cmd2);

    await service.undo();
    expect(service.canRedo()).toBe(true);

    const cmd3 = new MockCommand('Ação 3');
    service.execute(cmd3);

    expect(service.canRedo()).toBe(false);
    expect(service.redoStack().length).toBe(0);
    expect(service.lastUndoDescription()).toBe('Ação 3');
  });

  it('should coalesce commands when mergeWith returns true', () => {
    const cmd1 = new MergingMockCommand('Edição de texto');
    service.execute(cmd1);
    expect(service.undoStack().length).toBe(1);

    const cmd2 = new MergingMockCommand('Edição de texto continuação');
    service.execute(cmd2);

    expect(service.undoStack().length).toBe(1);
    expect(cmd1.mergeCount).toBe(1);
  });

  it('should enforce maximum history capacity limit and evict oldest command', () => {
    service.configure({ maxHistoryLength: 3 });

    const cmd1 = new MockCommand('1');
    const cmd2 = new MockCommand('2');
    const cmd3 = new MockCommand('3');
    const cmd4 = new MockCommand('4');

    service.execute(cmd1);
    service.execute(cmd2);
    service.execute(cmd3);
    service.execute(cmd4);

    expect(service.undoStack().length).toBe(3);
    expect(service.undoStack()[0]).toBe(cmd2);
    expect(service.undoStack()[2]).toBe(cmd4);
  });

  it('should group atomic commands into a single CompoundUndoCommand when run in transaction', async () => {
    const cmd1 = new MockCommand('Sub 1');
    const cmd2 = new MockCommand('Sub 2');

    await service.runInTransaction('Transação composta', 'media', () => {
      service.execute(cmd1);
      service.execute(cmd2);
    });

    expect(service.undoStack().length).toBe(1);
    const top = service.undoStack()[0];
    expect(top).toBeInstanceOf(CompoundUndoCommand);
    expect(top.description).toBe('Transação composta');

    await service.undo();
    expect(cmd2.undoCalled).toBe(1);
    expect(cmd1.undoCalled).toBe(1);

    await service.redo();
    expect(cmd1.redoCalled).toBe(1);
    expect(cmd2.redoCalled).toBe(1);
  });

  it('should clear both stacks and invoke destroy on clear()', () => {
    const cmd1 = new MockCommand('1');
    const cmd2 = new MockCommand('2');
    service.execute(cmd1);
    service.execute(cmd2);
    service.clear();

    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
    expect(service.undoStack().length).toBe(0);
    expect(service.redoStack().length).toBe(0);
    expect(cmd1.destroyCalled).toBe(1);
    expect(cmd2.destroyCalled).toBe(1);
  });

  it('should invoke destroy on evicted command when capacity limit is exceeded', () => {
    service.configure({ maxHistoryLength: 2 });
    const cmd1 = new MockCommand('1');
    const cmd2 = new MockCommand('2');
    const cmd3 = new MockCommand('3');

    service.execute(cmd1);
    service.execute(cmd2);
    expect(cmd1.destroyCalled).toBe(0);

    service.execute(cmd3);
    expect(cmd1.destroyCalled).toBe(1);
    expect(cmd2.destroyCalled).toBe(0);
    expect(cmd3.destroyCalled).toBe(0);
  });

  it('should invoke destroy on discarded redo commands when a new command is executed', async () => {
    const cmd1 = new MockCommand('1');
    const cmd2 = new MockCommand('2');
    service.execute(cmd1);
    service.execute(cmd2);

    await service.undo();
    expect(cmd2.destroyCalled).toBe(0);

    const cmd3 = new MockCommand('3');
    service.execute(cmd3);

    expect(cmd2.destroyCalled).toBe(1);
    expect(cmd1.destroyCalled).toBe(0);
  });

  it('should rollback and destroy partial commands when transaction throws', async () => {
    const cmd1 = new MockCommand('Sub 1');
    const cmd2 = new MockCommand('Sub 2');

    await expect(
      service.runInTransaction('Transação com falha', 'media', () => {
        service.execute(cmd1);
        service.execute(cmd2);
        throw new Error('Falha simulada na transação');
      })
    ).rejects.toThrow('Falha simulada na transação');

    expect(service.undoStack().length).toBe(0);
    expect(cmd2.undoCalled).toBe(1);
    expect(cmd1.undoCalled).toBe(1);
    expect(cmd2.destroyCalled).toBe(1);
    expect(cmd1.destroyCalled).toBe(1);
  });
});
