import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminAddon } from '../../../core/admin/platform.models';
import { PlatformService } from '../../../core/admin/platform.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../../shared/table/sort-header.component';
import { TableExportColumn } from '../../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../../shared/table/table-toolbar.component';

/**
 * `/admin/addons` — manage the add-on catalog tenants can buy (BW-119 admin
 * side). Creating or retiring an add-on needs a reason (written to the audit
 * log). Add-ons are never deleted, only retired.
 */
@Component({
  selector: 'app-admin-addons',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="addons">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="BW-119" title="Add-on catalog" subtitle="One-off top-ups businesses can buy." />

      <form class="card form" [formGroup]="form" (ngSubmit)="create()" novalidate data-testid="addon-form">
        <h2>New add-on</h2>
        <label>Code <input formControlName="code" placeholder="ai_credits_250" /></label>
        <label>Name <input formControlName="name" /></label>
        <label>Meter code <input formControlName="meter_code" placeholder="ai_generations_per_month" /></label>
        <label>Units granted <input type="number" formControlName="quantity" /></label>
        <label>Price (INR) <input formControlName="price" placeholder="499.00" /></label>
        <label>Reason <span class="required">(required)</span> <input formControlName="reason" /></label>
        @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
        <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving…' : 'Create add-on' }}</button>
      </form>

      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (addons().length === 0) {
        <app-empty-state icon="subscription" title="No add-ons" message="Create the first add-on above." />
      } @else {
        <div class="card">
          <ui-table-toolbar
            placeholder="Search add-ons…"
            [searchTerm]="searchTerm()"
            (searchChange)="searchTerm.set($event); page.set(1)"
            [data]="filteredAddons()"
            [columns]="exportColumns"
            filename="admin_addons"
            [loading]="loading()"
            (refresh)="load()"
          />
          <table data-testid="addons-table">
            <thead>
              <tr>
                <th><ui-sort-header label="Code" [active]="sortCol() === 'code'" [direction]="sortDir()" (sort)="toggleSort('code')" /></th>
                <th><ui-sort-header label="Name" [active]="sortCol() === 'name'" [direction]="sortDir()" (sort)="toggleSort('name')" /></th>
                <th><ui-sort-header label="Meter" [active]="sortCol() === 'meter_code'" [direction]="sortDir()" (sort)="toggleSort('meter_code')" /></th>
                <th><ui-sort-header label="Units" [active]="sortCol() === 'quantity'" [direction]="sortDir()" (sort)="toggleSort('quantity')" /></th>
                <th><ui-sort-header label="Price" [active]="sortCol() === 'price'" [direction]="sortDir()" (sort)="toggleSort('price')" /></th>
                <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (a of pagedAddons(); track a.id) {
                <tr>
                  <td><code>{{ a.code }}</code></td>
                  <td>{{ a.name }}</td>
                  <td>{{ a.meter_code }}</td>
                  <td>{{ a.quantity }}</td>
                  <td>₹{{ a.price }}</td>
                  <td><span class="badge badge--dot" [class]="a.status === 'active' ? 'badge--success' : 'badge--neutral'">{{ a.status }}</span></td>
                  <td>
                    <button type="button" (click)="toggle(a)">{{ a.status === 'active' ? 'Retire' : 'Reactivate' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-pagination
            [totalItems]="filteredAddons().length"
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
      .addons { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
      .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; align-items: end; }
      .form h2, .form button, .form .form-error { grid-column: 1 / -1; margin: 0; }
      label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
      input { padding: 0.4rem; font: inherit; }
      .required { color: #b00020; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
      .form-error { color: #b00020; }
      button { padding: 0.4rem 0.8rem; cursor: pointer; }
    `,
  ],
})
export class AdminAddonsComponent implements OnInit {
  readonly addons = signal<AdminAddon[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'meter_code', label: 'Meter' },
    { key: 'quantity', label: 'Units' },
    { key: 'price', label: 'Price' },
    { key: 'status', label: 'Status' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredAddons = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.addons(), this.sortCol(), this.sortDir(), (a, col) => {
      switch (col) {
        case 'code':
          return a.code;
        case 'name':
          return a.name;
        case 'meter_code':
          return a.meter_code;
        case 'quantity':
          return a.quantity;
        case 'price':
          return a.price;
        case 'status':
          return a.status;
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.meter_code.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q),
    );
  });

  readonly pagedAddons = computed(() => paginateItems(this.filteredAddons(), this.page(), this.pageSize()));
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]{3,64}$/)]],
    name: ['', [Validators.required]],
    meter_code: ['', [Validators.required]],
    quantity: [100, [Validators.required, Validators.min(1)]],
    price: ['', [Validators.required, Validators.pattern(/^\d{1,10}(\.\d{1,2})?$/)]],
    reason: ['', [Validators.required]],
  });

  constructor(private readonly platform: PlatformService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.platform.addons().subscribe({
      next: (a) => {
        this.addons.set(a);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.formError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  create(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const v = this.form.getRawValue();
    this.platform.createAddon({ ...v }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ code: '', name: '', meter_code: '', quantity: 100, price: '', reason: '' });
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const fields = apiErrorFields(err);
        this.formError.set(fields ? Object.values(fields).join(' ') : apiErrorMessage(err));
      },
    });
  }

  toggle(addon: AdminAddon): void {
    const reason = window.prompt('Reason for this change (required):')?.trim();
    if (!reason) {
      return;
    }
    this.platform.setAddonStatus(addon.id, addon.status === 'active' ? 'retired' : 'active', reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.formError.set(apiErrorMessage(err)),
    });
  }
}
