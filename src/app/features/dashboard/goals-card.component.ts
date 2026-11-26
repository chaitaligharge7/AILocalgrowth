import { Component, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorMessage } from '../../core/http/error.util';
import { Goal, GoalMetric, GoalMetricCode, GoalsResponse } from '../../core/growth/growth.models';
import { GrowthService } from '../../core/growth/growth.service';
import { localTodayDateString } from '../../core/utils/date.util';
import { IconComponent } from '../../shared/icons/icon.component';

/**
 * Compact Goal progress widget (BW-020).
 */
@Component({
  selector: 'app-goals-card',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <section class="card goals-card" aria-labelledby="goals-title">
      <header class="goals-header">
        <div class="goals-header-title">
          <h2 id="goals-title">Goals</h2>
          <span class="badge badge--neutral" title="Progress is measured from your own data on every load. Nothing is projected.">Measured, not predicted</span>
        </div>
        @if (data()?.can_edit && !adding() && (data()?.goals?.length ?? 0) < (data()?.max_active_goals ?? 20)) {
          <button type="button" class="btn-secondary btn-sm" data-test="goal-add" (click)="openAdd(data()!)">+ Add goal</button>
        }
      </header>

      @if (data(); as d) {
        @if (d.goals.length === 0 && !adding()) {
          <div class="empty-goals">
            <p class="muted small" data-test="goals-empty">
              No goals yet.{{ d.can_edit ? ' Set a target and progress will be measured automatically from your live data.' : ' Someone with edit rights can set one.' }}
            </p>
          </div>
        } @else if (d.goals.length > 0) {
          <ul class="goals">
            @for (g of d.goals; track g.id) {
              <li class="goal-item" [attr.data-test]="'goal-' + g.metric">
                <div class="row">
                  <strong>{{ g.label }}</strong>
                  <span
                    class="badge"
                    [class.badge--success]="g.status === 'achieved'"
                    [class.badge--danger]="g.status === 'missed'"
                    [class.badge--neutral]="g.status === 'no_data'"
                    [class.badge--warning]="g.status === 'in_progress'"
                  >
                    {{ statusLabel(g) }}
                  </span>
                </div>
                @if (g.current_value === null) {
                  <p class="muted small" data-test="goal-no-data">No data yet for this metric. Target {{ g.target_value }} {{ g.unit }}.</p>
                } @else {
                  <div class="bar" role="progressbar" [attr.aria-valuenow]="g.progress_pct" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="g.label + ' progress'">
                    <span [style.width.%]="g.progress_pct"></span>
                  </div>
                  <p class="small">
                    <strong>{{ g.current_value }}</strong> of {{ g.target_value }} {{ g.unit }} ({{ g.progress_pct }}%).
                    @if (g.status === 'in_progress') {
                      {{ g.remaining }} to go, {{ g.days_left }} day(s) left.
                    }
                  </p>
                }
                <div class="goal-foot">
                  <span class="muted small">
                    @if (g.baseline_value !== null) {
                      Started at {{ g.baseline_value }}.
                    }
                    Deadline {{ g.deadline_on }}@if (g.kind === 'period') { , counting from {{ g.starts_on }} }. Source: {{ g.source }}.
                  </span>
                  @if (d.can_edit && editingId() !== g.id) {
                    <span class="item-actions">
                      <button type="button" class="link action-icon-btn" (click)="startEdit(g)" [attr.aria-label]="'Edit goal ' + g.label" title="Edit goal">
                        <ui-icon name="edit" [size]="13" />
                        <span class="sr-only">Edit</span>
                      </button>
                      <button type="button" class="link danger action-icon-btn" (click)="remove(g)" [attr.aria-label]="'Remove goal ' + g.label" title="Remove goal">
                        <ui-icon name="trash" [size]="13" />
                        <span class="sr-only">Remove</span>
                      </button>
                    </span>
                  }
                </div>
                @if (d.can_edit && editingId() === g.id) {
                  <form class="inline" (ngSubmit)="saveEdit(g)">
                    <label>Target <input type="number" step="any" min="0" name="editTarget" [(ngModel)]="editTarget" required /></label>
                    <label>Deadline <input type="date" name="editDeadline" [(ngModel)]="editDeadline" [min]="minToday" required /></label>
                    <div class="edit-actions">
                      <button type="submit" class="btn-primary btn-sm" [disabled]="busy()">Save</button>
                      <button type="button" class="btn-secondary btn-sm" (click)="editingId.set(null)">Cancel</button>
                    </div>
                  </form>
                }
              </li>
            }
          </ul>
        }

        @if (d.can_edit && adding()) {
          <form class="add" (ngSubmit)="create()" data-test="goal-form">
            <label>
              Metric
              <select name="metric" [(ngModel)]="metric" (ngModelChange)="onMetricChange()" required>
                @for (m of d.metrics; track m.code) {
                  <option [value]="m.code">{{ m.label }}</option>
                }
              </select>
            </label>
            @if (selected(); as m) {
              <p class="muted small">
                {{ m.source }}.
                @if (m.kind === 'point') {
                  {{ m.current_value === null ? 'No data yet.' : 'Right now: ' + m.current_value + ' ' + m.unit + '.' }}
                }
              </p>
            }
            <div class="form-grid">
              <label>
                Target
                <input type="number" step="any" min="0" name="target" [(ngModel)]="target" required />
              </label>
              <label>
                Deadline
                <input type="date" name="deadline" [(ngModel)]="deadline" [min]="minToday" required />
              </label>
            </div>
            @if (selected()?.kind === 'period') {
              <label>
                Counting from
                <input type="date" name="startsOn" [(ngModel)]="startsOn" [min]="minToday" />
              </label>
            }
            @if (formError()) {
              <p class="form-error" role="alert">{{ formError() }}</p>
            }
            <div class="form-actions">
              <button type="submit" class="btn-primary btn-sm" [disabled]="busy()" data-test="goal-save">Add goal</button>
              <button type="button" class="btn-secondary btn-sm" (click)="adding.set(false)">Cancel</button>
            </div>
          </form>
        }
        <p class="muted small footer-note">{{ d.note }}</p>
      } @else if (errorMessage()) {
        <p class="form-error" role="alert">{{ errorMessage() }}</p>
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
      .goals-card {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .goals-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .goals-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: 0.92rem;
        font-weight: var(--font-bold);
      }
      .empty-goals {
        padding: 8px 10px;
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
      }
      .goals {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 10px;
      }
      .goal-item {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: var(--text-xs);
      }
      .bar {
        height: 6px;
        border-radius: var(--radius-pill);
        background: var(--color-neutral-bg);
        overflow: hidden;
        margin: 2px 0;
      }
      .bar span {
        display: block;
        height: 100%;
        border-radius: var(--radius-pill);
        background: linear-gradient(90deg, var(--color-primary), #14b8a6);
        transition: width 0.3s ease;
      }
      .goal-foot {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }
      .item-actions {
        display: inline-flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .inline,
      .add {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .form-actions,
      .edit-actions {
        display: flex;
        gap: 6px;
      }
      label {
        display: grid;
        gap: 3px;
        font-size: var(--text-xs);
      }
      .link {
        background: none;
        border: 0;
        color: var(--color-primary);
        cursor: pointer;
        padding: 0;
        font-size: 0.7rem;
        font-weight: var(--font-semibold);
      }
      .link:hover:not(:disabled) {
        background: none;
        text-decoration: underline;
      }
      .link.danger {
        color: var(--color-danger);
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.72rem;
        line-height: 1.38;
        margin: 0;
      }
      .footer-note {
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
export class GoalsCardComponent implements OnInit {
  readonly minToday = localTodayDateString();
  @Input({ required: true }) tenantId = '';

  readonly data = signal<GoalsResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly adding = signal(false);
  readonly editingId = signal<string | null>(null);

  metric: GoalMetricCode = 'reviews_total';
  target = '';
  deadline = '';
  startsOn = '';
  editTarget = '';
  editDeadline = '';

  constructor(private readonly growth: GrowthService) {}

  ngOnInit(): void {
    this.reload();
  }

  selected(): GoalMetric | undefined {
    return this.data()?.metrics.find((m) => m.code === this.metric);
  }

  statusLabel(g: Goal): string {
    switch (g.status) {
      case 'achieved':
        return 'Achieved';
      case 'missed':
        return 'Deadline passed';
      case 'no_data':
        return 'No data yet';
      default:
        return 'In progress';
    }
  }

  reload(): void {
    this.growth.goals(this.tenantId).subscribe({
      next: (r) => {
        this.data.set(r);
        this.errorMessage.set(null);
      },
      error: (err) => this.errorMessage.set(apiErrorMessage(err)),
    });
  }

  openAdd(d: GoalsResponse): void {
    this.metric = d.metrics[0]?.code ?? 'reviews_total';
    this.target = '';
    this.deadline = '';
    this.startsOn = '';
    this.formError.set(null);
    this.adding.set(true);
  }

  onMetricChange(): void {
    this.formError.set(null);
  }

  create(): void {
    this.busy.set(true);
    this.formError.set(null);
    const input = {
      metric: this.metric,
      target_value: String(this.target),
      deadline_on: this.deadline,
      ...(this.selected()?.kind === 'period' && this.startsOn ? { starts_on: this.startsOn } : {}),
    };
    this.growth.createGoal(this.tenantId, input).subscribe({
      next: () => {
        this.busy.set(false);
        this.adding.set(false);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.formError.set(apiErrorMessage(err));
      },
    });
  }

  startEdit(g: Goal): void {
    this.editingId.set(g.id);
    this.editTarget = String(g.target_value);
    this.editDeadline = g.deadline_on;
  }

  saveEdit(g: Goal): void {
    this.busy.set(true);
    this.growth.updateGoal(this.tenantId, g.id, { target_value: String(this.editTarget), deadline_on: this.editDeadline }).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingId.set(null);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  remove(g: Goal): void {
    if (!confirmDelete('this goal')) {
      return;
    }
    this.busy.set(true);
    this.growth.deleteGoal(this.tenantId, g.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }
}
