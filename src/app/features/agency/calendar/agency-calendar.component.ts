import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgencyCalendarEntry } from '../../../core/agency/agency.models';
import { AgencyService } from '../../../core/agency/agency.service';
import { apiErrorCode, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../../shared/table/table-export.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';

/**
 * `/agency/calendar` — blueprint §03 "cross-client calendar" / §3.1
 * "pooled budget visible" workspace spec. Wraps `GET /agency/calendar`
 * (`AgencyService::calendar()`, PHP), which aggregates schedules across
 * every ACTIVE client link within a required UTC date range and tags
 * each entry with its own `client_tenant_id`.
 *
 * SCOPE DECISION, reusing `docs/ADR/0026-angular-calendar-list-view-scope.md`'s
 * own precedent: a flat list view (grouped/sorted here, not grid-rendered)
 * is sufficient — no month/week drag-drop grid. The backend contract here
 * is, just like ADR 0026's, a view-agnostic flat date-range feed.
 *
 * Deliberately NOT a bulk-write surface (blueprint §3.1 "bulk operations
 * require explicit per-client confirmation"): there is no bulk-reschedule/
 * bulk-cancel endpoint in this backend (S8's own documented scope cut —
 * only the consolidated calendar READ exists). Rescheduling or cancelling
 * any one entry is done on the normal, already-built
 * `/app/:tenantId/calendar` screen for that specific client — linked per
 * row below — never fabricated here.
 */
@Component({
  selector: 'app-agency-calendar',
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
    <section class="calendar">
      <app-page-header
        eyebrow="Agency"
        eyebrowLabel="Marketing Operations"
        title="Cross-client calendar"
        subtitle="Consolidated, read-only schedule across every active client."
      />

      @if (notAnAgency()) {
        <p class="gap-note">
          You don't have an active agency account yet. Go to <a routerLink="/agency/overview">Overview</a> to enable
          agency mode first.
        </p>
      } @else {
        <div class="card toolbar-card">
          <p class="hint">
            Consolidated, read-only list of scheduled/published content across every ACTIVE client — tagged by client
            tenant. To reschedule or cancel an entry, open that client's own calendar (linked per row).
          </p>

          <section class="filters">
            <div class="date-filters">
              <label>
                <span>From</span>
                <input type="date" [value]="rangeStart()" (change)="onRangeChange('start', $event)" />
              </label>
              <label>
                <span>To</span>
                <input type="date" [value]="rangeEnd()" (change)="onRangeChange('end', $event)" />
              </label>
            </div>

            <div class="table-actions">
              <input
                type="search"
                class="search-input"
                placeholder="Search tenant, content, channel…"
                [value]="searchTerm()"
                (input)="onSearchInput($event)"
              />
              <ui-table-export
                [data]="sortedEntries()"
                [columns]="exportColumns"
                filename="agency_calendar"
                [loading]="loading()"
                (refresh)="refresh()"
              />
            </div>
          </section>
        </div>

        <div class="card table-card">
          @if (loading()) {
            <app-skeleton-loader [rows]="4" />
          } @else if (entries().length === 0) {
            <app-empty-state
              icon="calendar"
              title="No scheduled content in this range"
              message="No scheduled or published content was found across your active clients for the selected dates."
            />
          } @else if (filteredEntries().length === 0) {
            <p class="placeholder-empty">No entries match "{{ searchTerm() }}".</p>
          } @else {
            <div class="table-wrap">
              <table class="list-view">
                <thead>
                  <tr>
                    <th>
                      <ui-sort-header
                        label="Client tenant"
                        [active]="sortColumn() === 'client_tenant_id'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('client_tenant_id')"
                      />
                    </th>
                    <th>
                      <ui-sort-header
                        label="When (UTC)"
                        [active]="sortColumn() === 'scheduled_utc'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('scheduled_utc')"
                      />
                    </th>
                    <th>
                      <ui-sort-header
                        label="Content"
                        [active]="sortColumn() === 'content'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('content')"
                      />
                    </th>
                    <th>
                      <ui-sort-header
                        label="Channel"
                        [active]="sortColumn() === 'channel'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('channel')"
                      />
                    </th>
                    <th>
                      <ui-sort-header
                        label="Status"
                        [active]="sortColumn() === 'status'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('status')"
                      />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of pagedEntries(); track entry.id) {
                    <tr>
                      <td><code>{{ entry.client_tenant_id }}</code></td>
                      <td class="meta-cell">{{ entry.scheduled_utc | date: 'medium' }}</td>
                      <td><strong>{{ entry.content_title || entry.content_objective || '—' }}</strong></td>
                      <td><span class="badge badge--info">{{ entry.channel }}</span></td>
                      <td>
                        <span class="badge badge--dot" [class]="statusBadgeClass(entry.status)">{{ entry.status }}</span>
                        @if (entry.last_error_code) {
                          <span class="error-note" [title]="entry.last_error_code">⚠ {{ entry.last_error_code }}</span>
                        }
                      </td>
                      <td>
                        <a [routerLink]="['/app', entry.client_tenant_id, 'calendar']" class="btn-secondary btn-sm">
                          Open in this client's calendar
                        </a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="table-pagination-wrap">
              <app-pagination
                [totalItems]="filteredEntries().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event); page.set(1)"
              />
            </div>
          }
        </div>
        @if (loadError()) {
          <p class="form-error" role="alert">{{ loadError() }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .calendar {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .gap-note {
        margin: 0;
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        font-size: var(--text-xs);
      }
      .toolbar-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .table-card {
        padding: 0;
        overflow: hidden;
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
      }
      .hint {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        line-height: 1.45;
      }
      .filters {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .date-filters {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .table-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .search-input {
        height: 34px;
        padding: 0 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.825rem;
        outline: none;
        min-width: 220px;
      }
      .search-input:focus {
        border-color: #6366f1;
      }
      .table-pagination-wrap {
        padding: 8px 16px;
      }
      .placeholder-empty {
        padding: 20px;
        text-align: center;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        margin: 0;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: var(--font-semibold);
        font-size: var(--text-xs);
      }
      table.list-view {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      .meta-cell {
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .error-note {
        color: var(--color-warning);
        font-size: var(--text-xs);
        margin-left: var(--space-2);
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
    `,
  ],
})
export class AgencyCalendarComponent {
  readonly loading = signal(true);
  readonly notAnAgency = signal(false);
  readonly entries = signal<AgencyCalendarEntry[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly exportColumns: TableExportColumn[] = [
    { key: 'client_tenant_id', label: 'Client Tenant' },
    { key: 'scheduled_utc', label: 'When (UTC)' },
    { key: 'content_title', label: 'Content' },
    { key: 'channel', label: 'Channel' },
    { key: 'status', label: 'Status' },
  ];

  readonly filteredEntries = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return this.entries();
    return this.entries().filter((e) =>
      [e.client_tenant_id, e.channel, e.status, e.content_title || '', e.content_objective || ''].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  });

  readonly sortColumn = signal<'client_tenant_id' | 'scheduled_utc' | 'content' | 'channel' | 'status'>('scheduled_utc');
  readonly sortDirection = signal<SortDirection>('asc');

  readonly sortedEntries = computed(() =>
    sortTableRows(this.filteredEntries(), this.sortColumn(), this.sortDirection(), (row, col) => {
      switch (col) {
        case 'client_tenant_id':
          return row.client_tenant_id;
        case 'scheduled_utc':
          return row.scheduled_utc;
        case 'content':
          return row.content_title || row.content_objective || '';
        case 'channel':
          return row.channel;
        case 'status':
        default:
          return row.status;
      }
    }),
  );

  readonly pagedEntries = computed(() => paginateItems(this.sortedEntries(), this.page(), this.pageSize()));

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  toggleSort(column: 'client_tenant_id' | 'scheduled_utc' | 'content' | 'channel' | 'status'): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'published':
      case 'succeeded':
        return 'badge--success';
      case 'scheduled':
      case 'pending':
        return 'badge--warning';
      case 'failed':
      case 'cancelled':
        return 'badge--danger';
      default:
        return 'badge--neutral';
    }
  }

  readonly rangeStart = signal<string>(AgencyCalendarComponent.defaultRangeStart());
  readonly rangeEnd = signal<string>(AgencyCalendarComponent.defaultRangeEnd());

  constructor(private readonly agencyService: AgencyService) {
    this.refresh();
  }

  private static defaultRangeStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  private static defaultRangeEnd(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

  onRangeChange(which: 'start' | 'end', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (which === 'start') {
      this.rangeStart.set(value);
    } else {
      this.rangeEnd.set(value);
    }
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const startUtc = new Date(`${this.rangeStart()}T00:00:00Z`).toISOString();
    const endUtc = new Date(`${this.rangeEnd()}T23:59:59Z`).toISOString();
    this.agencyService.calendar(startUtc, endUtc).subscribe({
      next: (entries) => {
        this.loading.set(false);
        this.entries.set(entries);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (apiErrorCode(err) === 'NOT_FOUND') {
          this.notAnAgency.set(true);
        } else {
          this.loadError.set(apiErrorMessage(err));
        }
      },
    });
  }
}
