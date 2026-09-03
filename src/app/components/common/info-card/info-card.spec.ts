import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { InfoCard, type InfoCardType } from './info-card';

describe('InfoCard', () => {
  let component: InfoCard;
  let fixture: ComponentFixture<InfoCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoCard],
    }).compileComponents();

    fixture = TestBed.createComponent(InfoCard);
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
    const testCases: { type: InfoCardType, expectedRole: string, expectedClass: string }[] = [
      { type: 'warning', expectedRole: 'status', expectedClass: 'warning' },
      { type: 'info', expectedRole: 'status', expectedClass: 'info' },
      { type: 'error', expectedRole: 'alert', expectedClass: 'error' },
      { type: 'loading-segments', expectedRole: 'status', expectedClass: 'loading-segments' },
    ];

    for (const { type, expectedRole, expectedClass } of testCases) {
      it(`should render role="${expectedRole}" and class "${expectedClass}" for type "${type}"`, () => {
        fixture.componentRef.setInput('type', type);
        fixture.detectChanges();

        const cardElement = fixture.debugElement.query(By.css('.info-card'));
        expect(cardElement).toBeTruthy();
        expect(cardElement.nativeElement.getAttribute('role')).toBe(expectedRole);
        expect(cardElement.nativeElement.classList.contains(expectedClass)).toBe(true);

        const svgElement = cardElement.query(By.css('svg'));
        expect(svgElement).toBeTruthy();
        expect(svgElement.nativeElement.getAttribute('aria-hidden')).toBe('true');
      });
    }
  });
});
