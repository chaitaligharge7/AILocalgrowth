import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { GBP_CTA_TYPES, GBP_POST_TYPES, GbpPost, GbpPostStatus } from '../../core/google/gbp.models';
import { GbpService } from '../../core/google/gbp.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

const STATUS_VIEW: Record<GbpPostStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'badge--neutral' },
  published: { label: 'Published', cls: 'badge--success' },
  failed: { label: 'Failed', cls: 'badge--danger' },
  unknown: { label: 'Outcome unknown', cls: 'badge--warning' },
};

/**
 * Google posts manager (BW-036): drafts a Business Profile post for one
 * location and publishes it through the Google provider. In mock mode the
 * "publish" is accepted by the mock adapter only — the row says so
 * (MOCK_PROVIDER) and nothing reaches a real Google profile. Failed posts
 * can be retried; an unknown outcome is never retried blindly.
 */
@Component({
  selector: 'app-google-posts',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, SkeletonLoaderComponent, EmptyStateComponent, IconComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section>
      @if (canDraft) {
        <form class="card form" [formGroup]="form" (ngSubmit)="save()">
          <h3>{{ editingId() ? 'Edit post' : 'New post' }}</h3>
          <label>
            Type
            <select formControlName="post_type">
              @for (t of postTypes; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </label>
          <label>
            Post text
            <textarea rows="4" formControlName="body" maxlength="1500"></textarea>
            <span class="meta">{{ form.controls.body.value.length }}/1500</span>
            @if (fieldErrors()?.['body']) {
              <span class="form-error" role="alert">{{ fieldErrors()?.['body'] }}</span>
            }
          </label>
          <div class="row">
            <label>
              Button (optional)
              <select formControlName="cta_type">
                <option value="">No button</option>
                @for (c of ctaTypes; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </label>
            @if (form.controls.cta_type.value && form.controls.cta_type.value !== 'call') {
              <label class="grow">
                Button link
                <input type="url" formControlName="cta_url" placeholder="https://" />
                @if (fieldErrors()?.['cta_url']) {
                  <span class="form-error" role="alert">{{ fieldErrors()?.['cta_url'] }}</span>
                }
              </label>
            }
          </div>
          <p class="meta">Offer/event posts here carry text and a button only — offer terms and event dates are not modelled yet.</p>
          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }
          <div class="actions">
            <button type="submit" [disabled]="busy() || form.invalid">{{ editingId() ? 'Save changes' : 'Save draft' }}</button>
            @if (editingId()) {
              <button type="button" class="btn-secondary" (click)="cancelEdit()">Cancel</button>
            }
          </div>
        </form>
      }

      @if (actionError()) {
        <p class="form-error" role="alert">{{ actionError() }}</p>
      }
      @if (notice()) {
        <p class="success" role="status">{{ notice() }}</p>
      }

      <ui-table-toolbar
        placeholder="Search posts…"
        [searchTerm]="searchTerm()"
        (searchChange)="searchTerm.set($event); page.set(1)"
        [data]="filteredPosts()"
        [columns]="exportColumns"
        filename="google_posts"
        [loading]="loading()"
        (refresh)="load(true)"
      />

      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (posts().length === 0) {
        <app-empty-state icon="content" title="No Google posts yet" message="Write a draft above, then publish it to this location." />
      } @else {
        <table class="data-table" data-testid="post-table">
          <thead>
            <tr>
              <th><ui-sort-header label="Post" [active]="sortCol() === 'body'" [direction]="sortDir()" (sort)="toggleSort('body')" /></th>
              <th><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
              <th><ui-sort-header label="Updated" [active]="sortCol() === 'updated_at'" [direction]="sortDir()" (sort)="toggleSort('updated_at')" /></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (p of pagedPosts(); track p.id) {
              <tr>
                <td class="post-cell">
                  <span class="type">{{ p.post_type }}</span>
                  <p>{{ p.body }}</p>
                  @if (p.cta_type) {
                    <p class="meta">Button: {{ p.cta_type }}{{ p.cta_url ? ' → ' + p.cta_url : '' }}</p>
                  }
                  @if (p.error_hint) {
                    <p class="form-error">{{ p.error_hint }}</p>
                  }
                </td>
                <td>
                  <span class="badge badge--dot" [class]="view(p.status).cls">{{ view(p.status).label }}</span>
                  @if (p.mock_provider) {
                    <span class="badge badge--mock">MOCK_PROVIDER</span>
                  }
                  @if (p.attempt_count > 0) {
                    <p class="meta">{{ p.attempt_count }} attempt{{ p.attempt_count === 1 ? '' : 's' }}</p>
                  }
                </td>
                <td class="meta">{{ p.updated_at | date: 'medium' }}</td>
                <td class="row-actions">
                  @if (p.status === 'draft' || p.status === 'failed') {
                    @if (canPublish) {
                      <button type="button" [disabled]="busy()" (click)="publish(p)">{{ p.status === 'failed' ? 'Retry publish' : 'Publish' }}</button>
                    }
                    @if (canDraft) {
                      <button type="button" class="btn-secondary action-icon-btn" [disabled]="busy()" (click)="edit(p)" title="Edit post" aria-label="Edit post">
                        <ui-icon name="edit" [size]="14" />
                        <span class="sr-only">Edit</span>
                      </button>
                      <button type="button" class="btn-danger action-icon-btn" [disabled]="busy()" (click)="remove(p)" title="Delete post" aria-label="Delete post">
                        <ui-icon name="trash" [size]="14" />
                        <span class="sr-only">Delete</span>
                      </button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-pagination
          [totalItems]="posts().length"
          [currentPage]="page()"
          [pageSize]="pageSize()"
          (pageChange)="page.set($event)"
          (pageSizeChange)="pageSize.set($event)"
        />
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.8rem; color: var(--color-text-muted); margin: 0.15rem 0; }
      .form { display: grid; gap: 0.75rem; margin-bottom: 1rem; }
      .form h3 { margin: 0; }
      .row { display: flex; gap: 1rem; flex-wrap: wrap; }
      .grow { flex: 1; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; }
      input, select, textarea { padding: 0.5rem; font: inherit; font-weight: 400; }
      .actions { display: flex; gap: 0.5rem; }
      .form-error { color: #b00020; font-size: 0.85rem; }
      .success { color: #047857; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
      .post-cell p { margin: 0.2rem 0; }
      .type { text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; color: var(--color-primary); font-weight: 700; }
      .row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    `,
  ],
})
export class GooglePostsComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';
  /** Owner/admin/editor may draft (`content.create`) and publish (`content.publish`); the server is the real gate. */
  @Input() canDraft = false;
  @Input() canPublish = false;

  private readonly fb = new FormBuilder();
  readonly postTypes = GBP_POST_TYPES;
  readonly ctaTypes = GBP_CTA_TYPES;

  readonly form = this.fb.nonNullable.group({
    post_type: ['update'],
    body: ['', [Validators.required, Validators.maxLength(1500)]],
    cta_type: [''],
    cta_url: [''],
  });

  readonly posts = signal<GbpPost[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('');
  readonly sortDir = signal<SortDirection>('asc');

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly sortedPosts = computed(() =>
    sortTableRows(this.posts(), this.sortCol(), this.sortDir(), (p, col) => {
      switch (col) {
        case 'body':
          return p.body;
        case 'status':
          return p.status;
        case 'updated_at':
          return p.updated_at;
        default:
          return '';
      }
    }),
  );

  readonly searchTerm = signal('');
  readonly exportColumns: TableExportColumn[] = [
    { key: 'post_type', label: 'Type' },
    { key: 'body', label: 'Post' },
    { key: 'status', label: 'Status' },
    { key: 'updated_at', label: 'Updated' },
  ];
  readonly filteredPosts = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const list = this.sortedPosts();
    if (!q) return list;
    return list.filter((p) => p.body.toLowerCase().includes(q) || p.status.toLowerCase().includes(q) || p.post_type.toLowerCase().includes(q));
  });
  readonly pagedPosts = computed(() => paginateItems(this.filteredPosts(), this.page(), this.pageSize()));
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor(private readonly gbp: GbpService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['tenantId'] || changes['locationId']) && this.tenantId && this.locationId) {
      this.editingId.set(null);
      this.form.reset({ post_type: 'update', body: '', cta_type: '', cta_url: '' });
      this.load(true);
    }
  }

  view(status: GbpPostStatus): { label: string; cls: string } {
    return STATUS_VIEW[status];
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      post_type: v.post_type as GbpPost['post_type'],
      body: v.body,
      cta_type: (v.cta_type || null) as GbpPost['cta_type'],
      cta_url: v.cta_type && v.cta_type !== 'call' ? v.cta_url : null,
    };
    this.busy.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);
    this.notice.set(null);
    const id = this.editingId();
    const request = id
      ? this.gbp.updatePost(this.tenantId, id, payload)
      : this.gbp.createPost(this.tenantId, this.locationId, payload);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(id ? 'Post updated.' : 'Draft saved.');
        this.editingId.set(null);
        this.form.reset({ post_type: 'update', body: '', cta_type: '', cta_url: '' });
        this.load(false);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.formError.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }

  edit(post: GbpPost): void {
    this.editingId.set(post.id);
    this.form.setValue({ post_type: post.post_type, body: post.body, cta_type: post.cta_type ?? '', cta_url: post.cta_url ?? '' });
    this.notice.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ post_type: 'update', body: '', cta_type: '', cta_url: '' });
  }

  publish(post: GbpPost): void {
    this.runAction(this.gbp.publishPost(this.tenantId, post.id), (r) =>
      (r as GbpPost).mock_provider
        ? 'Accepted by the mock Google provider — nothing was sent to a real Google profile.'
        : 'Published to Google.',
    );
  }

  remove(post: GbpPost): void {
    if (!confirmDelete('this Google post draft')) {
      return;
    }
    this.runAction(this.gbp.deletePost(this.tenantId, post.id), 'Draft deleted.');
  }

  private runAction(request: Observable<unknown>, success: string | ((result: unknown) => string)): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    request.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.notice.set(typeof success === 'function' ? success(result) : success);
        this.load(false);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(apiErrorMessage(err));
        // The attempt (failed/unknown) is stored server-side — refresh to show its real state.
        this.load(false);
      },
    });
  }

  load(initial: boolean): void {
    if (initial) {
      this.loading.set(true);
    }
    this.loadError.set(null);
    this.gbp.listPosts(this.tenantId, this.locationId).subscribe({
      next: (res) => {
        this.posts.set(res.posts);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}