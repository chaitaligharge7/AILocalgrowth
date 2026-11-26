import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AdminTenant, AdminTenantStatus } from '../../../core/admin/admin.models';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SortHeaderComponent } from '../../../shared/table/sort-header.component';

/**
 * `/admin/tenants` — `GET /admin/tenants`, `PATCH /admin/tenants/{id}/status`.
 * The reason field is mandatory UI, not just backend validation: the form
 * cannot be submitted without it (`Validators.required` + `[disabled]`),
 * and the label is marked "(required)" rather than only erroring after a
 * failed submit — see task brief "make this obvious in the UI, not just
 * an error after the fact".
 */
@Component({
  selector: 'app-admin-tenants',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, SortHeaderComponent],
  template: `
    <section class="admin-tenants">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-011" title="Tenants" subtitle="All registered businesses on the platform." />

      <div class="card">
        <div class="list-toolbar">
          <input
            type="search"
            class="list-search"
            placeholder="Search by name or owner id…"
            [value]="searchTerm()"
            (input)="onSearchInput($event)"
          />
          <label class="status-filter">
            Status
            <select [value]="statusFilter()" (change)="onStatusFilterChange($event)">
              <option value="">All</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
            </select>
          </label>
          <button type="button" (click)="refresh()" [disabled]="loading()">Refresh</button>
        </div>

        @if (loading()) {
          <app-skeleton-loader [rows]="4" />
        } @else if (loadError()) {
          <p class="form-error" role="alert">{{ loadError() }}</p>
        } @else if (tenants().length === 0) {
          <app-empty-state icon="leads" title="No tenants found" message="No businesses match the current filter." />
        } @else if (filteredTenants().length === 0) {
          <p class="empty">No tenants match "{{ searchTerm() }}".</p>
        } @else {
          <div class="list-header">
            <ui-sort-header
              label="Name"
              [active]="sortColumn() === 'display_name'"
              [direction]="sortDescending() ? 'desc' : 'asc'"
              (sort)="toggleSort('display_name')"
            />
            <ui-sort-header
              label="Status"
              [active]="sortColumn() === 'status'"
              [direction]="sortDescending() ? 'desc' : 'asc'"
              (sort)="toggleSort('status')"
            />
            <span class="col-meta">Owner</span>
            <span class="col-meta">Action</span>
          </div>
          @for (tenant of sortedTenants(); track tenant.id) {
            <div class="list-row">
              <span class="avatar-initial" [class]="avatarTintClass(tenant.display_name || tenant.id)">
                {{ initialFor(tenant.display_name) }}
              </span>
              <span class="list-row-main">
                <span class="list-row-title">{{ tenant.display_name }}</span>
                <span class="list-row-subtitle">{{ tenant.id }}</span>
              </span>
              <span class="badge badge--dot" [class]="statusBadgeClass(tenant.status)">{{ tenant.status }}</span>
              <span class="list-row-meta"><code>{{ tenant.owner_user_id }}</code></span>
              <span class="actions">
                <a [routerLink]="['/admin/tenants', tenant.id]" data-testid="tenant-details-link">Details</a>
                @if (editingId() === tenant.id) {
                  <form [formGroup]="form" (ngSubmit)="submit(tenant)" novalidate class="inline-form">
                    <select formControlName="status">
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                    </select>
                    <label class="reason-label">
                      Reason <span class="required-mark">(required)</span>
                      <input type="text" formControlName="reason" placeholder="Why is this changing?" />
                    </label>
                    @if (form.controls.reason.touched && form.controls.reason.invalid) {
                      <p class="field-error">A reason is required for this privileged action.</p>
                    }
                    @if (actionError()) {
                      <p class="field-error">{{ actionError() }}</p>
                    }
                    <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving…' : 'Confirm' }}</button>
                    <button type="button" (click)="cancelEdit()">Cancel</button>
                  </form>
                } @else {
                  <button type="button" (click)="startEdit(tenant)">
                    {{ tenant.status === 'active' ? 'Suspend' : 'Reactivate' }}
                  </button>
                }
              </span>
            </div>
          }
          <div class="list-footer">Showing {{ filteredTenants().length }} of {{ tenants().length }} tenants</div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .admin-tenants {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .list-toolbar {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
        margin-bottom: var(--space-3);
      }
      .list-search {
        min-width: 180px;
        flex: 0 1 240px;
        width: 240px;
        max-width: 260px;
      }
      .status-filter {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .list-header {
        display: grid;
        grid-template-columns: 46px 1fr 110px 220px 140px;
        gap: var(--space-3);
        padding: 0 var(--space-2) var(--space-2);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border);
      }
      .list-header > *:first-child {
        grid-column: 2;
      }
      .list-row {
        display: grid;
        grid-template-columns: 34px 1fr 110px 220px 140px;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2);
        border-bottom: 1px solid var(--color-border);
      }
      @media (max-width: 720px) {
        .list-header {
          grid-template-columns: 46px 1fr 90px;
        }
        .list-row {
          grid-template-columns: 34px 1fr 90px;
        }
        .col-meta,
        .list-row-meta {
          display: none;
        }
        .list-row .actions {
          grid-column: 1 / -1;
        }
      }
      .inline-form {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        max-width: 280px;
      }
      .reason-label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
      }
      .required-mark {
        color: var(--color-danger);
        font-weight: 700;
      }
      input,
      select {
        padding: 0.4rem;
        font: inherit;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .empty {
        color: var(--color-text-muted);
      }
      button {
        padding: 0.4rem 0.8rem;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminTenantsComponent implements OnInit {
  readonly tenants = signal<AdminTenant[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly statusFilter = signal<AdminTenantStatus | ''>('');
  readonly searchTerm = signal('');

  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);

  /** Client-side filter over the already-fetched page — no extra API call. */
  readonly filteredTenants = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) {
      return this.tenants();
    }
    return this.tenants().filter((tenant) => [tenant.display_name, tenant.owner_user_id].some((field) => (field ?? '').toLowerCase().includes(q)));
  });

  /** Premium data-grid sortable columns — client-side only, over the already-filtered page. */
  readonly sortColumn = signal<'display_name' | 'status'>('display_name');
  readonly sortDescending = signal(false);

  readonly sortedTenants = computed(() => {
    const column = this.sortColumn();
    const descending = this.sortDescending();
    const rows = [...this.filteredTenants()];
    rows.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0));
    return descending ? rows.reverse() : rows;
  });

  toggleSort(column: 'display_name' | 'status'): void {
    if (this.sortColumn() === column) {
      this.sortDescending.set(!this.sortDescending());
    } else {
      this.sortColumn.set(column);
      this.sortDescending.set(false);
    }
  }

  sortAriaSort(column: 'display_name' | 'status'): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDescending() ? 'descending' : 'ascending';
  }

  sortArrow(column: 'display_name' | 'status'): string {
    if (this.sortColumn() !== column) {
      return '↕';
    }
    return this.sortDescending() ? '↓' : '↑';
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  /** First letter of a real tenant name — never a fabricated placeholder. */
  initialFor(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed[0].toUpperCase() : '•';
  }

  /** Stable hash of a real field onto one of 5 existing avatar tints — same record always gets the same color. */
  avatarTintClass(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const index = hash % 5;
    return index === 0 ? '' : `avatar-initial--${index}`;
  }

  /** Maps a tenant status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  statusBadgeClass(status: AdminTenantStatus): string {
    return status === 'active' ? 'badge--success' : 'badge--danger';
  }

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    status: ['suspended' as AdminTenantStatus, [Validators.required]],
    reason: ['', [Validators.required]],
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.refresh();
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as AdminTenantStatus | '');
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.admin.listTenants(this.statusFilter() || undefined).subscribe({
      next: (tenants) => {
        this.loading.set(false);
        this.tenants.set(tenants);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  startEdit(tenant: AdminTenant): void {
    this.editingId.set(tenant.id);
    this.actionError.set(null);
    this.form.reset({ status: tenant.status === 'active' ? 'suspended' : 'active', reason: '' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.actionError.set(null);
  }

  submit(tenant: AdminTenant): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    const { status, reason } = this.form.getRawValue();
    this.admin.updateTenantStatus(tenant.id, { status, reason }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editingId.set(null);
        this.tenants.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }
}
