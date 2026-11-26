import { DatePipe, KeyValuePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { AiUsage, Announcement, PlatformAdminUser, SupportReport } from '../../../core/admin/platform-ops.models';
import { PlatformOpsService } from '../../../core/admin/platform-ops.service';
import { localNowDateTimeString } from '../../../core/utils/date.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../../shared/icons/icon.component';

const STYLES = `
  .page { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-3); }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
  .card h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .row { display: flex; justify-content: space-between; margin: 0.25rem 0; }
  .meta { color: var(--color-text-muted); font-size: 0.8rem; }
  .filters label, .form label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
  .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; align-items: end; }
  .form h2, .form button, .form .form-error { grid-column: 1 / -1; margin: 0; }
  input, select, textarea { padding: 0.4rem; font: inherit; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
  th { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
  .form-error { color: #b00020; }
  .required { color: #b00020; }
  button { padding: 0.4rem 0.8rem; cursor: pointer; }
  .bar { height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden; min-width: 80px; }
  .bar > span { display: block; height: 100%; background: var(--color-primary); }
`;

const DAYS = [7, 14, 30, 60, 90];

/** `/admin/ai-usage` — AI generations, tokens, recorded cost and quota use (SA-032/038/040). */
@Component({
  selector: 'app-admin-ai-usage',
  standalone: true,
  imports: [StatCardComponent, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, DatePipe],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-032 / SA-038 / SA-040" title="AI usage" subtitle="Generations, tokens and quota use across all businesses." />
      <div class="filters">
        <label>Window
          <select data-testid="ai-days" [value]="days()" (change)="setDays(+$any($event.target).value)">
            @for (d of dayOptions; track d) { <option [value]="d">Last {{ d }} days</option> }
          </select>
        </label>
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <app-skeleton-loader [rows]="4" />
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="ai-stats">
          <app-stat-card label="Generations" [value]="d.totals.generations" />
          <app-stat-card label="Not completed" [value]="d.totals.not_completed" hint="Blocked by the safety filter or unfinished" />
          <app-stat-card label="Tokens in / out" [value]="d.totals.tokens_in + ' / ' + d.totals.tokens_out" />
          <app-stat-card label="Recorded cost" [value]="d.totals.recorded_cost" [hint]="d.totals.rows_with_recorded_cost + ' rows carry a cost'" />
        </div>
        <div class="card">
          <h2>By provider and model</h2>
          @if (d.by_provider_model.length === 0) {
            <app-empty-state icon="ai" title="No generations" message="Nothing was generated in this window." />
          } @else {
            <table data-testid="ai-models">
              <thead><tr><th>Provider</th><th>Model</th><th>Generations</th><th>Not completed</th><th>Tokens in</th><th>Tokens out</th><th>Recorded cost</th></tr></thead>
              <tbody>
                @for (m of d.by_provider_model; track m.provider + m.model) {
                  <tr><td>{{ m.provider }}</td><td>{{ m.model }}</td><td>{{ m.generations }}</td><td>{{ m.not_completed }}</td><td>{{ m.tokens_in }}</td><td>{{ m.tokens_out }}</td><td>{{ m.recorded_cost }}</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
        <div class="grid">
          <section class="card">
            <h2>By use case</h2>
            @for (u of d.by_use_case; track u.use_case) {
              <p class="row"><span>{{ u.use_case }}</span><strong>{{ u.generations }}@if (u.not_completed) { <span class="meta"> ({{ u.not_completed }} not completed)</span> }</strong></p>
            } @empty {
              <p class="meta">None.</p>
            }
          </section>
          <section class="card">
            <h2>Top businesses</h2>
            @for (t of d.top_tenants; track t.tenant_id) {
              <p class="row"><span>{{ t.tenant_name }}</span><strong>{{ t.generations }}</strong></p>
            } @empty {
              <p class="meta">None.</p>
            }
          </section>
          <section class="card">
            <h2>Quota use (current period)</h2>
            @for (q of d.quota; track q.meter_code) {
              <p class="row"><span>{{ q.meter_code }}</span><strong>{{ q.used_qty + q.reserved_qty }} / {{ q.limit_qty }}</strong></p>
              <div class="bar"><span [style.width.%]="pct(q.used_qty + q.reserved_qty, q.limit_qty)"></span></div>
              <p class="meta">{{ q.wallets }} wallets · {{ q.near_limit_wallets }} at 90%+</p>
            } @empty {
              <p class="meta">No usage wallets in the current period.</p>
            }
          </section>
        </div>
        <div class="card">
          <h2>Recent generations that did not complete</h2>
          @if (d.not_completed.length === 0) {
            <p class="meta">None in this window.</p>
          } @else {
            <table data-testid="ai-failures">
              <thead><tr><th>When</th><th>Business</th><th>Use case</th><th>Provider / model</th><th>Status</th></tr></thead>
              <tbody>
                @for (f of d.not_completed; track f.id) {
                  <tr><td>{{ f.created_at | date: 'd MMM, HH:mm' }}</td><td>{{ f.tenant_name }}</td><td>{{ f.use_case }}</td><td>{{ f.provider }} / {{ f.model }}</td><td>{{ f.status }}</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
        @for (n of d.notes; track n) {
          <p class="meta">{{ n }}</p>
        }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AdminAiUsageComponent implements OnInit {
  readonly dayOptions = DAYS;
  readonly days = signal(30);
  readonly data = signal<AiUsage | null>(null);
  readonly error = signal<string | null>(null);

  constructor(private readonly ops: PlatformOpsService) {}

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  pct(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }

  private load(): void {
    this.data.set(null);
    this.ops.aiUsage(this.days()).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}

/** `/admin/admins` — platform administrator roster (SA-061). Access is granted only from the server CLI; this page can only remove it. */
@Component({
  selector: 'app-admin-admins',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, DatePipe, IconComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-061 / SA-062" title="Administrators" subtitle="Everyone with platform admin access, their MFA state and live sessions." />
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (admins().length === 0) {
        <app-empty-state icon="team" title="No administrators" message="No platform administrators were found." />
      } @else {
        <div class="card">
          <table data-testid="admins-table">
            <thead><tr><th>Name</th><th>Email</th><th>MFA</th><th>Live sessions</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              @for (a of admins(); track a.id) {
                <tr>
                  <td>{{ a.name }}@if (a.is_you) { <span class="meta"> (you)</span> }</td>
                  <td>{{ a.email }}</td>
                  <td>{{ a.mfa_enrolled ? 'Enrolled' : 'Not enrolled' }}</td>
                  <td>{{ a.active_sessions }}</td>
                  <td>{{ a.last_login_at ? (a.last_login_at | date: 'd MMM y, HH:mm') : 'Never' }}</td>
                  <td>
                    @if (!a.is_you) {
                      <button type="button" class="btn-danger action-icon-btn" (click)="startRevoke(a)" title="Remove access" aria-label="Remove access">
                        <ui-icon name="trash" [size]="14" />
                        <span class="sr-only">Remove access</span>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (target()) {
        <form class="card form" [formGroup]="form" (ngSubmit)="confirmRevoke()" novalidate data-testid="revoke-form">
          <h2>Remove platform admin access for {{ target()!.name }}?</h2>
          <label>Reason <span class="required">(required)</span> <input formControlName="reason" /></label>
          @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
          <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Removing…' : 'Remove access' }}</button>
          <button type="button" (click)="target.set(null)">Cancel</button>
        </form>
      }
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @for (n of notes(); track n) { <p class="meta">{{ n }}</p> }
    </section>
  `,
  styles: [STYLES],
})
export class AdminAdminsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly admins = signal<PlatformAdminUser[]>([]);
  readonly notes = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly target = signal<PlatformAdminUser | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({ reason: ['', Validators.required] });

  constructor(
    private readonly ops: PlatformOpsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  startRevoke(admin: PlatformAdminUser): void {
    this.target.set(admin);
    this.form.reset({ reason: '' });
    this.formError.set(null);
  }

  confirmRevoke(): void {
    const t = this.target();
    if (!t || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.ops.revokeAdmin(t.id, this.form.getRawValue().reason.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.target.set(null);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.ops.admins().subscribe({
      next: (r) => {
        this.admins.set(r.admins);
        this.notes.set(r.notes);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

/** `/admin/announcements` — write platform announcements and maintenance notices (SA-057/058). */
@Component({
  selector: 'app-admin-announcements',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent, DatePipe],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-057 / SA-058" title="Announcements" subtitle="Notices every signed-in user sees at the top of their workspace." />
      <form class="card form" [formGroup]="form" (ngSubmit)="create()" novalidate data-testid="announcement-form">
        <h2>New notice</h2>
        <label>Type
          <select formControlName="kind"><option value="announcement">Announcement</option><option value="maintenance">Maintenance notice</option></select>
        </label>
        <label>Severity
          <select formControlName="severity"><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
        </label>
        <label>Title <input formControlName="title" maxlength="160" /></label>
        <label>Message <textarea formControlName="body" rows="2" maxlength="2000"></textarea></label>
        <label>Shows from <input type="datetime-local" formControlName="starts_at" [min]="minDateTime" /></label>
        <label>Shows until (optional) <input type="datetime-local" formControlName="ends_at" [min]="form.controls.starts_at.value || minDateTime" /></label>
        <label>Reason <span class="required">(required)</span> <input formControlName="reason" /></label>
        @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
        <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Publishing…' : 'Publish notice' }}</button>
      </form>
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (items().length === 0) {
        <app-empty-state icon="bell" title="No notices yet" message="Publish the first notice above." />
      } @else {
        <div class="card">
          <table data-testid="announcements-table">
            <thead><tr><th>Title</th><th>Type</th><th>Severity</th><th>Window</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              @for (a of items(); track a.id) {
                <tr>
                  <td>{{ a.title }}</td>
                  <td>{{ a.kind }}</td>
                  <td>{{ a.severity }}</td>
                  <td>{{ a.starts_at | date: 'd MMM y, HH:mm' }} → {{ a.ends_at ? (a.ends_at | date: 'd MMM y, HH:mm') : 'until retired' }}</td>
                  <td>{{ a.status }}</td>
                  <td>@if (a.status === 'active') { <button type="button" (click)="retire(a)">Retire</button> }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: [STYLES],
})
export class AdminAnnouncementsComponent implements OnInit {
  readonly minDateTime = localNowDateTimeString();
  private readonly fb = inject(FormBuilder);
  readonly items = signal<Announcement[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    kind: ['announcement' as 'announcement' | 'maintenance'],
    severity: ['info' as 'info' | 'warning' | 'critical'],
    title: ['', Validators.required],
    body: [''],
    starts_at: [''],
    ends_at: [''],
    reason: ['', Validators.required],
  });

  constructor(
    private readonly ops: PlatformOpsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  create(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.ops
      .createAnnouncement({
        kind: v.kind,
        severity: v.severity,
        title: v.title.trim(),
        body: v.body.trim(),
        starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : undefined,
        ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : undefined,
        reason: v.reason.trim(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ kind: 'announcement', severity: 'info', title: '', body: '', starts_at: '', ends_at: '', reason: '' });
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err));
        },
      });
  }

  retire(item: Announcement): void {
    const reason = window.prompt(`Why retire "${item.title}"?`);
    if (!reason || !reason.trim()) {
      return;
    }
    this.ops.retireAnnouncement(item.id, reason.trim()).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.ops.announcements().subscribe({
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

/** `/admin/support-report` — ticket volume and resolution time from real timestamps (SA-060). No SLA targets are recorded. */
@Component({
  selector: 'app-admin-support-report',
  standalone: true,
  imports: [KeyValuePipe, StatCardComponent, PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="page">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-060" title="Support report" subtitle="Ticket volume, resolution time and the age of open tickets." />
      <div class="filters">
        <label>Window
          <select data-testid="support-days" [value]="days()" (change)="setDays(+$any($event.target).value)">
            @for (d of dayOptions; track d) { <option [value]="d">Last {{ d }} days</option> }
          </select>
        </label>
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <app-skeleton-loader [rows]="3" />
      } @else {
        @let d = data()!;
        <div class="stats" data-testid="support-stats">
          <app-stat-card label="Tickets created" [value]="d.created" />
          <app-stat-card label="Tickets closed" [value]="d.closed" />
          <app-stat-card label="Open now" [value]="d.open_now" />
          <app-stat-card label="Median resolution" [value]="d.resolution_hours ? d.resolution_hours.median + ' h' : 'No data'" [hint]="d.resolution_hours ? 'Average ' + d.resolution_hours.average + ' h · p90 ' + d.resolution_hours.p90 + ' h' : 'No ticket closed in this window'" />
        </div>
        <div class="grid">
          <section class="card">
            <h2>Age of open tickets</h2>
            <p class="row"><span>Under 1 day</span><strong>{{ d.open_age.under_1_day }}</strong></p>
            <p class="row"><span>1 to 3 days</span><strong>{{ d.open_age['1_to_3_days'] }}</strong></p>
            <p class="row"><span>3 to 7 days</span><strong>{{ d.open_age['3_to_7_days'] }}</strong></p>
            <p class="row"><span>Over 7 days</span><strong>{{ d.open_age.over_7_days }}</strong></p>
          </section>
          <section class="card">
            <h2>Created by category</h2>
            @for (row of d.created_by_category | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">None.</p>
            }
          </section>
          <section class="card">
            <h2>Created by priority</h2>
            @for (row of d.created_by_priority | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">None.</p>
            }
          </section>
          <section class="card">
            <h2>Open by category</h2>
            @for (row of d.open_by_category | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">No open tickets.</p>
            }
          </section>
        </div>
        @for (n of d.notes; track n) {
          <p class="meta">{{ n }}</p>
        }
      }
    </section>
  `,
  styles: [STYLES],
})
export class AdminSupportReportComponent implements OnInit {
  readonly dayOptions = DAYS;
  readonly days = signal(30);
  readonly data = signal<SupportReport | null>(null);
  readonly error = signal<string | null>(null);

  constructor(private readonly ops: PlatformOpsService) {}

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  private load(): void {
    this.data.set(null);
    this.ops.supportReport(this.days()).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}
