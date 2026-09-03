import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * A reusable warning, information, error, or loading card component.
 */
@Component({
  selector: 'app-info-card',
  imports: [NgTemplateOutlet],
  templateUrl: './info-card.html',
  styleUrl: './info-card.scss',
})
export class InfoCard {
  /**
   * The message text displayed in the card.
   */
  public readonly message = input.required<string>();

  /**
   * The visual and semantic type of the card.
   */
  public readonly type = input.required<InfoCardType>();
}

/**
 * Supported card types and visual variants.
 */
export type InfoCardType = 'warning' | 'info' | 'error' | 'loading-segments';
