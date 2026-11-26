import { Location } from '@angular/common';
import { Component, Input, inject } from '@angular/core';

/**
 * Compact SaaS page header used across Business, Agency, and Admin screens.
 * Includes a back navigation button on the right side of the header.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="page-header">
      <div class="page-header__left">
        @if (eyebrow || eyebrowLabel) {
          <div class="eyebrow-row">
            @if (eyebrow) {
              <span class="eyebrow">{{ eyebrow }}</span>
            }
            @if (eyebrowLabel) {
              <span class="eyebrow-pill">{{ eyebrowLabel }}</span>
            }
          </div>
        }
        <div class="title-block">
          <h1>{{ title }}</h1>
          @if (subtitle) {
            <p class="subtitle">{{ subtitle }}</p>
          }
        </div>
      </div>

      @if (showBack) {
        <div class="page-header__actions">
          <button type="button" class="btn-primary btn-back" (click)="goBack()" title="Back to previous page" aria-label="Back">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Back</span>
          </button>
        </div>
      }
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        flex: 1 1 auto;
        min-width: 0;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
        width: 100%;
      }
      .page-header__left {
        flex: 1 1 auto;
        min-width: 200px;
      }
      .page-header__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-shrink: 0;
        margin-left: auto;
      }
      .btn-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0.38rem 0.85rem;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-primary-contrast);
        background: var(--color-primary);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 1px 2px rgba(7, 141, 126, 0.2);
      }
      .btn-back:hover {
        background: var(--color-primary-hover);
        border-color: var(--color-primary-hover);
        color: var(--color-primary-contrast);
        box-shadow: 0 2px 6px rgba(7, 141, 126, 0.28);
        transform: translateX(-1px);
      }
      .btn-back svg {
        transition: transform 0.15s ease;
      }
      .btn-back:hover svg {
        transform: translateX(-2px);
      }
      .eyebrow-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }
      .eyebrow {
        font-size: 0.68rem;
        font-weight: var(--font-bold);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-primary);
      }
      .eyebrow-pill {
        display: inline-flex;
        align-items: center;
        padding: 1px 7px;
        border-radius: var(--radius-pill);
        background: var(--color-primary-light);
        color: var(--color-primary);
        font-size: 0.66rem;
        font-weight: var(--font-semibold);
        text-transform: capitalize;
        letter-spacing: 0.02em;
      }
      h1 {
        margin: 0;
        font-size: 1.32rem;
        font-weight: var(--font-bold);
        letter-spacing: -0.02em;
        color: var(--color-text);
        line-height: 1.2;
      }
      .subtitle {
        margin: 3px 0 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        line-height: 1.4;
      }
    `,
  ],
})
export class PageHeaderComponent {
  private readonly location = inject(Location);

  @Input() eyebrow = '';
  @Input() eyebrowLabel = '';
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() showBack = true;

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      window.history.back();
    }
  }
}
