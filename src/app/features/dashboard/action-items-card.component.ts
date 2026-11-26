import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionItems } from '../../core/growth/growth.models';
import { IconComponent } from '../../shared/icons/icon.component';

/** Compact Pending approvals and action items hub (BW-018). */
@Component({
  selector: 'app-action-items-card',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="card action-card" aria-labelledby="actions-title">
      <header class="action-header">
        <h2 id="actions-title">Pending approvals & actions</h2>
        @if (data) {
          <span class="badge badge--dot" [class.badge--warning]="data.total > 0" [class.badge--success]="data.total === 0">
            {{ data.total }}
          </span>
        }
      </header>

      @if (data) {
        @if (data.items.length === 0) {
          <div class="empty-state">
            <p class="muted small" data-test="actions-empty">Nothing is waiting on you right now.</p>
          </div>
        } @else {
          <ul class="action-list">
            @for (item of data.items; track $index) {
              <li class="action-item">
                <a [routerLink]="link(item.web_path)" class="action-link">
                  <span class="icon-tile icon-tile--amber">
                    <ui-icon name="approvals" [size]="14" />
                  </span>
                  <div class="action-content">
                    <strong class="action-title">{{ item.title }}</strong>
                    <span class="muted small action-detail">{{ item.detail }}</span>
                  </div>
                  <span class="action-arrow" aria-hidden="true">
                    <ui-icon name="chevronRight" [size]="14" />
                  </span>
                </a>
              </li>
            }
          </ul>
          @if (data.counts.content_approvals > data.items.length) {
            <p class="muted small cap-note">Showing the oldest {{ data.list_cap }} of each type.</p>
          }
        }
      } @else if (errorMessage) {
        <p class="form-error" role="alert">{{ errorMessage }}</p>
      } @else {
        <p class="muted small">Loading…</p>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .action-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .action-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      h2 {
        margin: 0;
        font-size: 0.94rem;
        font-weight: var(--font-bold);
      }
      .empty-state {
        padding: 14px 12px;
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
      }
      .action-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .action-item {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        transition: border-color 0.14s ease, background-color 0.14s ease;
      }
      .action-item:hover {
        border-color: var(--color-primary);
        background: var(--color-surface-alt);
      }
      .action-link {
        display: flex;
        align-items: center;
        padding: 8px 10px;
        text-decoration: none;
        color: inherit;
        gap: 10px;
      }
      .icon-tile {
        width: 28px;
        height: 28px;
        border-radius: 7px;
      }
      .action-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .action-title {
        font-size: var(--text-xs);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .action-detail {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .action-arrow {
        color: var(--color-text-subtle);
        transition: transform 0.14s ease, color 0.14s ease;
      }
      .action-item:hover .action-arrow {
        color: var(--color-primary);
        transform: translateX(2px);
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.72rem;
        margin: 0;
      }
      .form-error {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-danger);
      }
    `,
  ],
})
export class ActionItemsCardComponent {
  @Input() data: ActionItems | null = null;
  @Input() errorMessage: string | null = null;
  @Input({ required: true }) tenantId = '';

  link(path: string): string[] {
    return ['/app', this.tenantId, ...path.split('/')];
  }
}
