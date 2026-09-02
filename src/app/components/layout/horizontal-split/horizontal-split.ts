import {
  Component,
  linkedSignal,
  viewChild,
  ElementRef,
  afterNextRender,
  inject,
  Renderer2,
  input,
  output,
  effect,
  OnDestroy
} from '@angular/core';

@Component({
  selector: 'app-horizontal-split',
  imports: [],
  templateUrl: './horizontal-split.html',
  styleUrl: './horizontal-split.scss',
})
export class HorizontalSplit implements OnDestroy {
  private readonly renderer2 = inject(Renderer2);

  public readonly defaultLeftWidth = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly resizeBarTopMargin = input<string>('0px');
  public readonly resizeBarBottomMargin = input<string>('0px');
  public readonly minWidthPercentage = input<number>(10);
  public readonly collapsed = input<CollapsedState>('none');
  public readonly layoutChanged = output<void>();

  protected readonly leftWidth = linkedSignal(() => this.defaultLeftWidth());
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];

  private isResizing = false;
  private startX = 0;
  private startLeftWidth = 0;

  /**
   * Handles pointerdown event on the resize bar to initiate dragging.
   *
   * @param event The pointer event.
   */
  protected resizeBarPointerDown(event: PointerEvent) {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startLeftWidth = this.leftWidth();
    event.preventDefault();
  }

  /**
   * Handles keydown events on the resize bar for keyboard-based resizing.
   *
   * @param event The keyboard event.
   */
  protected resizeBarKeyDown(event: KeyboardEvent) {
    // Step size in percentage.
    let step = 1;

    // Increase step size when Ctrl key is pressed.
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      step = 5;
    
    // Decrease step size when Shift key is pressed.
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      step = 0.5;
    
    // Increase step size when both Ctrl and Shift keys are pressed.
    } else if (event.ctrlKey && event.shiftKey) {
      step = 10;
    }

    if (event.key === 'ArrowLeft') {
      this.leftWidth.set(Math.max(this.leftWidth() - step, this.minWidthPercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.leftWidth.set(Math.min(this.leftWidth() + step, 100 - this.minWidthPercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'Home') {
      this.leftWidth.set(this.minWidthPercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'End') {
      this.leftWidth.set(100 - this.minWidthPercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    }
  }

  constructor() {
    afterNextRender(() => {
      this.unlisteners.push(
        this.renderer2.listen('window', 'pointermove', (event: PointerEvent) => {
          if (this.isResizing) {
            const containerWidth = this.splitContainer()?.nativeElement.getBoundingClientRect().width || 0;
            if (containerWidth > 0) {
              const deltaX = event.clientX - this.startX;
              const newLeftWidth = this.startLeftWidth + (deltaX / containerWidth) * 100;
              const clampedWidth = Math.min(
                Math.max(newLeftWidth, this.minWidthPercentage()),
                100 - this.minWidthPercentage()
              );

              if (clampedWidth !== this.leftWidth()) {
                this.leftWidth.set(clampedWidth);
                this.layoutChanged.emit();
              }
            }
          }
        })
      );

      this.unlisteners.push(
        this.renderer2.listen('window', 'pointerup', () => {
          if (this.isResizing) {
            this.isResizing = false;
          }
        })
      );
    });

    effect(() => {
      this.collapsed();
      this.layoutChanged.emit();
    });
  }

  ngOnDestroy() {
    this.unlisteners.forEach((unlistener) => unlistener());
  }
}

export type CollapsedState = 'left' | 'right' | 'none';
