import { Component, Input } from '@angular/core';
import { IconComponent } from '../icons/icon.component';

/**
 * Compact KPI stat tile with optional outline icon badge, semantic tint,
 * real hint copy, and optional real trend pill.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [IconComponent],
  template: `
    <article class="stat-card" [class]="tone ? 'stat-card--' + tone : ''">
      <div class="stat-top">
        <div class="label">{{ label }}</div>
        @if (icon) {
          <span class="stat-icon" [class]="tone ? 'stat-icon--' + tone : ''" [style.color]="iconColor || ''">
            <ui-icon [name]="icon" [size]="15" />
          </span>
        }
      </div>
      <div class="value">{{ value }}</div>
      @if (hint || trend) {
        <div class="stat-foot">
          @if (hint) {
            <div class="hint">{{ hint }}</div>
          }
          @if (trend) {
            <span class="trend" [class.trend--down]="trendDirection === 'down'">
              {{ trendDirection === 'down' ? '↓' : '↑' }} {{ trend }}
            </span>
          }
        </div>
      }
    </article>
  `,
  styles: [
    `
      .stat-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 4px;
        min-width: 0;
        height: 100%;
        position: relative;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
      }
      .stat-card:hover {
        border-color: var(--color-border-hover);
        box-shadow: var(--shadow-sm);
        transform: translateY(-1px);
      }
      .stat-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .label {
        font-size: 0.68rem;
        font-weight: var(--font-semibold);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--color-text-subtle);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .stat-icon {
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
      .stat-icon--mint {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
      .stat-icon--amber {
        background: var(--color-warning-bg);
        color: var(--color-warning);
      }
      .stat-icon--peach {
        background: var(--color-peach-bg);
        color: var(--color-peach);
      }
      .stat-icon--info {
        background: var(--color-info-bg);
        color: var(--color-info);
      }
      .value {
        font-size: 1.35rem;
        font-weight: var(--font-bold);
        letter-spacing: -0.02em;
        line-height: 1.2;
        color: var(--color-text);
        font-variant-numeric: tabular-nums;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .stat-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-top: 2px;
      }
      .hint {
        font-size: 0.72rem;
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .trend {
        margin-left: auto;
        font-size: 0.68rem;
        font-weight: var(--font-semibold);
        padding: 1px 7px;
        border-radius: var(--radius-pill);
        background: var(--color-success-bg);
        color: var(--color-success);
        white-space: nowrap;
      }
      .trend--down {
        background: var(--color-danger-bg);
        color: var(--color-danger);
      }
    `,
  ],
})
export class StatCardComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) value: string | number = '';
  @Input() trend = '';
  @Input() trendDirection: 'up' | 'down' = 'up';
  @Input() hint = '';
  @Input() icon = '';
  @Input() iconColor = '';
  @Input() tone: 'mint' | 'amber' | 'peach' | 'info' | '' = '';
}
