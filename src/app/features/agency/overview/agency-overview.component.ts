import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgencyAccount, AgencyClientLink } from '../../../core/agency/agency.models';
import { AgencyService } from '../../../core/agency/agency.service';
import { CurrentAgencyService } from '../../../core/agency/current-agency.service';
import { apiErrorCode, apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { Tenant } from '../../../core/tenancy/tenant.models';
import { TenantService } from '../../../core/tenancy/tenant.service';
import { InsightRow, InsightsCardComponent } from '../../../shared/dashboard-pattern/insights-card.component';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { IconComponent } from '../../../shared/icons/icon.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

/**
 * `/agency/overview` — Executive Agency Command Center for Agency Owners & Staff.
 */
@Component({
  selector: 'app-agency-overview',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    InsightsCardComponent,
    IconComponent,
    EmptyStateComponent,
    SkeletonLoaderComponent,
  ],
  template: `
    <section class="overview">
      <div class="topbar-row">
        <app-page-header
          eyebrow="Agency"
          eyebrowLabel="Command Center"
          title="Agency overview"
          [showBack]="false"
          subtitle="Oversee client portfolios, staff delegations, cross-client analytics, and pooled quotas."
        />
        @if (agency()) {
          <div class="top-actions">
            <a routerLink="/agency/analytics" class="btn-secondary btn-sm">
              <ui-icon name="analytics" [size]="13" />
              <span>Analytics</span>
            </a>
            <a routerLink="/agency/team" class="btn-secondary btn-sm">
              <ui-icon name="team" [size]="13" />
              <span>Team</span>
            </a>
            <a routerLink="/agency/clients" class="btn-primary btn-sm">
              <ui-icon name="plus" [size]="13" />
              <span>Invite client</span>
            </a>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="card">
          <app-skeleton-loader [rows]="4" />
        </div>
      } @else if (agency()) {
        <div class="stats">
          <app-stat-card
            label="Agency status"
            [value]="agency()!.status"
            [hint]="'Owner tenant: ' + shortId(agency()!.owner_tenant_id)"
            icon="security"
            tone="mint"
          />
          <app-stat-card
            label="Active clients"
            [value]="activeCount()"
            [hint]="clients().length + ' total connected'"
            icon="clients"
            tone="info"
          />
          <app-stat-card
            label="Pending invites"
            [value]="pendingCount()"
            hint="Awaiting client approval"
            icon="bell"
            tone="amber"
          />
          <app-stat-card
            label="Agency workspace"
            [value]="agency()!.brand_name"
            hint="Brand profile"
            icon="palette"
            tone="peach"
          />
        </div>

        <div class="bento-row">
          <section class="card portfolio-card">
            <header class="card-head">
              <div>
                <h2>Client portfolio</h2>
                <p class="sub">Active and pending client relationships</p>
              </div>
              <a routerLink="/agency/clients" class="btn-secondary btn-sm">View all clients →</a>
            </header>

            @if (clients().length === 0) {
              <app-empty-state
                icon="clients"
                title="No client businesses linked yet"
                message="Invite your first client tenant from the Clients directory to start managing their growth."
              />
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client tenant</th>
                      <th>Billing mode</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of clients().slice(0, 6); track c.id) {
                      <tr>
                        <td>
                          <div class="client-cell">
                            <span class="avatar-initial">{{ initialFor(c.client_tenant_id) }}</span>
                            <code>{{ shortId(c.client_tenant_id) }}</code>
                          </div>
                        </td>
                        <td class="muted-cell">
                          <span class="badge" [class]="c.permissions?.pooled_billing ? 'badge--info' : 'badge--neutral'">
                            {{ c.permissions?.pooled_billing ? 'Pooled opt-in' : 'Client direct' }}
                          </span>
                        </td>
                        <td>
                          <span
                            class="badge badge--dot"
                            [class.badge--success]="c.status === 'active'"
                            [class.badge--warning]="c.status === 'pending'"
                            [class.badge--neutral]="c.status !== 'active' && c.status !== 'pending'"
                          >
                            {{ c.status }}
                          </span>
                        </td>
                        <td>
                          <div class="row-actions">
                            @if (c.status === 'active') {
                              <a [routerLink]="['/agency/clients', c.id, 'overview']" class="btn-secondary btn-sm">Overview</a>
                              <a [routerLink]="['/agency/clients', c.id, 'staff']" class="btn-secondary btn-sm">Staff</a>
                            } @else {
                              <a routerLink="/agency/clients" class="btn-secondary btn-sm">Manage</a>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <app-insights-card title="Quick navigation" [rows]="workspaceRows" />
        </div>
      } @else {
        <div class="card enable-card">
          <p class="gap-note">
            You don't have an active agency account yet. Pick one of your own businesses below (you must be its owner
            or admin) and enable agency mode on it. This is a one-way, one-time action per tenant — the backend returns
            <code>409 ALREADY_AGENCY</code> if you try again on the same tenant.
          </p>

          @if (loadingTenants()) {
            <app-skeleton-loader [rows]="2" />
          } @else if (tenants().length === 0) {
            <p class="placeholder">You have no businesses to enable agency mode on yet.</p>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <label>
                Business
                <select formControlName="tenantId">
                  @for (t of tenants(); track t.id) {
                    <option [value]="t.id">{{ t.display_name }} ({{ t.caller_role }})</option>
                  }
                </select>
              </label>
              @if (fieldError('tenantId')) {
                <p class="field-error">{{ fieldError('tenantId') }}</p>
              }

              <label>
                Agency brand name (optional)
                <input type="text" formControlName="brandName" placeholder="Defaults to the business's display name" />
              </label>
              @if (fieldError('brand_name')) {
                <p class="field-error">{{ fieldError('brand_name') }}</p>
              }

              @if (errorMessage() && !hasFieldErrors()) {
                <p class="form-error" role="alert">{{ errorMessage() }}</p>
              }

              <div>
                <button type="submit" class="btn-primary" [disabled]="form.invalid || enabling()">
                  {{ enabling() ? 'Enabling…' : 'Enable agency mode' }}
                </button>
              </div>
            </form>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .overview {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .topbar-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .topbar-row ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .top-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .bento-row {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(300px, 1fr);
        gap: 12px;
        align-items: stretch;
      }
      .portfolio-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .card-head h2 {
        margin: 0;
        font-size: 0.94rem;
        font-weight: var(--font-bold);
      }
      .sub {
        margin: 2px 0 0;
        font-size: 0.72rem;
        color: var(--color-text-muted);
      }
      .client-cell {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .muted-cell {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .row-actions {
        display: inline-flex;
        gap: 8px;
      }
      .action-link {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-decoration: none;
      }
      .action-link:hover {
        text-decoration: underline;
      }
      .enable-card {
        max-width: 680px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .gap-note {
        margin: 0;
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        font-size: var(--text-xs);
        line-height: 1.45;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 440px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .placeholder {
        color: var(--color-text-subtle);
        font-size: var(--text-sm);
      }
      @media (max-width: 1024px) {
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .bento-row {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 540px) {
        .stats {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AgencyOverviewComponent {
  readonly workspaceRows: InsightRow[] = [
    { icon: 'clients', title: 'Clients directory', subtitle: 'Invite client tenants & manage approvals', tile: 'mint', link: '/agency/clients' },
    { icon: 'team', title: 'Team & workload', subtitle: 'Delegate staff to specific client accounts', link: '/agency/team' },
    { icon: 'analytics', title: 'Client analytics', subtitle: 'Compare client leads, posts, and ratings', tile: 'amber', link: '/agency/analytics' },
    { icon: 'performance', title: 'Pooled usage', subtitle: 'Consolidated usage meters across clients', link: '/agency/usage' },
    { icon: 'calendar', title: 'Cross-client calendar', subtitle: 'Unified publishing schedule across clients', tile: 'peach', link: '/agency/calendar' },
    { icon: 'subscription', title: 'Billing & branding', subtitle: 'Agency plan, invoices, and brand colours', link: '/agency/billing' },
  ];

  shortId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
  }

  initialFor(id: string): string {
    const t = id.trim();
    return t ? t[0].toUpperCase() : 'C';
  }

  private readonly fb = new FormBuilder();

  readonly loading = signal(true);
  readonly agency = signal<AgencyAccount | null>(null);
  readonly clients = signal<AgencyClientLink[]>([]);

  readonly activeCount = computed(() => this.clients().filter((c) => c.status === 'active').length);
  readonly pendingCount = computed(() => this.clients().filter((c) => c.status === 'pending').length);

  readonly tenants = signal<Tenant[]>([]);
  readonly loadingTenants = signal(false);
  readonly enabling = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  readonly form = this.fb.nonNullable.group({
    tenantId: ['', [Validators.required]],
    brandName: [''],
  });

  constructor(
    private readonly agencyService: AgencyService,
    private readonly tenantService: TenantService,
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

  private refresh(): void {
    this.loading.set(true);
    this.agencyService.listClients().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.agency.set(res.agency);
        this.clients.set(res.clients ?? []);
        this.currentAgency.set(res.agency);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (apiErrorCode(err) === 'NOT_FOUND') {
          this.agency.set(null);
          this.clients.set([]);
          this.loadTenants();
        } else {
          this.errorMessage.set(apiErrorMessage(err));
        }
      },
    });
  }

  private loadTenants(): void {
    this.loadingTenants.set(true);
    this.tenantService.list().subscribe({
      next: (tenants) => {
        this.loadingTenants.set(false);
        this.tenants.set(tenants);
        const ownerOrAdmin = tenants.find((t) => t.caller_role === 'owner' || t.caller_role === 'admin');
        if (ownerOrAdmin) {
          this.form.patchValue({ tenantId: ownerOrAdmin.id });
        }
      },
      error: () => {
        this.loadingTenants.set(false);
        this.tenants.set([]);
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.enabling()) {
      return;
    }
    this.enabling.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const { tenantId, brandName } = this.form.getRawValue();
    this.agencyService.enable(tenantId, brandName ? { brand_name: brandName } : {}).subscribe({
      next: (agency) => {
        this.enabling.set(false);
        this.agency.set(agency);
        this.currentAgency.set(agency);
      },
      error: (err: unknown) => {
        this.enabling.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }
}
