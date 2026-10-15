import {
  Component,
  input,
  signal,
  computed,
  inject,
  viewChild,
  ElementRef,
  afterNextRender,
  effect,
  DestroyRef,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { form, FormField, submit } from '@angular/forms/signals';
import { Split } from '../../layout/split/split';
import { Viewer } from '../../common/viewer/viewer';
import { ExportService } from '../../../services/export/export';
import { UndoRedoService } from '../../../services/undo/undo-redo';
import { UpdateExportMetadataCommand } from '../../../services/undo/commands/export-commands';
import { TextSegmentationService } from '../../../services/text-segmentation/text-segmentation';
import { VideoSegmentationService } from '../../../services/video-segmentation/video-segmentation';

/**
 * Metadata fields for the hybrid book imprint.
 */
export interface BookImprintMetadata {
  title: string,
  author: string,
  illustrations: string,
  rendering: string,
  editorialRevisions: string,
  performers: string,
  videoEngineer: string,
  videoEditing: string,
  soundEngineer: string,
  soundEditor: string,
  version: string,
  published: string,
  publisher: string,
  year: string,
  production: string,
  originalBook: OriginalBookMetadata,
}

/**
 * Metadata fields for the original book work.
 */
export interface OriginalBookMetadata {
  author: string,
  title: string,
  publicationNo: string,
  published: string,
  publisher: string,
  year: string,
  isbn: string,
  copyright: string,
}

/**
 * Export component allowing entry of hybrid book metadata and triggering export.
 */
@Component({
  selector: 'app-export',
  imports: [CommonModule, FormField, Split, Viewer],
  templateUrl: './export.html',
  styleUrl: './export.scss',
})
export class Export {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly exportService = inject(ExportService);
  private readonly undoRedoService = inject(UndoRedoService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly textSegmentationService = inject(TextSegmentationService);
  protected readonly videoSegmentationService = inject(VideoSegmentationService);
  private readonly exportSubmitButton = viewChild<ElementRef<HTMLButtonElement>>('exportSubmitButton');

  public readonly visible = input.required<boolean>();

  protected readonly activeTextSegments = computed(() => {
    return this.textSegmentationService.segments().filter((segment) => !segment.excluded);
  });

  protected readonly correlatedVideoSegments = computed(() => {
    return this.videoSegmentationService.correlatedSegments();
  });

  protected readonly alignedSegmentsCount = computed(() => {
    return Math.min(this.activeTextSegments().length, this.correlatedVideoSegments().length);
  });

  protected readonly hasSegmentMismatch = computed(() => {
    return (
      this.activeTextSegments().length > 0 &&
      this.correlatedVideoSegments().length > 0 &&
      this.activeTextSegments().length !== this.correlatedVideoSegments().length
    );
  });

  protected readonly isExporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exportSuccess = signal<string | null>(null);
  protected readonly reducedMotion = signal<boolean>(false);
  protected readonly exportProgress = signal<number>(0);
  protected readonly progressPercent = computed(() => Math.round(this.exportProgress() * 100));
  protected readonly strokeDashoffset = computed(() => {
    return Math.max(0, Math.min(100, 100 - this.exportProgress() * 100));
  });

  protected readonly buttonWidth = signal<number>(0);
  protected readonly buttonHeight = signal<number>(0);
  protected readonly buttonRadius = signal<number>(8);
  protected readonly strokeThickness = signal<number>(2);

  protected readonly metadataModel = signal<BookImprintMetadata>({
    title: '',
    author: '',
    illustrations: '',
    rendering: '',
    editorialRevisions: '',
    performers: '',
    videoEngineer: '',
    videoEditing: '',
    soundEngineer: '',
    soundEditor: '',
    version: '',
    published: '',
    publisher: '',
    year: '',
    production: '',
    originalBook: {
      author: '',
      title: '',
      publicationNo: '',
      published: '',
      publisher: '',
      year: '',
      isbn: '',
      copyright: '',
    },
  });

  protected readonly exportForm = form(this.metadataModel);

  private readonly unlisteners: (() => void)[] = [];
  private lastCommittedMetadata: BookImprintMetadata;
  private isApplyingUndoRedo = false;

  constructor() {
    this.lastCommittedMetadata = this.cloneMetadata(this.metadataModel());

    effect(() => {
      const current = this.metadataModel();
      if (this.isApplyingUndoRedo || this.undoRedoService.isOperating()) {
        this.lastCommittedMetadata = this.cloneMetadata(current);
        return;
      }

      if (this.isMetadataEqual(this.lastCommittedMetadata, current)) {
        return;
      }

      const before = this.lastCommittedMetadata;
      const after = this.cloneMetadata(current);
      this.lastCommittedMetadata = after;

      this.undoRedoService.execute(
        new UpdateExportMetadataCommand(before, after, (restored) => {
          this.isApplyingUndoRedo = true;
          try {
            this.metadataModel.set(this.cloneMetadata(restored));
            this.lastCommittedMetadata = this.cloneMetadata(restored);
          } finally {
            this.isApplyingUndoRedo = false;
          }
        })
      );
    });
    effect(() => {
      if (this.visible() && isPlatformBrowser(this.platformId)) {
        queueMicrotask(() => this.updateDimensions());
      }
    });

    if (isPlatformBrowser(this.platformId)) {
      if (typeof window.matchMedia === 'function') {
        const mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
        const listener = (event: MediaQueryListEvent) => {
          this.reducedMotion.set(event.matches);
        };
        mediaQueryList.addEventListener('change', listener);
        this.unlisteners.push(() => mediaQueryList.removeEventListener('change', listener));
      }

      afterNextRender(() => {
        const btn = this.exportSubmitButton()?.nativeElement;
        if (!btn) {
          return;
        }

        this.updateDimensions();

        if (typeof ResizeObserver === 'function') {
          const resizeObserver = new ResizeObserver(() => {
            this.updateDimensions();
          });
          resizeObserver.observe(btn);
          this.unlisteners.push(() => resizeObserver.disconnect());
        }
      });
    }

    this.destroyRef.onDestroy(() => {
      for (const unlisten of this.unlisteners) {
        unlisten();
      }
    });
  }

  /**
   * Updates the button dimension signals used for rendering the SVG progress outline.
   */
  protected updateDimensions(): void {
    const btn = this.exportSubmitButton()?.nativeElement;
    if (!btn) {
      return;
    }

    const rect = btn.getBoundingClientRect();
    const width = rect.width || btn.offsetWidth;
    const height = rect.height || btn.offsetHeight;

    if (width > 0 && height > 0) {
      this.buttonWidth.set(width);
      this.buttonHeight.set(height);

      const style = window.getComputedStyle(btn);
      const radius = parseFloat(style.borderRadius) || 8;
      const thickness = parseFloat(style.borderTopWidth) || 2;
      this.buttonRadius.set(radius);
      this.strokeThickness.set(thickness);
    }
  }

  /**
   * Triggers the hybrid book export process with progress tracking.
   */
  protected onExport(): void {
    this.updateDimensions();
    submit(this.exportForm, async () => {
      this.exportError.set(null);
      this.exportSuccess.set(null);
      this.exportProgress.set(0);
      this.isExporting.set(true);

      try {
        await this.exportService.exportBook(
          this.metadataModel(),
          (ratio) => this.exportProgress.set(ratio)
        );
        this.exportProgress.set(1);
        this.exportSuccess.set('Livro híbrido exportado com sucesso!');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Falha ao exportar livro híbrido.';
        this.exportError.set(message);
      } finally {
        this.isExporting.set(false);
      }
    });
  }

  protected onCloseAlertError(): void {
    this.exportError.set(null);
  }

  protected onCloseAlertSuccess(): void {
    this.exportSuccess.set(null);
  }

  private cloneMetadata(m: BookImprintMetadata): BookImprintMetadata {
    return {
      ...m,
      originalBook: { ...m.originalBook },
    };
  }

  private isMetadataEqual(a: BookImprintMetadata, b: BookImprintMetadata): boolean {
    if (
      a.title !== b.title ||
      a.author !== b.author ||
      a.illustrations !== b.illustrations ||
      a.rendering !== b.rendering ||
      a.editorialRevisions !== b.editorialRevisions ||
      a.performers !== b.performers ||
      a.videoEngineer !== b.videoEngineer ||
      a.videoEditing !== b.videoEditing ||
      a.soundEngineer !== b.soundEngineer ||
      a.soundEditor !== b.soundEditor ||
      a.version !== b.version ||
      a.published !== b.published ||
      a.publisher !== b.publisher ||
      a.year !== b.year ||
      a.production !== b.production
    ) {
      return false;
    }
    const oA = a.originalBook;
    const oB = b.originalBook;
    return (
      oA.author === oB.author &&
      oA.title === oB.title &&
      oA.publicationNo === oB.publicationNo &&
      oA.published === oB.published &&
      oA.publisher === oB.publisher &&
      oA.year === oB.year &&
      oA.isbn === oB.isbn &&
      oA.copyright === oB.copyright
    );
  }
}
