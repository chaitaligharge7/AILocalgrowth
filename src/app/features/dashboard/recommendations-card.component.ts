import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecommendationsResponse } from '../../core/growth/growth.models';

/**
 * Compact rule-based Growth Opportunities panel (BW-017).
 */
@Component({
  selector: 'app-recommendations-card',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <section class="card recs-card" aria-labelledby="recs-title">
      <header class="recs-header">
        <div class="recs-header-title">
          <h2 id="recs-title">Growth opportunities</h2>
          <span class="badge badge--neutral" title="Fixed rules over your own data. Not AI.">Rule-based</span>
        </div>
        @if (data && ((data.dismissed_count ?? 0) > 0 || showingHidden)) {
          <button type="button" class="link" data-test="rec-toggle-hidden" (click)="toggleHidden.emit()">
            {{ showingHidden ? 'Hide dismissed' : 'Show ' + data.dismissed_count + ' hidden' }}
          </button>
        }
      </header>

      @if (data) {
        @if (data.recommendations.length === 0) {
          <div class="empty-box">
            <p class="muted small" data-test="recs-empty">No rule found a gap in your data right now.</p>
          </div>
        } @else {
          <ul class="recs-list">
            @for (rec of data.recommendations; track rec.code) {
              <li class="rec-item">
                <div class="head">
                  <strong class="rec-title">{{ rec.title }}</strong>
                  <span
                    class="badge"
                    [class.badge--danger]="rec.priority === 'high'"
                    [class.badge--warning]="rec.priority === 'medium'"
                    [class.badge--neutral]="rec.priority === 'low'"
                  >
                    {{ rec.priority }}
                  </span>
                </div>
                <p class="rec-detail">{{ rec.detail }}</p>
                <div class="rec-bottom">
                  <span class="muted small rec-evidence">
                    Triggered by:
                    @for (e of rec.evidence; track e.label) {
                      <span class="evidence-pill">{{ e.label }} = {{ e.value }}</span>
                    }
                  </span>

                  @if (rec.dismissed) {
                    <div class="rec-actions-group">
                      <span class="muted small" data-test="rec-hidden-note">
                        Hidden for you{{ rec.dismissed_until ? ' until ' + (rec.dismissed_until | date: 'mediumDate') : ' until you restore it' }}.
                      </span>
                      <button type="button" class="link" (click)="restore.emit(rec.code)" [attr.aria-label]="'Show ' + rec.title + ' again'">Show again</button>
                    </div>
                  } @else {
                    <div class="rec-actions-group">
                      <a [routerLink]="link(rec.action.web_path)" class="btn-action">{{ rec.action.label }} →</a>
                      <button type="button" class="link" data-test="rec-snooze" (click)="dismiss.emit({ code: rec.code, days: 7 })" [attr.aria-label]="'Snooze ' + rec.title + ' for 7 days'">Snooze 7d</button>
                      <button type="button" class="link" data-test="rec-dismiss" (click)="dismiss.emit({ code: rec.code })" [attr.aria-label]="'Hide ' + rec.title">Hide</button>
                    </div>
                  }
                </div>
              </li>
            }
          </ul>
        }
        <p class="muted small note-text">{{ data.note }}</p>
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
      .recs-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .recs-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .recs-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: 0.94rem;
        font-weight: var(--font-bold);
      }
      .empty-box {
        padding: 14px 12px;
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
      }
      .recs-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }
      .rec-item {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .rec-title {
        font-size: var(--text-xs);
        color: var(--color-text);
      }
      .rec-detail {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        line-height: 1.38;
      }
      .rec-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 4px;
        border-top: 1px solid var(--color-border);
      }
      .rec-evidence {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex-wrap: wrap;
      }
      .evidence-pill {
        display: inline-block;
        padding: 1px 6px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        font-size: 0.68rem;
        color: var(--color-text);
      }
      .rec-actions-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .btn-action {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.65rem;
        border-radius: var(--radius-sm);
        background: var(--color-primary);
        color: #fff;
        font-size: 0.7rem;
        font-weight: var(--font-semibold);
        text-decoration: none;
        transition: background-color 0.15s ease;
      }
      .btn-action:hover {
        background: var(--color-primary-hover);
        color: #fff;
      }
      .link {
        background: none;
        border: 0;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 0;
        font-size: 0.7rem;
        font-weight: var(--font-medium);
      }
      .link:hover:not(:disabled) {
        background: none;
        color: var(--color-primary);
        text-decoration: underline;
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.7rem;
        margin: 0;
      }
      .note-text {
        margin-top: auto;
      }
      .form-error {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-danger);
      }
    `,
  ],
})
export class RecommendationsCardComponent {
  @Input() data: RecommendationsResponse | null = null;
  @Input() errorMessage: string | null = null;
  @Input({ required: true }) tenantId = '';
  @Input() showingHidden = false;
  @Output() dismiss = new EventEmitter<{ code: string; days?: number }>();
  @Output() restore = new EventEmitter<string>();
  @Output() toggleHidden = new EventEmitter<void>();

  link(path: string): string[] {
    return ['/app', this.tenantId, ...path.split('/')];
  }
}
