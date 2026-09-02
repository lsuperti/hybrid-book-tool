import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { VerticalSplit } from './vertical-split';

describe('VerticalSplit', () => {
  let component: VerticalSplit;
  let fixture: ComponentFixture<VerticalSplit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerticalSplit],
    }).compileComponents();

    fixture = TestBed.createComponent(VerticalSplit);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resizeBarAriaLabel', 'Resize bar');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize topHeight with defaultTopHeight input', () => {
    expect(component['topHeight']()).toBe(50);
  });

  it('should render ARIA attributes correctly on resize bar', async () => {
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));
    expect(resizeBar).toBeTruthy();
    expect(resizeBar.attributes['role']).toBe('separator');
    expect(resizeBar.attributes['aria-orientation']).toBe('horizontal');
    expect(resizeBar.attributes['aria-label']).toBe('Resize bar');
    expect(resizeBar.attributes['aria-valuenow']).toBe('50');
    expect(resizeBar.attributes['aria-valuemin']).toBe('1');
    expect(resizeBar.attributes['aria-valuemax']).toBe('99');
    expect(resizeBar.attributes['tabindex']).toBe('0');
  });

  it('should adjust topHeight on ArrowUp and ArrowDown key events', async () => {
    let layoutChangedEmitted = false;
    component.layoutChanged.subscribe(() => {
      layoutChangedEmitted = true;
    });

    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    // Test ArrowUp decreases topHeight by 1
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowUp',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(49);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowDown with Ctrl increases topHeight by 5
    layoutChangedEmitted = false;
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowDown',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(54);
    expect(layoutChangedEmitted).toBe(true);

    // Test ArrowUp with Shift decreases topHeight by 0.5
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowUp',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(53.5);

    // Test ArrowDown with Ctrl and Shift increases topHeight by 10
    resizeBar.triggerEventHandler('keydown', {
      key: 'ArrowDown',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(63.5);
  });

  it('should handle Home and End keys to set min and max height', () => {
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    resizeBar.triggerEventHandler('keydown', {
      key: 'Home',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(component.minHeightPercentage());

    resizeBar.triggerEventHandler('keydown', {
      key: 'End',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(component['topHeight']()).toBe(100 - component.minHeightPercentage());
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
      clientY: 100,
      preventDefault: vi.fn(),
    });

    expect(component['isResizing']).toBe(true);

    // Move pointer down by 40px (+20% in a 200px container)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 140 }));
    expect(component['topHeight']()).toBe(70);

    // Move pointer far down past max (300px -> +100% -> clamped to 90)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 }));
    expect(component['topHeight']()).toBe(99);

    // Move pointer far up past min (-200px -> clamped to 10)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: -200 }));
    expect(component['topHeight']()).toBe(1);

    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(component['isResizing']).toBe(false);
  });

  it('should update layout when collapsed input changes', async () => {
    let layoutChangedCount = 0;
    component.layoutChanged.subscribe(() => {
      layoutChangedCount++;
    });

    fixture.componentRef.setInput('collapsed', 'top');
    await fixture.whenStable();

    expect(layoutChangedCount).toBeGreaterThan(0);

    const container = fixture.debugElement.query(By.css('.split-container'));
    expect(container.nativeElement.style.getPropertyValue('--top-height')).toBe('0%');

    const topArea = fixture.debugElement.query(By.css('.top-area'));
    const bottomArea = fixture.debugElement.query(By.css('.bottom-area'));
    const resizeBar = fixture.debugElement.query(By.css('.resize-bar'));

    expect(topArea).toBeNull();
    expect(bottomArea).toBeTruthy();
    expect(resizeBar).toBeNull();

    fixture.componentRef.setInput('collapsed', 'bottom');
    await fixture.whenStable();

    expect(container.nativeElement.style.getPropertyValue('--top-height')).toBe('100%');
    expect(fixture.debugElement.query(By.css('.top-area'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.bottom-area'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.resize-bar'))).toBeNull();
  });
});
