import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AgencyReviewRow,
  AgencyReviewStatus,
  ArticleStatus,
  FeedbackItem,
  FeedbackStatus,
  HelpArticle,
  PlatformConsoleService,
  PlatformOrder,
  PrivacyOverview,
  Reconciliation,
  Verification,
} from '../../../core/admin/platform-console.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../../shared/icons/icon.component';

const STYLES = `
  .page { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
  .card h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .meta { color: var(--color-text-muted); font-size: 0.8rem; }
  .filters { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; }
  label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
  .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; align-items: end; }
  .form h2, .form button, .form .form-error, .form .wide { grid-column: 1 / -1; margin: 0; }
  input, select, textarea { padding: 0.4rem; font: inherit; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
  th { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
  .form-error { color: #b00020; }
  button { padding: 0.4rem 0.8rem; cursor: pointer; }
  .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .mock { display: inline-block; background: var(--color-gold, #d6a354); color: #0b1f38; font-weight: 700; font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 999px; }
`;

const DAYS = [7, 30, 90, 365];

/** Prompts for the mandatory audit reason; null when the admin cancels or leaves it empty. */
function askReason(question: string): string | null {
  const reason = window.prompt(question);
  return reason && reason.trim() ? reason.trim() : null;
}

/** `/admin/help` — write, publish and archive help-centre articles. */
@Component({
  selector: 'app-admin-help-articles',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, IconComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" title="Help centre" subtitle="Articles businesses read under Help. Only published articles are visible to them." />
      <div class="filters">
        <label>Status
          <select data-testid="help-status" (change)="setStatus($any($event.target).value)">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (items().length === 0) {
        <app-empty-state icon="content" title="No articles" message="Write the first article below." />
      } @else {
        <div class="card">
          <table data-testid="help-table">
            <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              @for (a of items(); track a.id) {
                <tr>
                  <td><strong>{{ a.title }}</strong><div class="meta">/{{ a.slug }}</div></td>
                  <td>{{ a.category }}</td>
                  <td>{{ a.status }}</td>
                  <td>{{ a.updated_at | date: 'medium' }}</td>
                  <td class="actions">
                    <button type="button" class="action-icon-btn" (click)="edit(a)" title="Edit article" aria-label="Edit article">
                      <ui-icon name="edit" [size]="14" />
                      <span class="sr-only">Edit</span>
                    </button>
                    @if (a.status !== 'published') { <button type="button" data-testid="publish" (click)="move(a, 'published')">Publish</button> }
                    @if (a.status === 'published') { <button type="button" (click)="move(a, 'draft')">Unpublish</button> }
                    @if (a.status !== 'archived') { <button type="button" (click)="move(a, 'archived')">Archive</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <form class="card form" [formGroup]="form" (ngSubmit)="save()" data-testid="help-form">
        <h2>{{ editingId() ? 'Edit article' : 'New article' }}</h2>
        <label>Title <input formControlName="title" /></label>
        <label>Category <input formControlName="category" /></label>
        <label>Slug (optional) <input formControlName="slug" [readOnly]="!!editingId()" /></label>
        <label class="wide">Summary <input formControlName="summary" /></label>
        <label class="wide">Body <textarea rows="8" formControlName="body"></textarea></label>
        <label class="wide">Keywords <input formControlName="keywords" /></label>
        <label class="wide">Reason (audit) <input formControlName="reason" /></label>
        @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
        <button type="submit" [disabled]="form.invalid || saving()">{{ editingId() ? 'Save changes' : 'Create draft' }}</button>
        @if (editingId()) { <button type="button" (click)="cancel()">Cancel edit</button> }
      </form>
    </section>
  `,
  styles: [STYLES],
})
export class AdminHelpArticlesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PlatformConsoleService);
  readonly items = signal<HelpArticle[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  private statusFilter: ArticleStatus | undefined;
  readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    category: ['general', Validators.required],
    slug: [''],
    summary: [''],
    body: ['', Validators.required],
    keywords: [''],
    reason: ['', Validators.required],
  });

  ngOnInit(): void {
    this.load();
  }

  setStatus(value: string): void {
    this.statusFilter = (value || undefined) as ArticleStatus | undefined;
    this.load();
  }

  edit(a: HelpArticle): void {
    this.api.article(a.id).subscribe({
      next: (full) => {
        this.editingId.set(full.id);
        this.form.reset({ title: full.title, category: full.category, slug: full.slug, summary: full.summary, body: full.body ?? '', keywords: full.keywords, reason: '' });
      },
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  cancel(): void {
    this.editingId.set(null);
    this.form.reset({ title: '', category: 'general', slug: '', summary: '', body: '', keywords: '', reason: '' });
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const input = { title: v.title.trim(), category: v.category.trim(), summary: v.summary.trim(), body: v.body.trim(), keywords: v.keywords.trim(), reason: v.reason.trim() };
    const id = this.editingId();
    this.saving.set(true);
    this.formError.set(null);
    const call = id ? this.api.updateArticle(id, input) : this.api.createArticle({ ...input, slug: v.slug.trim() || undefined });
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancel();
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err));
      },
    });
  }

  move(a: HelpArticle, status: ArticleStatus): void {
    const reason = askReason(`Why set "${a.title}" to ${status}?`);
    if (!reason) {
      return;
    }
    this.api.setArticleStatus(a.id, status, reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.articles(this.statusFilter).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

/** `/admin/feedback` — what businesses told the platform team, with triage. */
@Component({
  selector: 'app-admin-feedback',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" title="Customer feedback" subtitle="Messages from businesses. Triage them and leave a note the business can read." />
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (data(); as d) {
        <div class="stats" data-testid="feedback-stats">
          <app-stat-card label="New" [value]="d.counts.new" />
          <app-stat-card label="Triaged" [value]="d.counts.triaged" />
          <app-stat-card label="Resolved" [value]="d.counts.resolved" />
          <app-stat-card label="Dismissed" [value]="d.counts.dismissed" />
        </div>
        <div class="filters">
          <label>Status
            <select data-testid="feedback-status" (change)="setStatus($any($event.target).value)">
              <option value="">All</option>
              <option value="new">New</option>
              <option value="triaged">Triaged</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
        </div>
        @if (d.feedback.length === 0) {
          <app-empty-state icon="support" title="No feedback" message="Nothing matches this filter." />
        } @else {
          <div class="card">
            <table data-testid="feedback-table">
              <thead><tr><th>Business</th><th>Category</th><th>Message</th><th>Status</th><th>Received</th><th>Actions</th></tr></thead>
              <tbody>
                @for (f of d.feedback; track f.id) {
                  <tr>
                    <td>{{ f.tenant_name }}</td>
                    <td>{{ f.category }}@if (f.rating) { <div class="meta">{{ f.rating }}/5</div> }</td>
                    <td>{{ f.message }}@if (f.admin_note) { <div class="meta">Note: {{ f.admin_note }}</div> }</td>
                    <td>{{ f.status }}</td>
                    <td>{{ f.created_at | date: 'medium' }}</td>
                    <td class="actions">
                      <button type="button" (click)="triage(f, 'triaged')">Triage</button>
                      <button type="button" data-testid="resolve" (click)="triage(f, 'resolved')">Resolve</button>
                      <button type="button" (click)="triage(f, 'dismissed')">Dismiss</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (!error()) {
        <app-skeleton-loader [rows]="4" />
      }
    </section>
  `,
  styles: [STYLES],
})
export class AdminFeedbackComponent implements OnInit {
  private readonly api = inject(PlatformConsoleService);
  readonly data = signal<{ counts: Record<FeedbackStatus, number>; feedback: FeedbackItem[] } | null>(null);
  readonly error = signal<string | null>(null);
  private filter: FeedbackStatus | undefined;

  ngOnInit(): void {
    this.load();
  }

  setStatus(value: string): void {
    this.filter = (value || undefined) as FeedbackStatus | undefined;
    this.load();
  }

  triage(f: FeedbackItem, status: FeedbackStatus): void {
    const reason = askReason(`Reason for marking this feedback ${status}?`);
    if (!reason) {
      return;
    }
    const note = window.prompt('Note the business can read (optional):') ?? '';
    this.api.triageFeedback(f.id, status, note.trim(), reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  private load(): void {
    this.api.feedback(this.filter).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}

/** `/admin/verifications` — self-declared business details to accept or reject, plus the agency review record. */
@Component({
  selector: 'app-admin-verifications',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" title="Verification and agency review" subtitle="Details are self-declared and are not checked against any government registry." />
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      <div class="card">
        <h2>Business verification</h2>
        @if (verifications() === null) {
          <app-skeleton-loader [rows]="3" />
        } @else if (verifications()!.length === 0) {
          <app-empty-state icon="business" title="Nothing submitted" message="No business has submitted verification details." />
        } @else {
          <table data-testid="verification-table">
            <thead><tr><th>Business</th><th>Legal name</th><th>GSTIN</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              @for (v of verifications()!; track v.id) {
                <tr>
                  <td>{{ v.tenant_name }}</td>
                  <td>{{ v.legal_name }}@if (v.website_url) { <div class="meta">{{ v.website_url }}</div> }</td>
                  <td>{{ v.gstin ?? '—' }}</td>
                  <td>{{ v.status }}@if (v.review_note) { <div class="meta">{{ v.review_note }}</div> }</td>
                  <td>{{ v.submitted_at | date: 'medium' }}</td>
                  <td class="actions">
                    @if (v.status === 'submitted') {
                      <button type="button" data-testid="verify" (click)="decide(v, 'verified')">Verify</button>
                      <button type="button" (click)="decide(v, 'rejected')">Reject</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
      <div class="card">
        <h2>Agency accounts</h2>
        @if (agencies() === null) {
          <app-skeleton-loader [rows]="3" />
        } @else if (agencies()!.length === 0) {
          <app-empty-state icon="clients" title="No agencies" message="No agency account exists yet." />
        } @else {
          <table data-testid="agency-table">
            <thead><tr><th>Agency</th><th>Owner business</th><th>Active clients</th><th>Review</th><th>Actions</th></tr></thead>
            <tbody>
              @for (a of agencies()!; track a.id) {
                <tr>
                  <td>{{ a.brand_name }}</td>
                  <td>{{ a.owner_tenant_name }}</td>
                  <td>{{ a.active_clients }}</td>
                  <td>{{ a.review_status }}@if (a.review_note) { <div class="meta">{{ a.review_note }}</div> }</td>
                  <td class="actions">
                    <button type="button" data-testid="approve-agency" (click)="review(a, 'approved')">Approve</button>
                    <button type="button" (click)="review(a, 'rejected')">Reject</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <p class="meta">{{ agencyNote() }}</p>
        }
      </div>
    </section>
  `,
  styles: [STYLES],
})
export class AdminVerificationsComponent implements OnInit {
  private readonly api = inject(PlatformConsoleService);
  readonly verifications = signal<Verification[] | null>(null);
  readonly agencies = signal<AgencyReviewRow[] | null>(null);
  readonly agencyNote = signal('');
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  decide(v: Verification, decision: 'verified' | 'rejected'): void {
    const reason = askReason(`Reason for marking ${v.legal_name} ${decision}?`);
    if (!reason) {
      return;
    }
    const note = decision === 'rejected' ? (window.prompt('Note the business will see (required):') ?? '').trim() : '';
    if (decision === 'rejected' && !note) {
      return;
    }
    this.api.decideVerification(v.id, decision, note, reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  review(a: AgencyReviewRow, status: AgencyReviewStatus): void {
    const reason = askReason(`Reason for marking ${a.brand_name} ${status}?`);
    if (!reason) {
      return;
    }
    const note = (window.prompt('Note (optional):') ?? '').trim();
    this.api.reviewAgency(a.id, status, note, reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  private load(): void {
    this.api.verifications().subscribe({
      next: (rows) => this.verifications.set(rows),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
    this.api.agencyReviews().subscribe({
      next: (d) => {
        this.agencies.set(d.agencies);
        this.agencyNote.set(d.notes[0] ?? '');
      },
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}

/** `/admin/billing` — orders, payments and invoices reconciled from the stored rows. Read-only. */
@Component({
  selector: 'app-admin-billing-recon',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" title="Billing reconciliation" subtitle="Orders, payments and invoices cross-checked from the stored rows." />
      <div class="filters">
        <label>Window
          <select data-testid="recon-days" (change)="setDays(+$any($event.target).value)">
            @for (d of dayOptions; track d) { <option [value]="d" [selected]="d === days()">Last {{ d }} days</option> }
          </select>
        </label>
        @if (data()?.mock_provider) { <span class="mock" data-testid="mock-badge">MOCK_PROVIDER — figures are mock data</span> }
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <app-skeleton-loader [rows]="4" />
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="recon-stats">
          <app-stat-card label="Captured payments without invoice" [value]="d.discrepancies.captured_payments_without_invoice.count" />
          <app-stat-card label="Invoice total ≠ payment" [value]="d.discrepancies.invoice_total_differs_from_payment.count" />
          <app-stat-card label="Paid orders without payment" [value]="d.discrepancies.paid_orders_without_payment.count" />
        </div>
        <div class="card">
          <h2>Totals by status</h2>
          <table data-testid="recon-totals">
            <thead><tr><th>Kind</th><th>Status</th><th>Currency</th><th>Count</th><th>Total</th></tr></thead>
            <tbody>
              @for (r of d.orders; track 'o' + r.status + r.currency) { <tr><td>Orders</td><td>{{ r.status }}</td><td>{{ r.currency }}</td><td>{{ r.count }}</td><td>{{ r.total }}</td></tr> }
              @for (r of d.payments; track 'p' + r.status + r.currency) { <tr><td>Payments</td><td>{{ r.status }}</td><td>{{ r.currency }}</td><td>{{ r.count }}</td><td>{{ r.total }}</td></tr> }
              @for (r of d.invoices; track 'i' + r.status + r.currency) { <tr><td>Invoices</td><td>{{ r.status }}</td><td>{{ r.currency }}</td><td>{{ r.count }}</td><td>{{ r.total }}</td></tr> }
            </tbody>
          </table>
          @if (d.orders.length + d.payments.length + d.invoices.length === 0) {
            <app-empty-state icon="subscription" title="No billing activity" message="No orders, payments or invoices in this window." />
          }
        </div>
        <div class="card">
          <h2>Paid orders without a payment row</h2>
          @if (d.discrepancies.paid_orders_without_payment.items.length === 0) {
            <p class="meta">None.</p>
          } @else {
            <table data-testid="orphan-orders">
              <thead><tr><th>Business</th><th>Order</th><th>Amount</th></tr></thead>
              <tbody>
                @for (i of d.discrepancies.paid_orders_without_payment.items; track i.id) { <tr><td>{{ i.tenant_name }}</td><td>{{ i.external_order_id }}</td><td>{{ i.amount }} {{ i.currency }}</td></tr> }
              </tbody>
            </table>
          }
        </div>
        <div class="card">
          <h2>Captured payments without an invoice</h2>
          @if (d.discrepancies.captured_payments_without_invoice.items.length === 0) {
            <p class="meta">None.</p>
          } @else {
            <table>
              <thead><tr><th>Business</th><th>Payment</th><th>Amount</th></tr></thead>
              <tbody>
                @for (i of d.discrepancies.captured_payments_without_invoice.items; track i.id) { <tr><td>{{ i.tenant_name }}</td><td>{{ i.provider_payment_id }}</td><td>{{ i.amount }} {{ i.currency }}</td></tr> }
              </tbody>
            </table>
          }
        </div>
        <div class="card">
          <h2>Invoice total differs from payment</h2>
          @if (d.discrepancies.invoice_total_differs_from_payment.items.length === 0) {
            <p class="meta">None.</p>
          } @else {
            <table>
              <thead><tr><th>Business</th><th>Invoice</th><th>Invoice total</th><th>Payment</th></tr></thead>
              <tbody>
                @for (i of d.discrepancies.invoice_total_differs_from_payment.items; track i.invoice_id) { <tr><td>{{ i.tenant_name }}</td><td>{{ i.invoice_number }}</td><td>{{ i.invoice_total }}</td><td>{{ i.payment_amount }}</td></tr> }
              </tbody>
            </table>
          }
        </div>
        <div class="card">
          <h2>Recent orders</h2>
          @if (orders().length === 0) {
            <p class="meta">No orders in this window.</p>
          } @else {
            <table data-testid="orders-table">
              <thead><tr><th>Business</th><th>Order</th><th>Amount</th><th>Status</th><th>Payments</th><th>Created</th></tr></thead>
              <tbody>
                @for (o of orders(); track o.id) {
                  <tr><td>{{ o.tenant_name }}</td><td>{{ o.external_order_id ?? '—' }}</td><td>{{ o.amount }} {{ o.currency }}</td><td>{{ o.status }}</td><td>{{ o.payment_count }}</td><td>{{ o.created_at | date: 'medium' }}</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
        @for (n of d.notes; track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AdminBillingReconComponent implements OnInit {
  private readonly api = inject(PlatformConsoleService);
  readonly dayOptions = DAYS;
  readonly days = signal(30);
  readonly data = signal<Reconciliation | null>(null);
  readonly orders = signal<PlatformOrder[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  private load(): void {
    this.data.set(null);
    this.api.reconciliation(this.days()).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
    this.api.orders(this.days()).subscribe({
      next: (d) => this.orders.set(d.orders),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}

/** `/admin/privacy` — data export and erasure requests across businesses, with status handling. */
@Component({
  selector: 'app-admin-privacy',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" title="Privacy requests" subtitle="Data export and erasure requests. They are fulfilled by hand; marking one completed records that it was." />
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <app-skeleton-loader [rows]="4" />
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="privacy-stats">
          <app-stat-card label="Pending" [value]="d.counts.pending" />
          <app-stat-card label="In progress" [value]="d.counts.in_progress" />
          <app-stat-card label="Completed" [value]="d.counts.completed" />
          <app-stat-card label="Rejected" [value]="d.counts.rejected" />
        </div>
        @if (d.requests.length === 0) {
          <app-empty-state icon="security" title="No requests" message="No business has made a data request." />
        } @else {
          <div class="card">
            <table data-testid="privacy-table">
              <thead><tr><th>Business</th><th>Type</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>
                @for (r of d.requests; track r.id) {
                  <tr>
                    <td>{{ r.tenant_name }}</td><td>{{ r.type }}</td><td>{{ r.status }}</td><td>{{ r.requested_at | date: 'medium' }}</td>
                    <td class="actions">
                      @if (r.status === 'pending' || r.status === 'in_progress') {
                        @if (r.status === 'pending') { <button type="button" (click)="move(r, 'in_progress')">Start</button> }
                        <button type="button" data-testid="complete" (click)="move(r, 'completed')">Mark completed</button>
                        <button type="button" (click)="move(r, 'rejected')">Reject</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <div class="card">
          <h2>Privacy-related activity (last {{ d.days }} days)</h2>
          @if (d.audit_activity.length === 0) { <p class="meta">No recorded activity.</p> }
          @for (a of d.audit_activity; track a.action) { <p>{{ a.action }} — {{ a.count }}</p> }
        </div>
        @for (n of d.notes; track n) { <p class="meta">{{ n }}</p> }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AdminPrivacyComponent implements OnInit {
  private readonly api = inject(PlatformConsoleService);
  readonly data = signal<PrivacyOverview | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  move(r: { id: string; tenant_name: string }, status: 'in_progress' | 'completed' | 'rejected'): void {
    const reason = askReason(`Reason for marking the request from ${r.tenant_name} ${status}?`);
    if (!reason) {
      return;
    }
    this.api.setPrivacyStatus(r.id, status, reason).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  private load(): void {
    this.api.privacy(30).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}
