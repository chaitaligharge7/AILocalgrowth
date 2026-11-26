import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FeedbackItem, HelpArticle } from '../../core/admin/platform-console.service';
import { HelpService } from '../../core/help/help.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * `/app/:tenantId/help` — searchable help centre (articles written by the
 * platform team) and a form to send feedback to them. Feedback is stored and
 * triaged by a human; there is no automatic reply.
 */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [DatePipe, RouterLink, ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="help">
      <app-page-header eyebrow="Support" eyebrowLabel="Help centre" title="Help centre" subtitle="Guides from the Scriptlet team, and a way to tell us what to improve." />
      <p class="meta">
        <a [routerLink]="['/app', tenantId(), 'support']">Open a support ticket</a> ·
        <a [routerLink]="['/app', tenantId(), 'verification']">Business verification</a>
      </p>

      <div class="search">
        <label>Search guides <input data-testid="help-search" type="search" [value]="query()" (input)="onSearch($any($event.target).value)" placeholder="e.g. invoices, Google, roles" /></label>
        <label>Category
          <select data-testid="help-category" (change)="onCategory($any($event.target).value)">
            <option value="">All</option>
            @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
        </label>
      </div>

      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (articles().length === 0) {
        <app-empty-state icon="support" title="No guides found" message="Try a different search, or send us feedback below." />
      } @else {
        <div class="list" data-testid="help-list">
          @for (a of articles(); track a.id) {
            <article class="card">
              <h3><button type="button" class="link" (click)="open(a)">{{ a.title }}</button></h3>
              <p class="meta">{{ a.category }}</p>
              <p>{{ a.summary }}</p>
            </article>
          }
        </div>
      }

      @if (current(); as art) {
        <article class="card reading" data-testid="help-article">
          <h2>{{ art.title }}</h2>
          <p class="meta">{{ art.category }}@if (art.published_at) { · {{ art.published_at | date: 'mediumDate' }} }</p>
          <div class="body">{{ art.body }}</div>
          <button type="button" (click)="current.set(null)">Close</button>
        </article>
      }

      <form class="card form" [formGroup]="form" (ngSubmit)="send()" data-testid="feedback-form">
        <h2>Send feedback</h2>
        <label>Type
          <select formControlName="category">
            <option value="idea">Idea</option><option value="bug">Problem</option><option value="question">Question</option>
            <option value="praise">Praise</option><option value="other">Other</option>
          </select>
        </label>
        <label>Rating (optional)
          <select formControlName="rating"><option value="">—</option>@for (n of [1, 2, 3, 4, 5]; track n) { <option [value]="n">{{ n }}</option> }</select>
        </label>
        <label class="wide">Message <textarea rows="4" formControlName="message" maxlength="2000"></textarea></label>
        @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
        @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
        <button type="submit" [disabled]="form.invalid || sending()">Send feedback</button>
      </form>

      @if (mine().length > 0) {
        <div class="card" data-testid="my-feedback">
          <h2>Your feedback</h2>
          @for (f of mine(); track f.id) {
            <div class="fb">
              <strong>{{ f.category }}</strong> · {{ f.status }} · <span class="meta">{{ f.created_at | date: 'medium' }}</span>
              <p>{{ f.message }}</p>
              @if (f.admin_note) { <p class="meta">Reply from the team: {{ f.admin_note }}</p> }
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .help { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .search, .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; align-items: end; }
      .form h2, .form button, .form p, .form .wide { grid-column: 1 / -1; margin: 0; }
      label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
      input, select, textarea { padding: 0.45rem; font: inherit; }
      .list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
      .card h3 { margin: 0 0 0.25rem; font-size: 1rem; }
      .link { background: none; border: 0; padding: 0; font: inherit; font-weight: 700; color: var(--color-primary); cursor: pointer; text-align: left; }
      .meta { color: var(--color-text-muted); font-size: 0.8rem; }
      .body { white-space: pre-line; line-height: 1.6; }
      .form-error { color: #b00020; }
      .notice { color: var(--color-primary); }
      .fb { border-top: 1px solid var(--color-border); padding-top: 0.5rem; margin-top: 0.5rem; }
      button { padding: 0.45rem 0.9rem; cursor: pointer; }
    `,
  ],
})
export class HelpComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(HelpService);
  private readonly currentTenant = inject(CurrentTenantService);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly articles = signal<HelpArticle[]>([]);
  readonly categories = signal<string[]>([]);
  readonly current = signal<HelpArticle | null>(null);
  readonly mine = signal<FeedbackItem[]>([]);
  readonly query = signal('');
  readonly category = signal('');
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    category: ['idea'],
    rating: [''],
    message: ['', [Validators.required, Validators.maxLength(2000)]],
  });
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
    this.loadMine();
  }

  onSearch(value: string): void {
    this.query.set(value);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.load(), 250);
  }

  onCategory(value: string): void {
    this.category.set(value);
    this.load();
  }

  open(a: HelpArticle): void {
    this.api.article(a.slug).subscribe({
      next: (full) => this.current.set(full),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  send(): void {
    const id = this.tenantId();
    if (this.form.invalid || !id) {
      return;
    }
    const v = this.form.getRawValue();
    this.sending.set(true);
    this.formError.set(null);
    this.notice.set(null);
    this.api.submitFeedback(id, { category: v.category, message: v.message.trim(), rating: v.rating ? Number(v.rating) : null }).subscribe({
      next: () => {
        this.sending.set(false);
        this.notice.set('Thanks — your feedback was sent to the Scriptlet team.');
        this.form.reset({ category: 'idea', rating: '', message: '' });
        this.loadMine();
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.formError.set(Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.articles(this.query().trim() || undefined, this.category() || undefined).subscribe({
      next: (d) => {
        this.articles.set(d.articles);
        this.categories.set(d.categories);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  private loadMine(): void {
    const id = this.tenantId();
    if (!id) {
      return;
    }
    this.api.myFeedback(id).subscribe({ next: (rows) => this.mine.set(rows), error: () => undefined });
  }
}
