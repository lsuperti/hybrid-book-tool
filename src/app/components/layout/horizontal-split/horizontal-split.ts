import { Component, WritableSignal, signal, viewChild, ElementRef, afterNextRender, inject, Renderer2, input } from '@angular/core';

@Component({
  selector: 'app-horizontal-split',
  imports: [],
  templateUrl: './horizontal-split.html',
  styleUrl: './horizontal-split.scss',
})
export class HorizontalSplit {
  private readonly renderer2 = inject(Renderer2);
  
  public readonly defaultLeftWidth = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly resizeBarTopMargin = input<string>('0px');
  public readonly resizeBarBottomMargin = input<string>('0px');
  
  protected leftWidth!: WritableSignal<number>;
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];
  
  private isResizing = false;
  private startX = 0;
  private startLeftWidth = 0;
  
  private static readonly MIN_WIDTH_PERCENTAGE = 10; // Minimum width percentage for the areas

  protected resizeBarPointerDown(event: PointerEvent) {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startLeftWidth = this.leftWidth();
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

    if (event.key === 'ArrowLeft') {
      this.leftWidth.set(Math.max(this.leftWidth() - step, HorizontalSplit.MIN_WIDTH_PERCENTAGE));
    } else if (event.key === 'ArrowRight') {
      this.leftWidth.set(Math.min(this.leftWidth() + step, 100 - HorizontalSplit.MIN_WIDTH_PERCENTAGE));
    }
  }
  
  ngOnInit() {
    this.leftWidth = signal(this.defaultLeftWidth());
  }

  constructor() {
    afterNextRender(() => {
      this.unlisteners.push(
        this.renderer2.listen('window', 'pointermove', (event: PointerEvent) => {
          if (this.isResizing) {
            const containerWidth = this.splitContainer()?.nativeElement.getBoundingClientRect().width || 0;
            const deltaX = event.clientX - this.startX;
            const newLeftWidth = this.startLeftWidth + (deltaX / containerWidth) * 100;
            
            // Ensure the new width is within the allowed range
            if (newLeftWidth >= HorizontalSplit.MIN_WIDTH_PERCENTAGE && newLeftWidth <= 100 - HorizontalSplit.MIN_WIDTH_PERCENTAGE) {
              this.leftWidth.set(newLeftWidth);
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
