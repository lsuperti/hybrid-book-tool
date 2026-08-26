import { Component, input } from '@angular/core';

@Component({
  selector: 'app-warning-card',
  imports: [],
  templateUrl: './warning-card.html',
  styleUrl: './warning-card.scss',
})
export class WarningCard {
  public readonly halfWidthMargin = input<Side[]>([]);
  public readonly message = input.required<string>();
  public readonly type = input.required<WarningCardType>();
}

export type Side = 'left' | 'right' | 'top' | 'bottom';
export type WarningCardType = 'warning' | 'info' | 'error' | 'loading-segments';