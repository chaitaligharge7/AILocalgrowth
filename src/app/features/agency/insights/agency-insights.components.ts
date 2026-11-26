import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AgencyActivityEvent,
  AgencyClientOverview,
  AgencyInsightsService,
  AgencyTeamMember,
} from '../../../core/agency/agency-insights.service';
import { apiErrorMessage } from '../../../core/http/error.util';
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
  .card { padding: 18px 20px; }
  .card h2 { font-size: var(--text-md, 1rem); font-weight: var(--font-bold); margin: 0 0 10px; }
  .table-head-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .table-head-toolbar h2 { margin: 0; }
  .table-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .table-search { height: 34px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.825rem; outline: none; min-width: 180px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .meta { color: var(--color-text-muted); font-size: var(--text-xs); margin: 0; }
  .form-error { color: var(--color-danger); font-size: var(--text-xs); margin: 0; }
  .person-cell { display: inline-flex; align-items: center; gap: 10px; }
  .kv-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-xs); }
  .kv-row:last-child { border-bottom: none; }
  ul.checklist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  ul.checklist li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-surface-alt); font-size: var(--text-xs); }
  ul.checklist li[data-done='true'] { color: var(--color-success); font-weight: var(--font-semibold); background: var(--color-success-bg); }
  .loc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .loc-chip { padding: 5px 12px; border-radius: var(--radius-pill); background: var(--color-surface-alt); border: 1px solid var(--color-border); font-size: var(--text-xs); font-weight: var(--font-medium); }
  table { width: 100%; border-collapse: collapse; }
  .table-wrap { width: 100%; overflow-x: auto; }
  @media (max-width: 1024px) { .stats { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
  @media (max-width: 520px) { .stats { grid-template-columns: 1fr; } }
`;

/** `/agency/team` — agency staff roster with real workload (active client assignments). AG-009/010/044. */
@Component({
  selector: 'app-agency-team',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    SortHeaderComponent,
    TableExportComponent,
    PaginationComponent,
  ],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Roster & Workload" title="Team" subtitle="Your agency members and active client delegations." />
      @if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="3" /></div>
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (members().length === 0) {
        <div class="card"><app-empty-state icon="team" title="No team members" message="Members of your agency business appear here." /></div>
      } @else {
        <div class="card">
          <div class="table-head-toolbar">
            <h2>Staff roster ({{ filteredMembers().length }})</h2>
            <div class="table-actions">
              <input
                type="search"
                class="table-search"
                placeholder="Search name, email, role…"
                [value]="searchTerm()"
                (input)="searchTerm.set($any($event.target).value); page.set(1)"
              />
              <ui-table-export
                [data]="sortedMembers()"
                [columns]="exportColumns"
                filename="agency_team"
                [loading]="loading()"
                (refresh)="refresh()"
              />
            </div>
          </div>
          <table data-testid="team-table">
            <thead>
              <tr>
                <th>
                  <ui-sort-header
                    label="Name"
                    [active]="sortCol() === 'name'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('name')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Email"
                    [active]="sortCol() === 'email'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('email')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Role"
                    [active]="sortCol() === 'role_code'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('role_code')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Clients"
                    [active]="sortCol() === 'client_count'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('client_count')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Active assignments"
                    [active]="sortCol() === 'active_assignments'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('active_assignments')"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              @for (m of pagedMembers(); track m.user_id) {
                <tr>
                  <td>
                    <div class="person-cell">
                      <span class="avatar-initial">{{ (m.name || m.email || 'U')[0].toUpperCase() }}</span>
                      <strong>{{ m.name }}</strong>
                    </div>
                  </td>
                  <td class="meta">{{ m.email }}</td>
                  <td><span class="badge badge--info">{{ m.role_code }}</span></td>
                  <td>{{ m.client_count }}</td>
                  <td><strong>{{ m.active_assignments }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredMembers().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event); page.set(1)"
          />
        </div>
        <p class="meta">Workload counts only active staff assignments. Task or time tracking is not recorded.</p>
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyTeamComponent implements OnInit {
  readonly members = signal<AgencyTeamMember[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('name');
  readonly sortDir = signal<SortDirection>('asc');

  readonly exportColumns: TableExportColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role_code', label: 'Role' },
    { key: 'client_count', label: 'Clients' },
    { key: 'active_assignments', label: 'Active assignments' },
  ];

  readonly filteredMembers = computed(() => {
    const list = this.members();
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) =>
      [m.name, m.email, m.role_code].some((f) => f && f.toLowerCase().includes(q)),
    );
  });

  readonly sortedMembers = computed(() =>
    sortTableRows(this.filteredMembers(), this.sortCol(), this.sortDir(), (row, col) => (row as any)[col]),
  );

  readonly pagedMembers = computed(() => paginateItems(this.sortedMembers(), this.page(), this.pageSize()));

  constructor(private readonly api: AgencyInsightsService) {}

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
    this.error.set(null);
    this.api.team().subscribe({
      next: (m) => {
        this.members.set(m);
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

/** `/agency/activity` — agency relationship events only (invites, approvals, assignments). AG-048. */
@Component({
  selector: 'app-agency-activity',
  standalone: true,
  imports: [
    DatePipe,
    PageHeaderComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    SortHeaderComponent,
    TableExportComponent,
    PaginationComponent,
  ],
  template: `
    <section class="page">
      <app-page-header eyebrow="Agency" eyebrowLabel="Audit Log" title="Activity log" subtitle="Client invitations, approvals and staff assignments." />
      @if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (events().length === 0) {
        <div class="card"><app-empty-state icon="audit" title="No activity yet" message="Agency events will be listed here." /></div>
      } @else {
        <div class="card">
          <div class="table-head-toolbar">
            <h2>Activity events ({{ filteredEvents().length }})</h2>
            <div class="table-actions">
              <input
                type="search"
                class="table-search"
                placeholder="Search actor, client, action…"
                [value]="searchTerm()"
                (input)="searchTerm.set($any($event.target).value); page.set(1)"
              />
              <ui-table-export
                [data]="sortedEvents()"
                [columns]="exportColumns"
                filename="agency_activity"
                [loading]="loading()"
                (refresh)="refresh()"
              />
            </div>
          </div>
          <table data-testid="activity-table">
            <thead>
              <tr>
                <th>
                  <ui-sort-header
                    label="When"
                    [active]="sortCol() === 'created_at'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('created_at')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Who"
                    [active]="sortCol() === 'actor_name'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('actor_name')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Business"
                    [active]="sortCol() === 'tenant_name'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('tenant_name')"
                  />
                </th>
                <th>
                  <ui-sort-header
                    label="Action"
                    [active]="sortCol() === 'action'"
                    [direction]="sortDir()"
                    (sort)="toggleSort('action')"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              @for (e of pagedEvents(); track e.id) {
                <tr>
                  <td class="meta">{{ e.created_at | date: 'medium' }}</td>
                  <td><strong>{{ e.actor_name || 'System' }}</strong></td>
                  <td>{{ e.tenant_name }}</td>
                  <td><code>{{ e.action }}</code></td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredEvents().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event); page.set(1)"
          />
        </div>
        <p class="meta">Only agency relationship events are shown. Other activity inside a client business is never visible here.</p>
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyActivityComponent implements OnInit {
  readonly events = signal<AgencyActivityEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('created_at');
  readonly sortDir = signal<SortDirection>('desc');

  readonly exportColumns: TableExportColumn[] = [
    { key: 'created_at', label: 'When' },
    { key: 'actor_name', label: 'Who' },
    { key: 'tenant_name', label: 'Business' },
    { key: 'action', label: 'Action' },
  ];

  readonly filteredEvents = computed(() => {
    const list = this.events();
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) =>
      [e.actor_name || '', e.tenant_name || '', e.action || ''].some((f) => f.toLowerCase().includes(q)),
    );
  });

  readonly sortedEvents = computed(() =>
    sortTableRows(this.filteredEvents(), this.sortCol(), this.sortDir(), (row, col) => (row as any)[col]),
  );

  readonly pagedEvents = computed(() => paginateItems(this.sortedEvents(), this.page(), this.pageSize()));

  constructor(private readonly api: AgencyInsightsService) {}

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
    this.error.set(null);
    this.api.activity().subscribe({
      next: (e) => {
        this.events.set(e);
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

/** `/agency/clients/:linkId/overview` — one client at a glance plus an onboarding checklist. AG-015..019. */
@Component({
  selector: 'app-agency-client-overview',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent],
  template: `
    <section class="page">
      <div class="topbar-row">
        <app-page-header
          eyebrow="Agency"
          eyebrowLabel="Client Workspace"
          [title]="data()?.client_display_name ?? 'Client'"
          [showBack]="false"
          subtitle="Setup progress, operational counts, and delegated access."
        />
        <a routerLink="/agency/clients" class="btn-secondary btn-sm">← Back to clients</a>
      </div>
      @if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (data()) {
        @let d = data()!;
        <div class="stats">
          <app-stat-card label="Content items" [value]="d.counts.content_items" icon="content" />
          <app-stat-card label="Leads" [value]="d.counts.leads" icon="leads" tone="info" />
          <app-stat-card label="Reviews" [value]="d.counts.reviews" icon="reviews" tone="amber" />
          <app-stat-card label="Open tickets" [value]="d.counts.open_tickets" icon="support" tone="peach" />
        </div>
        <div class="grid">
          <section class="card" data-testid="checklist">
            <h2>Onboarding checklist ({{ d.checklist_done }}/{{ d.checklist_total }})</h2>
            <ul class="checklist">
              @for (c of d.checklist; track c.key) {
                <li [attr.data-done]="c.done">{{ c.done ? '✓' : '○' }} {{ c.label }}</li>
              }
            </ul>
          </section>
          <section class="card">
            <h2>Account status</h2>
            <div class="kv-row"><span>Subscription</span><span class="badge badge--neutral">{{ d.subscription_status ?? 'none' }}</span></div>
            <div class="kv-row"><span>Google profile</span><span class="badge" [class]="d.google_status === 'connected' ? 'badge--success' : 'badge--neutral'">{{ d.google_status === 'connected' ? 'connected' : 'not connected' }}</span></div>
            <div class="kv-row"><span>Brand kit</span><span>{{ d.brand_kit_set ? 'set up' : 'not set up' }}</span></div>
          </section>
          <section class="card">
            <h2>Delegated access</h2>
            <div class="kv-row"><span>Active staff assignments</span><strong>{{ d.active_staff_assignments }}</strong></div>
            <div style="margin-top: 10px;">
              <a [routerLink]="['/agency/clients', d.link_id, 'staff']" class="btn-primary btn-sm">Manage staff →</a>
            </div>
          </section>
        </div>
        <section class="card">
          <h2>Locations ({{ d.locations.length }})</h2>
          @if (d.locations.length === 0) {
            <p class="meta">No locations yet.</p>
          } @else {
            <ul class="loc-list">
              @for (l of d.locations; track l.id) {
                <li class="loc-chip"><strong>{{ l.name }}</strong> @if (l.category) { <span class="meta">· {{ l.category }}</span> }</li>
              }
            </ul>
          }
        </section>
      }
    </section>
  `,
  styles: [STYLES],
})
export class AgencyClientOverviewComponent implements OnInit {
  readonly data = signal<AgencyClientOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: AgencyInsightsService,
  ) {}

  ngOnInit(): void {
    const linkId = this.route.snapshot.paramMap.get('linkId') ?? '';
    this.api.clientOverview(linkId).subscribe({
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
}
