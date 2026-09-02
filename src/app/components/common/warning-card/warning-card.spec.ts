import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { WarningCard, type WarningCardType, type Side } from './warning-card';

describe('WarningCard', () => {
  let component: WarningCard;
  let fixture: ComponentFixture<WarningCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WarningCard],
    }).compileComponents();

    fixture = TestBed.createComponent(WarningCard);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('message', 'Test warning message');
    fixture.componentRef.setInput('type', 'warning');

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the provided message text', () => {
    fixture.componentRef.setInput('message', 'Custom notification text');
    fixture.detectChanges();

    const paragraph = fixture.debugElement.query(By.css('p'));
    expect(paragraph).toBeTruthy();
    expect(paragraph.nativeElement.textContent.trim()).toBe('Custom notification text');
  });

  describe('Card Types and Roles', () => {
    const testCases: { type: WarningCardType, expectedRole: string, expectedClass: string }[] = [
      { type: 'warning', expectedRole: 'status', expectedClass: 'warning' },
      { type: 'info', expectedRole: 'status', expectedClass: 'info' },
      { type: 'error', expectedRole: 'alert', expectedClass: 'error' },
      { type: 'loading-segments', expectedRole: 'status', expectedClass: 'loading-segments' },
    ];

    for (const { type, expectedRole, expectedClass } of testCases) {
      it(`should render role="${expectedRole}" and class "${expectedClass}" for type "${type}"`, () => {
        fixture.componentRef.setInput('type', type);
        fixture.detectChanges();

        const cardElement = fixture.debugElement.query(By.css('.warning-card'));
        expect(cardElement).toBeTruthy();
        expect(cardElement.nativeElement.getAttribute('role')).toBe(expectedRole);
        expect(cardElement.nativeElement.classList.contains(expectedClass)).toBe(true);

        const svgElement = cardElement.query(By.css('svg'));
        expect(svgElement).toBeTruthy();
        expect(svgElement.nativeElement.getAttribute('aria-hidden')).toBe('true');
      });
    }
  });

  describe('Half-Width Margin Attributes', () => {
    it('should not set any halfWidth attributes by default when margin list is empty', () => {
      fixture.componentRef.setInput('halfWidthMargin', []);
      fixture.detectChanges();

      const cardElement = fixture.debugElement.query(By.css('.warning-card'));
      expect(cardElement.nativeElement.getAttribute('halfWidthLeft')).toBeNull();
      expect(cardElement.nativeElement.getAttribute('halfWidthRight')).toBeNull();
      expect(cardElement.nativeElement.getAttribute('halfWidthTop')).toBeNull();
      expect(cardElement.nativeElement.getAttribute('halfWidthBottom')).toBeNull();
    });

    it('should set specified halfWidth attributes when sides are provided', () => {
      const sides: Side[] = ['left', 'top'];
      fixture.componentRef.setInput('halfWidthMargin', sides);
      fixture.detectChanges();

      const cardElement = fixture.debugElement.query(By.css('.warning-card'));
      expect(cardElement.nativeElement.getAttribute('halfWidthLeft')).toBe('true');
      expect(cardElement.nativeElement.getAttribute('halfWidthTop')).toBe('true');
      expect(cardElement.nativeElement.getAttribute('halfWidthRight')).toBeNull();
      expect(cardElement.nativeElement.getAttribute('halfWidthBottom')).toBeNull();
    });

    it('should set all halfWidth attributes when all four sides are provided', () => {
      const allSides: Side[] = ['left', 'right', 'top', 'bottom'];
      fixture.componentRef.setInput('halfWidthMargin', allSides);
      fixture.detectChanges();

      const cardElement = fixture.debugElement.query(By.css('.warning-card'));
      expect(cardElement.nativeElement.getAttribute('halfWidthLeft')).toBe('true');
      expect(cardElement.nativeElement.getAttribute('halfWidthRight')).toBe('true');
      expect(cardElement.nativeElement.getAttribute('halfWidthTop')).toBe('true');
      expect(cardElement.nativeElement.getAttribute('halfWidthBottom')).toBe('true');
    });
  });
});
