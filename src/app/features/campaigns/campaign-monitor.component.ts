import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';
import { MonitorJob, MonitorResponse } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { PublishingService } from '../../core/publishing/publishing.service';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

const STATUS_CLASS: Record<string, string> = {
  queued: 'badge--neutral',
  leased: 'badge--info',
  attempting: 'badge--info',
  reconciling: 'badge--warning',
  succeeded: 'badge--success',
  retry_wait: 'badge--warning',
  dead_letter: 'badge--danger',
  cancelled: 'badge--neutral',
};

/**
 * Publishing job monitor (BW-070/BW-088): every publish job with its content,
 * channel, attempts and last outcome. Failed or waiting jobs can be retried by
 * an owner/admin; a retry never creates a second post (the duplicate-publish
 * guard is checked again by the worker). Mock-provider jobs are labelled.
 */
@Component({
  selector: 'app-campaign-monitor',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section>
      @if (data(); as d) {
        <div class="chips" role="group" aria-label="Filter by status">
          <button type="button" class="chip" [class.active]="status() === ''" (click)="setStatus('')">All</button>
          @for (s of statuses(d); track s) {
            <button type="button" class="chip" [class.active]="status() === s" (click)="setStatus(s)">{{ s.replace('_', ' ') }} · {{ d.status_counts[s] }}</button>
          }
        </div>
      }
      @if (actionError()) { <p class="form-error" role="alert">{{ actionError() }}</p> }
      @if (notice()) { <p class="success" role="status">{{ notice() }}</p> }

      <ui-table-toolbar
        placeholder="Search jobs…"
        [searchTerm]="searchTerm()"
        (searchChange)="searchTerm.set($event); page.set(1)"
        [data]="filteredJobs()"
        [columns]="exportColumns"
        filename="publish_jobs"
        [loading]="loading()"
        (refresh)="load()"
      />
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (!data() || data()!.jobs.length === 0) {
        <app-empty-state icon="jobs" title="No publish jobs" message="Jobs appear here once an approved post is scheduled." />
      } @else if (filteredJobs().length === 0) {
        <p class="meta">No jobs match "{{ searchTerm() }}".</p>
      } @else {
        <table class="data-table" data-testid="monitor-table">
          <thead>
            <tr>
              <th><ui-sort-header label="Post" [active]="sortCol() === 'title'" [direction]="sortDir()" (sort)="toggleSort('title')" /></th>
              <th><ui-sort-header label="Channel" [active]="sortCol() === 'channel'" [direction]="sortDir()" (sort)="toggleSort('channel')" /></th>
              <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
              <th><ui-sort-header label="Attempts" [active]="sortCol() === 'attempts'" [direction]="sortDir()" (sort)="toggleSort('attempts')" /></th>
              <th><ui-sort-header label="Scheduled" [active]="sortCol() === 'scheduled_utc'" [direction]="sortDir()" (sort)="toggleSort('scheduled_utc')" /></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (j of pagedJobs(); track j.id) {
              <tr>
                <td>{{ j.content_title || 'Untitled' }}</td>
                <td>{{ j.channel }}@if (j.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }</td>
                <td>
                  <span class="badge badge--dot" [class]="cls(j.status)">{{ j.status.replace('_', ' ') }}</span>
                  @if (j.last_error_code) { <p class="meta">{{ j.last_error_code }}</p> }
                </td>
                <td>{{ j.attempts }}@if (j.last_outcome) { <span class="meta"> · {{ j.last_outcome }}</span> }</td>
                <td class="meta">{{ j.scheduled_utc | date: 'medium' }}</td>
                <td>
                  @if (j.retryable && data()!.viewer_can_retry) {
                    <button type="button" class="btn-secondary" [disabled]="busyId() === j.id" (click)="retry(j)">{{ busyId() === j.id ? 'Retrying…' : 'Retry' }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-pagination
          [totalItems]="filteredJobs().length"
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
      .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
      .chip { border-radius: 999px; padding: 0.3rem 0.9rem; cursor: pointer; font-size: 0.82rem; text-transform: capitalize; }
      .chip.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
      .meta { font-size: 0.78rem; color: var(--color-text-muted); margin: 0; }
      .form-error { color: #b00020; }
      .success { color: #1b6b3a; }
    `,
  ],
})
export class CampaignMonitorComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';

  readonly data = signal<MonitorResponse | null>(null);
  readonly status = signal('');
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'content_title', label: 'Post' },
    { key: 'channel', label: 'Channel' },
    { key: 'status', label: 'Status' },
    { key: 'attempts', label: 'Attempts' },
    { key: 'scheduled_utc', label: 'Scheduled' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredJobs = computed(() => {
    const jobs = this.data()?.jobs ?? [];
    const q = this.searchTerm().trim().toLowerCase();
    const sorted = sortTableRows(jobs, this.sortCol(), this.sortDir(), (j, col) => {
      switch (col) {
        case 'title':
          return j.content_title ?? '';
        case 'channel':
          return j.channel;
        case 'status':
          return j.status;
        case 'attempts':
          return j.attempts;
        case 'scheduled_utc':
          return j.scheduled_utc;
        default:
          return '';
      }
    });
    if (!q) return sorted;
    return sorted.filter(
      (j) =>
        (j.content_title ?? '').toLowerCase().includes(q) ||
        j.channel.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q),
    );
  });

  readonly pagedJobs = computed(() => paginateItems(this.filteredJobs(), this.page(), this.pageSize()));
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  constructor(
    private readonly api: CampaignService,
    private readonly publishing: PublishingService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.load();
    }
  }

  cls(s: string): string {
    return STATUS_CLASS[s] ?? 'badge--neutral';
  }

  statuses(d: MonitorResponse): string[] {
    return Object.keys(d.status_counts).filter((s) => d.status_counts[s] > 0);
  }

  setStatus(s: string): void {
    this.status.set(s);
    this.load();
  }

  retry(job: MonitorJob): void {
    this.busyId.set(job.id);
    this.actionError.set(null);
    this.notice.set(null);
    this.publishing.retryPublishJob(this.tenantId, job.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set('Job re-queued. The publishing worker will try it again.');
        this.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.monitor(this.tenantId, this.status() || undefined).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
