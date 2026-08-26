import { Routes } from '@angular/router';
import { Workflow } from './components/UI/workflow/workflow';
import { PdfViewerRoute } from './components/common/pdf-viewer/pdf-viewer-route';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: Workflow,
  },
  {
    path: 'pdf-viewer',
    component: PdfViewerRoute,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
