import { Component, WritableSignal, signal, viewChild, ElementRef, afterNextRender, inject, Renderer2, input, output, effect, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-horizontal-split',
  imports: [],
  templateUrl: './horizontal-split.html',
  styleUrl: './horizontal-split.scss',
})
export class HorizontalSplit implements OnInit, OnDestroy {
  private readonly renderer2 = inject(Renderer2);
  
  public readonly defaultLeftWidth = input<number>(50);
  public readonly resizeBarAriaLabel = input.required<string>();
  public readonly resizeBarTopMargin = input<string>('0px');
  public readonly resizeBarBottomMargin = input<string>('0px');
  public readonly minWidthPercentage = input<number>(10);
  public readonly collapsed = input<CollapsedState>('none');
  public readonly layoutChanged = output<void>();
  
  protected leftWidth!: WritableSignal<number>;
  private readonly splitContainer = viewChild<ElementRef<HTMLDivElement>>('splitContainer');
  private readonly unlisteners: (() => void)[] = [];
  
  private isResizing = false;
  private startX = 0;
  private startLeftWidth = 0;
  
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
      this.leftWidth.set(Math.max(this.leftWidth() - step, this.minWidthPercentage()));
      this.layoutChanged.emit();
    } else if (event.key === 'ArrowRight') {
      this.leftWidth.set(Math.min(this.leftWidth() + step, 100 - this.minWidthPercentage()));
      this.layoutChanged.emit();
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
            if (newLeftWidth >= this.minWidthPercentage() && newLeftWidth <= 100 - this.minWidthPercentage()) {
              this.leftWidth.set(newLeftWidth);
              this.layoutChanged.emit();
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
    this.unlisteners.forEach(unlistener => unlistener());
  }
}

export type CollapsedState = 'left' | 'right' | 'none';
