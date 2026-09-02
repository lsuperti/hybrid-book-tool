import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { Split } from './split';

describe('Split', () => {
  let component: Split;
  let fixture: ComponentFixture<Split>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Split],
    }).compileComponents();

    fixture = TestBed.createComponent(Split);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resizeBarAriaLabel', 'Resize bar');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize size with defaultSize input', () => {
    expect(component['size']()).toBe(50);
  });

  it('should render ARIA attributes correctly on resize bar for horizontal split', async () => {
    fixture.componentRef.setInput('direction', 'horizontal');
    await fixture.whenStable();

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));
    expect(resizeBar).toBeTruthy();
    expect(resizeBar.attributes['role']).toBe('separator');
    expect(resizeBar.attributes['aria-orientation']).toBe('vertical');
    expect(resizeBar.attributes['aria-label']).toBe('Resize bar');
    expect(resizeBar.attributes['aria-valuenow']).toBe('50');
    expect(resizeBar.attributes['aria-valuemin']).toBe('10');
    expect(resizeBar.attributes['aria-valuemax']).toBe('90');
    expect(resizeBar.attributes['tabindex']).toBe('0');
  });

  it('should render ARIA attributes correctly on resize bar for vertical split', async () => {
    fixture.componentRef.setInput('direction', 'vertical');
    await fixture.whenStable();

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));
    expect(resizeBar).toBeTruthy();
    expect(resizeBar.attributes['role']).toBe('separator');
    expect(resizeBar.attributes['aria-orientation']).toBe('horizontal');
  });

  it('should adjust size on horizontal arrow key events', async () => {
    fixture.componentRef.setInput('direction', 'horizontal');
    await fixture.whenStable();

    let layoutChangedEmitted = false;
    component.layoutChanged.subscribe(() => {
      layoutChangedEmitted = true;
    });

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    // Test ArrowLeft decreases size by 1
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowLeft',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(49);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowRight with Ctrl increases size by 5
    layoutChangedEmitted = false;
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(54);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowLeft with Shift decreases size by 0.5
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowLeft',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(53.5);

    // Test ArrowRight with Ctrl and Shift increases size by 10
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(63.5);
  });

  it('should adjust size on vertical arrow key events', async () => {
    fixture.componentRef.setInput('direction', 'vertical');
    await fixture.whenStable();

    let layoutChangedEmitted = false;
    component.layoutChanged.subscribe(() => {
      layoutChangedEmitted = true;
    });

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    // Test ArrowUp decreases size by 1
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowUp',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(49);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowDown with Ctrl increases size by 5
    layoutChangedEmitted = false;
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowDown',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(54);
    expect(layoutChangedEmitted).toBe(true);
  });

  it('should handle Home and End keys to set min and max size', () => {
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    resizeBar.triggerEventHandler('keydown', {
      key: 'Home',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(component.minSizePercentage());

    resizeBar.triggerEventHandler('keydown', {
      key: 'End',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['size']()).toBe(100 - component.minSizePercentage());
  });

  it('should handle pointer drag horizontally and clamp to min and max boundaries', async () => {
    fixture.componentRef.setInput('direction', 'horizontal');
    await fixture.whenStable();

    const container = component['splitContainer']()?.nativeElement;
    if (container) {
      Object.defineProperty(container, 'getBoundingClientRect', {
        value: () => ({ height: 200, width: 200, top: 0, left: 0, bottom: 200, right: 200 }),
        configurable: true,
      });
    }

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));
    resizeBar.triggerEventHandler('pointerdown', {
      clientX: 100,
      preventDefault: vi.fn(),
    });

    expect(component['isResizing']).toBe(true);

    // Move pointer right by 40px (+20% in a 200px container)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 140 }));
    expect(component['size']()).toBe(70);

    // Move pointer far right past max (300px -> +100% -> clamped to 90)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }));
    expect(component['size']()).toBe(90);

    // Move pointer far left past min (-200px -> clamped to 10)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -200 }));
    expect(component['size']()).toBe(10);

    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(component['isResizing']).toBe(false);
  });

  it('should handle pointer drag vertically and clamp to min and max boundaries', async () => {
    fixture.componentRef.setInput('direction', 'vertical');
    await fixture.whenStable();

    const container = component['splitContainer']()?.nativeElement;
    if (container) {
      Object.defineProperty(container, 'getBoundingClientRect', {
        value: () => ({ height: 200, width: 200, top: 0, left: 0, bottom: 200, right: 200 }),
        configurable: true,
      });
    }

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));
    resizeBar.triggerEventHandler('pointerdown', {
      clientY: 100,
      preventDefault: vi.fn(),
    });

    expect(component['isResizing']).toBe(true);

    // Move pointer down by 40px (+20% in a 200px container)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 140 }));
    expect(component['size']()).toBe(70);

    // Move pointer far down past max (300px -> +100% -> clamped to 90)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 }));
    expect(component['size']()).toBe(90);

    // Move pointer far up past min (-200px -> clamped to 10)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: -200 }));
    expect(component['size']()).toBe(10);

    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(component['isResizing']).toBe(false);
  });

  it('should update layout when collapsed input changes', async () => {
    let layoutChangedCount = 0;
    component.layoutChanged.subscribe(() => {
      layoutChangedCount++;
    });

    fixture.componentRef.setInput('collapsed', 'first');
    await fixture.whenStable();

    expect(layoutChangedCount).toBeGreaterThan(0);

    const container = fixture.debugElement.query(By.css('.split-container'));
    expect(container.nativeElement.style.getPropertyValue('--first-size')).toBe('0%');

    const firstArea = fixture.debugElement.query(By.css('.first-area'));
    const secondArea = fixture.debugElement.query(By.css('.second-area'));
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    expect(firstArea).toBeNull();
    expect(secondArea).toBeTruthy();
    expect(resizeBar).toBeNull();

    fixture.componentRef.setInput('collapsed', 'second');
    await fixture.whenStable();

    expect(container.nativeElement.style.getPropertyValue('--first-size')).toBe('100%');
    expect(fixture.debugElement.query(By.css('.first-area'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.second-area'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.resize-bar'))).toBeNull();
  });
});
