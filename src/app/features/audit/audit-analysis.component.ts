import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { AnalysisField, FieldComparison, ProfileAnalysis } from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const COMPARISON_VIEW: Record<FieldComparison, { label: string; cls: string }> = {
  match: { label: 'Matches Google', cls: 'badge--success' },
  differs: { label: 'Differs from Google', cls: 'badge--warning' },
  local_only: { label: 'Only in LocalGrowth', cls: 'badge--info' },
  google_only: { label: 'Only on Google', cls: 'badge--info' },
  missing: { label: 'Missing', cls: 'badge--danger' },
  not_synced: { label: 'Not synced yet', cls: 'badge--neutral' },
};

/**
 * Category & information analysis (BW-046): the location's Business Profile
 * (categories, hours, services, areas…) compared field-by-field with the
 * last Google profile sync, with a suggestion wherever something is missing
 * or different. The "Google" column is only shown after a sync and is
 * labelled MOCK while Google runs in mock mode — it is sample data, not the
 * business's real listing.
 */
@Component({
  selector: 'app-audit-analysis',
  standalone: true,
  imports: [SkeletonLoaderComponent],
  template: `
    <section>
      @if (loading()) {
        <app-skeleton-loader [rows]="5" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (analysis()) {
        <p class="summary">
          <strong>{{ analysis()!.summary.needs_attention }}</strong> of {{ analysis()!.summary.fields_total }} areas need attention ·
          <strong>{{ analysis()!.summary.differs_from_google }}</strong> differ from Google
          @if (analysis()!.google_snapshot.available) {
            @if (analysis()!.google_snapshot.mock_provider) {
              <span class="badge badge--mock">MOCK_PROVIDER</span>
            }
          } @else {
            <span class="badge badge--neutral">No Google sync yet</span>
          }
        </p>
        <p class="meta">{{ analysis()!.note }}</p>
        <table class="data-table" data-testid="analysis-table">
          <thead>
            <tr><th>Area</th><th>In LocalGrowth</th><th>On Google</th><th>Status</th><th>Suggestion</th></tr>
          </thead>
          <tbody>
            @for (f of analysis()!.fields; track f.code) {
              <tr>
                <td>{{ f.label }}</td>
                <td>{{ show(f.local.value, f.local.present) }}</td>
                <td>{{ f.google ? show(f.google.value, f.google.present) : '—' }}</td>
                <td><span class="badge badge--dot" [class]="view(f.comparison).cls">{{ view(f.comparison).label }}</span></td>
                <td class="meta">
                  {{ f.suggestion ?? 'Looks good.' }}
                  @if (f.detail && f.detail.missing_on_google.length > 0) {
                    <br />Not on Google: {{ f.detail.missing_on_google.join(', ') }}
                  }
                  @if (f.detail && f.detail.only_on_google.length > 0) {
                    <br />Only on Google: {{ f.detail.only_on_google.join(', ') }}
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .summary { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0 0 0.25rem; }
      .form-error { color: #b00020; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.75rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    `,
  ],
})
export class AuditAnalysisComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';

  readonly analysis = signal<ProfileAnalysis | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly insights: AuditInsightsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!(changes['tenantId'] || changes['locationId']) || !this.tenantId || !this.locationId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.analysis(this.tenantId, this.locationId).subscribe({
      next: (a) => {
        this.analysis.set(a);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  view(c: FieldComparison): { label: string; cls: string } {
    return COMPARISON_VIEW[c];
  }

  /** Compact human text for a value of any backend shape (string, count, list, hours map). */
  show(value: unknown, present: boolean): string {
    if (!present || value === null || value === undefined || value === '') {
      return 'Not set';
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length === 0 ? 'Not set' : value.join(', ');
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj['days_configured'] === 'number') {
      return `${obj['days_configured']} of 7 days set`;
    }
    if (obj['days'] && typeof obj['days'] === 'object') {
      return `${Object.keys(obj['days'] as object).length} days listed`;
    }
    return 'Set';
  }

  /** Exposed for the unit test. */
  fieldByCode(code: string): AnalysisField | undefined {
    return this.analysis()?.fields.find((f) => f.code === code);
  }
}
