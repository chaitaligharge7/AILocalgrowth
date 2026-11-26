import { Component, Input } from '@angular/core';
import { IconComponent } from '../icons/icon.component';

/**
 * Premium redesign (docs/UI_REDESIGN_MASTER_PLAN.md): a shared empty-state
 * card (icon + title + message), replacing ad-hoc "No leads yet." text
 * lines across list screens. Purely presentational — the caller still
 * decides when there really is no data; this never invents placeholder rows.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="empty-state">
      <span class="empty-state-icon">
        <ui-icon [name]="icon" [size]="22" />
      </span>
      <p class="empty-state-title">{{ title }}</p>
      @if (message) {
        <p class="empty-state-message">{{ message }}</p>
      }
    </div>
  `,
  styles: [
    `
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--space-2);
        padding: var(--space-6) var(--space-4);
        color: var(--color-text-muted);
      }
      .empty-state-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--color-primary-light);
        color: var(--color-primary);
      }
      .empty-state-title {
        font-weight: var(--font-semibold);
        color: var(--color-text);
        margin: 0;
      }
      .empty-state-message {
        font-size: var(--text-sm);
        margin: 0;
        max-width: 32ch;
      }
    `,
  ],
})
export class EmptyStateComponent {
  @Input() icon = 'leads';
  @Input({ required: true }) title = '';
  @Input() message = '';
}
