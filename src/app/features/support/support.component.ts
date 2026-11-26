import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { SupportService } from '../../core/support/support.service';
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_ALL_STATUSES, SupportCategory, SupportPriority, SupportStatus, SupportTicket } from '../../core/support/support.models';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { TableExportColumn, TableExportComponent } from '../../shared/table/table-export.component';

/**
 * `/app/:tenantId/support` — blueprint §02 M11, §10.4. List + create screen
 * for in-app support tickets. Any ACTIVE tenant member may create/list/view
 * tickets (no owner/admin gate server-side — see `SupportService` docblock),
 * so this screen does not hide the create form behind a role check.
 */
@Component({
  selector: 'app-support',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    PaginationComponent,
    TableExportComponent,
  ],
  template: `
    <section class="support">
      <app-page-header
        eyebrow="Support"
        eyebrowLabel="Tickets"
        title="Support"
        subtitle="Create and track support requests for this business."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="layout">
          <div class="list-pane card">
            <div class="pane-head">
              <h2>Your tickets</h2>
              <span class="ticket-count">{{ filteredTickets().length }} of {{ tickets().length }}</span>
            </div>

            <div class="list-toolbar">
              <input
                type="search"
                class="list-search"
                placeholder="Search by subject…"
                [value]="searchTerm()"
                (input)="onSearchInput($event)"
              />
              <label class="status-filter">
                <span>Status</span>
                <select [value]="statusFilter()" (change)="onStatusFilterChange($event)">
                  <option value="">All</option>
                  @for (status of statusOptions; track status) {
                    <option [value]="status">{{ formatLabel(status) }}</option>
                  }
                </select>
              </label>
              <ui-table-export
                [data]="filteredTickets()"
                [columns]="supportExportColumns"
                filename="support_tickets"
                [loading]="loading()"
                (refresh)="refresh()"
              />
              <button type="button" class="btn-primary btn-sm add-ticket-btn" (click)="openCreateModal()" data-testid="add-ticket-btn">
                + Add ticket
              </button>
            </div>

            @if (createNotice()) {
              <p class="form-success" role="status">{{ createNotice() }}</p>
            }

            @if (loading()) {
              <app-skeleton-loader [rows]="4" />
            } @else if (loadError()) {
              <p class="form-error" role="alert">{{ loadError() }}</p>
            } @else if (tickets().length === 0) {
              <app-empty-state icon="support" title="No tickets yet" message="Support requests you create will show up here." />
            } @else if (filteredTickets().length === 0) {
              <p class="empty">No tickets match "{{ searchTerm() }}".</p>
            } @else {
              <div class="ticket-list">
                @for (ticket of pagedTickets(); track ticket.id) {
                  <a class="list-row" [routerLink]="['/app', tenantId(), 'support', ticket.id]">
                    <span class="avatar-initial" [class]="avatarTintClass(ticket.id)">
                      {{ ticket.subject.trim() ? ticket.subject.trim()[0].toUpperCase() : '•' }}
                    </span>
                    <span class="list-row-main">
                      <span class="list-row-title">{{ ticket.subject }}</span>
                      <span class="list-row-subtitle">
                        {{ formatLabel(ticket.category) }} · {{ formatLabel(ticket.priority) }} priority
                      </span>
                    </span>
                    <span class="badge badge--dot" [class]="ticketBadgeClass(ticket.status)">
                      {{ formatLabel(ticket.status) }}
                    </span>
                    <span class="list-row-chevron" aria-hidden="true">
                      <ui-icon name="link" [size]="14" />
                    </span>
                  </a>
                }
              </div>
              <app-pagination
                [totalItems]="filteredTickets().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event); page.set(1)"
              />
            }
          </div>

        </div>

        @if (showCreateModal()) {
          <div class="modal-backdrop" (click)="closeCreateModal()">
            <div
              class="modal-dialog card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-ticket-title"
              (click)="$event.stopPropagation()"
            >
              <div class="modal-head">
                <div>
                  <h2 id="new-ticket-title">New ticket</h2>
                  <p class="pane-sub">Tell us what you need help with and our team will respond.</p>
                </div>
                <button type="button" class="modal-close" (click)="closeCreateModal()" aria-label="Close">✕</button>
              </div>
              <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
                <div class="form-row">
                  <label class="field">
                    <span>Category</span>
                    <select formControlName="category">
                      @for (category of categoryOptions; track category) {
                        <option [value]="category">{{ formatLabel(category) }}</option>
                      }
                    </select>
                  </label>

                  <label class="field">
                    <span>Priority</span>
                    <select formControlName="priority">
                      @for (priority of priorityOptions; track priority) {
                        <option [value]="priority">{{ formatLabel(priority) }}</option>
                      }
                    </select>
                  </label>
                </div>
                @if (fieldError('category')) {
                  <p class="field-error">{{ fieldError('category') }}</p>
                }

                <label class="field">
                  <span>Subject</span>
                  <input type="text" formControlName="subject" placeholder="Brief summary of your issue" />
                </label>
                @if (fieldError('subject')) {
                  <p class="field-error">{{ fieldError('subject') }}</p>
                }

                <label class="field">
                  <span>Message</span>
                  <textarea
                    formControlName="body"
                    rows="5"
                    placeholder="Describe what happened, steps to reproduce, or any relevant details…"
                  ></textarea>
                </label>
                @if (fieldError('body')) {
                  <p class="field-error">{{ fieldError('body') }}</p>
                }

                @if (errorMessage() && !hasFieldErrors()) {
                  <p class="form-error" role="alert">{{ errorMessage() }}</p>
                }

                <div class="modal-actions">
                  <button type="button" class="btn-secondary btn-sm" (click)="closeCreateModal()" [disabled]="submitting()">
                    Cancel
                  </button>
                  <button type="submit" class="btn-primary submit-btn" [disabled]="form.invalid || submitting()">
                    {{ submitting() ? 'Creating…' : 'Create ticket' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      .support {
        font-family: var(--font-sans);
        width: 100%;
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-5);
        align-items: start;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        z-index: 60;
      }
      .modal-dialog {
        width: 100%;
        max-width: 540px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        box-shadow: var(--shadow-lg);
      }
      .modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .modal-head h2 {
        margin: 0;
        font-size: var(--text-md, 1rem);
        font-weight: var(--font-semibold);
      }
      .modal-close {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        color: var(--color-text-muted);
        width: 28px;
        height: 28px;
        padding: 0;
        cursor: pointer;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .list-pane,
      .create-pane {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      @media (max-width: 960px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
      .pane-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .pane-head h2,
      .create-pane h2 {
        margin: 0;
        font-size: var(--text-md, 1rem);
        font-weight: var(--font-semibold);
      }
      .pane-sub {
        margin: -4px 0 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .ticket-count {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .list-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--space-2);
      }
      .list-search {
        flex: 0 1 240px;
        width: 240px;
        min-width: 180px;
        max-width: 260px;
      }
      .add-ticket-btn {
        margin-left: auto;
      }
      .status-filter {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .ticket-list {
        display: flex;
        flex-direction: column;
      }
      .support .list-row {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto 18px;
        align-items: center;
        gap: var(--space-3);
      }
      .list-row-main {
        min-width: 0;
      }
      .list-row-title {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .list-row-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
      }
      @media (max-width: 520px) {
        .form-row {
          grid-template-columns: 1fr;
        }
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--color-text);
      }
      .empty {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        margin: var(--space-2) 0;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .submit-btn {
        width: 100%;
        justify-content: center;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .form-success {
        color: var(--color-success);
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        margin: 0;
        font-size: var(--text-sm);
      }
    `,
  ],
})
export class SupportComponent implements OnInit {
  /** Maps a support-ticket status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  ticketBadgeClass(status: string): string {
    switch (status) {
      case 'resolved':
      case 'closed':
        return 'badge--success';
      case 'waiting_customer':
        return 'badge--warning';
      case 'open':
        return 'badge--info';
      default:
        return 'badge--neutral';
    }
  }

  readonly categoryOptions = SUPPORT_CATEGORIES;
  readonly priorityOptions = SUPPORT_PRIORITIES;
  readonly statusOptions = SUPPORT_ALL_STATUSES;

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  readonly tickets = signal<SupportTicket[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly statusFilter = signal<SupportStatus | ''>('');
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly supportExportColumns: TableExportColumn[] = [
    { key: 'subject', label: 'Subject' },
    { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
  ];

  /** Client-side filter over the already-fetched page of tickets — real data already in memory, no extra API call. */
  readonly filteredTickets = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) {
      return this.tickets();
    }
    return this.tickets().filter((ticket) => ticket.subject.toLowerCase().includes(q));
  });

  readonly pagedTickets = computed(() => paginateItems(this.filteredTickets(), this.page(), this.pageSize()));

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  /** Stable hash of a real field onto one of 5 existing avatar tints — same ticket always gets the same color. */
  avatarTintClass(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const index = hash % 5;
    return index === 0 ? '' : `avatar-initial--${index}`;
  }

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    category: ['other' as SupportCategory, [Validators.required]],
    priority: ['normal' as SupportPriority, [Validators.required]],
    subject: ['', [Validators.required]],
    body: ['', [Validators.required]],
  });

  readonly submitting = signal(false);
  readonly showCreateModal = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly createNotice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  formatLabel(value: string): string {
    return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly support: SupportService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Deep link from Billing ("?category=billing") pre-selects the ticket category.
    const requested = this.route.snapshot.queryParamMap.get('category');
    if (requested && (SUPPORT_CATEGORIES as readonly string[]).includes(requested)) {
      this.form.patchValue({ category: requested as SupportCategory });
    }
    this.refresh();
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as SupportStatus | '');
    this.refresh();
  }

  refresh(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    const status = this.statusFilter() || undefined;
    this.support.list(tenantId, status).subscribe({
      next: (tickets) => {
        this.loading.set(false);
        this.tickets.set(tickets);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  openCreateModal(): void {
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    if (!this.submitting()) {
      this.showCreateModal.set(false);
    }
  }

  submit(): void {
    const tenantId = this.tenantId();
    if (this.form.invalid || this.submitting() || !tenantId) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.createNotice.set(null);
    this.fieldErrors.set(null);

    const { category, priority, subject, body } = this.form.getRawValue();
    this.support.create(tenantId, { category, priority, subject, body }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showCreateModal.set(false);
        this.createNotice.set('Support ticket created.');
        this.form.reset({ category: 'other', priority: 'normal', subject: '', body: '' });
        this.refresh();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }
}
