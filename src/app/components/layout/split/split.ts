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
  selector: 'app-split',
  imports: [],
  templateUrl: './split.html',
  styleUrl: './split.scss',
})
export class Split implements OnDestroy {
  private readonly renderer2 = inject(Renderer2);

  public readonly direction = input<SplitDirection>('horizontal');
  public readonly defaultSize = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly minSizePercentage = input<number>(10);
  public readonly collapsed = input<SplitCollapsedState>('none');
  public readonly layoutChanged = output<void>();

  protected readonly size = linkedSignal(() => this.defaultSize());
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];

  private isResizing = false;
  private startPointerPos = 0;
  private startSize = 0;

  /**
   * Checks whether the first area is collapsed.
   *
   * @returns `true` if the first area is collapsed, `false` otherwise.
   */
  protected isFirstCollapsed(): boolean {
    const state = this.collapsed();
    return state === 'first' || state === 'left' || state === 'top';
  }

  /**
   * Checks whether the second area is collapsed.
   *
   * @returns `true` if the second area is collapsed, `false` otherwise.
   */
  protected isSecondCollapsed(): boolean {
    const state = this.collapsed();
    return state === 'second' || state === 'right' || state === 'bottom';
  }

  /**
   * Checks whether neither area is collapsed.
   *
   * @returns `true` if neither area is collapsed, `false` otherwise.
   */
  protected isCollapsedNone(): boolean {
    return !this.isFirstCollapsed() && !this.isSecondCollapsed();
  }

  /**
   * Handles pointerdown event on the resize bar to initiate dragging.
   *
   * @param event The pointer event.
   */
  protected resizeBarPointerDown(event: PointerEvent) {
    this.isResizing = true;
    this.startPointerPos = this.direction() === 'horizontal' ? event.clientX : event.clientY;
    this.startSize = this.size();
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

    const isHorizontal = this.direction() === 'horizontal';
    const isDecreaseKey = isHorizontal ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
    const isIncreaseKey = isHorizontal ? event.key === 'ArrowRight' : event.key === 'ArrowDown';

    if (isDecreaseKey) {
      this.size.set(Math.max(this.size() - step, this.minSizePercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (isIncreaseKey) {
      this.size.set(Math.min(this.size() + step, 100 - this.minSizePercentage()));
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'Home') {
      this.size.set(this.minSizePercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    } else if (event.key === 'End') {
      this.size.set(100 - this.minSizePercentage());
      this.layoutChanged.emit();
      event.preventDefault();
    }
  }

  constructor() {
    afterNextRender(() => {
      this.unlisteners.push(
        this.renderer2.listen('window', 'pointermove', (event: PointerEvent) => {
          if (this.isResizing) {
            const containerRect = this.splitContainer()?.nativeElement.getBoundingClientRect();
            const containerDimension =
              this.direction() === 'horizontal' ? (containerRect?.width || 0) : (containerRect?.height || 0);

            if (containerDimension > 0) {
              const currentPos = this.direction() === 'horizontal' ? event.clientX : event.clientY;
              const delta = currentPos - this.startPointerPos;
              const newSize = this.startSize + (delta / containerDimension) * 100;
              const clampedSize = Math.min(
                Math.max(newSize, this.minSizePercentage()),
                100 - this.minSizePercentage()
              );

              if (clampedSize !== this.size()) {
                this.size.set(clampedSize);
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

export type SplitDirection = 'horizontal' | 'vertical';
export type SplitCollapsedState = 'first' | 'second' | 'none' | 'left' | 'right' | 'top' | 'bottom';
