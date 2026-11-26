import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { AuditComparison, CheckChange } from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { SparklineChartComponent } from '../../shared/dashboard-pattern/sparkline-chart.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const CHANGE_VIEW: Record<CheckChange, { label: string; cls: string }> = {
  improved: { label: 'Improved', cls: 'badge--success' },
  regressed: { label: 'Got worse', cls: 'badge--danger' },
  unchanged: { label: 'No change', cls: 'badge--neutral' },
  evidence_added: { label: 'Evidence added', cls: 'badge--info' },
  evidence_lost: { label: 'Evidence lost', cls: 'badge--warning' },
};

/**
 * Historical audit comparison (BW-049): readiness/coverage trend across
 * every stored audit plus a check-by-check diff between two audits
 * (default: the two most recent). Audits are immutable snapshots, so this
 * only ever compares what was really recorded; "unknown" is never treated
 * as a fail (a check that gained evidence shows as "Evidence added").
 */
@Component({
  selector: 'app-audit-history',
  standalone: true,
  imports: [DatePipe, SparklineChartComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }
      @if (loading() && !result()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (!result()) {
        @if (!error()) {
          <app-empty-state icon="audit" title="No audits yet" message="Run a readiness audit to start a history." />
        }
      } @else {
        @if (result()!.trend.length > 0) {
          <app-sparkline-chart title="Readiness score over time (oldest to newest)" [points]="scorePoints()" />
          <p class="meta">{{ result()!.trend.length }} audit{{ result()!.trend.length === 1 ? '' : 's' }} recorded. {{ result()!.readiness_score_note }}</p>
        }

        @if (!result()!.comparable) {
          <app-empty-state icon="audit" title="Nothing to compare yet" [message]="result()!.reason ?? 'Run another audit after making changes.'" />
        } @else {
          <div class="pickers">
            <label>
              From (earlier)
              <select (change)="pick('from', $any($event.target).value)">
                @for (t of result()!.trend; track t.audit_id) {
                  <option [value]="t.audit_id" [selected]="t.audit_id === result()!.from!.id">{{ t.completed_at | date: 'medium' }} — {{ t.readiness_score }}</option>
                }
              </select>
            </label>
            <label>
              To (later)
              <select (change)="pick('to', $any($event.target).value)">
                @for (t of result()!.trend; track t.audit_id) {
                  <option [value]="t.audit_id" [selected]="t.audit_id === result()!.to!.id">{{ t.completed_at | date: 'medium' }} — {{ t.readiness_score }}</option>
                }
              </select>
            </label>
          </div>

          <div class="deltas">
            <div class="card">
              <p class="meta">Readiness score</p>
              <p class="big">{{ result()!.from!.readiness_score }} → {{ result()!.to!.readiness_score }}</p>
              <span class="badge badge--dot" [class]="deltaClass(result()!.score_delta!)">{{ signed(result()!.score_delta!) }}</span>
            </div>
            <div class="card">
              <p class="meta">Evidence coverage</p>
              <p class="big">{{ result()!.from!.coverage_pct }}% → {{ result()!.to!.coverage_pct }}%</p>
              <span class="badge badge--dot" [class]="deltaClass(result()!.coverage_delta!)">{{ signed(result()!.coverage_delta!) }} pts</span>
            </div>
          </div>

          <table class="data-table" data-testid="compare-table">
            <thead>
              <tr><th>Check</th><th>Weight</th><th>Before</th><th>After</th><th>Change</th></tr>
            </thead>
            <tbody>
              @for (c of result()!.checks; track c.code) {
                <tr>
                  <td>{{ c.label }}</td>
                  <td>{{ c.weight }}</td>
                  <td>{{ stateLabel(c.from_state) }}</td>
                  <td>{{ stateLabel(c.to_state) }}</td>
                  <td><span class="badge badge--dot" [class]="view(c.change).cls">{{ view(c.change).label }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .pickers { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; }
      select { padding: 0.45rem; font: inherit; font-weight: 400; min-width: 15rem; }
      .deltas { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .big { font-size: 1.4rem; font-weight: 700; margin: 0.25rem 0; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    `,
  ],
})
export class AuditHistoryComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';

  readonly result = signal<AuditComparison | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private fromId: string | undefined;
  private toId: string | undefined;

  constructor(private readonly insights: AuditInsightsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] || changes['locationId']) {
      this.fromId = undefined;
      this.toId = undefined;
      this.load();
    }
  }

  scorePoints(): number[] {
    return (this.result()?.trend ?? []).map((t) => t.readiness_score);
  }

  view(change: CheckChange): { label: string; cls: string } {
    return CHANGE_VIEW[change];
  }

  stateLabel(state: string): string {
    return state === 'pass' ? 'Pass' : state === 'fail' ? 'Needs attention' : 'Evidence missing';
  }

  signed(n: number): string {
    return (n > 0 ? '+' : '') + n;
  }

  deltaClass(n: number): string {
    return n > 0 ? 'badge--success' : n < 0 ? 'badge--danger' : 'badge--neutral';
  }

  pick(which: 'from' | 'to', auditId: string): void {
    if (which === 'from') {
      this.fromId = auditId;
    } else {
      this.toId = auditId;
    }
    this.load();
  }

  private load(): void {
    if (!this.tenantId || !this.locationId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.compare(this.tenantId, this.locationId, this.fromId, this.toId).subscribe({
      next: (result) => {
        this.result.set(result.trend.length === 0 ? null : result);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
