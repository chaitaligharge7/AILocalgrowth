import { Component, Input } from '@angular/core';

/**
 * Premium redesign (docs/UI_REDESIGN_MASTER_PLAN.md): a shimmer placeholder
 * for a list/table's loading state, replacing a plain "Loading…" line.
 * Purely presentational — caller still owns the real loading signal; this
 * never renders fabricated data, only empty bars.
 */
@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  template: `
    @for (row of rowsArray(); track $index) {
      <div class="skeleton-row">
        <span class="skeleton-bar skeleton-bar--avatar"></span>
        <span class="skeleton-bar skeleton-bar--main"></span>
        <span class="skeleton-bar skeleton-bar--small"></span>
      </div>
    }
  `,
  styles: [
    `
      .skeleton-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-2);
      }
      .skeleton-bar {
        display: block;
        border-radius: var(--radius-sm);
        background: linear-gradient(
          90deg,
          var(--color-surface-alt) 25%,
          var(--color-border) 37%,
          var(--color-surface-alt) 63%
        );
        background-size: 400% 100%;
        animation: skeleton-shimmer 1.4s ease infinite;
      }
      .skeleton-bar--avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .skeleton-bar--main {
        flex: 1;
        height: 14px;
      }
      .skeleton-bar--small {
        width: 70px;
        height: 14px;
        flex-shrink: 0;
      }
      @keyframes skeleton-shimmer {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }
    `,
  ],
})
export class SkeletonLoaderComponent {
  @Input() rows = 4;

  rowsArray(): number[] {
    return Array.from({ length: Math.max(0, this.rows) }, (_, i) => i);
  }
}
