import { DatePipe, KeyValuePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { apiErrorMessage } from '../../../core/http/error.util';
import { OpsEvent, OpsEventSource, OpsFailures, OpsHealth } from '../../../core/admin/platform-ops.models';
import { PlatformOpsService } from '../../../core/admin/platform-ops.service';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

type Tab = 'health' | 'events' | 'failures';

/**
 * `/admin/ops` — integration, webhook and queue health (SA-041..047), the
 * inbound event log (SA-047) and failure diagnostics (SA-050). Every number is a
 * count over rows the platform stored; no latency/uptime is measured, and the
 * page says so.
 */
@Component({
  selector: 'app-admin-ops',
  standalone: true,
  imports: [DatePipe, KeyValuePipe, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <app-page-header
        eyebrow="PLATFORM ADMIN"
        eyebrowLabel="SA-041..050"
        title="Operations"
        subtitle="Webhook, queue and integration health, recent provider events and failures."
      />
      <div class="tabs" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" [class.active]="tab() === t.key" (click)="select(t.key)">
            {{ t.label }}
          </button>
        }
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }

      @if (tab() === 'health') {
        @if (!health()) {
          <app-skeleton-loader [rows]="4" />
        } @else {
          @let h = health()!;
          <div class="stats" data-testid="health-stats">
            <app-stat-card label="Jobs overdue (15 min+)" [value]="h.queues.jobs_overdue_15m" />
            <app-stat-card label="Tokens expired" [value]="h.connections.token_expired" />
            <app-stat-card label="Tokens expiring in 7 days" [value]="h.connections.token_expiring_7d" />
            <app-stat-card label="Oldest pending outbox" [value]="(h.queues.outbox_oldest_pending_at | date: 'd MMM, HH:mm') ?? 'None'" />
          </div>
          <div class="grid">
            <section class="card">
              <h2>Provider webhooks</h2>
              @for (row of h.webhooks.provider_events.by_status | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">No provider webhook events received yet.</p>
              }
              <p class="meta">Last received: {{ h.webhooks.provider_events.last_received_at ? (h.webhooks.provider_events.last_received_at | date: 'medium') : 'never' }}</p>
            </section>
            <section class="card">
              <h2>Payment events</h2>
              @for (row of h.webhooks.payment_events.by_status | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">No payment events yet.</p>
              }
              <p class="meta">Last received: {{ h.webhooks.payment_events.last_received_at ? (h.webhooks.payment_events.last_received_at | date: 'medium') : 'never' }}</p>
            </section>
            <section class="card">
              <h2>WhatsApp webhooks (24 h)</h2>
              @for (row of h.webhooks.whatsapp.last_24h_by_kind | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">None in the last 24 hours.</p>
              }
              <p class="meta">Last received: {{ h.webhooks.whatsapp.last_received_at ? (h.webhooks.whatsapp.last_received_at | date: 'medium') : 'never' }}</p>
            </section>
            <section class="card">
              <h2>Background jobs</h2>
              @for (row of h.queues.jobs_by_status | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">No background jobs recorded.</p>
              }
            </section>
            <section class="card">
              <h2>Outbox</h2>
              @for (row of h.queues.outbox_by_status | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">Outbox is empty.</p>
              }
            </section>
            <section class="card">
              <h2>Provider connections</h2>
              @for (row of h.connections.by_provider_status | keyvalue; track row.key) {
                <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
              } @empty {
                <p class="meta">No provider connections yet.</p>
              }
            </section>
          </div>
          @for (n of h.notes; track n) {
            <p class="meta">{{ n }}</p>
          }
        }
      }

      @if (tab() === 'events') {
        <div class="filters">
          <label>Source
            <select data-testid="event-source" [value]="source()" (change)="setSource($any($event.target).value)">
              <option value="provider">Provider webhooks</option>
              <option value="payment">Payment events</option>
              <option value="whatsapp">WhatsApp webhook log</option>
            </select>
          </label>
        </div>
        @if (loadingEvents()) {
          <app-skeleton-loader [rows]="4" />
        } @else if (events().length === 0) {
          <app-empty-state icon="audit" title="No events" message="Nothing has been received from this source yet." />
        } @else {
          <div class="card">
            <table data-testid="events-table">
              <thead><tr><th>Received</th><th>Provider</th><th>Event</th><th>Status</th><th>Verified</th><th>Detail</th></tr></thead>
              <tbody>
                @for (e of events(); track e.id) {
                  <tr>
                    <td>{{ e.received_at | date: 'd MMM, HH:mm:ss' }}</td>
                    <td>{{ e.provider }}@if (e.tenant_name) { · {{ e.tenant_name }} }</td>
                    <td><code>{{ e.event_id }}</code></td>
                    <td><span class="badge badge--dot" [class]="statusClass(e.status)">{{ e.status }}</span></td>
                    <td>{{ e.verified === null ? '—' : e.verified ? 'yes' : 'no' }}</td>
                    <td>{{ e.detail || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      @if (tab() === 'failures') {
        <div class="filters">
          <label>Window
            <select data-testid="failure-days" [value]="days()" (change)="setDays(+$any($event.target).value)">
              @for (d of [7, 14, 30, 60, 90]; track d) { <option [value]="d">Last {{ d }} days</option> }
            </select>
          </label>
        </div>
        @if (!failures()) {
          <app-skeleton-loader [rows]="3" />
        } @else {
          @let f = failures()!;
          <div class="stats">
            <app-stat-card label="Failed publish jobs" [value]="f.counts.publish_jobs_failed" />
            <app-stat-card label="AI generations not completed" [value]="f.counts.ai_generations_not_completed" />
            <app-stat-card label="Jobs needing attention" [value]="f.counts.jobs_needing_attention" />
            <app-stat-card label="Outbox dead-letter" [value]="f.counts.outbox_dead_letter" />
          </div>
          <div class="card">
            <h2>Background jobs needing attention</h2>
            @if (f.jobs.length === 0) {
              <p class="meta">None.</p>
            } @else {
              <table data-testid="failed-jobs">
                <thead><tr><th>Type</th><th>Status</th><th>Attempts</th><th>Business</th><th>Updated</th></tr></thead>
                <tbody>
                  @for (j of f.jobs; track j.id) {
                    <tr><td>{{ j.type }}</td><td>{{ j.status }}</td><td>{{ j.attempts }}</td><td>{{ j.tenant_name || '—' }}</td><td>{{ j.updated_at | date: 'd MMM, HH:mm' }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </div>
          <div class="card">
            <h2>Failed publish jobs</h2>
            @if (f.publish_jobs.length === 0) {
              <p class="meta">None in this window.</p>
            } @else {
              <table data-testid="failed-publish">
                <thead><tr><th>Provider</th><th>Error code</th><th>Attempts</th><th>Business</th><th>Updated</th></tr></thead>
                <tbody>
                  @for (p of f.publish_jobs; track p.id) {
                    <tr><td>{{ p.provider }}</td><td>{{ p.error_code || '—' }}</td><td>{{ p.attempts }}</td><td>{{ p.tenant_name }}</td><td>{{ p.updated_at | date: 'd MMM, HH:mm' }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </div>
          @for (n of f.notes; track n) {
            <p class="meta">{{ n }}</p>
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .page { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--color-border); }
      .tabs button { background: none; border: 0; padding: 0.6rem 1rem; cursor: pointer; font: inherit; font-weight: 600; color: var(--color-text-muted); border-bottom: 2px solid transparent; }
      .tabs button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
      .card h2 { font-size: 1rem; margin: 0 0 0.5rem; }
      .row { display: flex; justify-content: space-between; margin: 0.25rem 0; }
      .meta { color: var(--color-text-muted); font-size: 0.8rem; }
      .filters label { display: inline-flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
      select { padding: 0.4rem; font: inherit; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
      th { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
    `,
  ],
})
export class AdminOpsComponent implements OnInit {
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'health', label: 'Health' },
    { key: 'events', label: 'Events' },
    { key: 'failures', label: 'Failures' },
  ];
  readonly tab = signal<Tab>('health');
  readonly health = signal<OpsHealth | null>(null);
  readonly events = signal<OpsEvent[]>([]);
  readonly loadingEvents = signal(false);
  readonly source = signal<OpsEventSource>('provider');
  readonly failures = signal<OpsFailures | null>(null);
  readonly days = signal(7);
  readonly error = signal<string | null>(null);

  constructor(private readonly ops: PlatformOpsService) {}

  ngOnInit(): void {
    this.ops.health().subscribe({
      next: (h) => this.health.set(h),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  select(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    if (tab === 'events' && this.events().length === 0) {
      this.loadEvents();
    }
    if (tab === 'failures' && !this.failures()) {
      this.loadFailures();
    }
  }

  setSource(source: OpsEventSource): void {
    this.source.set(source);
    this.loadEvents();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.loadFailures();
  }

  statusClass(status: string): string {
    if (['processed', 'delivered', 'read', 'captured', 'sent'].includes(status)) {
      return 'badge--success';
    }
    if (['failed', 'dead_letter', 'error'].includes(status)) {
      return 'badge--danger';
    }
    return 'badge--neutral';
  }

  private loadEvents(): void {
    this.loadingEvents.set(true);
    this.ops.events(this.source()).subscribe({
      next: (rows) => {
        this.events.set(rows);
        this.loadingEvents.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loadingEvents.set(false);
      },
    });
  }

  private loadFailures(): void {
    this.failures.set(null);
    this.ops.failures(this.days()).subscribe({
      next: (f) => this.failures.set(f),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}
