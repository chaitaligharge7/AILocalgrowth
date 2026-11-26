import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { ActivityEvent } from '../../core/settings/settings.models';
import { SettingsService } from '../../core/settings/settings.service';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

/**
 * Settings → Activity log (owner/admin): the tenant's own audit trail
 * (`GET .../activity-log`). Filterable by action and date range. Actors who
 * are not members of this business are shown as "Outside user" — the server
 * deliberately never returns their name.
 */
@Component({
  selector: 'app-settings-activity',
  standalone: true,
  imports: [ReactiveFormsModule, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="block">
      <h2>Activity log</h2>
      <p class="meta">Security-relevant changes in this business: team changes, invites, settings, and refused access attempts.</p>
      <form class="filters" [formGroup]="form" (ngSubmit)="apply()">
        <label>
          Action
          <select formControlName="action">
            <option value="">All actions</option>
            @for (action of actions(); track action) {
              <option [value]="action">{{ action }}</option>
            }
          </select>
        </label>
        <label>
          From
          <input type="date" formControlName="from" />
        </label>
        <label>
          To
          <input type="date" formControlName="to" />
        </label>
        <button type="submit" [disabled]="loading()">Apply</button>
        <button
          type="button"
          class="btn-secondary"
          data-testid="export-activity-csv"
          (click)="exportCsv()"
          [disabled]="loading() || exporting()"
        >
          {{ exporting() ? 'Exporting…' : 'Export CSV' }}
        </button>
      </form>
      @if (fieldErrors()) {
        <p class="form-error" role="alert">{{ fieldErrors()?.['from'] || fieldErrors()?.['to'] }}</p>
      }
      <ui-table-toolbar
        placeholder="Search activity…"
        [searchTerm]="searchTerm()"
        (searchChange)="searchTerm.set($event); page.set(1)"
        [data]="filteredEvents()"
        [columns]="exportColumns"
        filename="activity_log"
        [loading]="loading()"
        (refresh)="apply()"
        (exportCsv)="exportCsv()"
      />
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (events().length === 0) {
        <app-empty-state icon="audit" title="No activity matches" message="Try a different action or date range." />
      } @else if (filteredEvents().length === 0) {
        <p class="meta">No activity events match "{{ searchTerm() }}".</p>
      } @else {
        <table class="data-table" data-testid="activity-table">
          <thead>
            <tr>
              <th><ui-sort-header label="When" [active]="sortCol() === 'created_at'" [direction]="sortDir()" (sort)="toggleSort('created_at')" /></th>
              <th>Who</th>
              <th><ui-sort-header label="Action" [active]="sortCol() === 'action'" [direction]="sortDir()" (sort)="toggleSort('action')" /></th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            @for (event of pagedEvents(); track event.id) {
              <tr>
                <td class="meta">{{ event.created_at }}</td>
                <td>{{ actor(event) }}</td>
                <td><span class="badge badge--dot" [class]="badge(event)">{{ event.action }}</span></td>
                <td class="meta">{{ summary(event) }}</td>
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
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .filters { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; margin: 1rem 0; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.875rem; }
      input, select { padding: 0.5rem; font: inherit; }
      button { padding: 0.5rem 1rem; cursor: pointer; }
      .form-error { color: #b00020; font-size: 0.875rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    `,
  ],
})
export class SettingsActivityComponent implements OnInit {
  private readonly fb = new FormBuilder();

  readonly form = this.fb.nonNullable.group({ action: [''], from: [''], to: [''] });
  readonly events = signal<ActivityEvent[]>([]);
  readonly actions = signal<string[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'created_at', label: 'When' },
    { key: 'action', label: 'Action' },
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
        case 'action':
          return e.action;
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        this.actor(e).toLowerCase().includes(q) ||
        this.summary(e).toLowerCase().includes(q),
    );
  });

  readonly pagedEvents = computed(() => paginateItems(this.filteredEvents(), this.page(), this.pageSize()));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly settings: SettingsService,
  ) {}

  ngOnInit(): void {
    this.apply();
  }

  apply(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    const { action, from, to } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    this.fieldErrors.set(null);
    this.settings.activityLog(tenantId, { action, from, to }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.events.set(res.events);
        this.actions.set(res.actions);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }

  exportCsv(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.exporting()) {
      return;
    }
    const { action, from, to } = this.form.getRawValue();
    this.exporting.set(true);
    this.error.set(null);
    this.settings.exportActivityLogCsv(tenantId, { action, from, to }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  actor(event: ActivityEvent): string {
    if (event.actor_name) {
      return event.actor_name;
    }

    return event.actor_type === 'user' ? 'Outside user' : event.actor_type;
  }

  badge(event: ActivityEvent): string {
    if (event.action.includes('denied') || event.action.includes('removed') || event.action.includes('revoked')) {
      return 'badge--danger';
    }

    return event.action.includes('created') || event.action.includes('accepted') ? 'badge--success' : 'badge--info';
  }

  summary(event: ActivityEvent): string {
    const parts: string[] = [];
    if (event.before) {
      parts.push('from ' + JSON.stringify(event.before));
    }
    if (event.after) {
      parts.push('to ' + JSON.stringify(event.after));
    }

    return parts.length > 0 ? parts.join(' ') : event.entity_type;
  }
}
