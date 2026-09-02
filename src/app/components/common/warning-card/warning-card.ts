import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * A reusable warning, information, error, or loading card component.
 */
@Component({
  selector: 'app-warning-card',
  imports: [NgTemplateOutlet],
  templateUrl: './warning-card.html',
  styleUrl: './warning-card.scss',
})
export class WarningCard {
  /**
   * The message text displayed in the card.
   */
  public readonly message = input.required<string>();

  /**
   * The visual and semantic type of the card.
   */
  public readonly type = input.required<WarningCardType>();
}

/**
 * Supported card types and visual variants.
 */
export type WarningCardType = 'warning' | 'info' | 'error' | 'loading-segments';
