import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsOverview } from '../../core/analytics/analytics.models';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { ActionItems, DashboardWidget, GrowthScore, RecommendationsResponse } from '../../core/growth/growth.models';
import { GrowthService } from '../../core/growth/growth.service';
import { API_BASE_URL } from '../../core/http/api-base-url.token';
import { ApiSuccess } from '../../core/http/api-envelope.model';
import { apiErrorMessage } from '../../core/http/error.util';
import { LocationSummary } from '../../core/locations/location.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { InsightRow, InsightsCardComponent } from '../../shared/dashboard-pattern/insights-card.component';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { RecommendedActionsComponent } from '../../shared/dashboard-pattern/recommended-actions.component';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { ActionItemsCardComponent } from './action-items-card.component';
import { GoalsCardComponent } from './goals-card.component';
import { GrowthScoreCardComponent } from './growth-score-card.component';
import { RecommendationsCardComponent } from './recommendations-card.component';

/**
 * `/app/:tenantId/dashboard` — Compact 12-column SaaS Bento Dashboard
 * for Business Owners, Admins, Editors, and Agency Staff.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    InsightsCardComponent,
    RecommendedActionsComponent,
    IconComponent,
    GrowthScoreCardComponent,
    ActionItemsCardComponent,
    RecommendationsCardComponent,
    GoalsCardComponent,
  ],
  template: `
    <section class="dashboard">
      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="dashboard-topbar">
          <div class="header-main">
            <app-page-header
              eyebrow="Dashboard"
              [eyebrowLabel]="tenant()!.caller_role"
              [title]="tenant()!.display_name"
              [showBack]="false"
              [subtitle]="
                (tenant()!.business_type ? tenant()!.business_type + ' · ' : '') +
                tenant()!.country +
                ' · ' +
                tenant()!.currency +
                ' · ' +
                tenant()!.timezone
              "
            />
          </div>

          <div class="header-actions">
            <a [routerLink]="['/app', tenant()!.id, 'ai-studio']" class="btn-secondary btn-sm">
              <ui-icon name="ai" [size]="13" />
              <span>AI Studio</span>
            </a>
            <a [routerLink]="['/app', tenant()!.id, 'content']" class="btn-primary btn-sm">
              <ui-icon name="plus" [size]="13" />
              <span>New post</span>
            </a>
            @if (canManageTenant()) {
              <a [routerLink]="['/app', tenant()!.id, 'members']" class="btn-secondary btn-sm">
                <ui-icon name="team" [size]="13" />
                <span>Team</span>
              </a>
            }
            <button type="button" class="btn-secondary btn-sm" data-test="customize-toggle" (click)="toggleCustomize()">
              <ui-icon name="sliders" [size]="13" />
              <span>{{ customizing() ? 'Close customize' : 'Customize widgets' }}</span>
            </button>
          </div>
        </div>

        <div class="filter-bar" role="region" aria-label="Dashboard filters" data-test="dashboard-filters">
          <div class="filter-group">
            <label class="filter-label" for="dashboard-location-select">
              <ui-icon name="business" [size]="13" />
              <span>Location</span>
            </label>
            <select
              id="dashboard-location-select"
              class="filter-select"
              data-test="dashboard-location-filter"
              [value]="selectedLocationId()"
              (change)="onLocationChange($any($event.target).value)"
            >
              <option value="">All locations ({{ locations().length || overview()?.audit_coverage?.locations_total || 0 }})</option>
              @for (loc of locations(); track loc.id) {
                <option [value]="loc.id">{{ loc.name }}{{ loc.address?.city ? ' · ' + loc.address!.city : '' }}</option>
              }
            </select>
          </div>

          <div class="filter-group">
            <span class="filter-label">
              <ui-icon name="calendar" [size]="13" />
              <span>Period</span>
            </span>
            <div class="period-pills" role="group" aria-label="Date range filter" data-test="dashboard-period-filter">
              @for (opt of periodOptions; track opt.label) {
                <button
                  type="button"
                  class="period-pill"
                  [class.period-pill--active]="selectedDays() === opt.days"
                  [attr.data-test]="'period-' + (opt.days ?? 'all')"
                  (click)="onPeriodChange(opt.days)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
          </div>

          @if (loadingFiltered()) {
            <span class="filter-status">Updating…</span>
          }
        </div>

        @if (customizing()) {
          <section class="card customize" aria-label="Customize dashboard widgets">
            <div class="customize-head">
              <div>
                <h3>Customize dashboard layout</h3>
                <p class="muted small">Show, hide and reorder widgets. Saved per user account.</p>
              </div>
              <div class="customize-buttons">
                <button type="button" class="btn-primary btn-sm" data-test="save-widgets" [disabled]="savingWidgets()" (click)="saveWidgets()">Save layout</button>
                <button type="button" class="btn-secondary btn-sm" data-test="reset-widgets" [disabled]="savingWidgets()" (click)="resetWidgets()">Reset to default</button>
              </div>
            </div>
            <ul class="customize-list">
              @for (w of draft(); track w.code; let i = $index) {
                <li class="customize-item">
                  <label class="customize-label">
                    <input type="checkbox" [checked]="w.visible" (change)="toggleVisible(i)" [attr.aria-label]="'Show ' + w.label" />
                    <span>{{ w.label }}</span>
                  </label>
                  <div class="customize-move">
                    <button type="button" class="link" [disabled]="i === 0" (click)="move(i, -1)" [attr.aria-label]="'Move ' + w.label + ' up'">Up</button>
                    <button type="button" class="link" [disabled]="i === draft().length - 1" (click)="move(i, 1)" [attr.aria-label]="'Move ' + w.label + ' down'">Down</button>
                  </div>
                </li>
              }
            </ul>
            @if (widgetError()) {
              <p class="form-error" role="alert">{{ widgetError() }}</p>
            }
          </section>
        }

        <div class="bento-grid">
          @for (w of visibleWidgets(); track w.code; let idx = $index) {
            @switch (w.code) {
              @case ('growth_score') {
                <div class="bento-cell" [class]="cellClass(idx)">
                  <app-growth-score-card [value]="growthScore()" [errorMessage]="growthError()" />
                </div>
              }
              @case ('goals') {
                <div class="bento-cell" [class]="cellClass(idx)">
                  <app-goals-card [tenantId]="tenant()!.id" />
                </div>
              }
              @case ('kpis') {
                @if (overview(); as ov) {
                  <div class="bento-cell bento-cell--full">
                    <div class="kpi-row">
                      <app-stat-card
                        label="Audit coverage"
                        [value]="ov.audit_coverage.percentage + '%'"
                        [hint]="ov.audit_coverage.locations_audited + ' of ' + ov.audit_coverage.locations_total + ' locations'"
                        icon="audit"
                      />
                      <app-stat-card
                        label="Posts succeeded"
                        [value]="ov.posts.succeeded + ' / ' + ov.posts.attempted"
                        [hint]="ov.posts.failed + ' failed'"
                        icon="marketing"
                        tone="mint"
                      />
                      <app-stat-card
                        label="Pending reviews"
                        [value]="ov.pending_reviews"
                        hint="awaiting reply"
                        icon="reviews"
                        tone="amber"
                      />
                      <app-stat-card
                        label="Leads"
                        [value]="ov.leads.available ? (ov.leads.count ?? 0) : 'Not yet available'"
                        [hint]="ov.leads.available ? 'CRM pipeline active' : ov.leads.note"
                        icon="leads"
                        tone="info"
                      />
                    </div>
                  </div>
                }
              }
              @case ('action_items') {
                <div class="bento-cell" [class]="cellClass(idx)">
                  <app-action-items-card [data]="actionItems()" [errorMessage]="actionError()" [tenantId]="tenant()!.id" />
                </div>
              }
              @case ('recommendations') {
                <div class="bento-cell" [class]="cellClass(idx)">
                  <app-recommendations-card
                    [data]="recommendations()"
                    [errorMessage]="recsError()"
                    [tenantId]="tenant()!.id"
                    [showingHidden]="showHiddenRecs()"
                    (dismiss)="dismissRec($event.code, $event.days)"
                    (restore)="restoreRec($event)"
                    (toggleHidden)="toggleHiddenRecs()"
                  />
                </div>
              }
            }
          }

          <div class="bento-cell bento-cell--7">
            <app-insights-card title="Your modules" [rows]="moduleRows()" />
          </div>

          <div class="bento-cell bento-cell--5 side-stack">
            <app-recommended-actions
              title="Quick actions"
              [message]="
                canManageTenant()
                  ? 'Invite a teammate, configure location scopes, or review member roles.'
                  : 'Jump directly into content drafts, publishing calendar, or connected accounts.'
              "
              [linkLabel]="canManageTenant() ? 'Manage members' : 'Open content'"
              [link]="canManageTenant() ? ['/app', tenant()!.id, 'members'] : ['/app', tenant()!.id, 'content']"
            />

            @if (overview()?.subscription_usage?.length) {
              <section class="card quota-card">
                <div class="quota-head">
                  <h3>Monthly plan usage</h3>
                  <a [routerLink]="['/app', tenant()!.id, 'billing']" class="quota-link">Billing →</a>
                </div>
                <div class="quota-list">
                  @for (m of overview()!.subscription_usage; track m.meter_code) {
                    <div class="quota-row">
                      <div class="quota-meta">
                        <span>{{ formatMeter(m.meter_code) }}</span>
                        <strong>{{ m.used_qty + m.reserved_qty }} / {{ m.limit_qty }}</strong>
                      </div>
                      <div class="quota-bar">
                        <i [style.width.%]="meterPct(m.used_qty + m.reserved_qty, m.limit_qty)"></i>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .dashboard {
        width: 100%;
        font-family: var(--font-sans);
      }
      .dashboard-topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .header-main ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .header-main ::ng-deep .subtitle {
        text-transform: capitalize;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      /* Dashboard Filter Bar (Location + Date Range) */
      .filter-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 8px 12px;
        margin-bottom: 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .filter-group {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .filter-label {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .filter-select {
        min-width: 210px;
        max-width: 280px;
        padding: 5px 10px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
      }
      .period-pills {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
      }
      .period-pill {
        border: none;
        background: transparent;
        padding: 4px 10px;
        border-radius: 5px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .period-pill:hover {
        color: var(--color-text);
      }
      .period-pill--active {
        background: var(--color-primary);
        color: #ffffff;
      }
      .period-pill--active:hover {
        color: #ffffff;
      }
      .filter-status {
        font-size: var(--text-xs);
        color: var(--color-primary);
        font-weight: var(--font-semibold);
      }

      /* Customize Panel */
      .customize {
        padding: 12px 16px;
        margin-bottom: 12px;
      }
      .customize-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .customize-head h3 {
        margin: 0;
        font-size: 0.9rem;
      }
      .customize-buttons {
        display: flex;
        gap: 6px;
      }
      .customize-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 6px;
      }
      .customize-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
      }
      .customize-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--text-xs);
        cursor: pointer;
      }
      .customize-move {
        display: flex;
        gap: 8px;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-primary);
        cursor: pointer;
        font-size: 0.7rem;
        font-weight: var(--font-semibold);
      }
      .link:hover:not(:disabled) {
        background: none;
        text-decoration: underline;
      }
      .link:disabled {
        color: var(--color-text-subtle);
      }

      /* 12-Column Compact Bento Grid (zero dead vertical voids) */
      .bento-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 12px;
        align-items: start;
      }
      .bento-cell {
        min-width: 0;
      }
      .bento-cell--full {
        grid-column: 1 / -1;
      }
      .bento-cell--7 {
        grid-column: span 7;
      }
      .bento-cell--6 {
        grid-column: span 6;
      }
      .bento-cell--5 {
        grid-column: span 5;
      }

      .kpi-row {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        align-items: stretch;
      }
      .kpi-row ::ng-deep app-stat-card,
      .kpi-row ::ng-deep .stat-card {
        height: 100%;
      }

      .side-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .quota-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .quota-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .quota-head h3 {
        margin: 0;
        font-size: 0.88rem;
        font-weight: var(--font-bold);
      }
      .quota-link {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-decoration: none;
      }
      .quota-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .quota-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .quota-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.72rem;
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .quota-meta strong {
        color: var(--color-text);
      }
      .quota-bar {
        height: 5px;
        border-radius: 999px;
        background: var(--color-neutral-bg);
        overflow: hidden;
      }
      .quota-bar i {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-primary);
      }

      .form-error {
        color: var(--color-danger);
        font-size: var(--text-xs);
        margin: 6px 0 0;
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.72rem;
        margin: 0;
      }

      @media (max-width: 1024px) {
        .bento-cell--7,
        .bento-cell--6,
        .bento-cell--5 {
          grid-column: 1 / -1;
        }
        .kpi-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 540px) {
        .kpi-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBase = inject(API_BASE_URL);

  constructor(
    readonly currentTenant: CurrentTenantService,
    private readonly analyticsService: AnalyticsService,
    private readonly growth: GrowthService,
  ) {}

  readonly periodOptions: { label: string; days: number | null }[] = [
    { label: 'All time', days: null },
    { label: '7d', days: 7 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
  ];

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly locations = signal<LocationSummary[]>([]);
  readonly selectedLocationId = signal<string>('');
  readonly selectedDays = signal<number | null>(null);
  readonly loadingFiltered = signal(false);
  readonly overview = signal<AnalyticsOverview | null>(null);

  readonly growthScore = signal<GrowthScore | null>(null);
  readonly growthError = signal<string | null>(null);
  readonly recommendations = signal<RecommendationsResponse | null>(null);
  readonly recsError = signal<string | null>(null);
  readonly showHiddenRecs = signal(false);
  readonly actionItems = signal<ActionItems | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly widgets = signal<DashboardWidget[]>([
    { code: 'growth_score', label: 'Growth score', visible: true },
    { code: 'goals', label: 'Goals', visible: true },
    { code: 'kpis', label: 'Key numbers', visible: true },
    { code: 'action_items', label: 'Action items', visible: true },
    { code: 'recommendations', label: 'Recommendations', visible: true },
  ]);
  readonly visibleWidgets = computed(() => this.widgets().filter((w) => w.visible));
  readonly customizing = signal(false);
  readonly draft = signal<DashboardWidget[]>([]);
  readonly widgetError = signal<string | null>(null);
  readonly savingWidgets = signal(false);

  /**
   * Computes balanced 12-column spans for non-KPI widgets so consecutive pairs
   * fill all 12 columns (7+5 or 5+7) while any standalone widget between full
   * rows expands to 12 columns — leaving zero empty holes in any widget order.
   */
  readonly cellSpans = computed<string[]>(() => {
    const list = this.visibleWidgets();
    const spans = new Array<string>(list.length).fill('bento-cell--full');
    let runStart = -1;

    const flushRun = (endExclusive: number) => {
      if (runStart < 0) {
        return;
      }
      let i = runStart;
      while (i < endExclusive) {
        if (i + 1 < endExclusive) {
          const firstHeavy = list[i].code === 'recommendations';
          const secondHeavy = list[i + 1].code === 'recommendations';
          if (firstHeavy && !secondHeavy) {
            spans[i] = 'bento-cell--7';
            spans[i + 1] = 'bento-cell--5';
          } else if (secondHeavy && !firstHeavy) {
            spans[i] = 'bento-cell--5';
            spans[i + 1] = 'bento-cell--7';
          } else {
            spans[i] = 'bento-cell--6';
            spans[i + 1] = 'bento-cell--6';
          }
          i += 2;
        } else {
          spans[i] = 'bento-cell--full';
          i += 1;
        }
      }
      runStart = -1;
    };

    for (let idx = 0; idx < list.length; idx++) {
      if (list[idx].code === 'kpis' || list[idx].code === 'growth_score') {
        flushRun(idx);
        spans[idx] = 'bento-cell--full';
      } else if (runStart < 0) {
        runStart = idx;
      }
    }
    flushRun(list.length);
    return spans;
  });

  cellClass(index: number): string {
    return this.cellSpans()[index] ?? 'bento-cell--full';
  }

  formatMeter(code: string): string {
    return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  meterPct(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }

  toggleCustomize(): void {
    if (!this.customizing()) {
      this.draft.set(this.widgets().map((w) => ({ ...w })));
      this.widgetError.set(null);
    }
    this.customizing.set(!this.customizing());
  }

  toggleVisible(index: number): void {
    this.draft.update((d) => d.map((w, i) => (i === index ? { ...w, visible: !w.visible } : w)));
  }

  move(index: number, delta: number): void {
    const to = index + delta;
    this.draft.update((d) => {
      if (to < 0 || to >= d.length) {
        return d;
      }
      const next = [...d];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  saveWidgets(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    this.savingWidgets.set(true);
    this.widgetError.set(null);
    this.growth.saveWidgets(t.id, this.draft().map((w) => ({ code: w.code, visible: w.visible }))).subscribe({
      next: (res) => {
        this.widgets.set(res.widgets);
        this.savingWidgets.set(false);
        this.customizing.set(false);
      },
      error: (err) => {
        this.widgetError.set(apiErrorMessage(err));
        this.savingWidgets.set(false);
      },
    });
  }

  resetWidgets(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    this.savingWidgets.set(true);
    this.widgetError.set(null);
    this.growth.resetWidgets(t.id).subscribe({
      next: (res) => {
        this.widgets.set(res.widgets);
        this.draft.set(res.widgets);
        this.savingWidgets.set(false);
      },
      error: (err) => {
        this.widgetError.set(apiErrorMessage(err));
        this.savingWidgets.set(false);
      },
    });
  }

  private loadRecommendations(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    this.growth.recommendations(t.id, this.showHiddenRecs()).subscribe({
      next: (r) => {
        this.recommendations.set(r);
        this.recsError.set(null);
      },
      error: (err) => this.recsError.set(apiErrorMessage(err)),
    });
  }

  dismissRec(code: string, days?: number): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    this.growth.dismissRecommendation(t.id, code, days).subscribe({
      next: () => this.loadRecommendations(),
      error: (err) => this.recsError.set(apiErrorMessage(err)),
    });
  }

  restoreRec(code: string): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    this.growth.restoreRecommendation(t.id, code).subscribe({
      next: () => this.loadRecommendations(),
      error: (err) => this.recsError.set(apiErrorMessage(err)),
    });
  }

  toggleHiddenRecs(): void {
    this.showHiddenRecs.update((v) => !v);
    this.loadRecommendations();
  }

  readonly canManageTenant = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  onLocationChange(locationId: string): void {
    this.selectedLocationId.set(locationId);
    this.loadFilteredData();
  }

  onPeriodChange(days: number | null): void {
    this.selectedDays.set(days);
    this.loadFilteredData();
  }

  private loadFilteredData(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    const filters = {
      locationId: this.selectedLocationId() || null,
      days: this.selectedDays(),
    };
    this.loadingFiltered.set(true);
    let pending = 2;
    const done = () => {
      pending--;
      if (pending <= 0) {
        this.loadingFiltered.set(false);
      }
    };

    this.analyticsService.overview(t.id, filters).subscribe({
      next: (ov) => {
        this.overview.set(ov);
        done();
      },
      error: () => {
        this.overview.set(null);
        done();
      },
    });

    this.growth.score(t.id, filters).subscribe({
      next: (s) => {
        this.growthScore.set(s);
        this.growthError.set(null);
        done();
      },
      error: (err) => {
        this.growthError.set(apiErrorMessage(err));
        done();
      },
    });
  }

  ngOnInit(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    if (this.http) {
      this.http
        .get<ApiSuccess<{ locations: LocationSummary[] }>>(`${this.apiBase}/tenants/${encodeURIComponent(t.id)}/locations`)
        .subscribe({
          next: (res) => this.locations.set(res.data?.locations ?? []),
          error: () => this.locations.set([]),
        });
    }

    this.loadFilteredData();

    this.growth.widgets(t.id).subscribe({
      next: (res) => {
        this.widgets.set(res.widgets);
        this.draft.set(res.widgets);
      },
      error: () => this.draft.set(this.widgets()),
    });
    this.loadRecommendations();
    this.growth.actionItems(t.id).subscribe({
      next: (a) => this.actionItems.set(a),
      error: (err) => this.actionError.set(apiErrorMessage(err)),
    });
  }

  readonly moduleRows = computed<InsightRow[]>(() => {
    const t = this.tenant();
    if (!t) {
      return [];
    }
    return [
      {
        icon: 'audit',
        title: 'Profile readiness indicator',
        subtitle: 'Connect Google and run a readiness audit',
        link: ['/app', t.id, 'integrations'],
      },
      {
        icon: 'content',
        title: 'Drafts & approvals',
        subtitle: 'Brand kit, assets, AI composer and content drafts',
        tile: 'mint',
        link: ['/app', t.id, 'content'],
      },
      {
        icon: 'calendar',
        title: 'Next scheduled post',
        subtitle: 'Schedule approved content and track publish jobs',
        tile: 'amber',
        link: ['/app', t.id, 'calendar'],
      },
      {
        icon: 'reviews',
        title: 'Unreplied reviews',
        subtitle: 'Review inbox and reply workflow, once a location is linked',
        link: ['/app', t.id, 'integrations'],
      },
      {
        icon: 'subscription',
        title: 'Monthly quotas',
        subtitle: 'Plan, subscription status and usage meters',
        tile: 'peach',
        link: ['/app', t.id, 'billing'],
      },
    ];
  });
}
