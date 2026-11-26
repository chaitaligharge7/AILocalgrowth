import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AnalyticsOverview, LocationMetricsResponse, MetricPoint } from '../../core/analytics/analytics.models';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { API_BASE_URL } from '../../core/http/api-base-url.token';
import { ApiSuccess } from '../../core/http/api-envelope.model';
import { apiErrorMessage } from '../../core/http/error.util';
import { LocationSummary } from '../../core/locations/location.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SparklineChartComponent } from '../../shared/dashboard-pattern/sparkline-chart.component';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';

interface MetricTableRow {
  date: string;
  values: (number | null)[];
}

/**
 * `/app/:tenantId/analytics` — Compact SaaS Analytics & Provider Telemetry screen.
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageHeaderComponent,
    StatCardComponent,
    SparklineChartComponent,
    PaginationComponent,
    SortHeaderComponent,
    IconComponent,
  ],
  template: `
    <section class="analytics">
      <app-page-header
        eyebrow="Analytics"
        eyebrowLabel="Reporting"
        title="Analytics"
        subtitle="Operational dashboard for audit coverage, publishing, provider metrics, and subscription usage."
      />

      @if (exportError()) {
        <p class="form-error" role="alert">{{ exportError() }}</p>
      }
      @if (exportNotice()) {
        <p class="success" role="status">{{ exportNotice() }}</p>
      }

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <section class="overview-section">
          @if (loadingOverview()) {
            <div class="card loading-card"><p class="placeholder">Loading analytics overview…</p></div>
          } @else if (overview()) {
            <div class="cards">
              <app-stat-card
                label="Audit coverage"
                [value]="overview()!.audit_coverage.percentage + '%'"
                icon="audit"
              />
              <app-stat-card
                label="Posts succeeded"
                [value]="overview()!.posts.succeeded + ' / ' + overview()!.posts.attempted"
                [hint]="overview()!.posts.failed + ' failed'"
                icon="marketing"
                tone="mint"
              />
              <app-stat-card
                label="Pending reviews"
                [value]="overview()!.pending_reviews"
                icon="reviews"
                tone="amber"
              />
              <app-stat-card
                label="Leads"
                [value]="overview()!.leads.available ? overview()!.leads.count ?? 0 : 'Not yet available'"
                [hint]="overview()!.leads.available ? '' : overview()!.leads.note"
                icon="leads"
                tone="info"
              />
            </div>

            <div class="card subscription-card">
              <div class="card-head">
                <div class="card-title-group">
                  <div class="card-icon-badge">
                    <ui-icon name="marketing" [size]="16" />
                  </div>
                  <div>
                    <h2>Subscription usage</h2>
                    <p class="card-subtitle">Active meter consumption against monthly quotas</p>
                  </div>
                </div>
                <span class="generated-at">Generated {{ overview()!.generated_at | date: 'medium' }}</span>
              </div>
              @if (overview()!.subscription_usage.length === 0) {
                <p class="placeholder">No active subscription usage to report.</p>
              } @else {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Meter</th>
                        <th>Usage Quota</th>
                        <th>Used</th>
                        <th>Reserved</th>
                        <th>Limit</th>
                        <th>Period</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (wallet of overview()!.subscription_usage; track wallet.meter_code) {
                        <tr>
                          <td class="meter-col">
                            <div class="meter-info">
                              <span class="meter-title">{{ meterTitle(wallet.meter_code) }}</span>
                              <code>{{ wallet.meter_code }}</code>
                            </div>
                          </td>
                          <td class="usage-bar-col">
                            <div class="meter-bar-wrap">
                              <div class="meter-bar-track">
                                <div
                                  class="meter-bar-fill"
                                  [class.meter-bar-fill--warning]="meterPercent(wallet.used_qty, wallet.limit_qty) >= 80"
                                  [style.width.%]="meterPercent(wallet.used_qty, wallet.limit_qty)"
                                ></div>
                              </div>
                              <span class="meter-percent">{{ meterPercent(wallet.used_qty, wallet.limit_qty) }}%</span>
                            </div>
                          </td>
                          <td class="qty-cell font-semibold">{{ wallet.used_qty }}</td>
                          <td class="qty-cell text-muted">{{ wallet.reserved_qty }}</td>
                          <td class="qty-cell">{{ wallet.limit_qty }}</td>
                          <td class="meta">{{ wallet.period_start | date: 'mediumDate' }} – {{ wallet.period_end | date: 'mediumDate' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
          @if (overviewError()) {
            <p class="form-error" role="alert">{{ overviewError() }}</p>
          }
        </section>

        <section class="card metrics metrics-card">
          <div class="metrics-head">
            <div class="metrics-title-group">
              <div class="card-title-inline">
                <div class="card-icon-badge card-icon-badge--teal">
                  <ui-icon name="chart" [size]="16" />
                </div>
                <div>
                  <h2>Per-location provider metrics</h2>
                  <p class="metrics-subtitle">
                    Select a business location, provider, and date range to inspect daily Google or Meta performance metrics.
                  </p>
                </div>
              </div>
            </div>
            <div class="metrics-export-actions export-dropdown">
              <button
                type="button"
                class="btn-primary btn-sm export-trigger"
                data-testid="export-metrics-trigger"
                (click)="metricsExportMenuOpen.set(!metricsExportMenuOpen()); exportMenuOpen.set(false)"
                [disabled]="metricsForm.invalid || exporting()"
                aria-haspopup="menu"
                [attr.aria-expanded]="metricsExportMenuOpen()"
              >
                <span>Export</span>
                <span class="caret">▾</span>
              </button>
              <div class="export-menu" role="menu" [hidden]="!metricsExportMenuOpen()">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-metrics-csv"
                  (click)="exportLocationMetrics('csv'); metricsExportMenuOpen.set(false)"
                  [disabled]="metricsForm.invalid || exporting()"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-metrics-pdf"
                  (click)="exportLocationMetrics('pdf'); metricsExportMenuOpen.set(false)"
                  [disabled]="metricsForm.invalid || exporting()"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-metrics-clipboard"
                  (click)="copyMetricsToClipboard(); metricsExportMenuOpen.set(false)"
                  [disabled]="!metricsResult() || metricRows().length === 0"
                >
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-metrics-excel"
                  (click)="exportMetricsExcel(); metricsExportMenuOpen.set(false)"
                  [disabled]="!metricsResult() || metricRows().length === 0"
                >
                  Export Excel
                </button>
              </div>
            </div>
          </div>

          <div class="metrics-filter-container">
            <div class="preset-row" role="group" aria-label="Date range quick presets">
              <span class="preset-label">Quick range:</span>
              @for (days of datePresets; track days) {
                <button
                  type="button"
                  class="preset-pill"
                  [class.preset-pill--active]="activePresetDays() === days"
                  [attr.data-testid]="'analytics-preset-' + days"
                  (click)="applyDatePreset(days)"
                >
                  Last {{ days }}d
                </button>
              }
            </div>

            <form [formGroup]="metricsForm" (ngSubmit)="loadMetrics()" novalidate class="metrics-form">
              <label class="form-field">
                <span class="field-label">Location</span>
                <select formControlName="locationId" data-testid="analytics-location-select" class="form-select">
                  @if (locations().length === 0) {
                    <option value="">No locations available</option>
                  } @else {
                    @for (loc of locations(); track loc.id) {
                      <option [value]="loc.id">{{ loc.name }}{{ loc.address?.city ? ' · ' + loc.address!.city : '' }}</option>
                    }
                  }
                </select>
              </label>
              <label class="form-field">
                <span class="field-label">Provider</span>
                <select formControlName="provider" class="form-select">
                  <option value="google">Google</option>
                  <option value="meta">Meta</option>
                </select>
              </label>
              <label class="form-field">
                <span class="field-label">From</span>
                <input type="date" formControlName="start" (change)="activePresetDays.set(null)" class="form-input" />
              </label>
              <label class="form-field">
                <span class="field-label">To</span>
                <input type="date" formControlName="end" [min]="metricsForm.controls.start.value" (change)="activePresetDays.set(null)" class="form-input" />
              </label>
              <div class="actions">
                <button type="submit" class="btn-primary btn-load-metrics" [disabled]="metricsForm.invalid || loadingMetrics()">
                  {{ loadingMetrics() ? 'Loading…' : 'Load metrics' }}
                </button>
              </div>
            </form>
          </div>

          @if (metricsError()) {
            <p class="form-error" role="alert">{{ metricsError() }}</p>
          }

          @if (metricsResult()) {
            <div class="provenance-bar" role="status">
              <div class="provenance-items">
                <span class="prov-chip">
                  <span class="prov-label">Source</span>
                  <strong class="prov-val">{{ metricsResult()!.provider }}</strong>
                </span>
                <span class="prov-chip">
                  <span class="prov-label">Granularity</span>
                  <strong class="prov-val">{{ metricsResult()!.granularity }}</strong>
                </span>
                <span class="prov-chip">
                  <span class="prov-label">Provenance</span>
                  <strong class="prov-val">{{ metricsResult()!.provenance }}</strong>
                </span>
                @if (metricsResult()!.mock_provider) {
                  <span class="badge badge--mock" title="Simulated via the mock provider — never a real provider API call.">MOCK_PROVIDER</span>
                }
              </div>
              <span class="prov-fetched">Fetched {{ metricsResult()!.fetched_at | date: 'short' }}</span>
            </div>
            @if (metricNames().length === 0) {
              <p class="placeholder">No metrics returned for this range.</p>
            } @else {
              @if (metricNames().length > 1) {
                <div class="metric-tabs" role="tablist" aria-label="Select chart metric">
                  @for (name of metricNames(); track name) {
                    <button
                      type="button"
                      class="metric-tab"
                      [class.metric-tab--active]="activeMetricName() === name"
                      (click)="selectedMetricName.set(name)"
                    >
                      {{ name }}
                    </button>
                  }
                </div>
              }
              <app-sparkline-chart
                [title]="'Performance over time — ' + activeMetricName()"
                [points]="activeMetricSeries()"
              />
              <div class="table-wrap">
                <table class="metrics-table">
                  <thead>
                    <tr>
                      <th><ui-sort-header label="Date" [active]="metricsSortCol() === 'date'" [direction]="metricsSortDir()" (sort)="toggleMetricsSort('date')" /></th>
                      @for (name of metricNames(); track name; let idx = $index) {
                        <th><ui-sort-header [label]="name" [active]="metricsSortCol() === 'm_' + idx" [direction]="metricsSortDir()" (sort)="toggleMetricsSort('m_' + idx)" /></th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of pagedMetricRows(); track row.date) {
                      <tr>
                        <td>{{ row.date }}</td>
                        @for (value of row.values; track $index) {
                          <td [class.no-data]="value === null">
                            @if (value === null) {
                              <span class="no-data-badge" title="The provider reported no data for this day — this is NOT a zero.">No data</span>
                            } @else {
                              {{ value }}
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination
                [totalItems]="metricRows().length"
                [currentPage]="metricsPage()"
                [pageSize]="metricsPageSize()"
                (pageChange)="metricsPage.set($event)"
                (pageSizeChange)="metricsPageSize.set($event)"
              />
            }
          }
        </section>

        <p class="hint">CSV export is owner/admin only — enforced server-side regardless of this screen.</p>
      }
    </section>
  `,
  styles: [
    `
      .analytics {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .topbar-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        width: 100%;
      }
      .topbar-row ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .export-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .metrics-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .metrics-export-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .preset-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .preset-label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .preset-pill {
        border: 1px solid var(--color-border);
        background: var(--color-surface-alt);
        color: var(--color-text-muted);
        border-radius: var(--radius-sm);
        padding: 4px 10px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .preset-pill:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .preset-pill--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #ffffff;
      }
      .preset-pill--active:hover {
        color: #ffffff;
      }
      .overview-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .card {
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.03);
        padding: 20px 22px;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }
      .card-title-group,
      .card-title-inline {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .card-icon-badge {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgba(13, 148, 136, 0.1);
        color: var(--color-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .card-icon-badge--teal {
        background: rgba(14, 165, 233, 0.1);
        color: #0284c7;
      }
      .card-subtitle {
        margin: 2px 0 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .subscription-card {
        display: flex;
        flex-direction: column;
      }
      .meter-col {
        text-align: left !important;
      }
      .meter-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .meter-title {
        font-weight: 600;
        font-size: var(--text-xs);
        color: var(--color-text);
      }
      .usage-bar-col {
        min-width: 140px;
      }
      .meter-bar-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .meter-bar-track {
        flex: 1;
        height: 7px;
        border-radius: 999px;
        background: var(--color-border);
        overflow: hidden;
      }
      .meter-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--color-primary);
        transition: width 0.3s ease;
      }
      .meter-bar-fill--warning {
        background: var(--color-warning);
      }
      .meter-percent {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--color-text-muted);
        min-width: 32px;
        text-align: right;
      }
      .qty-cell {
        font-variant-numeric: tabular-nums;
        font-size: var(--text-xs);
      }
      .font-semibold {
        font-weight: 600;
      }
      .text-muted {
        color: var(--color-text-muted);
      }
      .metrics-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .metrics-filter-container {
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .metrics-form {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .form-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text-muted);
      }
      .field-label {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      .form-select,
      .form-input {
        padding: 7px 11px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm, 6px);
        font: inherit;
        font-size: var(--text-xs);
        background: var(--color-surface, #fff);
        color: var(--color-text);
        box-shadow: var(--shadow-xs);
      }
      .form-select:focus,
      .form-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.15);
      }
      .btn-load-metrics {
        padding: 7px 14px;
        font-size: var(--text-xs);
        font-weight: 600;
        white-space: nowrap;
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface, #fff);
        box-shadow: var(--shadow-xs);
        margin: 6px 0;
      }
      app-sparkline-chart {
        display: block;
      }
      .metric-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .metric-tab {
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: 12px;
        cursor: pointer;
      }
      .metric-tab--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;
        font-weight: 600;
      }
      .metrics-table td.no-data {
        background: var(--color-surface-alt);
      }
      .no-data-badge {
        color: var(--color-warning);
        font-size: 0.72rem;
        font-style: italic;
      }
      .metrics-title-group {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .metrics-subtitle {
        margin: 0;
        font-size: 0.82rem;
        color: var(--color-text-muted);
        line-height: 1.45;
      }
      .provenance-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 8px 12px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .provenance-items {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .prov-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
      }
      .prov-label {
        color: var(--color-text-muted);
      }
      .prov-val {
        color: var(--color-text);
        text-transform: capitalize;
      }
      .prov-fetched {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .generated-at,
      .meta {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      form {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .success {
        color: var(--color-success);
        margin: 0;
        font-size: var(--text-xs);
      }
      .placeholder,
      .hint {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .gap-note {
        margin: 0;
        color: var(--color-text-muted);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 8px 10px;
        font-size: var(--text-xs);
      }
      .export-dropdown {
        position: relative;
        display: inline-flex;
      }
      .export-trigger {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .export-trigger .caret {
        font-size: 0.75em;
        opacity: 0.85;
      }
      .export-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 4px);
        min-width: 175px;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-md, 8px);
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
        padding: 4px;
        z-index: 30;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .export-menu[hidden] {
        display: none;
      }
      .export-menu button {
        width: 100%;
        text-align: left;
        justify-content: flex-start;
        background: transparent;
        border: none;
        padding: 7px 10px;
        font-size: var(--text-xs);
        font-weight: 500;
        color: var(--color-text);
        border-radius: var(--radius-sm, 6px);
      }
      .export-menu button:hover:not(:disabled) {
        background: var(--color-surface-alt, #f1f5f9);
        color: var(--color-primary);
      }
      @media (max-width: 960px) {
        .cards {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (max-width: 520px) {
        .cards {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AnalyticsComponent {
  private readonly fb = new FormBuilder();

  readonly tenant = computed(() => this.currentTenant.tenant());

  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBase = inject(API_BASE_URL);

  readonly datePresets: readonly number[] = [7, 30, 90];
  readonly activePresetDays = signal<number | null>(null);
  readonly locations = signal<LocationSummary[]>([]);

  readonly overview = signal<AnalyticsOverview | null>(null);
  readonly loadingOverview = signal(true);
  readonly overviewError = signal<string | null>(null);

  readonly metricsForm = this.fb.nonNullable.group({
    locationId: ['', [Validators.required]],
    provider: ['google', [Validators.required]],
    start: [AnalyticsComponent.defaultStart(), [Validators.required]],
    end: [AnalyticsComponent.defaultEnd(), [Validators.required]],
  });
  readonly metricsResult = signal<LocationMetricsResponse | null>(null);
  readonly loadingMetrics = signal(false);
  readonly metricsError = signal<string | null>(null);

  readonly exporting = signal(false);
  readonly exportError = signal<string | null>(null);
  readonly exportNotice = signal<string | null>(null);
  readonly exportMenuOpen = signal(false);
  readonly metricsExportMenuOpen = signal(false);
  readonly metricsPage = signal(1);
  readonly metricsPageSize = signal(10);
  readonly metricsSortCol = signal<string>('');
  readonly metricsSortDir = signal<SortDirection>('asc');

  toggleMetricsSort(col: string): void {
    if (this.metricsSortCol() === col) {
      this.metricsSortDir.set(this.metricsSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.metricsSortCol.set(col);
      this.metricsSortDir.set('asc');
    }
  }

  readonly metricNames = computed<string[]>(() => {
    const result = this.metricsResult();
    return result ? Object.keys(result.metrics) : [];
  });

  readonly selectedMetricName = signal<string | null>(null);
  readonly activeMetricName = computed<string>(() => {
    const names = this.metricNames();
    const chosen = this.selectedMetricName();
    return chosen && names.includes(chosen) ? chosen : (names[0] ?? '');
  });

  readonly activeMetricSeries = computed<number[]>(() => {
    const result = this.metricsResult();
    const name = this.activeMetricName();
    if (!result || !name) {
      return [];
    }
    return result.metrics[name].map((p) => p.value).filter((v): v is number => v !== null);
  });

  readonly firstMetricSeries = computed<number[]>(() => this.activeMetricSeries());

  readonly metricRows = computed<MetricTableRow[]>(() => {
    const result = this.metricsResult();
    if (!result) {
      return [];
    }
    const names = this.metricNames();
    const dates = names.length > 0 ? result.metrics[names[0]].map((p) => p.date) : [];
    return dates.map((date, i) => ({
      date,
      values: names.map((name) => this.pointAt(result.metrics[name], i)?.value ?? null),
    }));
  });

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly analyticsService: AnalyticsService,
  ) {
    this.refreshOverview();
    this.loadLocations();
  }

  private loadLocations(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || !this.http) {
      return;
    }
    this.http
      .get<ApiSuccess<{ locations: LocationSummary[] }>>(`${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/locations`)
      .subscribe({
        next: (res) => {
          const list = res.data?.locations ?? [];
          this.locations.set(list);
          if (list.length > 0 && !this.metricsForm.controls.locationId.value) {
            this.metricsForm.controls.locationId.setValue(list[0].id);
          }
        },
        error: () => this.locations.set([]),
      });
  }

  applyDatePreset(days: number): void {
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - (days - 1));
    this.activePresetDays.set(days);
    this.metricsForm.patchValue({
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    });
    if (this.metricsForm.valid) {
      this.loadMetrics();
    }
  }

  private pointAt(series: MetricPoint[], index: number): MetricPoint | undefined {
    return series[index];
  }

  private static defaultStart(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    return d.toISOString().slice(0, 10);
  }

  private static defaultEnd(): string {
    return new Date().toISOString().slice(0, 10);
  }

  refreshOverview(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingOverview.set(false);
      return;
    }
    this.loadingOverview.set(true);
    this.overviewError.set(null);
    this.analyticsService.overview(tenantId).subscribe({
      next: (overview) => {
        this.loadingOverview.set(false);
        this.overview.set(overview);
      },
      error: (err: unknown) => {
        this.loadingOverview.set(false);
        this.overviewError.set(apiErrorMessage(err));
      },
    });
  }

  loadMetrics(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.metricsForm.invalid || this.loadingMetrics()) {
      return;
    }
    this.loadingMetrics.set(true);
    this.metricsError.set(null);
    this.metricsResult.set(null);
    const raw = this.metricsForm.getRawValue();
    this.analyticsService.locationMetrics(tenantId, raw.locationId, raw.provider, raw.start, raw.end).subscribe({
      next: (result) => {
        this.loadingMetrics.set(false);
        this.metricsResult.set(result);
      },
      error: (err: unknown) => {
        this.loadingMetrics.set(false);
        this.metricsError.set(apiErrorMessage(err));
      },
    });
  }

  exportCsv(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    this.analyticsService.exportCsv(tenantId).subscribe({
      next: ({ blob, filename }) => {
        this.exporting.set(false);
        AnalyticsComponent.triggerDownload(blob, filename);
        this.exportNotice.set(`Downloaded ${filename}.`);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.exportError.set(apiErrorMessage(err));
      },
    });
  }

  exportPdf(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    this.analyticsService.exportPdf(tenantId).subscribe({
      next: ({ blob, filename }) => {
        this.exporting.set(false);
        AnalyticsComponent.triggerDownload(blob, filename);
        this.exportNotice.set(`Downloaded ${filename}.`);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.exportError.set(apiErrorMessage(err));
      },
    });
  }

  exportLocationMetrics(format: 'csv' | 'pdf'): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.metricsForm.invalid || this.exporting()) {
      return;
    }
    const raw = this.metricsForm.getRawValue();
    const scope = {
      locationId: raw.locationId,
      provider: raw.provider,
      start: raw.start,
      end: raw.end,
    };
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    const req$ =
      format === 'pdf'
        ? this.analyticsService.exportPdf(tenantId, scope)
        : this.analyticsService.exportCsv(tenantId, scope);
    req$.subscribe({
      next: ({ blob, filename }) => {
        this.exporting.set(false);
        AnalyticsComponent.triggerDownload(blob, filename);
        this.exportNotice.set(`Downloaded ${filename}.`);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.exportError.set(apiErrorMessage(err));
      },
    });
  }

  pagedMetricRows(): MetricTableRow[] {
    const sorted = sortTableRows(this.metricRows(), this.metricsSortCol(), this.metricsSortDir(), (row, col) => {
      if (col === 'date') return row.date;
      if (col.startsWith('m_')) {
        const idx = Number(col.slice(2));
        return row.values[idx] ?? null;
      }
      return '';
    });
    return paginateItems(sorted, this.metricsPage(), this.metricsPageSize());
  }

  meterTitle(code: string): string {
    return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  meterPercent(used: number, limit: number): number {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  copyOverviewToClipboard(): void {
    const o = this.overview();
    if (!o) {
      this.exportError.set('Overview data is not loaded yet.');
      return;
    }
    const text = this.overviewRows(o)
      .map((r) => r.join('\t'))
      .join('\n');
    this.copyText(text, 'Copied analytics overview to clipboard.');
  }

  exportOverviewExcel(): void {
    const o = this.overview();
    if (!o) {
      this.exportError.set('Overview data is not loaded yet.');
      return;
    }
    const blob = AnalyticsComponent.buildExcelBlob('Analytics Overview', this.overviewRows(o));
    const filename = `analytics-overview-${new Date().toISOString().slice(0, 10)}.xls`;
    AnalyticsComponent.triggerDownload(blob, filename);
    this.exportNotice.set(`Downloaded ${filename}.`);
  }

  private overviewRows(o: AnalyticsOverview): string[][] {
    return [
      ['Section', 'Metric', 'Value'],
      ['Audit', 'Locations audited', `${o.audit_coverage.locations_audited} / ${o.audit_coverage.locations_total} (${o.audit_coverage.percentage}%)`],
      ['Publishing', 'Attempted', String(o.posts.attempted)],
      ['Publishing', 'Succeeded', String(o.posts.succeeded)],
      ['Publishing', 'Failed', String(o.posts.failed)],
      ['Reviews', 'Pending reviews', String(o.pending_reviews)],
      ['Leads', 'Total leads', o.leads.available && o.leads.count !== null ? String(o.leads.count) : 'Unavailable'],
      ...o.subscription_usage.map((u) => ['Usage', u.meter_code, `${u.used_qty} / ${u.limit_qty}`]),
    ];
  }

  copyMetricsToClipboard(): void {
    const rows = this.metricRows();
    const names = this.metricNames();
    if (!this.metricsResult() || rows.length === 0) {
      this.exportError.set('Load location metrics first before copying.');
      return;
    }
    const header = ['Date', ...names].join('\t');
    const body = rows.map((r) => [r.date, ...r.values.map((v) => (v === null ? 'No data' : String(v)))].join('\t'));
    this.copyText([header, ...body].join('\n'), 'Copied location metrics to clipboard.');
  }

  exportMetricsExcel(): void {
    const res = this.metricsResult();
    const rows = this.metricRows();
    const names = this.metricNames();
    if (!res || rows.length === 0) {
      this.exportError.set('Load location metrics first before exporting.');
      return;
    }
    const tableRows: string[][] = [
      ['Date', ...names],
      ...rows.map((r) => [r.date, ...r.values.map((v) => (v === null ? 'No data' : String(v)))]),
    ];
    const blob = AnalyticsComponent.buildExcelBlob(`${res.provider} metrics`, tableRows);
    const filename = `analytics-${res.provider}-${new Date().toISOString().slice(0, 10)}.xls`;
    AnalyticsComponent.triggerDownload(blob, filename);
    this.exportNotice.set(`Downloaded ${filename}.`);
  }

  private copyText(text: string, successMsg: string): void {
    this.exportError.set(null);
    this.exportNotice.set(null);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.exportNotice.set(successMsg),
        () => this.exportError.set('Could not access clipboard.'),
      );
    } else {
      this.exportError.set('Clipboard API is unavailable in this browser.');
    }
  }

  private static buildExcelBlob(sheetTitle: string, rows: string[][]): Blob {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const trs = rows
      .map(
        (row, idx) =>
          `<tr>${row.map((cell) => `<${idx === 0 ? 'th' : 'td'}>${esc(cell)}</${idx === 0 ? 'th' : 'td'}>`).join('')}</tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${esc(sheetTitle)}</title></head><body><table border="1">${trs}</table></body></html>`;
    return new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  }

  private static triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
