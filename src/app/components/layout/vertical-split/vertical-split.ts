import { Component, WritableSignal, signal, viewChild, ElementRef, afterNextRender, inject, Renderer2, input } from '@angular/core';

@Component({
  selector: 'app-vertical-split',
  imports: [],
  templateUrl: './vertical-split.html',
  styleUrl: './vertical-split.scss',
})
export class VerticalSplit {
  private readonly renderer2 = inject(Renderer2);
  
  public readonly defaultTopHeight = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly resizeBarLeftMargin = input<string>('0px');
  public readonly resizeBarRightMargin = input<string>('0px');
  
  protected topHeight!: WritableSignal<number>;
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];
  
  private isResizing = false;
  private startY = 0;
  private startTopHeight = 0;
  
  private static readonly MIN_HEIGHT_PERCENTAGE = 0.5; // Minimum height percentage for the areas

  protected resizeBarPointerDown(event: PointerEvent) {
    this.isResizing = true;
    this.startY = event.clientY;
    this.startTopHeight = this.topHeight();
    event.preventDefault();
  }

  protected resizeBarKeyDown(event: KeyboardEvent) {
    let step = 1; // Step size in percentage
    
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      step = 5; // Increase step size when Ctrl key is pressed
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      step = 0.5; // Decrease step size when Shift key is pressed
    } else if (event.ctrlKey && event.shiftKey) {
      step = 10; // Increase step size when both Ctrl and Shift keys are pressed
    }

    if (event.key === 'ArrowUp') {
      this.topHeight.set(Math.max(this.topHeight() - step, VerticalSplit.MIN_HEIGHT_PERCENTAGE));
    } else if (event.key === 'ArrowDown') {
      this.topHeight.set(Math.min(this.topHeight() + step, 100 - VerticalSplit.MIN_HEIGHT_PERCENTAGE));
    }
  }
  
  ngOnInit() {
    this.topHeight = signal(this.defaultTopHeight());
  }

  constructor() {
    afterNextRender(() => {
      this.unlisteners.push(
        this.renderer2.listen('window', 'pointermove', (event: PointerEvent) => {
          if (this.isResizing) {
            const containerHeight = this.splitContainer()?.nativeElement.getBoundingClientRect().height || 0;
            const deltaX = event.clientY - this.startY;
            const newTopHeight = this.startTopHeight + (deltaX / containerHeight) * 100;
            
            // Ensure the new height is within the allowed range
            if (newTopHeight >= VerticalSplit.MIN_HEIGHT_PERCENTAGE && newTopHeight <= 100 - VerticalSplit.MIN_HEIGHT_PERCENTAGE) {
              this.topHeight.set(newTopHeight);
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
  }

  ngOnDestroy() {
    this.unlisteners.forEach(unlistener => unlistener());
  }
}
