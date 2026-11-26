import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icons/icon.component';

export interface InsightRow {
  icon: string;
  title: string;
  subtitle: string;
  tile?: 'mint' | 'amber' | 'peach' | '';
  link?: string | unknown[];
}

/**
 * Compact interactive module / insight list card with tinted icon tiles
 * and hover chevrons.
 */
@Component({
  selector: 'app-insights-card',
  standalone: true,
  imports: [IconComponent, RouterLink],
  template: `
    <section class="insights-card">
      <header class="card-head">
        <h2>{{ title }}</h2>
        <span class="count-pill">{{ rows.length }}</span>
      </header>
      <ul>
        @for (row of rows; track row.title) {
          <li>
            @if (row.link) {
              <a [routerLink]="row.link" class="row-link">
                <span class="icon-tile" [class]="row.tile ? 'icon-tile--' + row.tile : ''">
                  <ui-icon [name]="row.icon" [size]="15" />
                </span>
                <span class="text">
                  <span class="row-title">{{ row.title }}</span>
                  <span class="row-subtitle">{{ row.subtitle }}</span>
                </span>
                <span class="chevron" aria-hidden="true">
                  <ui-icon name="chevronRight" [size]="14" />
                </span>
              </a>
            } @else {
              <div class="row-static">
                <span class="icon-tile" [class]="row.tile ? 'icon-tile--' + row.tile : ''">
                  <ui-icon [name]="row.icon" [size]="15" />
                </span>
                <span class="text">
                  <span class="row-title">{{ row.title }}</span>
                  <span class="row-subtitle">{{ row.subtitle }}</span>
                </span>
              </div>
            }
          </li>
        }
      </ul>
    </section>
  `,
  styles: [
    `
      .insights-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        padding: 14px 16px;
        height: 100%;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      h2 {
        margin: 0;
        font-size: 0.92rem;
        font-weight: var(--font-bold);
      }
      .count-pill {
        font-size: 0.68rem;
        font-weight: var(--font-semibold);
        padding: 1px 7px;
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .row-link,
      .row-static {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        margin: 0 -8px;
        border-radius: var(--radius-md);
        text-decoration: none;
        color: inherit;
        min-width: 0;
        transition: background-color 0.14s ease;
      }
      .row-link:hover {
        background: var(--color-surface-alt);
      }
      .row-link:hover .row-title {
        color: var(--color-primary);
      }
      .row-link:hover .chevron {
        color: var(--color-primary);
        transform: translateX(2px);
      }
      .icon-tile {
        width: 30px;
        height: 30px;
        border-radius: 7px;
      }
      .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1px;
      }
      .row-title {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
        line-height: 1.25;
      }
      .row-subtitle {
        font-size: 0.72rem;
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chevron {
        color: var(--color-text-subtle);
        flex-shrink: 0;
        transition: transform 0.14s ease, color 0.14s ease;
      }
    `,
  ],
})
export class InsightsCardComponent {
  @Input() title = 'Key insights';
  @Input({ required: true }) rows: InsightRow[] = [];
}
