import { Component, computed, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AGENCY_STAFF_ROLE_CODES, AgencyStaffAssignment, AgencyStaffRoleCode } from '../../../core/agency/agency.models';
import { AgencyService } from '../../../core/agency/agency.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../../shared/icons/icon.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../../shared/table/table-export.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';

function allowedStaffRoleValidator(control: AbstractControl): ValidationErrors | null {
  return AGENCY_STAFF_ROLE_CODES.includes(control.value as AgencyStaffRoleCode) ? null : { invalidRole: true };
}

/**
 * `/agency/clients/:linkId/staff` — Compact 2-column Staff Delegation Board.
 */
@Component({
  selector: 'app-agency-staff',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    IconComponent,
    SortHeaderComponent,
    TableExportComponent,
    PaginationComponent,
  ],
  template: `
    <section class="staff">
      <div class="top-row">
        <app-page-header
          eyebrow="Agency"
          eyebrowLabel="Staff Delegation"
          title="Staff assignments"
          [showBack]="false"
          subtitle="Delegate scoped client access to agency team members."
        />
        <div class="link-bar">
          <span class="hint">Link <code>{{ linkId }}</code></span>
          <a routerLink="/agency/clients" class="btn-secondary btn-sm">← Back to clients</a>
        </div>
      </div>

      <div class="staff-grid">
        <section class="list card">
          <div class="list-head">
            <div>
              <h2>Current assignments</h2>
              <span class="sub">{{ filteredAssignments().length }} assignments</span>
            </div>
            <div class="toolbar-actions">
              <input
                type="search"
                class="list-search"
                placeholder="Search staff ID, role…"
                [value]="searchTerm()"
                (input)="searchTerm.set($any($event.target).value); page.set(1)"
              />
              <ui-table-export
                [data]="sortedAssignments()"
                [columns]="exportColumns"
                filename="agency_staff_assignments"
                [loading]="loading()"
                (refresh)="refresh()"
              />
            </div>
          </div>
          @if (loading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (assignments().length === 0) {
            <app-empty-state icon="team" title="No staff assigned" message="Assign an agency team member using the form on the right." />
          } @else if (filteredAssignments().length === 0) {
            <p class="empty-note">No assignments match "{{ searchTerm() }}".</p>
          } @else {
            <table class="list-view">
              <thead>
                <tr>
                  <th>
                    <ui-sort-header
                      label="Staff user ID"
                      [active]="sortCol() === 'agency_user_id'"
                      [direction]="sortDir()"
                      (sort)="toggleSort('agency_user_id')"
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
                  <th>Location scope</th>
                  <th>
                    <ui-sort-header
                      label="Status"
                      [active]="sortCol() === 'status'"
                      [direction]="sortDir()"
                      (sort)="toggleSort('status')"
                    />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (a of pagedAssignments(); track a.id) {
                  <tr>
                    <td>
                      <div class="user-cell">
                        <span class="avatar-initial">{{ initialFor(a.agency_user_id) }}</span>
                        <code>{{ a.agency_user_id }}</code>
                      </div>
                    </td>
                    <td><span class="badge badge--info">{{ a.role_code }}</span></td>
                    <td class="meta">{{ a.location_id || 'All locations' }}</td>
                    <td>
                      <span class="badge badge--dot" [class]="a.status === 'active' ? 'badge--success' : 'badge--neutral'">
                        {{ a.status }}
                      </span>
                    </td>
                    <td>
                      @if (a.status === 'active') {
                        <button type="button" class="btn-danger btn-sm action-icon-btn" (click)="revoke(a)" [disabled]="revokingId() === a.id" title="Revoke assignment" aria-label="Revoke assignment">
                          <ui-icon name="trash" [size]="13" />
                          <span class="sr-only">{{ revokingId() === a.id ? 'Revoking…' : 'Revoke' }}</span>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <app-pagination
              [totalItems]="filteredAssignments().length"
              [currentPage]="page()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[]"
              (pageChange)="page.set($event)"
            />
          }
          @if (listError()) {
            <p class="form-error" role="alert">{{ listError() }}</p>
          }
        </section>

        <section class="assign card">
          <h2>Assign staff</h2>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <label>
              Staff user ID
              <input type="text" formControlName="userId" placeholder="Active agency member UUID" />
            </label>
            @if (fieldError('user_id')) {
              <p class="field-error">{{ fieldError('user_id') }}</p>
            }

            <label>
              Delegated role
              <select formControlName="roleCode">
                @for (role of roleOptions; track role) {
                  <option [value]="role">{{ role }}</option>
                }
              </select>
            </label>
            @if (fieldError('role_code')) {
              <p class="field-error">{{ fieldError('role_code') }}</p>
            }
            @if (form.controls.roleCode.errors?.['invalidRole']) {
              <p class="field-error">Role must be editor, analyst, or viewer.</p>
            }

            <label>
              Location ID (optional)
              <input type="text" formControlName="locationId" placeholder="Leave blank for all locations" />
            </label>
            @if (fieldError('location_id')) {
              <p class="field-error">{{ fieldError('location_id') }}</p>
            }

            @if (assignError() && !hasFieldErrors()) {
              <p class="form-error" role="alert">{{ assignError() }}</p>
            }
            @if (assignNotice()) {
              <p class="success" role="status">{{ assignNotice() }}</p>
            }

            <button type="submit" class="btn-primary" [disabled]="form.invalid || assigning()">
              {{ assigning() ? 'Assigning…' : 'Assign staff' }}
            </button>
          </form>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .staff {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .top-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .top-row ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .link-bar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .staff-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
        gap: 16px;
        align-items: start;
      }
      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .list-head h2 {
        margin: 0;
      }
      .sub {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .toolbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .list-search {
        height: 34px;
        padding: 0 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.825rem;
        outline: none;
        max-width: 180px;
      }
      .empty-note {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        padding: 12px 0;
      }
      .list.card,
      .assign.card {
        padding: 18px 20px;
      }
      h2 {
        margin: 0 0 10px;
        font-size: var(--text-md, 1rem);
        font-weight: var(--font-bold);
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
      }
      table.list-view {
        width: 100%;
        border-collapse: collapse;
      }
      .user-cell {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .hint,
      .meta {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .success {
        color: var(--color-success);
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        margin: 0;
        font-size: var(--text-xs);
      }
      @media (max-width: 960px) {
        .staff-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AgencyStaffComponent {
  private readonly fb = new FormBuilder();
  readonly roleOptions = AGENCY_STAFF_ROLE_CODES;

  initialFor(id: string | null | undefined): string {
    const trimmed = (id ?? '').trim();
    return trimmed ? trimmed[0].toUpperCase() : '•';
  }

  readonly linkId: string;

  readonly loading = signal(true);
  readonly assignments = signal<AgencyStaffAssignment[]>([]);
  readonly listError = signal<string | null>(null);
  readonly revokingId = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('agency_user_id');
  readonly sortDir = signal<SortDirection>('asc');

  readonly exportColumns: TableExportColumn[] = [
    { key: 'agency_user_id', label: 'Staff user ID' },
    { key: 'role_code', label: 'Role' },
    { key: 'location_id', label: 'Location scope' },
    { key: 'status', label: 'Status' },
  ];

  readonly filteredAssignments = computed(() => {
    const list = this.assignments();
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      [a.agency_user_id, a.role_code, a.status, a.location_id || ''].some((f) => f.toLowerCase().includes(q)),
    );
  });

  readonly sortedAssignments = computed(() =>
    sortTableRows(this.filteredAssignments(), this.sortCol(), this.sortDir(), (row, col) => (row as any)[col]),
  );

  readonly pagedAssignments = computed(() => paginateItems(this.sortedAssignments(), this.page(), this.pageSize()));

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    roleCode: ['editor' as AgencyStaffRoleCode, [Validators.required, allowedStaffRoleValidator]],
    locationId: [''],
  });
  readonly assigning = signal(false);
  readonly assignError = signal<string | null>(null);
  readonly assignNotice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    route: ActivatedRoute,
    private readonly agencyService: AgencyService,
  ) {
    this.linkId = route.snapshot.paramMap.get('linkId') ?? '';
    this.refresh();
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  refresh(): void {
    if (!this.linkId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.listError.set(null);
    this.agencyService.listAssignments(this.linkId).subscribe({
      next: (assignments) => {
        this.loading.set(false);
        this.assignments.set(assignments);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.assigning() || !this.linkId) {
      return;
    }
    this.assigning.set(true);
    this.assignError.set(null);
    this.fieldErrors.set(null);
    this.assignNotice.set(null);

    const { userId, roleCode, locationId } = this.form.getRawValue();
    this.agencyService
      .assignStaff(this.linkId, {
        user_id: userId,
        role_code: roleCode,
        location_id: locationId || undefined,
      })
      .subscribe({
        next: (assignment) => {
          this.assigning.set(false);
          this.assignNotice.set(`Assigned ${assignment.agency_user_id} as ${assignment.role_code}.`);
          this.form.patchValue({ userId: '', locationId: '' });
          this.refresh();
        },
        error: (err: unknown) => {
          this.assigning.set(false);
          this.assignError.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  revoke(assignment: AgencyStaffAssignment): void {
    if (this.revokingId() || !this.linkId) {
      return;
    }
    this.revokingId.set(assignment.id);
    this.listError.set(null);
    this.agencyService.revokeAssignment(this.linkId, assignment.id).subscribe({
      next: () => {
        this.revokingId.set(null);
        this.refresh();
      },
      error: (err: unknown) => {
        this.revokingId.set(null);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }
}
