import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformAgency, PlatformTicket, PlatformUser } from '../../../core/admin/platform.models';
import { PlatformService } from '../../../core/admin/platform.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

const LIST_STYLES = `
  .list { font-family: var(--font-sans); max-width: 1100px; display: flex; flex-direction: column; gap: var(--space-4); }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
  th { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
  .toolbar { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; }
  .form-error { color: #b00020; }
  .meta { color: var(--color-text-muted); font-size: 0.85rem; }
  input, select, button { padding: 0.4rem 0.6rem; font: inherit; }
`;

/** `/admin/users` — platform user directory (SA-015/016). Never shows credentials. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [DatePipe, FormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="list">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-015" title="Users" subtitle="Everyone registered on the platform." />
      <form class="toolbar" (ngSubmit)="load()">
        <input type="search" name="q" [(ngModel)]="query" placeholder="Search name or email…" data-testid="user-search" />
        <button type="submit">Search</button>
      </form>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (users().length === 0) {
        <app-empty-state icon="leads" title="No users found" message="No users match this search." />
      } @else {
        <div class="card">
          <table data-testid="users-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Businesses</th><th>Last login</th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td>{{ u.name }}</td>
                  <td>{{ u.email }}</td>
                  <td><span class="badge badge--dot" [class]="u.email_verified ? 'badge--success' : 'badge--warning'">{{ u.email_verified ? u.status : 'unverified' }}</span></td>
                  <td>{{ u.tenant_count }}</td>
                  <td class="meta">{{ u.last_login_at ? (u.last_login_at | date: 'medium') : 'never' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [LIST_STYLES],
})
export class AdminUsersComponent implements OnInit {
  readonly users = signal<PlatformUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  query = '';

  constructor(private readonly platform: PlatformService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.users(this.query.trim() || undefined).subscribe({
      next: (u) => {
        this.users.set(u);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

/** `/admin/agencies` — agency account directory (SA-018). */
@Component({
  selector: 'app-admin-agencies',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="list">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-018" title="Agencies" subtitle="Agency accounts and how many clients they manage." />
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (agencies().length === 0) {
        <app-empty-state icon="clients" title="No agencies yet" message="Agency accounts appear here once a business enables agency mode." />
      } @else {
        <div class="card">
          <table data-testid="agencies-table">
            <thead><tr><th>Agency</th><th>Owner business</th><th>Active clients</th><th>Pending invites</th><th>Staff assignments</th><th>Created</th></tr></thead>
            <tbody>
              @for (a of agencies(); track a.id) {
                <tr>
                  <td>{{ a.brand_name }}</td>
                  <td>{{ a.owner_tenant_name }}</td>
                  <td>{{ a.active_clients }}</td>
                  <td>{{ a.pending_invites }}</td>
                  <td>{{ a.active_assignments }}</td>
                  <td class="meta">{{ a.created_at | date: 'mediumDate' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [LIST_STYLES],
})
export class AdminAgenciesComponent implements OnInit {
  readonly agencies = signal<PlatformAgency[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(private readonly platform: PlatformService) {}

  ngOnInit(): void {
    this.platform.agencies().subscribe({
      next: (a) => {
        this.agencies.set(a);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

/** `/admin/support` — cross-business ticket queue (SA-051/052). Read-only; replies stay in each business. */
@Component({
  selector: 'app-admin-support',
  standalone: true,
  imports: [DatePipe, FormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="list">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-051/052" title="Support queue" subtitle="Tickets across all businesses (read-only)." />
      <div class="toolbar">
        <label>Status
          <select [(ngModel)]="status" (change)="load()" data-testid="ticket-status">
            <option value="">All</option>
            @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </label>
        <label>Category
          <select [(ngModel)]="category" (change)="load()">
            <option value="">All</option>
            @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
          </select>
        </label>
        <span class="meta" data-testid="ticket-counts">
          @for (s of statusCounts(); track s[0]) { {{ s[0] }}: {{ s[1] }} · }
        </span>
      </div>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (tickets().length === 0) {
        <app-empty-state icon="support" title="No tickets" message="No tickets match these filters." />
      } @else {
        <div class="card">
          <table data-testid="tickets-table">
            <thead><tr><th>Business</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>
              @for (t of tickets(); track t.id) {
                <tr>
                  <td>{{ t.tenant_name }}</td>
                  <td>{{ t.subject }}</td>
                  <td>{{ t.category }}</td>
                  <td>{{ t.priority }}</td>
                  <td><span class="badge badge--dot badge--neutral">{{ t.status }}</span></td>
                  <td class="meta">{{ t.created_at | date: 'medium' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [LIST_STYLES],
})
export class AdminSupportComponent implements OnInit {
  readonly statuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
  readonly categories = ['billing', 'technical', 'content', 'integrations', 'account', 'other'];
  readonly tickets = signal<PlatformTicket[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  status = '';
  category = '';

  constructor(private readonly platform: PlatformService) {}

  ngOnInit(): void {
    this.load();
  }

  statusCounts(): [string, number][] {
    return Object.entries(this.counts());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.tickets(this.status || undefined, this.category || undefined).subscribe({
      next: (r) => {
        this.tickets.set(r.tickets);
        this.counts.set(r.by_status);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
