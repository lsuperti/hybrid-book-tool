import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { HorizontalSplit } from './horizontal-split';

describe('HorizontalSplit', () => {
  let component: HorizontalSplit;
  let fixture: ComponentFixture<HorizontalSplit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HorizontalSplit],
    }).compileComponents();

    fixture = TestBed.createComponent(HorizontalSplit);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resizeBarAriaLabel', 'Resize bar');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize leftWidth with defaultLeftWidth input', () => {
    expect(component['leftWidth']()).toBe(50);
  });

  it('should render ARIA attributes correctly on resize bar', async () => {
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

  it('should adjust leftWidth on ArrowLeft and ArrowRight key events', async () => {
    let layoutChangedEmitted = false;
    component.layoutChanged.subscribe(() => {
      layoutChangedEmitted = true;
    });

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    // Test ArrowLeft decreases leftWidth by 1
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowLeft',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(49);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowRight with Ctrl increases leftWidth by 5
    layoutChangedEmitted = false;
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(54);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowLeft with Shift decreases leftWidth by 0.5
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowLeft',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(53.5);

    // Test ArrowRight with Ctrl and Shift increases leftWidth by 10
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(63.5);
  });

  it('should handle Home and End keys to set min and max width', () => {
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    resizeBar.triggerEventHandler('keydown', {
      key: 'Home',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(component.minWidthPercentage());

    resizeBar.triggerEventHandler('keydown', {
      key: 'End',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['leftWidth']()).toBe(100 - component.minWidthPercentage());
  });

  it('should handle pointer drag and clamp to min and max boundaries', async () => {
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
    expect(component['leftWidth']()).toBe(70);

    // Move pointer far right past max (300px -> +100% -> clamped to 90)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }));
    expect(component['leftWidth']()).toBe(90);

    // Move pointer far left past min (-200px -> clamped to 10)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -200 }));
    expect(component['leftWidth']()).toBe(10);

    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(component['isResizing']).toBe(false);
  });

  it('should update layout when collapsed input changes', async () => {
    let layoutChangedCount = 0;
    component.layoutChanged.subscribe(() => {
      layoutChangedCount++;
    });

    fixture.componentRef.setInput('collapsed', 'left');
    await fixture.whenStable();

    expect(layoutChangedCount).toBeGreaterThan(0);

    const container = fixture.debugElement.query(By.css('.split-container'));
    expect(container.nativeElement.style.getPropertyValue('--left-width')).toBe('0%');

    const leftArea = fixture.debugElement.query(By.css('.left-area'));
    const rightArea = fixture.debugElement.query(By.css('.right-area'));
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    expect(leftArea).toBeNull();
    expect(rightArea).toBeTruthy();
    expect(resizeBar).toBeNull();

    fixture.componentRef.setInput('collapsed', 'right');
    await fixture.whenStable();

    expect(container.nativeElement.style.getPropertyValue('--left-width')).toBe('100%');
    expect(fixture.debugElement.query(By.css('.left-area'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.right-area'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.resize-bar'))).toBeNull();
  });
});
