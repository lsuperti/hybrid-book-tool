import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { Workflow, WORKFLOW_TABS } from './workflow';
import { UndoRedoService } from '../../../services/undo/undo-redo';

describe('Workflow', () => {
  let component: Workflow;
  let fixture: ComponentFixture<Workflow>;
  let undoRedoService: UndoRedoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Workflow],
    }).compileComponents();

    fixture = TestBed.createComponent(Workflow);
    component = fixture.componentInstance;
    undoRedoService = TestBed.inject(UndoRedoService);
    await fixture.whenStable();
  });

  it('should create the workflow component', () => {
    expect(component).toBeTruthy();
  });

  describe('WAI-ARIA APG Tabs Pattern and Semantics', () => {
    it('should configure role=tablist on tabs navigation with an accessible label and horizontal orientation', () => {
      const tablist = fixture.debugElement.query(By.css('.tabs[role="tablist"]'));
      expect(tablist).toBeTruthy();
      expect(tablist.nativeElement.getAttribute('aria-label')).toBe('Abas do fluxo de trabalho');
      expect(tablist.nativeElement.getAttribute('aria-orientation')).toBe('horizontal');
    });

    it('should associate each tab with its corresponding tabpanel via aria-controls and aria-labelledby', () => {
      fixture.detectChanges();
      for (const tabId of WORKFLOW_TABS) {
        const tabButton = fixture.debugElement.query(By.css(`#tab-${tabId}`));
        const panel = fixture.debugElement.query(By.css(`#tabpanel-${tabId}`));

        expect(tabButton).toBeTruthy();
        expect(panel).toBeTruthy();

        expect(tabButton.nativeElement.getAttribute('role')).toBe('tab');
        expect(tabButton.nativeElement.getAttribute('aria-controls')).toBe(`tabpanel-${tabId}`);

        expect(panel.nativeElement.getAttribute('role')).toBe('tabpanel');
        expect(panel.nativeElement.getAttribute('aria-labelledby')).toBe(`tab-${tabId}`);
      }
    });

    it('should enforce roving tabindex on tabs (active tab has tabindex 0, inactive have -1)', () => {
      fixture.detectChanges();

      const ingestTab = fixture.debugElement.query(By.css('#tab-ingest'));
      const textSegTab = fixture.debugElement.query(By.css('#tab-text-segmentation'));
      const videoSegTab = fixture.debugElement.query(By.css('#tab-video-segmentation'));

      expect(ingestTab.nativeElement.getAttribute('tabindex')).toBe('0');
      expect(ingestTab.nativeElement.getAttribute('aria-selected')).toBe('true');

      expect(textSegTab.nativeElement.getAttribute('tabindex')).toBe('-1');
      expect(textSegTab.nativeElement.getAttribute('aria-selected')).toBe('false');

      expect(videoSegTab.nativeElement.getAttribute('tabindex')).toBe('-1');
      expect(videoSegTab.nativeElement.getAttribute('aria-selected')).toBe('false');

      // Switch to text-segmentation
      component['tabButtonClick']('text-segmentation');
      fixture.detectChanges();

      expect(ingestTab.nativeElement.getAttribute('tabindex')).toBe('-1');
      expect(ingestTab.nativeElement.getAttribute('aria-selected')).toBe('false');

      expect(textSegTab.nativeElement.getAttribute('tabindex')).toBe('0');
      expect(textSegTab.nativeElement.getAttribute('aria-selected')).toBe('true');
    });

    it('should set tabindex 0 and aria-hidden false on active tabpanel and -1 and true on inactive tabpanels', () => {
      fixture.detectChanges();

      const ingestPanel = fixture.debugElement.query(By.css('#tabpanel-ingest'));
      const textSegPanel = fixture.debugElement.query(By.css('#tabpanel-text-segmentation'));

      expect(ingestPanel.nativeElement.getAttribute('tabindex')).toBe('0');
      expect(ingestPanel.nativeElement.getAttribute('aria-hidden')).toBe('false');
      expect(textSegPanel.nativeElement.getAttribute('tabindex')).toBe('-1');
      expect(textSegPanel.nativeElement.getAttribute('aria-hidden')).toBe('true');

      component['tabButtonClick']('text-segmentation');
      fixture.detectChanges();

      expect(ingestPanel.nativeElement.getAttribute('tabindex')).toBe('-1');
      expect(ingestPanel.nativeElement.getAttribute('aria-hidden')).toBe('true');
      expect(textSegPanel.nativeElement.getAttribute('tabindex')).toBe('0');
      expect(textSegPanel.nativeElement.getAttribute('aria-hidden')).toBe('false');
    });
  });

  describe('Keyboard Navigation (Arrow keys, Home, End)', () => {
    it('should navigate to next tab on ArrowRight keydown and focus target button', () => {
      fixture.detectChanges();

      const ingestTab = fixture.debugElement.query(By.css('#tab-ingest'));
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');

      ingestTab.nativeElement.dispatchEvent(event);
      fixture.detectChanges();

      expect(preventSpy).toHaveBeenCalled();
      expect(component['currentTab']()).toBe('text-segmentation');
    });

    it('should wrap from last tab to first tab on ArrowRight keydown', () => {
      component['tabButtonClick']('export');
      fixture.detectChanges();

      const exportTab = fixture.debugElement.query(By.css('#tab-export'));
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });

      exportTab.nativeElement.dispatchEvent(event);
      fixture.detectChanges();

      expect(component['currentTab']()).toBe('ingest');
    });

    it('should wrap from first tab to last tab on ArrowLeft keydown', () => {
      fixture.detectChanges();

      const ingestTab = fixture.debugElement.query(By.css('#tab-ingest'));
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });

      ingestTab.nativeElement.dispatchEvent(event);
      fixture.detectChanges();

      expect(component['currentTab']()).toBe('export');
    });

    it('should navigate to first tab on Home keydown', () => {
      component['tabButtonClick']('correlation');
      fixture.detectChanges();

      const correlationTab = fixture.debugElement.query(By.css('#tab-correlation'));
      const event = new KeyboardEvent('keydown', { key: 'Home', cancelable: true });

      correlationTab.nativeElement.dispatchEvent(event);
      fixture.detectChanges();

      expect(component['currentTab']()).toBe('ingest');
    });

    it('should navigate to last tab on End keydown', () => {
      fixture.detectChanges();

      const ingestTab = fixture.debugElement.query(By.css('#tab-ingest'));
      const event = new KeyboardEvent('keydown', { key: 'End', cancelable: true });

      ingestTab.nativeElement.dispatchEvent(event);
      fixture.detectChanges();

      expect(component['currentTab']()).toBe('export');
    });

    it('should ignore arrow keys when modifier keys (Alt, Ctrl, Meta) are pressed', () => {
      fixture.detectChanges();

      const ingestTab = fixture.debugElement.query(By.css('#tab-ingest'));

      // Alt+ArrowRight (browser back/forward navigation)
      const altEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, cancelable: true });
      const altPreventSpy = vi.spyOn(altEvent, 'preventDefault');
      ingestTab.nativeElement.dispatchEvent(altEvent);
      expect(altPreventSpy).not.toHaveBeenCalled();
      expect(component['currentTab']()).toBe('ingest');

      // Ctrl+ArrowRight
      const ctrlEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, cancelable: true });
      const ctrlPreventSpy = vi.spyOn(ctrlEvent, 'preventDefault');
      ingestTab.nativeElement.dispatchEvent(ctrlEvent);
      expect(ctrlPreventSpy).not.toHaveBeenCalled();
      expect(component['currentTab']()).toBe('ingest');

      // Meta+ArrowRight
      const metaEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, cancelable: true });
      const metaPreventSpy = vi.spyOn(metaEvent, 'preventDefault');
      ingestTab.nativeElement.dispatchEvent(metaEvent);
      expect(metaPreventSpy).not.toHaveBeenCalled();
      expect(component['currentTab']()).toBe('ingest');
    });
  });

  describe('Global Shortcuts', () => {
    it('should trigger undo on Ctrl+Z when undo is available', () => {
      vi.spyOn(undoRedoService, 'canUndo').mockReturnValue(true);
      const undoSpy = vi.spyOn(undoRedoService, 'undo').mockResolvedValue();

      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
      window.dispatchEvent(event);

      expect(undoSpy).toHaveBeenCalled();
    });

    it('should trigger redo on Ctrl+Y when redo is available', () => {
      vi.spyOn(undoRedoService, 'canRedo').mockReturnValue(true);
      const redoSpy = vi.spyOn(undoRedoService, 'redo').mockResolvedValue();

      const event = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true });
      window.dispatchEvent(event);

      expect(redoSpy).toHaveBeenCalled();
    });

    it('should trigger redo on Ctrl+Shift+Z when redo is available', () => {
      vi.spyOn(undoRedoService, 'canRedo').mockReturnValue(true);
      const redoSpy = vi.spyOn(undoRedoService, 'redo').mockResolvedValue();

      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, cancelable: true });
      window.dispatchEvent(event);

      expect(redoSpy).toHaveBeenCalled();
    });
  });

  describe('Undo/Redo Accessibility Announcements (aria-live)', () => {
    it('should render an aria-live polite region for screen reader action announcements', () => {
      fixture.detectChanges();
      const liveRegion = fixture.debugElement.query(By.css('.workflow-action-announcement-sr'));

      expect(liveRegion).toBeTruthy();
      expect(liveRegion.nativeElement.getAttribute('aria-live')).toBe('polite');
      expect(liveRegion.nativeElement.getAttribute('aria-atomic')).toBe('true');
    });

    it('should update live region text when undo completes with a description', async () => {
      vi.spyOn(undoRedoService, 'lastUndoDescription').mockReturnValue('Vincular segmento');
      vi.spyOn(undoRedoService, 'undo').mockResolvedValue();

      component['onUndo']();
      await fixture.whenStable();
      fixture.detectChanges();

      const liveRegion = fixture.debugElement.query(By.css('.workflow-action-announcement-sr'));
      expect(liveRegion.nativeElement.textContent.trim()).toBe('Desfeito: Vincular segmento');
    });

    it('should update live region text when redo completes with a description', async () => {
      vi.spyOn(undoRedoService, 'lastRedoDescription').mockReturnValue('Vincular segmento');
      vi.spyOn(undoRedoService, 'redo').mockResolvedValue();

      component['onRedo']();
      await fixture.whenStable();
      fixture.detectChanges();

      const liveRegion = fixture.debugElement.query(By.css('.workflow-action-announcement-sr'));
      expect(liveRegion.nativeElement.textContent.trim()).toBe('Refeito: Vincular segmento');
    });
  });
});
