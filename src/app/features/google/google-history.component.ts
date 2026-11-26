import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { SyncHistoryItem } from '../../core/google/gbp.models';
import { GbpService } from '../../core/google/gbp.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

const KIND_LABEL: Record<string, string> = {
  profile_sync: 'Profile sync',
  review_sync: 'Review sync',
  profile_push: 'Profile push',
  photo_push: 'Photo push',
  post_publish: 'Post publish',
};

type StatusFilter = '' | 'failed' | 'unknown';

/**
 * Sync history, errors and recovery (BW-040): every profile/review sync run,
 * profile/photo push and post publish for the business, newest first, with
 * its real status and a plain-language hint for known error codes. Failed
 * pushes and posts can be retried here; a failed sync is re-run with "Sync
 * now" on the audit screen. Unknown outcomes are shown but never retried
 * automatically (that could duplicate a public post).
 */
@Component({
  selector: 'app-google-history',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section>
      <ui-table-toolbar
        placeholder="Search history…"
        [searchTerm]="searchTerm()"
        (searchChange)="searchTerm.set($event); page.set(1)"
        [data]="filteredItems()"
        [columns]="exportColumns"
        filename="google_sync_history"
        [loading]="loading()"
        (refresh)="load()"
      >
        <div filters class="filters" role="group" aria-label="Filter by status">
          @for (f of filters; track f.id) {
            <button type="button" [class.active]="filter() === f.id" (click)="setFilter(f.id)">{{ f.label }}</button>
          }
        </div>
      </ui-table-toolbar>
      @if (actionError()) {
        <p class="form-error" role="alert">{{ actionError() }}</p>
      }
      @if (notice()) {
        <p class="success" role="status">{{ notice() }}</p>
      }
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (items().length === 0) {
        <app-empty-state icon="audit" title="Nothing here" message="Syncs, pushes and posts will be listed with their outcome." />
      } @else if (filteredItems().length === 0) {
        <p class="meta">No history entries match "{{ searchTerm() }}".</p>
      } @else {
        <table class="data-table" data-testid="history-table">
          <thead>
            <tr>
              <th><ui-sort-header label="What" [active]="sortCol() === 'kind'" [direction]="sortDir()" (sort)="toggleSort('kind')" /></th>
              <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
              <th><ui-sort-header label="When" [active]="sortCol() === 'at'" [direction]="sortDir()" (sort)="toggleSort('at')" /></th>
              <th>Details</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (i of pagedItems(); track i.source + i.id) {
              <tr>
                <td>{{ kind(i) }}</td>
                <td>
                  <span class="badge badge--dot" [class]="statusClass(i.status)">{{ i.status }}</span>
                  @if (i.mock_provider) {
                    <span class="badge badge--mock">MOCK_PROVIDER</span>
                  }
                </td>
                <td class="meta">{{ i.at ? (i.at | date: 'medium') : '—' }}</td>
                <td class="meta">
                  @if (i.error_hint) {
                    {{ i.error_hint }}
                  } @else if (i.retry_hint) {
                    {{ i.retry_hint }}
                  } @else if (i.error_code) {
                    {{ i.error_code }}
                  } @else {
                    —
                  }
                  @if (i.attempt_count > 1) {
                    <br />{{ i.attempt_count }} attempts
                  }
                </td>
                <td>
                  @if (i.retryable && canRetry(i)) {
                    <button type="button" [disabled]="busyId() === i.id" (click)="retry(i)">{{ busyId() === i.id ? 'Retrying…' : 'Retry' }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-pagination
          [totalItems]="filteredItems().length"
          [currentPage]="page()"
          [pageSize]="pageSize()"
          (pageChange)="page.set($event)"
          (pageSizeChange)="pageSize.set($event); page.set(1)"
        />
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .filters { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
      .filters button { border-radius: 999px; padding: 0.3rem 0.9rem; }
      .filters button.active { background: var(--color-primary-light); border-color: var(--color-primary); color: var(--color-primary); }
      .form-error { color: #b00020; font-size: 0.85rem; }
      .success { color: #047857; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    `,
  ],
})
export class GoogleHistoryComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  /** Owner/admin/editor; pushes need `integration.manage`, posts `content.publish` — the server decides. */
  @Input() canManage = false;

  readonly filters: { id: StatusFilter; label: string }[] = [
    { id: '', label: 'All' },
    { id: 'failed', label: 'Failed' },
    { id: 'unknown', label: 'Unknown outcome' },
  ];

  readonly filter = signal<StatusFilter>('');
  readonly items = signal<SyncHistoryItem[]>([]);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'source', label: 'What' },
    { key: 'status', label: 'Status' },
    { key: 'at', label: 'When' },
    { key: 'error_code', label: 'Details' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredItems = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(this.items(), this.sortCol(), this.sortDir(), (i, col) => {
      switch (col) {
        case 'kind':
          return this.kind(i);
        case 'status':
          return i.status;
        case 'at':
          return i.at ?? '';
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (i) =>
        this.kind(i).toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q) ||
        (i.error_code ?? '').toLowerCase().includes(q),
    );
  });

  readonly pagedItems = computed(() => paginateItems(this.filteredItems(), this.page(), this.pageSize()));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor(private readonly gbp: GbpService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.load();
    }
  }

  setFilter(f: StatusFilter): void {
    this.filter.set(f);
    this.load();
  }

  kind(i: SyncHistoryItem): string {
    return KIND_LABEL[i.kind] ?? i.kind;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'succeeded':
        return 'badge--success';
      case 'failed':
        return 'badge--danger';
      case 'unknown':
      case 'stalled':
        return 'badge--warning';
      default:
        return 'badge--neutral';
    }
  }

  canRetry(i: SyncHistoryItem): boolean {
    return this.canManage && (i.source === 'push_job' || i.source === 'post');
  }

  retry(i: SyncHistoryItem): void {
    this.busyId.set(i.id);
    this.actionError.set(null);
    this.notice.set(null);
    const request: Observable<unknown> = i.source === 'post' ? this.gbp.publishPost(this.tenantId, i.id) : this.gbp.retryPushJob(this.tenantId, i.id);
    request.subscribe({
      next: (result) => {
        this.busyId.set(null);
        const mock = (result as { mock_provider?: boolean | null }).mock_provider;
        this.notice.set(mock ? 'Retry accepted by the mock Google provider — nothing was sent to a real Google profile.' : 'Retry sent to Google.');
        this.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
        this.load();
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gbp.history(this.tenantId, this.filter() || undefined).subscribe({
      next: (h) => {
        this.items.set(h.items);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
