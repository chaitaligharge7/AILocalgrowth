import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AgencyAnalytics,
  AgencyBilling,
  AgencyConsoleService,
  AgencyNotice,
  AgencyRole,
} from '../../../core/agency/agency-console.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../../shared/table/table-export.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';

const STYLES = `
  .page { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: 16px; }
  .topbar-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .topbar-row ::ng-deep .page-header { margin-bottom: 0; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .card { padding: 18px 20px; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .card h2 { font-size: var(--text-md, 1rem); font-weight: var(--font-bold); margin: 0 0 10px; }
  .card-head h2 { margin: 0; }
  .table-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .table-search { height: 34px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.825rem; outline: none; min-width: 180px; }
  .row { display: flex; justify-content: space-between; align-items: center; margin: 6px 0; gap: 1rem; font-size: var(--text-xs); }
  .meta { color: var(--color-text-muted); font-size: var(--text-xs); margin: 0; }
  .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; align-items: end; }
  .form h2, .form button, .form .form-error, .form .ok { grid-column: 1 / -1; margin: 0; }
  .form button { justify-self: start; }
  label { display: flex; flex-direction: column; gap: 6px; font-weight: var(--font-semibold); font-size: var(--text-xs); }
  input[type='color'] { padding: 2px; height: 2.2rem; width: 100%; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; }
  .form-error { color: var(--color-danger); font-size: var(--text-xs); margin: 0; }
  .ok { color: var(--color-success); background: var(--color-success-bg); border: 1px solid var(--color-success-border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--text-xs); }
  .filters { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .action-btns { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .bar { height: 7px; background: var(--color-neutral-bg); border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
  .bar > span { display: block; height: 100%; background: var(--color-primary); border-radius: 999px; }
  .perm { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; border-radius: 999px; background: var(--color-surface-alt); border: 1px solid var(--color-border); font-size: 0.72rem; font-family: var(--font-mono); }
  table { width: 100%; border-collapse: collapse; }
  .table-wrap { width: 100%; overflow-x: auto; }
  @media (max-width: 1024px) { .stats { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
  @media (max-width: 520px) { .stats { grid-template-columns: 1fr; } }
`;

/** `/agency/billing` — the agency business's own plan, usage, invoices and add-ons (AG-041/043). */
@Component({
  selector: 'app-agency-billing',
  standalone: true,
  imports: [DatePipe, RouterLink, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Billing" title="Agency billing" subtitle="Your agency business's own plan, usage, invoices and add-ons." />
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="billing-stats">
          <app-stat-card label="Plan" [value]="d.subscription?.plan_name ?? 'No plan'" [hint]="d.subscription ? 'Status: ' + d.subscription.status : 'No active subscription'" icon="subscription" />
          <app-stat-card label="Active clients" [value]="d.clients.active" icon="clients" tone="mint" />
          <app-stat-card label="Clients with a plan" [value]="d.clients.with_live_subscription" icon="audit" tone="info" />
          <app-stat-card label="Clients without a plan" [value]="d.clients.without_live_subscription" icon="bell" tone="amber" />
        </div>
        <div class="grid">
          <section class="card">
            <h2>Subscription</h2>
            @if (d.subscription) {
              <p class="row"><span>Status</span><span class="badge badge--info">{{ d.subscription.status }}</span></p>
              @if (d.subscription.current_period_end) {
                <p class="row"><span>Current period ends</span><strong>{{ d.subscription.current_period_end | date: 'd MMM y' }}</strong></p>
              }
              @if (d.subscription.cancel_at) {
                <p class="row"><span>Cancels on</span><strong>{{ d.subscription.cancel_at | date: 'd MMM y' }}</strong></p>
              }
            } @else {
              <p class="meta">This agency business has no active subscription.</p>
            }
            <div class="action-btns">
              <a class="btn-primary btn-sm" [routerLink]="['/app', d.agency_tenant_id, 'billing']">Manage plan</a>
              <a class="btn-secondary btn-sm" [routerLink]="['/app', d.agency_tenant_id, 'billing', 'addons']">Buy add-on credits</a>
            </div>
          </section>
          <section class="card">
            <h2>Usage this period</h2>
            @for (m of d.usage_meters; track m.meter_code) {
              <p class="row"><span>{{ m.meter_code }}</span><strong>{{ m.used_qty + m.reserved_qty }} / {{ m.limit_qty }}</strong></p>
              <div class="bar"><span [style.width.%]="pct(m.used_qty + m.reserved_qty, m.limit_qty)"></span></div>
            } @empty {
              <p class="meta">No usage wallets yet for this period.</p>
            }
          </section>
        </div>
        <div class="grid">
          <div class="card">
            <h2>Invoices</h2>
            @if (d.invoices.length === 0) {
              <app-empty-state icon="subscription" title="No invoices yet" message="Invoices appear here after a paid subscription." />
            } @else {
              <table data-testid="invoices-table">
                <thead><tr><th>Number</th><th>Issued</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  @for (i of d.invoices; track i.id) {
                    <tr>
                      <td><code>{{ i.invoice_number }}</code></td>
                      <td>{{ i.issued_at ? (i.issued_at | date: 'd MMM y') : '—' }}</td>
                      <td>{{ i.currency }} {{ i.total }}</td>
                      <td><span class="badge badge--success">{{ i.status }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
          <div class="card">
            <h2>Add-on purchases</h2>
            @if (d.addon_purchases.length === 0) {
              <p class="meta">No add-ons purchased.</p>
            } @else {
              <table data-testid="addon-purchases">
                <thead><tr><th>Add-on</th><th>Units</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (p of d.addon_purchases; track p.id) {
                    <tr>
                      <td>{{ p.addon_name }}</td><td>{{ p.quantity }}</td><td>{{ p.currency }} {{ p.amount }}</td>
                      <td><span class="badge badge--neutral">{{ p.status }}</span></td>
                      <td>@if (p.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </div>
        @for (n of d.notes; track n) {
          <p class="meta">{{ n }}</p>
        }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyBillingComponent implements OnInit {
  readonly data = signal<AgencyBilling | null>(null);
  readonly error = signal<string | null>(null);

  constructor(private readonly console: AgencyConsoleService) {}

  ngOnInit(): void {
    this.console.billing().subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  pct(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }
}

/** `/agency/branding` — name, colours and contact shown inside the agency workspace (AG-047). */
@Component({
  selector: 'app-agency-branding',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Branding" title="Branding" subtitle="How your agency appears inside this workspace." />
      @if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="3" /></div>
      } @else {
        <div class="grid">
          <form class="card form" [formGroup]="form" (ngSubmit)="save()" novalidate data-testid="branding-form">
            <h2>Identity settings</h2>
            <label>Brand name <input formControlName="brand_name" maxlength="160" /></label>
            <label>Tagline <input formControlName="tagline" maxlength="120" /></label>
            <label>Primary colour <input type="color" formControlName="primary_color" /></label>
            <label>Accent colour <input type="color" formControlName="accent_color" /></label>
            <label>Support email <input type="email" formControlName="support_email" /></label>
            <label>Website (https://) <input formControlName="website_url" /></label>
            @for (e of fieldErrorList(); track e[0]) { <p class="form-error" role="alert">{{ e[0] }}: {{ e[1] }}</p> }
            @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
            @if (saved()) { <p class="ok" role="status">Branding saved.</p> }
            <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving…' : 'Save branding' }}</button>
          </form>
          <section class="card preview" data-testid="branding-preview">
            <h2>Live preview</h2>
            <div class="preview-box">
              <p class="brand" [style.color]="form.controls.primary_color.value"><strong>{{ form.controls.brand_name.value }}</strong></p>
              <p class="meta">{{ form.controls.tagline.value || 'Agency growth partner' }}</p>
              <span class="chip" [style.background]="form.controls.accent_color.value">Accent badge</span>
            </div>
          </section>
        </div>
        @for (n of notes(); track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [
    STYLES,
    `
      .preview-box { padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-alt); display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
      .brand { font-size: 1.35rem; margin: 0; }
      .chip { display: inline-block; padding: 0.18rem 0.65rem; border-radius: 999px; color: #fff; font-size: 0.72rem; font-weight: 600; }
    `,
  ],
})
export class AgencyBrandingComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly notes = signal<string[]>([]);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldErrorList = computed(() => Object.entries(this.fieldErrors()));
  readonly form = this.fb.nonNullable.group({
    brand_name: ['', [Validators.required, Validators.maxLength(160)]],
    tagline: [''],
    primary_color: ['#078d7e'],
    accent_color: ['#d6a354'],
    support_email: [''],
    website_url: [''],
  });

  constructor(private readonly console: AgencyConsoleService) {}

  ngOnInit(): void {
    this.console.branding().subscribe({
      next: (b) => {
        this.form.reset({
          brand_name: b.brand_name,
          tagline: b.tagline,
          primary_color: b.primary_color ?? '#078d7e',
          accent_color: b.accent_color ?? '#d6a354',
          support_email: b.support_email,
          website_url: b.website_url,
        });
        this.notes.set(b.notes);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.formError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.formError.set(null);
    this.fieldErrors.set({});
    this.console.saveBranding(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.fieldErrors.set(apiErrorFields(err) ?? {});
        this.formError.set(apiErrorMessage(err));
      },
    });
  }
}

/** `/agency/roles` — the fixed role set and the permissions each grants (AG-045). */
@Component({
  selector: 'app-agency-roles',
  standalone: true,
  imports: [PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Governance" title="Roles and permissions" subtitle="Fixed system roles and delegated client capabilities." />
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!roles()) {
        <div class="card"><app-skeleton-loader [rows]="3" /></div>
      } @else {
        <div class="card">
          <table data-testid="roles-table">
            <thead><tr><th>Role</th><th>Used for</th><th>Permissions</th><th>Active assignments</th></tr></thead>
            <tbody>
              @for (r of roles()!; track r.code) {
                <tr>
                  <td><strong>{{ r.name }}</strong> <span class="meta">({{ r.code }})</span></td>
                  <td>{{ r.scope === 'agency_management' ? 'Managing the agency' : 'Delegated to a client' }}</td>
                  <td>@for (p of r.permissions; track p) { <span class="perm">{{ p }}</span> } @empty { <span class="meta">None</span> }</td>
                  <td>{{ r.scope === 'delegable_to_client' ? r.active_assignments : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @for (n of notes(); track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyRolesComponent implements OnInit {
  readonly roles = signal<AgencyRole[] | null>(null);
  readonly notes = signal<string[]>([]);
  readonly error = signal<string | null>(null);

  constructor(private readonly console: AgencyConsoleService) {}

  ngOnInit(): void {
    this.console.roles().subscribe({
      next: (r) => {
        this.roles.set(r.roles);
        this.notes.set(r.notes);
      },
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}

/** `/agency/notifications` — things that need attention across client links (AG-008). */
@Component({
  selector: 'app-agency-notifications',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    PageHeaderComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    SortHeaderComponent,
    TableExportComponent,
    PaginationComponent,
  ],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Alerts" title="Notifications" subtitle="Live attention items computed across your client portfolio." />
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!items()) {
        <div class="card"><app-skeleton-loader [rows]="3" /></div>
      } @else if (items()!.length === 0) {
        <div class="card"><app-empty-state icon="bell" title="All clear" message="Nothing needs your attention right now." /></div>
      } @else {
        <div class="card">
          <div class="card-head">
            <h2>Notifications ({{ filteredNotices().length }})</h2>
            <div class="table-actions">
              <input
                type="search"
                class="table-search"
                placeholder="Search client, message…"
                [value]="searchTerm()"
                (input)="searchTerm.set($any($event.target).value); page.set(1)"
              />
              <ui-table-export
                [data]="sortedNotices()"
                [columns]="exportColumns"
                filename="agency_notifications"
                [loading]="loading()"
                (refresh)="refresh()"
              />
            </div>
          </div>
          <table data-testid="notices-table">
            <thead>
              <tr>
                <th>
                  <ui-sort-header
                    label="Client"
                    [active]="sortCol() === 'client_name'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('client_name')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="What"
                    [active]="sortCol() === 'message'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('message')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="When"
                    [active]="sortCol() === 'at'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('at')"
                  />
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (n of pagedNotices(); track n.kind + n.link_id) {
                <tr>
                  <td><strong>{{ n.client_name }}</strong></td>
                  <td><span class="badge badge--dot" [class]="n.severity === 'warning' ? 'badge--warning' : 'badge--neutral'">{{ n.severity }}</span> {{ n.message }}</td>
                  <td class="meta">{{ n.at | date: 'd MMM y' }}</td>
                  <td>
                    @if (n.kind !== 'invite_pending' && n.kind !== 'invite_expired') {
                      <a [routerLink]="['/agency/clients', n.link_id, 'overview']" class="btn-secondary btn-sm">Open client</a>
                    } @else {
                      <a routerLink="/agency/clients" class="btn-secondary btn-sm">Clients</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredNotices().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event); page.set(1)"
          />
        </div>
        @for (n of notes(); track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyNotificationsComponent implements OnInit {
  readonly items = signal<AgencyNotice[] | null>(null);
  readonly notes = signal<string[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('at');
  readonly sortDir = signal<SortDirection>('desc');

  readonly exportColumns: TableExportColumn[] = [
    { key: 'client_name', label: 'Client' },
    { key: 'severity', label: 'Severity' },
    { key: 'message', label: 'Message' },
    { key: 'at', label: 'When' },
  ];

  readonly filteredNotices = computed(() => {
    const list = this.items() ?? [];
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) =>
      [n.client_name, n.message, n.severity].some((f) => f && f.toLowerCase().includes(q)),
    );
  });

  readonly sortedNotices = computed(() =>
    sortTableRows(this.filteredNotices(), this.sortCol(), this.sortDir(), (row, col) => (row as any)[col]),
  );

  readonly pagedNotices = computed(() => paginateItems(this.sortedNotices(), this.page(), this.pageSize()));

  constructor(private readonly console: AgencyConsoleService) {}

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  refresh(): void {
    this.loading.set(true);
    this.console.notifications().subscribe({
      next: (r) => {
        this.items.set(r.notifications);
        this.notes.set(r.notes);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.refresh();
  }
}

/** `/agency/analytics` — per-client counts over a window with CSV export (AG-031..035). */
@Component({
  selector: 'app-agency-analytics',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    SortHeaderComponent,
    TableExportComponent,
    PaginationComponent,
  ],
  template: `
    <section class="page">
      <div class="topbar-row">
        <app-page-header eyebrow="Agency" eyebrowLabel="Cross-Client Analytics" title="Client analytics" subtitle="Side-by-side operational metrics across active clients." />
        <div class="filters">
          <label>
            Window
            <select data-testid="analytics-days" [value]="days()" (change)="setDays(+$any($event.target).value)">
              @for (d of dayOptions; track d) { <option [value]="d">Last {{ d }} days</option> }
            </select>
          </label>
        </div>
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else if (data()!.client_count === 0) {
        <div class="card"><app-empty-state icon="analytics" title="No active clients" message="Analytics appear once a client approves your invite." /></div>
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="analytics-stats">
          <app-stat-card label="New leads" [value]="d.totals.leads_new" icon="leads" tone="info" />
          <app-stat-card label="Content created" [value]="d.totals.content_created" icon="content" />
          <app-stat-card label="Posts published" [value]="d.totals.posts_succeeded" [hint]="d.totals.posts_failed + ' failed'" icon="marketing" tone="mint" />
          <app-stat-card label="New reviews" [value]="d.totals.reviews_new" [hint]="d.totals.avg_rating !== null ? 'Avg rating ' + d.totals.avg_rating : 'No ratings yet'" icon="reviews" tone="amber" />
        </div>
        <div class="card">
          <div class="card-head">
            <h2>Client breakdown ({{ filteredClients().length }})</h2>
            <div class="table-actions">
              <input
                type="search"
                class="table-search"
                placeholder="Search client…"
                [value]="searchTerm()"
                (input)="searchTerm.set($any($event.target).value); page.set(1)"
              />
              <button type="button" class="btn-secondary btn-sm" (click)="exportCsv()" data-testid="export-csv">Download CSV</button>
              <ui-table-export
                [data]="sortedClients()"
                [columns]="exportColumns"
                filename="agency_analytics"
                [loading]="loading()"
                (refresh)="load()"
              />
            </div>
          </div>
          <table data-testid="analytics-table">
            <thead>
              <tr>
                <th>
                  <ui-sort-header
                    label="Client"
                    [active]="sortCol() === 'client_name'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('client_name')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="New leads"
                    [active]="sortCol() === 'leads_new'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('leads_new')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Content"
                    [active]="sortCol() === 'content_created'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('content_created')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Published"
                    [active]="sortCol() === 'posts_succeeded'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('posts_succeeded')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Failed"
                    [active]="sortCol() === 'posts_failed'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('posts_failed')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="New reviews"
                    [active]="sortCol() === 'reviews_new'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('reviews_new')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Avg rating"
                    [active]="sortCol() === 'avg_rating'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('avg_rating')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Open tickets"
                    [active]="sortCol() === 'open_tickets'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('open_tickets')"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              @for (c of pagedClients(); track c.link_id) {
                <tr>
                  <td><a [routerLink]="['/agency/clients', c.link_id, 'overview']"><strong>{{ c.client_name }}</strong></a></td>
                  <td>{{ c.leads_new }}</td><td>{{ c.content_created }}</td><td>{{ c.posts_succeeded }}</td><td>{{ c.posts_failed }}</td>
                  <td>{{ c.reviews_new }}</td><td>{{ c.avg_rating ?? '—' }}</td><td>{{ c.open_tickets }}</td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredClients().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event); page.set(1)"
          />
        </div>
        @for (n of d.notes; track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyAnalyticsComponent implements OnInit {
  readonly dayOptions = [7, 30, 90];
  readonly days = signal(30);
  readonly data = signal<AgencyAnalytics | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('client_name');
  readonly sortDir = signal<SortDirection>('asc');

  readonly exportColumns: TableExportColumn[] = [
    { key: 'client_name', label: 'Client' },
    { key: 'leads_new', label: 'New leads' },
    { key: 'content_created', label: 'Content created' },
    { key: 'posts_succeeded', label: 'Posts published' },
    { key: 'posts_failed', label: 'Posts failed' },
    { key: 'reviews_new', label: 'New reviews' },
    { key: 'avg_rating', label: 'Avg rating' },
    { key: 'open_tickets', label: 'Open tickets' },
  ];

  readonly filteredClients = computed(() => {
    const list = this.data()?.clients ?? [];
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => (c.client_name || '').toLowerCase().includes(q));
  });

  readonly sortedClients = computed(() =>
    sortTableRows(this.filteredClients(), this.sortCol(), this.sortDir(), (row, col) => (row as any)[col]),
  );

  readonly pagedClients = computed(() => paginateItems(this.sortedClients(), this.page(), this.pageSize()));

  constructor(private readonly console: AgencyConsoleService) {}

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  ngOnInit(): void {
    this.load();
  }

  setDays(d: number): void {
    this.days.set(d);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.console.analytics(this.days()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  csv(): string {
    const d = this.data();
    if (!d) {
      return '';
    }
    const esc = (v: string | number | null): string => {
      const s = v === null ? '' : String(v);
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n']/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = ['Client', 'New leads', 'Content created', 'Posts published', 'Posts failed', 'New reviews', 'Avg rating', 'Open tickets'];
    return [
      header.join(','),
      ...d.clients.map((c) =>
        [c.client_name, c.leads_new, c.content_created, c.posts_succeeded, c.posts_failed, c.reviews_new, c.avg_rating, c.open_tickets].map(esc).join(','),
      ),
    ].join('\n');
  }

  exportCsv(): void {
    const d = this.data();
    if (!d) {
      return;
    }
    const blob = new Blob([this.csv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agency-analytics-${d.days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
