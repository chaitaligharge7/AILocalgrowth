import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgencyClientLink } from '../../../core/agency/agency.models';
import { AgencyService } from '../../../core/agency/agency.service';
import { CurrentAgencyService } from '../../../core/agency/current-agency.service';
import { apiErrorCode, apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../../shared/icons/icon.component';
import { SortHeaderComponent } from '../../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../../shared/table/table-export.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';

/**
 * `/agency/clients` — Compact 2-column Agency Client Directory & Invite panel.
 */
@Component({
  selector: 'app-agency-clients',
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
    <section class="clients">
      <app-page-header
        eyebrow="Agency"
        eyebrowLabel="Directory"
        title="Clients"
        subtitle="Manage client business relationships, pooled billing opt-ins, and staff delegations."
      />

      @if (notAnAgency()) {
        <p class="gap-note">
          You don't have an active agency account yet. Go to <a routerLink="/agency/overview">Overview</a> to enable
          agency mode first.
        </p>
      } @else {
        <div class="clients-grid">
          <section class="list-card card">
            <div class="list-toolbar">
              <div>
                <h2>Connected clients</h2>
                <p class="sub">{{ clients().length }} total client relationships</p>
              </div>
              <div class="toolbar-actions">
                <input
                  type="search"
                  class="list-search"
                  placeholder="Search by tenant ID or status…"
                  [value]="searchTerm()"
                  (input)="onSearchInput($event)"
                />
                <ui-table-export
                  [data]="sortedClients()"
                  [columns]="exportColumns"
                  filename="agency_clients"
                  [loading]="loading()"
                  (refresh)="refresh()"
                />
              </div>
            </div>

            @if (loading()) {
              <app-skeleton-loader [rows]="3" />
            } @else if (clients().length === 0) {
              <app-empty-state icon="leads" title="No client relationships yet" message="Send an invite on the right to connect a client workspace." />
            } @else if (filteredClients().length === 0) {
              <p class="empty">No relationships match "{{ searchTerm() }}".</p>
            } @else {
              <table>
                <thead>
                  <tr>
                    <th>
                      <ui-sort-header
                        label="Client tenant ID"
                        [active]="sortColumn() === 'client_tenant_id'"
                        [direction]="sortDescending() ? 'desc' : 'asc'"
                        (sort)="toggleSort('client_tenant_id')"
                      />
                    </th>
                    <th>Billing</th>
                    <th>
                      <ui-sort-header
                        label="Status"
                        [active]="sortColumn() === 'status'"
                        [direction]="sortDescending() ? 'desc' : 'asc'"
                        (sort)="toggleSort('status')"
                      />
                    </th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (link of pagedClients(); track link.id) {
                    <tr>
                      <td>
                        <div class="tenant-cell">
                          <span class="avatar-initial" [class]="avatarTintClass(link.client_tenant_id)">
                            {{ initialFor(link.client_tenant_id) }}
                          </span>
                          <code>{{ link.client_tenant_id }}</code>
                        </div>
                      </td>
                      <td class="meta-cell">
                        {{ link.permissions?.pooled_billing ? 'Pooled opt-in' : 'Standard' }}
                      </td>
                      <td>
                        <span class="badge badge--dot" [class]="statusBadgeClass(link.status)">{{ link.status }}</span>
                      </td>
                      <td class="meta-cell">{{ link.expires_at || '—' }}</td>
                      <td>
                        <div class="actions">
                          @if (link.status === 'active') {
                            <a [routerLink]="['/agency/clients', link.id, 'overview']" class="btn-secondary btn-sm" data-testid="client-overview-link">Overview</a>
                            <a [routerLink]="['/agency/clients', link.id, 'staff']" class="btn-secondary btn-sm">Staff</a>
                          }
                          @if (link.status === 'pending' || link.status === 'active') {
                            <button type="button" class="btn-danger btn-sm action-icon-btn" (click)="revoke(link)" [disabled]="revokingId() === link.id" title="Revoke client link" aria-label="Revoke client link">
                              <ui-icon name="trash" [size]="13" />
                              <span class="sr-only">{{ revokingId() === link.id ? 'Revoking…' : 'Revoke' }}</span>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <app-pagination
                [totalItems]="filteredClients().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event); page.set(1)"
              />
            }
            @if (listError()) {
              <p class="form-error" role="alert">{{ listError() }}</p>
            }
          </section>

          <section class="invite card">
            <h2>Invite a client</h2>
            <p class="hint">
              Inviting creates a <strong>pending</strong> relationship. Client data stays private until their owner/admin
              explicitly approves under <em>Agency invites</em>.
            </p>
            <form [formGroup]="inviteForm" (ngSubmit)="submitInvite()" novalidate>
              <label>
                Client tenant ID
                <input type="text" formControlName="clientTenantId" placeholder="Paste client tenant UUID" />
              </label>
              @if (fieldError('client_tenant_id')) {
                <p class="field-error">{{ fieldError('client_tenant_id') }}</p>
              }

              <label class="checkbox">
                <input type="checkbox" formControlName="pooledBilling" />
                <span>Request pooled billing opt-in (reporting only — does not redirect live billing)</span>
              </label>

              @if (inviteError() && !hasFieldErrors()) {
                <p class="form-error" role="alert">{{ inviteError() }}</p>
              }
              @if (inviteNotice()) {
                <p class="success" role="status">{{ inviteNotice() }}</p>
              }

              <button type="submit" class="btn-primary" [disabled]="inviteForm.invalid || inviting()">
                {{ inviting() ? 'Sending invite…' : 'Send invite' }}
              </button>
            </form>
          </section>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .clients {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .clients-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
        gap: 16px;
        align-items: start;
      }
      .list-card {
        padding: 18px 20px;
      }
      .invite.card {
        padding: 18px 20px;
      }
      .pane-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      h2 {
        margin: 0;
        font-size: var(--text-md, 1rem);
        font-weight: var(--font-bold);
      }
      .sub {
        margin: 2px 0 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .client-badge-count {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .gap-note {
        margin: 0;
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        font-size: var(--text-xs);
      }
      .hint {
        margin: 4px 0 12px;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        line-height: 1.45;
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
      label.checkbox {
        flex-direction: row;
        align-items: flex-start;
        gap: 8px;
        font-weight: var(--font-normal);
        color: var(--color-text-muted);
      }
      .list-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .toolbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .list-search {
        flex: 1 1 180px;
        max-width: 240px;
        height: 34px;
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      .tenant-cell {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .meta-cell {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .actions {
        display: inline-flex;
        gap: 6px;
        align-items: center;
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
      .empty {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        padding: 12px 0;
      }
      @media (max-width: 960px) {
        .clients-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AgencyClientsComponent {
  private readonly fb = new FormBuilder();

  readonly loading = signal(true);
  readonly notAnAgency = signal(false);
  readonly clients = signal<AgencyClientLink[]>([]);
  readonly listError = signal<string | null>(null);
  readonly revokingId = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly exportColumns: TableExportColumn[] = [
    { key: 'client_tenant_id', label: 'Client Tenant ID' },
    { key: 'status', label: 'Status' },
    { key: 'pooled_billing', label: 'Billing' },
    { key: 'expires_at', label: 'Expires' },
  ];

  readonly filteredClients = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) {
      return this.clients();
    }
    return this.clients().filter((link) => [link.client_tenant_id, link.status].some((field) => field.toLowerCase().includes(q)));
  });

  readonly sortColumn = signal<'client_tenant_id' | 'status'>('status');
  readonly sortDescending = signal(false);

  readonly sortedClients = computed(() => {
    const column = this.sortColumn();
    const descending = this.sortDescending();
    const rows = [...this.filteredClients()];
    rows.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0));
    return descending ? rows.reverse() : rows;
  });

  readonly pagedClients = computed(() => paginateItems(this.sortedClients(), this.page(), this.pageSize()));

  toggleSort(column: 'client_tenant_id' | 'status'): void {
    if (this.sortColumn() === column) {
      this.sortDescending.set(!this.sortDescending());
    } else {
      this.sortColumn.set(column);
      this.sortDescending.set(false);
    }
  }

  sortAriaSort(column: 'client_tenant_id' | 'status'): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDescending() ? 'descending' : 'ascending';
  }

  sortArrow(column: 'client_tenant_id' | 'status'): string {
    if (this.sortColumn() !== column) {
      return '↕';
    }
    return this.sortDescending() ? '↓' : '↑';
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  initialFor(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed[0].toUpperCase() : '•';
  }

  avatarTintClass(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const index = hash % 5;
    return index === 0 ? '' : `avatar-initial--${index}`;
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'active':
        return 'badge--success';
      case 'pending':
        return 'badge--warning';
      case 'rejected':
      case 'revoked':
        return 'badge--neutral';
      default:
        return 'badge--info';
    }
  }

  readonly inviteForm = this.fb.nonNullable.group({
    clientTenantId: ['', [Validators.required]],
    pooledBilling: [false],
  });
  readonly inviting = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly inviteNotice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    private readonly agencyService: AgencyService,
    private readonly currentAgency: CurrentAgencyService,
  ) {
    this.refresh();
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  refresh(): void {
    this.loading.set(true);
    this.listError.set(null);
    this.agencyService.listClients().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.notAnAgency.set(false);
        this.clients.set(res.clients);
        this.currentAgency.set(res.agency);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (apiErrorCode(err) === 'NOT_FOUND') {
          this.notAnAgency.set(true);
        } else {
          this.listError.set(apiErrorMessage(err));
        }
      },
    });
  }

  submitInvite(): void {
    if (this.inviteForm.invalid || this.inviting()) {
      return;
    }
    this.inviting.set(true);
    this.inviteError.set(null);
    this.fieldErrors.set(null);
    this.inviteNotice.set(null);

    const { clientTenantId, pooledBilling } = this.inviteForm.getRawValue();
    this.agencyService
      .inviteClient({ client_tenant_id: clientTenantId, permissions: { pooled_billing: pooledBilling } })
      .subscribe({
        next: (link) => {
          this.inviting.set(false);
          this.inviteNotice.set(`Invite sent to tenant ${link.client_tenant_id} (status: pending).`);
          this.inviteForm.patchValue({ clientTenantId: '', pooledBilling: false });
          this.refresh();
        },
        error: (err: unknown) => {
          this.inviting.set(false);
          this.inviteError.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  revoke(link: AgencyClientLink): void {
    if (this.revokingId()) {
      return;
    }
    this.revokingId.set(link.id);
    this.listError.set(null);
    this.agencyService.revokeByAgency(link.id).subscribe({
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
