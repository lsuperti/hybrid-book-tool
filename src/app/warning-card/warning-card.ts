import { Component, input } from '@angular/core';

@Component({
  selector: 'app-warning-card',
  imports: [],
  templateUrl: './warning-card.html',
  styleUrl: './warning-card.scss',
})
export class WarningCard {
  message = input.required<string>();
}