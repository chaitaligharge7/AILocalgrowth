import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgencyUsage } from '../../../core/agency/agency.models';
import { AgencyService } from '../../../core/agency/agency.service';
import { apiErrorCode, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../../shared/table/table-export.component';

/**
 * `/agency/usage` — Compact Pooled Usage Reporting screen.
 */
@Component({
  selector: 'app-agency-usage',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, SkeletonLoaderComponent, SortHeaderComponent, TableExportComponent],
  template: `
    <section class="usage">
      <app-page-header
        eyebrow="Agency"
        eyebrowLabel="Pooled Meters"
        title="Pooled usage"
        subtitle="Agency-wide and per-client usage meters, reporting only."
      />

      @if (notAnAgency()) {
        <p class="gap-note">
          You don't have an active agency account yet. Go to <a routerLink="/agency/overview">Overview</a> to enable
          agency mode first.
        </p>
      } @else if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else if (usage()) {
        <div class="billing-banner" role="alert" data-testid="pooled-billing-banner">
          <strong>Reporting only.</strong> Client usage shown below is <strong>not yet billed through the agency</strong> —
          <code>pooled_billing_wired: {{ usage()!.pooled_billing_wired }}</code>. Each client continues to pay for and
          be capped by its own subscription plan. This is a consolidated READ-ONLY view, not a billing redirect.
        </div>

        <section class="card totals">
          <div class="totals-head">
            <h2>Agency-wide totals</h2>
            <ui-table-export
              [data]="sortedTotals()"
              [columns]="totalsColumns"
              filename="agency_usage_totals"
              [loading]="loading()"
              (refresh)="refresh()"
            />
          </div>
          @if (usage()!.totals.length === 0) {
            <p class="placeholder">No usage meters to total yet (no active client has a subscription).</p>
          } @else {
            <table class="list-view">
              <thead>
                <tr>
                  <th>
                    <ui-sort-header
                      label="Meter"
                      [active]="totalsSortCol() === 'meter_code'"
                      [direction]="totalsSortDir()"
                      (sort)="toggleTotalsSort('meter_code')"
                    />
                  </th>
                  <th>Utilization</th>
                  <th>
                    <ui-sort-header
                      label="Limit"
                      [active]="totalsSortCol() === 'limit_qty'"
                      [direction]="totalsSortDir()"
                      (sort)="toggleTotalsSort('limit_qty')"
                    />
                  </th>
                  <th>
                    <ui-sort-header
                      label="Used"
                      [active]="totalsSortCol() === 'used_qty'"
                      [direction]="totalsSortDir()"
                      (sort)="toggleTotalsSort('used_qty')"
                    />
                  </th>
                  <th>
                    <ui-sort-header
                      label="Reserved"
                      [active]="totalsSortCol() === 'reserved_qty'"
                      [direction]="totalsSortDir()"
                      (sort)="toggleTotalsSort('reserved_qty')"
                    />
                  </th>
                  <th>
                    <ui-sort-header
                      label="Remaining"
                      [active]="totalsSortCol() === 'remaining_qty'"
                      [direction]="totalsSortDir()"
                      (sort)="toggleTotalsSort('remaining_qty')"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (t of sortedTotals(); track t.meter_code) {
                  <tr>
                    <td><code>{{ t.meter_code }}</code></td>
                    <td style="min-width: 120px;">
                      <div class="bar"><span [style.width.%]="pct(t.used_qty + t.reserved_qty, t.limit_qty)"></span></div>
                    </td>
                    <td>{{ t.limit_qty }}</td>
                    <td>{{ t.used_qty }}</td>
                    <td>{{ t.reserved_qty }}</td>
                    <td><strong>{{ t.remaining_qty }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section class="per-client">
          <div class="per-client-head">
            <h2 class="section-heading">Per client ({{ filteredClients().length }})</h2>
            <input
              type="search"
              class="client-search"
              placeholder="Search client name or ID…"
              [value]="clientSearch()"
              (input)="clientSearch.set($any($event.target).value)"
            />
          </div>
          @if (usage()!.clients.length === 0) {
            <div class="card"><p class="placeholder">No active clients yet.</p></div>
          } @else if (filteredClients().length === 0) {
            <div class="card"><p class="placeholder">No clients match "{{ clientSearch() }}".</p></div>
          } @else {
            <div class="client-grid">
              @for (client of filteredClients(); track client.client_tenant_id) {
                <article class="card client-card">
                  <div class="client-head">
                    <h3>{{ client.client_display_name || client.client_tenant_id }}</h3>
                    <span class="badge" [class]="client.pooled_billing_opt_in ? 'badge--warning' : 'badge--info'">
                      {{ client.pooled_billing_opt_in ? 'Pooled billing requested (reporting only)' : 'Own billing' }}
                    </span>
                  </div>
                  <p class="client-meta">
                    Plan: <strong>{{ client.plan_code || '—' }}</strong> · Subscription: <strong>{{ client.subscription_status || '—' }}</strong>
                  </p>
                  @if (client.meters.length === 0) {
                    <p class="placeholder">No usage meters for this client's subscription.</p>
                  } @else {
                    <table class="list-view">
                      <thead>
                        <tr>
                          <th>Meter</th>
                          <th>Limit</th>
                          <th>Used</th>
                          <th>Reserved</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of client.meters; track m.meter_code) {
                          <tr>
                            <td><code>{{ m.meter_code }}</code></td>
                            <td>{{ m.limit_qty }}</td>
                            <td>{{ m.used_qty }}</td>
                            <td>{{ m.reserved_qty }}</td>
                            <td><strong>{{ m.remaining_qty }}</strong></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </article>
              }
            </div>
          }
        </section>
      }
      @if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      }
    </section>
  `,
  styles: [
    `
      .usage {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 16px;
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
      .billing-banner {
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-left: 4px solid var(--color-warning);
        border-radius: var(--radius-md);
        padding: 12px 16px;
        font-size: var(--text-xs);
        line-height: 1.5;
      }
      h2 {
        margin: 0 0 12px;
        font-size: var(--text-md, 1rem);
        font-weight: var(--font-bold);
      }
      .section-heading {
        margin: 4px 0 10px;
      }
      .totals.card {
        padding: 18px 20px;
      }
      .bar {
        height: 7px;
        background: var(--color-neutral-bg);
        border-radius: 999px;
        overflow: hidden;
      }
      .bar > span {
        display: block;
        height: 100%;
        background: var(--color-primary);
        border-radius: 999px;
      }
      .client-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
        gap: 16px;
      }
      .totals-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .totals-head h2 {
        margin: 0;
      }
      .per-client-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .per-client-head h2 {
        margin: 0;
      }
      .client-search {
        height: 34px;
        padding: 0 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.825rem;
        outline: none;
        min-width: 220px;
      }
      .client-search:focus {
        border-color: #6366f1;
      }
      .client-card {
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .client-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .client-head h3 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: var(--font-bold);
      }
      .client-meta {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .placeholder {
        margin: 0;
        color: var(--color-text-subtle);
        font-size: var(--text-xs);
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      @media (max-width: 640px) {
        .client-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AgencyUsageComponent {
  readonly loading = signal(true);
  readonly notAnAgency = signal(false);
  readonly usage = signal<AgencyUsage | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly clientSearch = signal('');

  readonly totalsSortCol = signal<string>('meter_code');
  readonly totalsSortDir = signal<SortDirection>('asc');

  readonly totalsColumns: TableExportColumn[] = [
    { key: 'meter_code', label: 'Meter' },
    { key: 'limit_qty', label: 'Limit' },
    { key: 'used_qty', label: 'Used' },
    { key: 'reserved_qty', label: 'Reserved' },
    { key: 'remaining_qty', label: 'Remaining' },
  ];

  readonly sortedTotals = computed(() => {
    const list = this.usage()?.totals ?? [];
    return sortTableRows(list, this.totalsSortCol(), this.totalsSortDir(), (row, col) => (row as any)[col]);
  });

  readonly filteredClients = computed(() => {
    const clients = this.usage()?.clients ?? [];
    const q = this.clientSearch().trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.client_tenant_id, c.client_display_name || '', c.plan_code || ''].some((f) => f.toLowerCase().includes(q)),
    );
  });

  toggleTotalsSort(col: string): void {
    if (this.totalsSortCol() === col) {
      this.totalsSortDir.set(this.totalsSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.totalsSortCol.set(col);
      this.totalsSortDir.set('asc');
    }
  }

  constructor(private readonly agencyService: AgencyService) {
    this.refresh();
  }

  pct(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.agencyService.usage().subscribe({
      next: (usage) => {
        this.loading.set(false);
        this.usage.set(usage);
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
