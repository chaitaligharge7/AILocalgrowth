import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { FeatureFlag, FeatureFlagScopeType } from '../../../core/admin/admin.models';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn } from '../../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../../shared/table/table-toolbar.component';

/**
 * `/admin/feature-flags` — `GET/PATCH /admin/feature-flags` (blueprint
 * §10.4 AC-15 "Admin can disable broken integration without database
 * edits"). The reason field is mandatory UI on every toggle, matching
 * `AdminAuditTrail::requireReason()`.
 */
@Component({
  selector: 'app-admin-feature-flags',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="admin-feature-flags">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-FLAGS" title="Feature flags" subtitle="Toggle integrations without a database edit." />

      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else {
        <div class="card table-card">
        <ui-table-toolbar
          placeholder="Search flags…"
          [searchTerm]="searchTerm()"
          (searchChange)="searchTerm.set($event); page.set(1)"
          [data]="filteredFlags()"
          [columns]="exportColumns"
          filename="feature_flags"
          [loading]="loading()"
          (refresh)="refresh()"
        />
        <table>
          <thead>
            <tr>
              <th><ui-sort-header label="Flag key" [active]="sortCol() === 'flag_key'" [direction]="sortDir()" (sort)="toggleSort('flag_key')" /></th>
              <th><ui-sort-header label="Scope" [active]="sortCol() === 'scope_type'" [direction]="sortDir()" (sort)="toggleSort('scope_type')" /></th>
              <th><ui-sort-header label="Enabled" [active]="sortCol() === 'enabled'" [direction]="sortDir()" (sort)="toggleSort('enabled')" /></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (flag of pagedFlags(); track flag.id) {
              <tr>
                <td>{{ flag.flag_key }}</td>
                <td>{{ flag.scope_type }}{{ flag.scope_id ? ' (' + flag.scope_id + ')' : '' }}</td>
                <td><span class="badge badge--dot" [class]="flag.enabled ? 'badge--success' : 'badge--neutral'">{{ flag.enabled ? 'on' : 'off' }}</span></td>
                <td>
                  @if (editingKey() === flag.flag_key) {
                    <form [formGroup]="form" (ngSubmit)="submit(flag)" novalidate class="inline-form">
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
                    <button type="button" (click)="startEdit(flag)">{{ flag.enabled ? 'Disable' : 'Enable' }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-pagination
          [totalItems]="filteredFlags().length"
          [currentPage]="page()"
          [pageSize]="pageSize()"
          (pageChange)="page.set($event)"
          (pageSizeChange)="pageSize.set($event); page.set(1)"
        />
        </div>
      }

      <h2>Set a flag</h2>
      <p class="meta">
        <code>PATCH /admin/feature-flags</code> upserts — this also creates a brand-new <code>flag_key</code> the
        first time it's set, so this one form covers both "add a flag" and "toggle an existing one".
      </p>
      <form [formGroup]="createForm" (ngSubmit)="submitCreate()" novalidate class="create-form">
        <label>
          Flag key
          <input type="text" formControlName="flag_key" placeholder="e.g. ai.generation.enabled" />
        </label>
        <label>
          Scope
          <select formControlName="scope_type">
            <option value="global">global</option>
            <option value="tenant">tenant</option>
          </select>
        </label>
        @if (createForm.controls.scope_type.value === 'tenant') {
          <label>
            Scope id (tenant id)
            <input type="text" formControlName="scope_id" />
          </label>
        }
        <label class="checkbox-label">
          <input type="checkbox" formControlName="enabled" />
          Enabled
        </label>
        <label class="reason-label">
          Reason <span class="required-mark">(required)</span>
          <input type="text" formControlName="reason" placeholder="Why is this changing?" />
        </label>
        @if (createForm.controls.reason.touched && createForm.controls.reason.invalid) {
          <p class="field-error">A reason is required for this privileged action.</p>
        }
        @if (createError()) {
          <p class="form-error" role="alert">{{ createError() }}</p>
        }
        @if (createdKey()) {
          <p class="success" role="status">Saved "{{ createdKey() }}".</p>
        }
        <button type="submit" [disabled]="createForm.invalid || creating()">
          {{ creating() ? 'Saving…' : 'Save flag' }}
        </button>
      </form>
    </section>
  `,
  styles: [
    `
      .admin-feature-flags {
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
      .table-card {
        overflow-x: auto;
      }
      .meta {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
      .create-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 360px;
      }
      .create-form label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
        font-size: 0.875rem;
      }
      .checkbox-label {
        flex-direction: row !important;
        align-items: center;
        gap: 0.4rem !important;
      }
      .success {
        color: #146c2e;
        margin: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
      }
      th,
      td {
        text-align: center;
        padding: 0.5rem;
        border-bottom: 1px solid #eee;
        vertical-align: top;
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
export class AdminFeatureFlagsComponent implements OnInit {
  readonly flags = signal<FeatureFlag[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'flag_key', label: 'Flag key' },
    { key: 'scope_type', label: 'Scope' },
    { key: 'enabled', label: 'Enabled' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredFlags = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.flags(), this.sortCol(), this.sortDir(), (f, col) => {
      switch (col) {
        case 'flag_key':
          return f.flag_key;
        case 'scope_type':
          return f.scope_type;
        case 'enabled':
          return f.enabled;
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter((f) => f.flag_key.toLowerCase().includes(q) || f.scope_type.toLowerCase().includes(q));
  });

  readonly pagedFlags = computed(() => paginateItems(this.filteredFlags(), this.page(), this.pageSize()));
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly editingKey = signal<string | null>(null);
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createdKey = signal<string | null>(null);

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required]],
  });

  readonly createForm = this.fb.nonNullable.group({
    flag_key: ['', [Validators.required]],
    scope_type: ['global' as FeatureFlagScopeType, [Validators.required]],
    scope_id: [''],
    enabled: [true],
    reason: ['', [Validators.required]],
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.admin.listFeatureFlags().subscribe({
      next: (flags) => {
        this.loading.set(false);
        this.flags.set(flags);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  startEdit(flag: FeatureFlag): void {
    this.editingKey.set(flag.flag_key);
    this.actionError.set(null);
    this.form.reset({ reason: '' });
  }

  cancelEdit(): void {
    this.editingKey.set(null);
    this.actionError.set(null);
  }

  submit(flag: FeatureFlag): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    const { reason } = this.form.getRawValue();
    const scopeType: FeatureFlagScopeType = flag.scope_type;
    this.admin
      .patchFeatureFlag({
        flag_key: flag.flag_key,
        scope_type: scopeType,
        scope_id: flag.scope_id ?? undefined,
        enabled: !flag.enabled,
        reason,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.editingKey.set(null);
          this.flags.update((list) => list.map((f) => (f.id === updated.id ? updated : f)));
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.actionError.set(apiErrorMessage(err));
        },
      });
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.creating()) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.createdKey.set(null);
    const { flag_key, scope_type, scope_id, enabled, reason } = this.createForm.getRawValue();
    this.admin
      .patchFeatureFlag({
        flag_key,
        scope_type,
        scope_id: scope_type === 'tenant' && scope_id ? scope_id : undefined,
        enabled,
        reason,
      })
      .subscribe({
        next: (saved) => {
          this.creating.set(false);
          this.createdKey.set(saved.flag_key);
          this.refresh();
        },
        error: (err: unknown) => {
          this.creating.set(false);
          this.createError.set(apiErrorMessage(err));
        },
      });
  }
}
