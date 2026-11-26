import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AdminAuditEvent } from '../../../core/admin/admin.models';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn } from '../../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../../shared/table/table-toolbar.component';

/**
 * `/admin/audit-events` — `GET /admin/audit-events?tenant_id=&actor_id=&action=&from=&to=&limit=`.
 * Read-only filterable log viewer — the first screen that makes any
 * `audit_events` row visible to anyone (blueprint §02 M17).
 */
@Component({
  selector: 'app-admin-audit-events',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="admin-audit-events">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-AUDIT" title="Audit events" subtitle="Read-only, filterable platform activity log." />

      <form [formGroup]="form" (ngSubmit)="search()" novalidate class="filters card">
        <label>
          Tenant id
          <input type="text" formControlName="tenant_id" />
        </label>
        <label>
          Actor id
          <input type="text" formControlName="actor_id" />
        </label>
        <label>
          Action
          <input type="text" formControlName="action" placeholder="e.g. tenant.status_changed" />
        </label>
        <label>
          From
          <input type="datetime-local" formControlName="from" />
        </label>
        <label>
          To
          <input type="datetime-local" formControlName="to" />
        </label>
        <label>
          Limit
          <input type="number" min="1" formControlName="limit" />
        </label>
        <button type="submit" [disabled]="loading()">{{ loading() ? 'Searching…' : 'Search' }}</button>
      </form>

      @if (loading()) {
        <app-skeleton-loader [rows]="5" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (events().length === 0) {
        <app-empty-state icon="audit" title="No matching audit events" message="Adjust the filters above and search again." />
      } @else {
        <div class="card table-card">
          <ui-table-toolbar
            placeholder="Filter audit events…"
            [searchTerm]="searchTerm()"
            (searchChange)="searchTerm.set($event); page.set(1)"
            [data]="filteredEvents()"
            [columns]="exportColumns"
            filename="admin_audit_events"
            [loading]="loading()"
            (refresh)="search()"
          />
          <table>
            <thead>
              <tr>
                <th><ui-sort-header label="When" [active]="sortCol() === 'created_at'" [direction]="sortDir()" (sort)="toggleSort('created_at')" /></th>
                <th><ui-sort-header label="Actor" [active]="sortCol() === 'actor'" [direction]="sortDir()" (sort)="toggleSort('actor')" /></th>
                <th><ui-sort-header label="Action" [active]="sortCol() === 'action'" [direction]="sortDir()" (sort)="toggleSort('action')" /></th>
                <th><ui-sort-header label="Entity" [active]="sortCol() === 'entity'" [direction]="sortDir()" (sort)="toggleSort('entity')" /></th>
                <th><ui-sort-header label="Tenant" [active]="sortCol() === 'tenant_id'" [direction]="sortDir()" (sort)="toggleSort('tenant_id')" /></th>
              </tr>
            </thead>
            <tbody>
              @for (event of pagedEvents(); track event.id) {
                <tr>
                  <td>{{ event.created_at }}</td>
                  <td>{{ event.actor_type }}:{{ event.actor_id ?? '—' }}</td>
                  <td>{{ event.action }}</td>
                  <td>{{ event.entity_type }}/{{ event.entity_id }}</td>
                  <td>{{ event.tenant_id ?? '—' }}</td>
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
      }
    </section>
  `,
  styles: [
    `
      .admin-audit-events {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: end;
      }
      .filters label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
        font-size: 0.8rem;
      }
      input {
        padding: 0.4rem;
        font: inherit;
      }
      .table-card {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: center;
        padding: 0.4rem;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.85rem;
      }
      th {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }
      .form-error {
        color: var(--color-danger);
      }
      button {
        padding: 0.5rem 1rem;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminAuditEventsComponent implements OnInit {
  readonly events = signal<AdminAuditEvent[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'created_at', label: 'When' },
    { key: 'actor_type', label: 'Actor type' },
    { key: 'action', label: 'Action' },
    { key: 'entity_type', label: 'Entity' },
    { key: 'tenant_id', label: 'Tenant' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredEvents = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.events(), this.sortCol(), this.sortDir(), (e, col) => {
      switch (col) {
        case 'created_at':
          return e.created_at;
        case 'actor':
          return `${e.actor_type}:${e.actor_id ?? ''}`;
        case 'action':
          return e.action;
        case 'entity':
          return `${e.entity_type}/${e.entity_id}`;
        case 'tenant_id':
          return e.tenant_id ?? '';
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        (e.tenant_id ?? '').toLowerCase().includes(q) ||
        (e.actor_id ?? '').toLowerCase().includes(q),
    );
  });

  readonly pagedEvents = computed(() => paginateItems(this.filteredEvents(), this.page(), this.pageSize()));
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    tenant_id: [''],
    actor_id: [''],
    action: [''],
    from: [''],
    to: [''],
    limit: [100],
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const { tenant_id, actor_id, action, from, to, limit } = this.form.getRawValue();
    this.admin
      .listAuditEvents({
        tenant_id: tenant_id || undefined,
        actor_id: actor_id || undefined,
        action: action || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        limit: limit || undefined,
      })
      .subscribe({
        next: (events) => {
          this.loading.set(false);
          this.events.set(events);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.loadError.set(apiErrorMessage(err));
        },
      });
  }
}
