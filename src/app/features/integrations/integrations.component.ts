import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  ExistingLocationLink,
  ExternalLocation,
  LocationLink,
  ProviderConnection,
  TenantLocationOption,
} from '../../core/integrations/integration.models';
import { IntegrationProvider, IntegrationService } from '../../core/integrations/integration.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

/**
 * `/app/:tenantId/integrations` — blueprint §3.1 / §02 M04 & M13.
 * Supports:
 * - Google Business Profile (PKCE live OAuth + mock mode) & Meta OAuth
 * - Proactive broken-connection (`reauth_required`/`expired`/`error`) alert banner
 * - Multi-location picker backed by `GET /tenants/{t}/locations` and
 *   `GET /tenants/{t}/integrations/{id}/external-locations`
 */
@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="integrations">
      <app-page-header
        eyebrow="CONNECTIONS"
        eyebrowLabel="Google &amp; Meta"
        title="Integrations"
        subtitle="Connect Google Business Profile and Meta, monitor connection health, and map multiple locations to external targets."
      />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        @if (!canManage()) {
          <p class="owner-only-note">
            Only the tenant owner or an admin may connect/disconnect integrations (enforced server-side). You can still
            view connection status below.
          </p>
        }

        @if (brokenConnections().length > 0) {
          <div class="reauth-banner" role="alert">
            <div class="reauth-banner__body">
              <strong>Connection attention required</strong>
              <span>
                @for (broken of brokenConnections(); track broken.id; let last = $last) {
                  {{ broken.provider }} ({{ broken.external_account_id }}) is <code>{{ broken.status }}</code>{{ last ? '' : ', ' }}
                }
                — background profile and review sync is paused until reconnected.
              </span>
            </div>
            @if (canManage()) {
              <button
                type="button"
                class="btn-reauth"
                (click)="reconnectFirstBroken()"
                [disabled]="connectingProvider() !== null"
              >
                Reconnect now
              </button>
            }
          </div>
        }

        <div class="provider-grid">
          <section class="connect">
            <div class="connect__head">
              <h2>Google Business Profile</h2>
              <span class="pill-note">PKCE OAuth 2.0</span>
            </div>
            <p class="connect__desc">Sync profile details, customer reviews, local posts, and readiness audits.</p>
            @if (canManage()) {
              <button type="button" class="btn-primary" (click)="connect('google')" [disabled]="connectingProvider() !== null">
                {{ connectingProvider() === 'google' ? 'Connecting…' : 'Connect Google' }}
              </button>
            }
            @if (connectError() && connectErrorProvider() === 'google') {
              <p class="form-error" role="alert">{{ connectError() }}</p>
            }
            @if (lastConnectedLocationId() && lastConnectedProvider() === 'google') {
              <p class="success" role="status">
                Connected. Auto-linked location: <code>{{ lastConnectedLocationId() }}</code> —
                <button type="button" class="link-btn" (click)="openAudit(lastConnectedLocationId()!)">Open readiness audit</button>
                ·
                <button type="button" class="link-btn" (click)="openReviews(lastConnectedLocationId()!)">Open reviews</button>
              </p>
            }
          </section>

          <section class="connect">
            <div class="connect__head">
              <h2>Meta (Facebook Page &amp; Instagram)</h2>
              <span class="pill-note">Pages &amp; IG</span>
            </div>
            <p class="connect__desc">Publish scheduled posts and track page insights across linked locations.</p>
            @if (canManage()) {
              <button type="button" class="btn-primary" (click)="connect('meta')" [disabled]="connectingProvider() !== null">
                {{ connectingProvider() === 'meta' ? 'Connecting…' : 'Connect Meta' }}
              </button>
            }
            @if (connectError() && connectErrorProvider() === 'meta') {
              <p class="form-error" role="alert">{{ connectError() }}</p>
            }
            @if (lastConnectedLocationId() && lastConnectedProvider() === 'meta') {
              <p class="success" role="status">
                Connected. Auto-linked location: <code>{{ lastConnectedLocationId() }}</code> — use the multi-location
                picker below to map additional Pages or Instagram accounts.
              </p>
            }
          </section>
        </div>

        <section class="list">
          <h2>Connected accounts</h2>
          <ui-table-toolbar
            placeholder="Search provider, account, status…"
            [searchTerm]="connSearch()"
            (searchChange)="connSearch.set($event); connPage.set(1)"
            [data]="filteredConnections()"
            [columns]="connExportColumns"
            filename="connected_accounts"
            [loading]="loading()"
            (refresh)="refreshList()"
          />
          @if (loading()) {
            <p>Loading…</p>
          } @else if (connections().length === 0) {
            <p class="placeholder">No Google or Meta account connected yet.</p>
          } @else if (filteredConnections().length === 0) {
            <p class="placeholder">No connected accounts match "{{ connSearch() }}".</p>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><ui-sort-header label="Provider" [active]="connSortCol() === 'provider'" [direction]="connSortDir()" (sort)="toggleConnSort('provider')" /></th>
                    <th><ui-sort-header label="Account" [active]="connSortCol() === 'account'" [direction]="connSortDir()" (sort)="toggleConnSort('account')" /></th>
                    <th><ui-sort-header label="Status" [active]="connSortCol() === 'status'" [direction]="connSortDir()" (sort)="toggleConnSort('status')" /></th>
                    <th>Scopes</th>
                    <th><ui-sort-header label="Last checked" [active]="connSortCol() === 'last_checked_at'" [direction]="connSortDir()" (sort)="toggleConnSort('last_checked_at')" /></th>
                    <th><ui-sort-header label="Expires" [active]="connSortCol() === 'expires_at'" [direction]="connSortDir()" (sort)="toggleConnSort('expires_at')" /></th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (conn of pagedConnections(); track conn.id) {
                    <tr>
                      <td class="cap">{{ conn.provider }}</td>
                      <td>
                        <code>{{ conn.external_account_id }}</code>
                        @if (conn.mock_provider) {
                          <span
                            class="badge badge--mock"
                            [title]="'Simulated via the mock ' + conn.provider + ' provider — never a real ' + conn.provider + ' API call.'"
                          >
                            MOCK_PROVIDER
                          </span>
                        }
                      </td>
                      <td><span class="badge" [class]="connectionBadgeClass(conn.status)">{{ conn.status }}</span></td>
                      <td class="scopes-cell">{{ conn.scopes.join(', ') || '—' }}</td>
                      <td>{{ conn.last_checked_at ? (conn.last_checked_at | date: 'short') : 'Never' }}</td>
                      <td>{{ conn.expires_at ? (conn.expires_at | date: 'short') : '—' }}</td>
                      <td class="row-actions">
                        @if (canManage() && conn.status === 'connected') {
                          <button type="button" class="btn-ghost" (click)="disconnect(conn)" [disabled]="disconnectingId() === conn.id">
                            {{ disconnectingId() === conn.id ? 'Disconnecting…' : 'Disconnect' }}
                          </button>
                        } @else if (canManage() && isBrokenStatus(conn.status)) {
                          <button
                            type="button"
                            class="btn-reauth-sm"
                            (click)="connect(asProvider(conn.provider))"
                            [disabled]="connectingProvider() !== null"
                          >
                            Reconnect
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pagination
              [totalItems]="filteredConnections().length"
              [currentPage]="connPage()"
              [pageSize]="connPageSize()"
              (pageChange)="connPage.set($event)"
              (pageSizeChange)="connPageSize.set($event); connPage.set(1)"
            />
          }
          @if (listError()) {
            <p class="form-error" role="alert">{{ listError() }}</p>
          }
        </section>

        @if (canManage()) {
          <section class="location-link card">
            <div class="section-head">
              <div>
                <h2>Multi-location picker</h2>
                <p class="section-sub">
                  Map any business location to an eligible Google Business Profile location or Meta Page.
                </p>
              </div>
              @if (connections().length > 0) {
                <button
                  type="button"
                  class="btn-secondary"
                  (click)="loadPickerOptions()"
                  [disabled]="loadingPicker() || !locationLinkForm.controls.connectionId.value"
                >
                  {{ loadingPicker() ? 'Loading targets…' : (pickerLoaded() ? 'Refresh targets' : 'Load locations &amp; targets') }}
                </button>
              }
            </div>

            @if (connections().length === 0) {
              <p class="placeholder">Connect Google or Meta above first.</p>
            } @else {
              @if (pickerError()) {
                <p class="form-error" role="alert">{{ pickerError() }}</p>
              }

              @if (existingLinks().length > 0) {
                <div class="existing-links">
                  <strong>Active mappings for this connection:</strong>
                  <ul>
                    @for (lnk of existingLinks(); track lnk.id) {
                      <li>
                        <span>{{ lnk.location_name || lnk.location_id }}</span>
                        <span class="arrow">→</span>
                        <code>{{ lnk.external_location_id }}</code>
                      </li>
                    }
                  </ul>
                </div>
              }

              <form [formGroup]="locationLinkForm" (ngSubmit)="submitLocationLink()" novalidate class="picker-form">
                <label>
                  Connection
                  <select formControlName="connectionId" (change)="onConnectionChange()">
                    @for (conn of connections(); track conn.id) {
                      <option [value]="conn.id">{{ conn.provider }} — {{ conn.external_account_id }} ({{ conn.status }})</option>
                    }
                  </select>
                </label>

                <label>
                  Business location
                  @if (tenantLocations().length > 0) {
                    <select formControlName="locationId">
                      <option value="">Select a business location…</option>
                      @for (loc of tenantLocations(); track loc.id) {
                        <option [value]="loc.id">{{ loc.name }}{{ loc.city ? ' (' + loc.city + ')' : '' }}</option>
                      }
                    </select>
                  } @else {
                    <input type="text" formControlName="locationId" placeholder="Click 'Load locations & targets' or enter location ID" />
                  }
                </label>

                <label>
                  External Google / Meta target
                  @if (externalLocations().length > 0) {
                    <select formControlName="externalLocationId">
                      <option value="">Select an external location / Page…</option>
                      @for (ext of externalLocations(); track ext.external_location_id) {
                        <option [value]="ext.external_location_id">
                          {{ ext.display_name }} — {{ ext.external_location_id }}{{ ext.linked_location_name ? ' [linked: ' + ext.linked_location_name + ']' : '' }}
                        </option>
                      }
                    </select>
                  } @else {
                    <input type="text" formControlName="externalLocationId" placeholder="Click 'Load locations & targets' or enter external ID" />
                  }
                </label>

                <div class="actions">
                  <button type="submit" class="btn-primary" [disabled]="locationLinkForm.invalid || linkingLocation()">
                    {{ linkingLocation() ? 'Linking…' : 'Save link' }}
                  </button>
                </div>
                @if (locationLinkError()) {
                  <p class="form-error" role="alert">{{ locationLinkError() }}</p>
                }
                @if (lastLocationLink()) {
                  <p class="success" role="status">
                    Location <code>{{ lastLocationLink()!.location_id }}</code> is now linked to external id
                    <code>{{ lastLocationLink()!.external_location_id }}</code>
                    ({{ lastLocationLink()!.created ? 'created' : 'reassigned' }}).
                  </p>
                }
              </form>
            }
          </section>
        }

        <section class="open-location card">
          <h2>Open a location</h2>
          <form [formGroup]="locationForm" (ngSubmit)="openFromForm()" novalidate>
            <label>
              Location
              @if (tenantLocations().length > 0) {
                <select formControlName="locationId">
                  <option value="">Select a location…</option>
                  @for (loc of tenantLocations(); track loc.id) {
                    <option [value]="loc.id">{{ loc.name }}{{ loc.city ? ' (' + loc.city + ')' : '' }}</option>
                  }
                </select>
              } @else {
                <input type="text" formControlName="locationId" placeholder="Enter location ID" />
              }
            </label>
            <div class="actions">
              <button type="submit" class="btn-secondary" [disabled]="locationForm.invalid">Open readiness audit</button>
              <button type="button" class="btn-secondary" [disabled]="locationForm.invalid" (click)="openReviewsFromForm()">Open reviews</button>
            </div>
          </form>
        </section>
      }
    </section>
  `,
  styles: [
    `
      .integrations {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .provider-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--space-4);
      }
      .connect,
      .list,
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4);
      }
      .connect__head,
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        margin-bottom: var(--space-2);
      }
      .connect h2,
      .list h2,
      .card h2 {
        margin: 0;
        font-size: var(--text-md);
      }
      .connect__desc,
      .section-sub {
        margin: 0 0 var(--space-3);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }
      .pill-note {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--color-neutral-bg);
        color: var(--color-text-muted);
      }
      .reauth-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        font-size: var(--text-sm);
      }
      .reauth-banner__body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .btn-reauth,
      .btn-reauth-sm {
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: var(--radius-sm);
        padding: 6px 12px;
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
      }
      .btn-reauth-sm {
        padding: 4px 10px;
        font-size: 12px;
      }
      .btn-primary {
        background: var(--color-primary);
        color: #fff;
        border: none;
        border-radius: var(--radius-sm);
        padding: 7px 14px;
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
      }
      .btn-secondary {
        background: var(--color-surface);
        color: var(--color-text);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 6px 12px;
        font-size: var(--text-sm);
        font-weight: 500;
        cursor: pointer;
      }
      .btn-ghost {
        background: transparent;
        color: var(--color-danger);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .table-wrap {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
        margin-top: var(--space-2);
      }
      th,
      td {
        text-align: center;
        padding: var(--space-2);
        border-bottom: 1px solid var(--color-border);
      }
      .cap {
        text-transform: capitalize;
        font-weight: 600;
      }
      .scopes-cell {
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .existing-links {
        background: var(--color-neutral-bg);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        margin-bottom: var(--space-3);
        font-size: var(--text-sm);
      }
      .existing-links ul {
        margin: var(--space-2) 0 0;
        padding-left: var(--space-4);
      }
      .existing-links .arrow {
        margin: 0 6px;
        color: var(--color-text-muted);
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--color-primary);
        text-decoration: underline;
        cursor: pointer;
        font: inherit;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        max-width: 520px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-sm);
        font-weight: 500;
      }
      input,
      select {
        padding: 7px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font: inherit;
        background: var(--color-surface);
      }
      .actions {
        display: flex;
        gap: var(--space-3);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: var(--space-2) 0 0;
        font-size: var(--text-sm);
      }
      .success {
        color: var(--color-success);
        margin: var(--space-2) 0 0;
        font-size: var(--text-sm);
      }
      .placeholder {
        color: var(--color-text-subtle);
        font-size: var(--text-sm);
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        background: var(--color-neutral-bg);
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        margin: 0;
      }
    `,
  ],
})
export class IntegrationsComponent {
  private readonly fb = new FormBuilder();

  /** Maps a provider connection status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  connectionBadgeClass(status: string): string {
    switch (status) {
      case 'connected':
        return 'badge--success';
      case 'reauth_required':
      case 'error':
      case 'revoked':
        return 'badge--danger';
      case 'expired':
        return 'badge--warning';
      default:
        return 'badge--neutral';
    }
  }

  isBrokenStatus(status: string): boolean {
    return status === 'reauth_required' || status === 'expired' || status === 'error' || status === 'revoked';
  }

  asProvider(provider: string): IntegrationProvider {
    return provider === 'meta' ? 'meta' : 'google';
  }

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly canManage = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly connections = signal<ProviderConnection[]>([]);
  readonly connSearch = signal('');
  readonly connPage = signal(1);
  readonly connPageSize = signal(10);
  readonly connSortCol = signal('');
  readonly connSortDir = signal<SortDirection>('asc');
  readonly connExportColumns: TableExportColumn[] = [
    { key: 'provider', label: 'Provider' },
    { key: 'external_account_id', label: 'Account' },
    { key: 'status', label: 'Status' },
    { key: 'last_checked_at', label: 'Last checked' },
    { key: 'expires_at', label: 'Expires' },
  ];

  toggleConnSort(col: string): void {
    if (this.connSortCol() === col) {
      this.connSortDir.set(this.connSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.connSortCol.set(col);
      this.connSortDir.set('asc');
    }
  }

  readonly filteredConnections = computed(() => {
    const q = this.connSearch().trim().toLowerCase();
    const sorted = sortTableRows(this.connections(), this.connSortCol(), this.connSortDir(), (c, col) => {
      switch (col) {
        case 'provider':
          return c.provider;
        case 'account':
          return c.external_account_id;
        case 'status':
          return c.status;
        case 'last_checked_at':
          return c.last_checked_at ?? '';
        case 'expires_at':
          return c.expires_at ?? '';
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.provider.toLowerCase().includes(q) ||
        c.external_account_id.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  });

  readonly pagedConnections = computed(() => paginateItems(this.filteredConnections(), this.connPage(), this.connPageSize()));
  readonly brokenConnections = computed(() => this.connections().filter((c) => this.isBrokenStatus(c.status)));
  readonly loading = signal(true);
  readonly listError = signal<string | null>(null);

  readonly connectingProvider = signal<IntegrationProvider | null>(null);
  readonly connectError = signal<string | null>(null);
  readonly connectErrorProvider = signal<IntegrationProvider | null>(null);
  readonly lastConnectedLocationId = signal<string | null>(null);
  readonly lastConnectedProvider = signal<IntegrationProvider | null>(null);

  readonly disconnectingId = signal<string | null>(null);

  readonly tenantLocations = signal<TenantLocationOption[]>([]);
  readonly externalLocations = signal<ExternalLocation[]>([]);
  readonly existingLinks = signal<ExistingLocationLink[]>([]);
  readonly loadingPicker = signal(false);
  readonly pickerLoaded = signal(false);
  readonly pickerError = signal<string | null>(null);

  readonly locationForm = this.fb.nonNullable.group({
    locationId: ['', [Validators.required]],
  });

  readonly locationLinkForm = this.fb.nonNullable.group({
    connectionId: ['', [Validators.required]],
    locationId: ['', [Validators.required]],
    externalLocationId: ['', [Validators.required]],
  });
  readonly linkingLocation = signal(false);
  readonly locationLinkError = signal<string | null>(null);
  readonly lastLocationLink = signal<LocationLink | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly integrationService: IntegrationService,
    private readonly router: Router,
  ) {
    this.refreshList();
  }

  refreshList(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.integrationService.list(tenantId).subscribe({
      next: (connections) => {
        this.loading.set(false);
        this.connections.set(connections);
        if (connections.length > 0 && !this.locationLinkForm.controls.connectionId.value) {
          this.locationLinkForm.patchValue({ connectionId: connections[0].id });
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }

  loadPickerOptions(): void {
    const tenantId = this.tenant()?.id;
    const connectionId = this.locationLinkForm.controls.connectionId.value;
    if (!tenantId || !connectionId || this.loadingPicker()) {
      return;
    }
    this.loadingPicker.set(true);
    this.pickerError.set(null);

    forkJoin({
      locations: this.integrationService.listTenantLocations(tenantId),
      external: this.integrationService.listExternalLocations(tenantId, connectionId),
    }).subscribe({
      next: ({ locations, external }) => {
        this.loadingPicker.set(false);
        this.pickerLoaded.set(true);
        this.tenantLocations.set(locations);
        this.externalLocations.set(external.external_locations);
        this.existingLinks.set(external.existing_links);
        if (!this.locationLinkForm.controls.locationId.value && locations.length > 0) {
          this.locationLinkForm.patchValue({ locationId: locations[0].id });
        }
        if (!this.locationLinkForm.controls.externalLocationId.value && external.external_locations.length > 0) {
          this.locationLinkForm.patchValue({ externalLocationId: external.external_locations[0].external_location_id });
        }
      },
      error: (err: unknown) => {
        this.loadingPicker.set(false);
        this.pickerError.set(apiErrorMessage(err));
      },
    });
  }

  onConnectionChange(): void {
    if (this.pickerLoaded()) {
      this.loadPickerOptions();
    }
  }

  reconnectFirstBroken(): void {
    const first = this.brokenConnections()[0];
    if (!first) {
      return;
    }
    this.connect(this.asProvider(first.provider));
  }

  connect(provider: IntegrationProvider): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.connectingProvider() !== null) {
      return;
    }
    this.connectingProvider.set(provider);
    this.connectError.set(null);
    this.connectErrorProvider.set(null);
    this.lastConnectedLocationId.set(null);
    this.lastConnectedProvider.set(null);

    this.integrationService.oauthStart(tenantId, provider).subscribe({
      next: (started) => {
        if (!started.mock_provider && this.integrationService.isExternalAuthorizeUrl(started.authorize_url)) {
          this.connectingProvider.set(null);
          window.location.assign(started.authorize_url);
          return;
        }
        this.integrationService.completeOauthCallback(started.authorize_url).subscribe({
          next: (connection) => {
            this.connectingProvider.set(null);
            this.lastConnectedLocationId.set(connection.linked_location_id);
            this.lastConnectedProvider.set(provider);
            if (connection.linked_location_id) {
              this.locationLinkForm.patchValue({ locationId: connection.linked_location_id });
            }
            this.refreshList();
          },
          error: (err: unknown) => {
            this.connectingProvider.set(null);
            this.connectErrorProvider.set(provider);
            this.connectError.set(apiErrorMessage(err));
          },
        });
      },
      error: (err: unknown) => {
        this.connectingProvider.set(null);
        this.connectErrorProvider.set(provider);
        this.connectError.set(apiErrorMessage(err));
      },
    });
  }

  submitLocationLink(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.locationLinkForm.invalid || this.linkingLocation()) {
      return;
    }
    this.linkingLocation.set(true);
    this.locationLinkError.set(null);
    const raw = this.locationLinkForm.getRawValue();
    this.integrationService
      .createLocationLink(tenantId, raw.connectionId, {
        location_id: raw.locationId,
        external_location_id: raw.externalLocationId,
      })
      .subscribe({
        next: (link) => {
          this.linkingLocation.set(false);
          this.lastLocationLink.set(link);
          if (this.pickerLoaded()) {
            this.loadPickerOptions();
          }
        },
        error: (err: unknown) => {
          this.linkingLocation.set(false);
          this.locationLinkError.set(apiErrorMessage(err));
        },
      });
  }

  disconnect(conn: ProviderConnection): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.disconnectingId()) {
      return;
    }
    this.disconnectingId.set(conn.id);
    this.listError.set(null);
    this.integrationService.disconnect(tenantId, conn.id).subscribe({
      next: () => {
        this.disconnectingId.set(null);
        this.refreshList();
      },
      error: (err: unknown) => {
        this.disconnectingId.set(null);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }

  openAudit(locationId: string): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    void this.router.navigate(['/app', tenantId, 'locations', locationId, 'audit']);
  }

  openReviews(locationId: string): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    void this.router.navigate(['/app', tenantId, 'locations', locationId, 'reviews']);
  }

  openFromForm(): void {
    if (this.locationForm.invalid) {
      return;
    }
    this.openAudit(this.locationForm.getRawValue().locationId);
  }

  openReviewsFromForm(): void {
    if (this.locationForm.invalid) {
      return;
    }
    this.openReviews(this.locationForm.getRawValue().locationId);
  }
}
