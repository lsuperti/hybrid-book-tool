import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PdfViewerRoute } from './pdf-viewer-route';

describe('PdfViewerRoute', () => {
  let component: PdfViewerRoute;
  let fixture: ComponentFixture<PdfViewerRoute>;
  let queryParamMapSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    queryParamMapSubject = new BehaviorSubject(
      convertToParamMap({
        'pdf-viewer-src': 'blob:test-pdf-src',
        'pdf-viewer-name': 'my-viewer',
      })
    );

    await TestBed.configureTestingModule({
      imports: [PdfViewerRoute],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMapSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PdfViewerRoute);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should extract src and name from route query params', () => {
    expect(component['src']()).toBe('blob:test-pdf-src');
    expect(component['name']()).toBe('my-viewer');
  });
});
