import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AddonCatalog, AddonPurchase, BillingAddon } from '../../core/billing/addons.models';
import { AddonsService } from '../../core/billing/addons.service';
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
 * `/app/:tenantId/billing/addons` — optional add-on purchases (BW-119).
 * A purchase is always created `pending`. In the non-production mock payment
 * mode the page shows a clearly-labelled DEV-ONLY control that simulates the
 * provider confirming payment; the API refuses it outside mock mode, and the
 * page never claims a real charge happened.
 */
@Component({
  selector: 'app-billing-addons',
  standalone: true,
  imports: [DatePipe, RouterLink, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="addons">
      <app-page-header eyebrow="Billing" eyebrowLabel="Add-ons" title="Add-ons" subtitle="One-off top-ups on top of your plan." />
      <p class="meta">
        <a [routerLink]="['/app', tenantId(), 'billing']">← Back to billing</a>
        ·
        <a [routerLink]="['/app', tenantId(), 'support']" [queryParams]="{ category: 'billing' }" data-testid="billing-support-link">Billing question? Contact support</a>
      </p>

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else {
        @if (catalog()?.mock_provider) {
          <p class="mock-banner" data-testid="mock-banner">
            <span class="badge badge--warning">MOCK_PROVIDER</span> Payments are simulated in this environment. No real money moves.
          </p>
        }
        @if (notice()) {
          <p class="notice" role="status">{{ notice() }}</p>
        }
        @if (actionError()) {
          <p class="form-error" role="alert">{{ actionError() }}</p>
        }

        <h2>Available add-ons</h2>
        @if (addons().length === 0) {
          <app-empty-state icon="subscription" title="No add-ons available" message="There are no add-ons on offer right now." />
        } @else {
          <div class="grid">
            @for (a of addons(); track a.id) {
              <article class="card addon" data-testid="addon-card">
                <h3>{{ a.name }}</h3>
                <p class="meta">{{ a.description }}</p>
                <p><strong>₹{{ a.price }}</strong> · +{{ a.quantity }} on <code>{{ a.meter_code }}</code></p>
                <button type="button" (click)="buy(a)" [disabled]="busy()">Buy add-on</button>
              </article>
            }
          </div>
        }

        <h2>Your purchases</h2>
        <ui-table-toolbar
          placeholder="Search purchases…"
          [searchTerm]="searchTerm()"
          (searchChange)="searchTerm.set($event); page.set(1)"
          [data]="filteredPurchases()"
          [columns]="exportColumns"
          filename="addon_purchases"
          [loading]="loading()"
          (refresh)="load()"
        />
        @if (purchases().length === 0) {
          <app-empty-state icon="invoices" title="No purchases yet" message="Add-ons you buy will be listed here." />
        } @else if (filteredPurchases().length === 0) {
          <p class="meta">No purchases match "{{ searchTerm() }}".</p>
        } @else {
          <table class="data-table" data-testid="purchase-table">
            <thead>
              <tr>
                <th><ui-sort-header label="Add-on" [active]="sortCol() === 'addon_name'" [direction]="sortDir()" (sort)="toggleSort('addon_name')" /></th>
                <th><ui-sort-header label="Amount" [active]="sortCol() === 'amount'" [direction]="sortDir()" (sort)="toggleSort('amount')" /></th>
                <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
                <th><ui-sort-header label="When" [active]="sortCol() === 'created_at'" [direction]="sortDir()" (sort)="toggleSort('created_at')" /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (p of pagedPurchases(); track p.id) {
                <tr>
                  <td>{{ p.addon_name }} <span class="meta">(+{{ p.quantity }})</span></td>
                  <td>₹{{ p.amount }}</td>
                  <td>
                    <span class="badge badge--dot" [class]="badge(p)">{{ p.status }}</span>
                    @if (p.mock_provider && p.status === 'paid') {
                      <span class="badge badge--warning">MOCK_PROVIDER</span>
                    }
                  </td>
                  <td class="meta">{{ p.created_at | date: 'medium' }}</td>
                  <td class="actions">
                    @if (p.status === 'pending') {
                      @if (catalog()?.mock_provider) {
                        <button type="button" (click)="mockComplete(p)" [disabled]="busy()" data-testid="mock-complete">DEV ONLY: Complete mock payment</button>
                      }
                      <button type="button" (click)="cancel(p)" [disabled]="busy()">Cancel</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredPurchases().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event); page.set(1)"
          />
        }
      }
    </section>
  `,
  styles: [
    `
      .addons { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
      .addon h3 { margin: 0 0 0.25rem; }
      .meta { color: var(--color-text-muted); font-size: 0.85rem; }
      .form-error { color: #b00020; }
      .mock-banner { border: 1px dashed var(--color-warning, #b26a00); padding: 0.5rem 0.75rem; border-radius: var(--radius-md); }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
      button { padding: 0.4rem 0.8rem; cursor: pointer; }
    `,
  ],
})
export class BillingAddonsComponent implements OnInit {
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly catalog = signal<AddonCatalog | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly notice = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly addons = computed<BillingAddon[]>(() => this.catalog()?.addons ?? []);
  readonly purchases = computed<AddonPurchase[]>(() => this.catalog()?.purchases ?? []);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'addon_name', label: 'Add-on' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'When' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredPurchases = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.purchases(), this.sortCol(), this.sortDir(), (p, col) => {
      switch (col) {
        case 'addon_name':
          return p.addon_name;
        case 'amount':
          return p.amount;
        case 'status':
          return p.status;
        case 'created_at':
          return p.created_at;
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter((p) => (p.addon_name ?? '').toLowerCase().includes(q) || p.status.toLowerCase().includes(q));
  });

  readonly pagedPurchases = computed(() => paginateItems(this.filteredPurchases(), this.page(), this.pageSize()));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly api: AddonsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  badge(p: AddonPurchase): string {
    return p.status === 'paid' ? 'badge--success' : p.status === 'pending' ? 'badge--warning' : 'badge--neutral';
  }

  load(): void {
    const id = this.tenantId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.api.catalog(id).subscribe({
      next: (c) => {
        this.catalog.set(c);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  buy(addon: BillingAddon): void {
    this.run(this.api.purchase(this.tenantId(), addon.id), 'Purchase created for ' + addon.name + '. It stays pending until payment is confirmed.');
  }

  mockComplete(p: AddonPurchase): void {
    this.run(this.api.mockComplete(this.tenantId(), p.id), 'Mock payment confirmed (MOCK_PROVIDER). Your usage limit was raised.');
  }

  cancel(p: AddonPurchase): void {
    this.run(this.api.cancel(this.tenantId(), p.id), 'Purchase cancelled.');
  }

  private run(call: Observable<unknown>, message: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(message);
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }
}
