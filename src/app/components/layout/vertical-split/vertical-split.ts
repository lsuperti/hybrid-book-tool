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
  selector: 'app-vertical-split',
  imports: [],
  templateUrl: './vertical-split.html',
  styleUrl: './vertical-split.scss',
})
export class VerticalSplit implements OnDestroy {
  private readonly renderer2 = inject(Renderer2);

  public readonly defaultTopHeight = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly resizeBarLeftMargin = input<string>('0px');
  public readonly resizeBarRightMargin = input<string>('0px');
  public readonly minHeightPercentage = input<number>(1);
  public readonly collapsed = input<CollapsedState>('none');
  public readonly layoutChanged = output<void>();

  protected readonly topHeight = linkedSignal(() => this.defaultTopHeight());
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];

  private isResizing = false;
  private startY = 0;
  private startTopHeight = 0;

  /**
   * Handles pointerdown event on the resize bar to initiate dragging.
   *
   * @param event The pointer event.
   */
  protected resizeBarPointerDown(event: PointerEvent) {
    this.isResizing = true;
    this.startY = event.clientY;
    this.startTopHeight = this.topHeight();
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

    if (event.key === 'ArrowUp') {
      this.topHeight.set(Math.max(this.topHeight() - step, this.minHeightPercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      this.topHeight.set(Math.min(this.topHeight() + step, 100 - this.minHeightPercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'Home') {
      this.topHeight.set(this.minHeightPercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'End') {
      this.topHeight.set(100 - this.minHeightPercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    }
  }

  constructor() {
    afterNextRender(() => {
      this.unlisteners.push(
        this.renderer2.listen('window', 'pointermove', (event: PointerEvent) => {
          if (this.isResizing) {
            const containerHeight = this.splitContainer()?.nativeElement.getBoundingClientRect().height || 0;
            if (containerHeight > 0) {
              const deltaY = event.clientY - this.startY;
              const newTopHeight = this.startTopHeight + (deltaY / containerHeight) * 100;
              const clampedHeight = Math.min(
                Math.max(newTopHeight, this.minHeightPercentage()),
                100 - this.minHeightPercentage()
              );

              if (clampedHeight !== this.topHeight()) {
                this.topHeight.set(clampedHeight);
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

export type CollapsedState = 'top' | 'bottom' | 'none';
