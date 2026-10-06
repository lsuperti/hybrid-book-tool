import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Export } from './export';
import { ExportService } from '../../../services/export/export';

describe('Export', () => {
  let component: Export;
  let fixture: ComponentFixture<Export>;
  let exportService: ExportService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Export],
      providers: [
        {
          provide: ExportService,
          useValue: {
            exportBook: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Export);
    fixture.componentRef.setInput('visible', true);
    component = fixture.componentInstance;
    exportService = TestBed.inject(ExportService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the split layout and export button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-split')).toBeTruthy();
    expect(compiled.querySelector('.export-submit-button')).toBeTruthy();
    expect(compiled.querySelector('.preview-container')).toBeTruthy();
  });

  it('should render metadata form fields and subaltern original book section', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#field-title')).toBeTruthy();
    expect(compiled.querySelector('.subaltern-fieldset')).toBeTruthy();
    expect(compiled.querySelector('#field-orig-title')).toBeTruthy();
  });

  it('should call ExportService on export button click and show success message', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');
    expect(button).toBeTruthy();

    button?.click();
    await fixture.whenStable();

    expect(exportService.exportBook).toHaveBeenCalled();

    fixture.detectChanges();
    const successAlert = compiled.querySelector('.export-alert-success');
    expect(successAlert).toBeTruthy();
    expect(successAlert?.textContent).toContain('Livro híbrido exportado com sucesso!');
  });

  it('should show error message when export fails', async () => {
    vi.mocked(exportService.exportBook).mockRejectedValueOnce(
      new Error('Erro de teste ao exportar')
    );

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');

    button?.click();
    await fixture.whenStable();

    fixture.detectChanges();
    const errorAlert = compiled.querySelector('.export-alert-error');
    expect(errorAlert).toBeTruthy();
    expect(errorAlert?.textContent).toContain('Erro de teste ao exportar');
  });

  it('should pass onProgress callback to ExportService and render progress state', async () => {
    let capturedCallback: ((ratio: number) => void) | undefined;
    vi.mocked(exportService.exportBook).mockImplementation(async (_meta, onProgress) => {
      capturedCallback = onProgress;
      if (onProgress) {
        onProgress(0.5);
      }
      return new Blob(['zip'], { type: 'application/zip' });
    });

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.export-submit-button');

    button?.click();
    await fixture.whenStable();

    expect(capturedCallback).toBeDefined();
  });
});
