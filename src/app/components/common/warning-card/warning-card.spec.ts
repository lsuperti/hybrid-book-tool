import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WarningCard } from './warning-card';

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
});
