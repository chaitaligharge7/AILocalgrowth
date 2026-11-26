import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgencyClientLink } from '../../core/agency/agency.models';
import { AgencyService } from '../../core/agency/agency.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

/**
 * `/app/:tenantId/agency-invites` — the CLIENT side of the agency
 * delegation flow (blueprint §06 W09 "client owner approves agency-client
 * relationship"; ADR 0045 "agency-initiates, client-approves"). This is
 * the two-sided half of the feature that must live under the ordinary
 * `/app/:tenantId/*` shell, NOT under `/agency/*` — it is the CLIENT
 * tenant's own owner/admin who must see and act on an invite addressed to
 * THEIR business, whether or not they themselves run an agency.
 *
 * Wraps `GET /tenants/{t}/agency-invites` (every invite addressed to this
 * tenant, any status) and `POST .../accept|reject|revoke`
 * (`AgencyService::{listInvitesForClient,acceptInvite,rejectInvite,revokeByClient}()`,
 * PHP). `acceptInvite()` is the ONLY backend path that can ever make a
 * relationship `active` — never anything the agency side does.
 *
 * Accept/reject is only offered for `pending` invites; revoke (ending the
 * relationship from the client's own side) is offered for `pending` or
 * `active` ones, mirroring exactly what `AgencyService::revokeByClient()`
 * allows server-side. The form is hidden entirely for non-owner/admin
 * callers as UX polish — `requireClientOwnerAdmin()` enforces this
 * server-side regardless.
 */
@Component({
  selector: 'app-agency-invites',
  standalone: true,
  imports: [DatePipe, FormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, SortHeaderComponent, PaginationComponent, TableToolbarComponent],
  template: `
    <section class="invites">
      <app-page-header
        eyebrow="Administration"
        eyebrowLabel="Delegation"
        title="Agency invites"
        subtitle="Review agency access requests, control module permissions, and manage active agency links."
      />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else if (!canManage()) {
        <div class="card">
          <p class="owner-only-note">
            Only this business's owner or admin may view or act on agency invites (enforced server-side regardless of
            this message).
          </p>
        </div>
      } @else {
        <p class="hint">
          An agency never gains access to this business automatically — a relationship becomes active only once you
          explicitly accept it below.
        </p>

        @if (errorMessage()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }
        @if (notice()) {
          <p class="form-success" role="status">{{ notice() }}</p>
        }

        <div class="card table-card">
          <ui-table-toolbar
            placeholder="Search agency, status…"
            [searchTerm]="searchTerm()"
            (searchChange)="searchTerm.set($event); page.set(1)"
            [data]="filteredInvites()"
            [columns]="exportColumns"
            filename="agency_invites"
            [loading]="loading()"
            (refresh)="refresh()"
          />
          @if (loading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (invites().length === 0) {
            <app-empty-state
              icon="link"
              title="No agency invites yet"
              message="When an agency invites your business, the request will appear here for your approval."
            />
          } @else if (filteredInvites().length === 0) {
            <p class="hint">No agency invites match "{{ searchTerm() }}".</p>
          } @else {
            <div class="table-wrap">
              <table class="list-view">
                <thead>
                  <tr>
                    <th>
                      <ui-sort-header
                        label="Agency"
                        [active]="sortColumn() === 'agency'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('agency')"
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
                    <th>Allowed modules</th>
                    <th>Pooled billing</th>
                    <th>
                      <ui-sort-header
                        label="Expires"
                        [active]="sortColumn() === 'expires_at'"
                        [direction]="sortDirection()"
                        (sort)="toggleSort('expires_at')"
                      />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (invite of pagedInvites(); track invite.id) {
                    <tr>
                      <td>
                        <div class="agency-cell">
                          <span class="agency-name">{{ invite.agency_brand_name || invite.agency_id }}</span>
                          @if (invite.agency_brand_name) {
                            <code class="agency-id">{{ invite.agency_id }}</code>
                          }
                        </div>
                      </td>
                      <td>
                        <span class="badge badge--dot" [class]="statusBadgeClass(invite.status)">
                          {{ invite.status }}
                        </span>
                      </td>
                      <td>
                        <div class="perm-chips">
                          @for (label of enabledPermissions(invite); track label) {
                            <span class="perm-chip">{{ label }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <span class="badge" [class]="invite.permissions?.pooled_billing ? 'badge--info' : 'badge--neutral'">
                          {{ invite.permissions?.pooled_billing ? 'Yes' : 'No' }}
                        </span>
                      </td>
                      <td class="meta-cell">
                        {{ invite.expires_at ? (invite.expires_at | date: 'mediumDate') : '—' }}
                      </td>
                      <td>
                        <div class="actions">
                          @if (invite.status === 'pending' || invite.status === 'active') {
                            <button
                              type="button"
                              class="btn-secondary btn-sm"
                              data-testid="edit-agency-permissions"
                              (click)="openPermissions(invite)"
                              [disabled]="busyId() === invite.id"
                            >
                              Permissions
                            </button>
                          }
                          @if (invite.status === 'pending') {
                            <button
                              type="button"
                              class="btn-primary btn-sm"
                              (click)="accept(invite)"
                              [disabled]="busyId() === invite.id"
                            >
                              {{ busyId() === invite.id ? 'Working…' : 'Accept' }}
                            </button>
                            <button
                              type="button"
                              class="btn-secondary btn-sm"
                              (click)="reject(invite)"
                              [disabled]="busyId() === invite.id"
                            >
                              Reject
                            </button>
                          }
                          @if (invite.status === 'pending' || invite.status === 'active') {
                            <button
                              type="button"
                              class="btn-danger btn-sm"
                              (click)="revoke(invite)"
                              [disabled]="busyId() === invite.id"
                            >
                              Revoke
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pagination
              [totalItems]="filteredInvites().length"
              [currentPage]="page()"
              [pageSize]="pageSize()"
              (pageChange)="page.set($event)"
              (pageSizeChange)="pageSize.set($event); page.set(1)"
            />
          }
        </div>

        @if (editingPermInvite(); as target) {
          <section class="card perm-panel" data-testid="agency-permissions-panel">
            <h3>
              Client visibility &amp; permissions for
              <strong>{{ target.agency_brand_name || target.agency_id }}</strong>
            </h3>
            <p class="hint">Choose which modules this agency is allowed to access for your business.</p>
            <div class="perm-grid">
              <label class="perm-check">
                <input type="checkbox" [ngModel]="permContent()" (ngModelChange)="permContent.set($event)" />
                <span>Content &amp; scheduling</span>
              </label>
              <label class="perm-check">
                <input type="checkbox" [ngModel]="permReviews()" (ngModelChange)="permReviews.set($event)" />
                <span>Reviews &amp; replies</span>
              </label>
              <label class="perm-check">
                <input type="checkbox" [ngModel]="permAnalytics()" (ngModelChange)="permAnalytics.set($event)" />
                <span>Analytics &amp; audits</span>
              </label>
              <label class="perm-check">
                <input type="checkbox" [ngModel]="permLeads()" (ngModelChange)="permLeads.set($event)" />
                <span>Leads &amp; CRM</span>
              </label>
              <label class="perm-check">
                <input type="checkbox" [ngModel]="permBilling()" (ngModelChange)="permBilling.set($event)" />
                <span>Billing &amp; usage</span>
              </label>
            </div>
            <div class="perm-actions">
              <button
                type="button"
                class="btn-primary btn-sm"
                data-testid="save-agency-permissions"
                (click)="savePermissions()"
                [disabled]="busyId() === target.id"
              >
                {{ busyId() === target.id ? 'Saving…' : 'Save permissions' }}
              </button>
              <button type="button" class="btn-secondary btn-sm" (click)="editingPermInvite.set(null)">Cancel</button>
            </div>
          </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .invites {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .hint {
        color: var(--color-text-subtle);
        font-size: var(--text-sm);
        margin: 0;
      }
      .owner-only-note {
        color: var(--color-text-subtle);
        font-size: var(--text-sm);
        margin: 0;
      }
      .table-card {
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      table.list-view {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      .agency-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .agency-name {
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .agency-id {
        font-size: 0.7rem;
        color: var(--color-text-muted);
      }
      .meta-cell {
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .actions {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .form-error {
        color: var(--color-danger);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        margin: 0;
        font-size: var(--text-sm);
      }
      .form-success {
        color: var(--color-success);
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        margin: 0;
        font-size: var(--text-sm);
      }
      .perm-chips {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px;
      }
      .perm-chip {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
        color: var(--color-text-subtle);
        border: 1px solid var(--color-border);
      }
      .perm-panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .perm-panel h3 {
        margin: 0;
        font-size: var(--text-md, 1rem);
      }
      .perm-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: var(--space-2);
      }
      .perm-check {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        cursor: pointer;
      }
      .perm-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
    `,
  ],
})
export class AgencyInvitesComponent {
  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly canManage = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly loading = signal(true);
  readonly invites = signal<AgencyClientLink[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly sortColumn = signal<'agency' | 'status' | 'expires_at'>('status');
  readonly sortDirection = signal<SortDirection>('asc');

  readonly sortedInvites = computed(() =>
    sortTableRows(this.invites(), this.sortColumn(), this.sortDirection(), (row, col) => {
      switch (col) {
        case 'agency':
          return row.agency_brand_name || row.agency_id;
        case 'status':
          return row.status;
        case 'expires_at':
        default:
          return row.expires_at ?? '';
      }
    }),
  );

  toggleSort(column: 'agency' | 'status' | 'expires_at'): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'active':
        return 'badge--success';
      case 'pending':
        return 'badge--warning';
      case 'rejected':
      case 'revoked':
        return 'badge--danger';
      default:
        return 'badge--neutral';
    }
  }

  readonly editingPermInvite = signal<AgencyClientLink | null>(null);
  readonly permContent = signal(true);
  readonly permReviews = signal(true);
  readonly permAnalytics = signal(true);
  readonly permLeads = signal(false);
  readonly permBilling = signal(false);

  enabledPermissions(invite: AgencyClientLink): string[] {
    const p = invite.permissions;
    const list: string[] = [];
    if (p?.content ?? true) list.push('Content');
    if (p?.reviews ?? true) list.push('Reviews');
    if (p?.analytics ?? true) list.push('Analytics');
    if (p?.leads) list.push('Leads');
    if (p?.billing) list.push('Billing');
    return list.length > 0 ? list : ['None'];
  }

  openPermissions(invite: AgencyClientLink): void {
    const p = invite.permissions;
    this.editingPermInvite.set(invite);
    this.permContent.set(p?.content ?? true);
    this.permReviews.set(p?.reviews ?? true);
    this.permAnalytics.set(p?.analytics ?? true);
    this.permLeads.set(Boolean(p?.leads));
    this.permBilling.set(Boolean(p?.billing));
  }

  savePermissions(): void {
    const tenantId = this.tenant()?.id;
    const target = this.editingPermInvite();
    if (!tenantId || !target) return;
    this.busyId.set(target.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.agencyService
      .updateClientPermissions(tenantId, target.id, {
        content: this.permContent(),
        reviews: this.permReviews(),
        analytics: this.permAnalytics(),
        leads: this.permLeads(),
        billing: this.permBilling(),
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.editingPermInvite.set(null);
          this.notice.set('Agency permission preferences saved.');
          this.refresh();
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.errorMessage.set(apiErrorMessage(err));
        },
      });
  }

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly agencyService: AgencyService,
  ) {
    this.refresh();
  }

  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly exportColumns: TableExportColumn[] = [
    { key: 'agency_brand_name', label: 'Agency' },
    { key: 'status', label: 'Status' },
    { key: 'expires_at', label: 'Expires' },
  ];

  readonly filteredInvites = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const list = this.sortedInvites();
    if (!q) return list;
    return list.filter(
      (i) =>
        (i.agency_brand_name ?? '').toLowerCase().includes(q) ||
        i.agency_id.toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q),
    );
  });

  readonly pagedInvites = computed(() => paginateItems(this.filteredInvites(), this.page(), this.pageSize()));

  refresh(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || !this.canManage()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.agencyService.listInvitesForClient(tenantId).subscribe({
      next: (invites) => {
        this.loading.set(false);
        this.invites.set(invites);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  accept(invite: AgencyClientLink): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.busyId()) {
      return;
    }
    this.busyId.set(invite.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.agencyService.acceptInvite(tenantId, invite.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set('Invite accepted — the relationship is now active.');
        this.refresh();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  reject(invite: AgencyClientLink): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.busyId()) {
      return;
    }
    this.busyId.set(invite.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.agencyService.rejectInvite(tenantId, invite.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set('Invite rejected.');
        this.refresh();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  revoke(invite: AgencyClientLink): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.busyId()) {
      return;
    }
    this.busyId.set(invite.id);
    this.errorMessage.set(null);
    this.notice.set(null);
    this.agencyService.revokeByClient(tenantId, invite.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set('Relationship revoked.');
        this.refresh();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }
}
