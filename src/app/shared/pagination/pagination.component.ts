import { Component, computed, input, output } from '@angular/core';

/**
 * Slices an array for the current 1-based page and page size.
 */
export function paginateItems<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  return items.slice(start, start + safeSize);
}

/**
 * Reusable compact SaaS pagination bar for data tables and lists.
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  template: `
    @if (totalItems() > 0) {
      <nav class="pagination-bar" aria-label="Table pagination">
        <span class="pagination-info">
          Showing <strong>{{ startIndex() }}</strong>–<strong>{{ endIndex() }}</strong> of <strong>{{ totalItems() }}</strong>
        </span>

        <div class="pagination-controls">
          @if (pageSizeOptions().length > 0) {
            <label class="page-size-label">
              <span>Rows:</span>
              <select
                class="page-size-select"
                aria-label="Rows per page"
                [value]="pageSize()"
                (change)="onPageSizeSelect($any($event.target).value)"
              >
                @for (size of pageSizeOptions(); track size) {
                  <option [value]="size">{{ size }}</option>
                }
              </select>
            </label>
          }

          <div class="page-buttons">
            <button
              type="button"
              class="page-btn"
              [disabled]="safePage() <= 1"
              (click)="goToPage(safePage() - 1)"
              aria-label="Previous page"
            >
              ‹ Prev
            </button>
            <span class="page-indicator">Page {{ safePage() }} of {{ totalPages() }}</span>
            <button
              type="button"
              class="page-btn"
              [disabled]="safePage() >= totalPages()"
              (click)="goToPage(safePage() + 1)"
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      </nav>
    }
  `,
  styles: [
    `
      .pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        padding: 0.65rem 0.25rem 0.15rem;
        margin-top: 0.5rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
        font-size: var(--text-xs, 0.78rem);
        color: var(--color-text-muted, #64748b);
      }
      .pagination-info strong {
        color: var(--color-text, #0f172a);
        font-weight: 600;
      }
      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        flex-wrap: wrap;
      }
      .page-size-label {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: var(--text-xs, 0.78rem);
        font-weight: 500;
        color: var(--color-text-muted, #64748b);
      }
      .page-size-select {
        height: 28px;
        padding: 0 0.4rem;
        font-size: var(--text-xs, 0.78rem);
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        background: var(--color-surface, #fff);
        color: var(--color-text, #0f172a);
      }
      .page-buttons {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .page-btn {
        height: 28px;
        padding: 0 0.6rem;
        font-size: var(--text-xs, 0.78rem);
        font-weight: 600;
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border-strong, #cbd5e1);
        background: var(--color-surface, #fff);
        color: var(--color-text, #0f172a);
        cursor: pointer;
      }
      .page-btn:hover:not(:disabled) {
        border-color: var(--color-primary, #078d7e);
        color: var(--color-primary, #078d7e);
      }
      .page-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .page-indicator {
        font-weight: 500;
        color: var(--color-text, #0f172a);
        padding: 0 0.2rem;
      }
    `,
  ],
})
export class PaginationComponent {
  readonly totalItems = input.required<number>();
  readonly currentPage = input<number>(1);
  readonly pageSize = input<number>(10);
  readonly pageSizeOptions = input<number[]>([5, 10, 25, 50]);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / Math.max(1, this.pageSize()))));
  readonly safePage = computed(() => Math.min(Math.max(1, this.currentPage()), this.totalPages()));
  readonly startIndex = computed(() => (this.totalItems() === 0 ? 0 : (this.safePage() - 1) * this.pageSize() + 1));
  readonly endIndex = computed(() => Math.min(this.totalItems(), this.safePage() * this.pageSize()));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    if (clamped !== this.safePage()) {
      this.pageChange.emit(clamped);
    }
  }

  onPageSizeSelect(raw: string): void {
    const size = Number(raw);
    if (Number.isFinite(size) && size > 0) {
      this.pageSizeChange.emit(size);
      this.pageChange.emit(1);
    }
  }
}
