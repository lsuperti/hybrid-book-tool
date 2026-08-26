import { Component, input } from '@angular/core';

@Component({
  selector: 'app-export',
  imports: [],
  templateUrl: './export.html',
  styleUrl: './export.scss',
})
export class Export {
  public readonly visible = input.required<boolean>();
}
