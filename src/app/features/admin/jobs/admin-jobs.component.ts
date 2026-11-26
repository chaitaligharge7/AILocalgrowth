import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AdminJob, AdminJobType } from '../../../core/admin/admin.models';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn } from '../../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../../shared/table/table-toolbar.component';

/**
 * `/admin/jobs` — unified `GET /admin/jobs` (publish + notification
 * dead-letter/failed queues), `POST /admin/jobs/{id}/retry`. Retry is only
 * offered server-side for `publish` jobs in `dead_letter`/`retry_wait` and
 * `notification` events in `dead_letter` (409 `JOB_NOT_RETRYABLE`
 * otherwise) — the button is shown for every row regardless (the backend
 * is the real gate), but a 409 surfaces inline rather than silently.
 */
@Component({
  selector: 'app-admin-jobs',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="admin-jobs">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-JOBS" title="Jobs" subtitle="Background publish & notification queues." />

      <ui-table-toolbar
        placeholder="Search jobs…"
        [searchTerm]="searchTerm()"
        (searchChange)="searchTerm.set($event); page.set(1)"
        [data]="filteredJobs()"
        [columns]="exportColumns"
        filename="admin_jobs"
        [loading]="loading()"
        (refresh)="refresh()"
      >
        <label filters class="filter-label">
          Type
          <select [value]="typeFilter()" (change)="onTypeFilterChange($event)">
            <option value="">All</option>
            <option value="publish">publish</option>
            <option value="notification">notification</option>
          </select>
        </label>
      </ui-table-toolbar>

      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (jobs().length === 0) {
        <app-empty-state icon="jobs" title="No jobs" message="The publish and notification queues are currently empty." />
      } @else {
        <div class="card">
          <table>
            <thead>
              <tr>
                <th><ui-sort-header label="Type" [active]="sortCol() === 'type'" [direction]="sortDir()" (sort)="toggleSort('type')" /></th>
                <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
                <th><ui-sort-header label="Attempts" [active]="sortCol() === 'attempts'" [direction]="sortDir()" (sort)="toggleSort('attempts')" /></th>
                <th><ui-sort-header label="Tenant" [active]="sortCol() === 'tenant_id'" [direction]="sortDir()" (sort)="toggleSort('tenant_id')" /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (job of pagedJobs(); track job.type + job.id) {
                <tr>
                  <td>{{ job.type }}</td>
                  <td><span class="badge badge--dot" [class]="statusBadgeClass(job.status)">{{ job.status }}</span></td>
                  <td>{{ job.attempts }}</td>
                  <td>{{ job.tenant_id ?? '—' }}</td>
                  <td>
                    @if (editingKey() === job.type + job.id) {
                      <form [formGroup]="form" (ngSubmit)="submit(job)" novalidate class="inline-form">
                        <label class="reason-label">
                          Reason <span class="required-mark">(required)</span>
                          <input type="text" formControlName="reason" placeholder="Why retry this job?" />
                        </label>
                        @if (form.controls.reason.touched && form.controls.reason.invalid) {
                          <p class="field-error">A reason is required for this privileged action.</p>
                        }
                        @if (actionError()) {
                          <p class="field-error">{{ actionError() }}</p>
                        }
                        <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Retrying…' : 'Confirm retry' }}</button>
                        <button type="button" (click)="cancelEdit()">Cancel</button>
                      </form>
                    } @else {
                      <button type="button" (click)="startEdit(job)">Retry</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredJobs().length"
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
      .admin-jobs {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .filter-row {
        display: flex;
        align-items: end;
        gap: 1rem;
      }
      .filter-row label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
        font-size: 0.875rem;
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: center;
        padding: 0.5rem;
        border-bottom: 1px solid var(--color-border);
        vertical-align: top;
      }
      th {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }
      .empty {
        color: var(--color-text-muted);
      }
      .inline-form {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        max-width: 260px;
      }
      .reason-label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .required-mark {
        color: #b00020;
        font-weight: 700;
      }
      input {
        padding: 0.4rem;
        font: inherit;
      }
      .field-error,
      .form-error {
        color: #b00020;
        margin: 0;
        font-size: 0.8rem;
      }
      button {
        padding: 0.4rem 0.8rem;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminJobsComponent implements OnInit {
  readonly jobs = signal<AdminJob[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'attempts', label: 'Attempts' },
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

  readonly filteredJobs = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.jobs(), this.sortCol(), this.sortDir(), (j, col) => {
      switch (col) {
        case 'type':
          return j.type;
        case 'status':
          return j.status;
        case 'attempts':
          return j.attempts;
        case 'tenant_id':
          return j.tenant_id ?? '';
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (j) =>
        j.type.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) ||
        (j.tenant_id ?? '').toLowerCase().includes(q),
    );
  });

  readonly pagedJobs = computed(() => paginateItems(this.filteredJobs(), this.page(), this.pageSize()));
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly typeFilter = signal<AdminJobType | ''>('');

  readonly editingKey = signal<string | null>(null);
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required]],
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.refresh();
  }

  /** Maps a job's real status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  statusBadgeClass(status: string): string {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return 'badge--success';
      case 'pending':
      case 'retry_wait':
        return 'badge--warning';
      case 'dead_letter':
      case 'failed':
        return 'badge--danger';
      default:
        return 'badge--info';
    }
  }

  onTypeFilterChange(event: Event): void {
    this.typeFilter.set((event.target as HTMLSelectElement).value as AdminJobType | '');
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.admin.listJobs(this.typeFilter() || undefined).subscribe({
      next: (jobs) => {
        this.loading.set(false);
        this.jobs.set(jobs);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  startEdit(job: AdminJob): void {
    this.editingKey.set(job.type + job.id);
    this.actionError.set(null);
    this.form.reset({ reason: '' });
  }

  cancelEdit(): void {
    this.editingKey.set(null);
    this.actionError.set(null);
  }

  submit(job: AdminJob): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    const { reason } = this.form.getRawValue();
    this.admin.retryJob(job.id, { type: job.type, reason }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editingKey.set(null);
        this.jobs.update((list) => list.map((j) => (j.type === updated.type && j.id === updated.id ? updated : j)));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }
}
