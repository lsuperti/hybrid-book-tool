import {
  Component,
  signal,
  computed,
  inject,
  Renderer2,
  OnDestroy,
  viewChildren,
  ElementRef,
} from '@angular/core';
import { Ingest } from '../ingest/ingest';
import { TextSegmentation } from '../text-segmentation/text-segmentation';
import { VideoSegmentation } from '../video-segmentation/video-segmentation';
import { Correlation } from '../correlation/correlation';
import { Export } from '../export/export';
import { UndoRedoService } from '../../../services/undo/undo-redo';

export type Tab = 'ingest' | 'text-segmentation' | 'video-segmentation' | 'correlation' | 'export';

export const WORKFLOW_TABS: readonly Tab[] = [
  'ingest',
  'text-segmentation',
  'video-segmentation',
  'correlation',
  'export',
];

/**
 * Root workflow component orchestrating the main application phases,
 * global keyboard shortcuts (Ctrl+Z / Ctrl+Y), and undo/redo controls.
 */
@Component({
  selector: 'app-workflow',
  imports: [Ingest, TextSegmentation, VideoSegmentation, Correlation, Export],
  templateUrl: './workflow.html',
  styleUrl: './workflow.scss',
})
export class Workflow implements OnDestroy {
  protected readonly currentTab = signal<Tab>('ingest');
  protected readonly undoRedoService = inject(UndoRedoService);
  protected readonly lastActionAnnouncement = signal<string>('');

  protected readonly undoTitle = computed(() => {
    const desc = this.undoRedoService.lastUndoDescription();
    return desc ? `Desfazer: ${desc} (Ctrl+Z)` : 'Desfazer (Ctrl+Z)';
  });

  protected readonly redoTitle = computed(() => {
    const desc = this.undoRedoService.lastRedoDescription();
    return desc ? `Refazer: ${desc} (Ctrl+Y)` : 'Refazer (Ctrl+Y)';
  });

  protected readonly undoAriaLabel = computed(() => {
    const desc = this.undoRedoService.lastUndoDescription();
    return desc ? `Desfazer ${desc}` : 'Desfazer';
  });

  protected readonly redoAriaLabel = computed(() => {
    const desc = this.undoRedoService.lastRedoDescription();
    return desc ? `Refazer ${desc}` : 'Refazer';
  });

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly renderer2 = inject(Renderer2);
  private readonly unlisteners: (() => void)[] = [];

  constructor() {
    this.unlisteners.push(
      this.renderer2.listen('window', 'keydown', (event: KeyboardEvent) => {
        this.handleGlobalKeydown(event);
      })
    );
  }

  /**
   * Switches the active workflow view tab.
   *
   * @param tab The target workflow tab.
   */
  protected tabButtonClick(tab: Tab): void {
    this.currentTab.set(tab);
  }

  /**
   * Handles keyboard navigation within the tabs list according to the WAI-ARIA APG Tabs pattern.
   * Supports ArrowRight, ArrowLeft, Home, and End keys with roving tabindex.
   *
   * @param event The keyboard event.
   * @param tab The tab identifier that received the keydown event.
   */
  protected onTabKeydown(event: KeyboardEvent, tab: Tab): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const currentIndex = WORKFLOW_TABS.indexOf(tab);
    let targetIndex = -1;

    if (event.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % WORKFLOW_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + WORKFLOW_TABS.length) % WORKFLOW_TABS.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = WORKFLOW_TABS.length - 1;
    }

    if (targetIndex !== -1) {
      event.preventDefault();
      const targetTab = WORKFLOW_TABS[targetIndex];
      this.currentTab.set(targetTab);
      const buttons = this.tabButtons();
      const targetButton = buttons[targetIndex];
      targetButton?.nativeElement.focus();
    }
  }

  /**
   * Triggers an undo operation via the UndoRedoService.
   */
  protected onUndo(): void {
    const desc = this.undoRedoService.lastUndoDescription();
    void this.undoRedoService.undo().then(() => {
      if (desc) {
        this.lastActionAnnouncement.set(`Desfeito: ${desc}`);
      }
    });
  }

  /**
   * Triggers a redo operation via the UndoRedoService.
   */
  protected onRedo(): void {
    const desc = this.undoRedoService.lastRedoDescription();
    void this.undoRedoService.redo().then(() => {
      if (desc) {
        this.lastActionAnnouncement.set(`Refeito: ${desc}`);
      }
    });
  }

  /**
   * Handles application-wide shortcut keys for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z).
   *
   * @param event The keyboard event.
   */
  private handleGlobalKeydown(event: KeyboardEvent): void {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta) {
      return;
    }

    if (event.key === 'z' || event.key === 'Z') {
      if (event.shiftKey) {
        if (this.undoRedoService.canRedo()) {
          event.preventDefault();
          this.onRedo();
        }
      } else {
        if (this.undoRedoService.canUndo()) {
          event.preventDefault();
          this.onUndo();
        }
      }
    } else if (event.key === 'y' || event.key === 'Y') {
      if (this.undoRedoService.canRedo()) {
        event.preventDefault();
        this.onRedo();
      }
    }
  }

  ngOnDestroy(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
  }
}
