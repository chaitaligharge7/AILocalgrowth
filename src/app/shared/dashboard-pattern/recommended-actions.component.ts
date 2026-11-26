import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icons/icon.component';

/**
 * Compact highlighted callout card for quick actions and contextual guidance.
 */
@Component({
  selector: 'app-recommended-actions',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="recommended-actions">
      <div class="head">
        <span class="accent-icon" aria-hidden="true">
          <ui-icon name="zap" [size]="15" />
        </span>
        <h2>{{ title }}</h2>
      </div>
      <p class="msg">{{ message }}</p>
      @if (linkLabel && link) {
        <div class="cta-row">
          <a [routerLink]="link" class="cta-link">
            <span>{{ linkLabel }}</span>
            <ui-icon name="arrowUpRight" [size]="13" />
          </a>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .recommended-actions {
        background: linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%);
        border: 1px solid #ccfbf1;
        border-left: 3px solid var(--color-primary);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .accent-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        background: var(--color-primary-light);
        color: var(--color-primary);
        flex-shrink: 0;
      }
      h2 {
        margin: 0;
        font-size: 0.92rem;
        font-weight: var(--font-bold);
      }
      .msg {
        margin: 0;
        font-size: var(--text-xs);
        line-height: 1.45;
        color: var(--color-text-muted);
      }
      .cta-row {
        margin-top: 2px;
      }
      .cta-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0.34rem 0.72rem;
        border-radius: var(--radius-sm);
        background: var(--color-primary);
        color: #ffffff;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-decoration: none;
        transition: background-color 0.15s ease;
      }
      .cta-link:hover {
        background: var(--color-primary-hover);
        color: #ffffff;
      }
    `,
  ],
})
export class RecommendedActionsComponent {
  @Input() title = 'Recommended actions';
  @Input({ required: true }) message = '';
  @Input() linkLabel = '';
  @Input() link: string | unknown[] = '';
}
