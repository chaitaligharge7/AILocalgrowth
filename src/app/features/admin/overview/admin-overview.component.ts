import { KeyValuePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { PlatformOverview } from '../../../core/admin/platform.models';
import { PlatformService } from '../../../core/admin/platform.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../../shared/dashboard-pattern/stat-card.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

/**
 * `/admin/overview` — Compact Platform-Wide Operational Overview.
 */
@Component({
  selector: 'app-admin-overview',
  standalone: true,
  imports: [KeyValuePipe, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent],
  template: `
    <section class="overview">
      <app-page-header
        eyebrow="Platform admin"
        eyebrowLabel="Live Telemetry"
        title="Platform overview"
        subtitle="Live counts across every business, user, subscription, and queue."
      />

      @if (loading()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (data()) {
        @let d = data()!;
        <div class="stats" data-testid="overview-stats">
          <app-stat-card label="Businesses" [value]="d.businesses.total" [hint]="d.businesses.new_last_30_days + ' new in 30 days'" icon="business" />
          <app-stat-card label="Users" [value]="d.users.total" [hint]="d.users.verified + ' verified'" icon="users" tone="mint" />
          <app-stat-card label="Agencies" [value]="d.agencies.active" hint="active agency accounts" icon="clients" tone="info" />
          <app-stat-card label="Open tickets" [value]="openTickets(d)" hint="not resolved or closed" icon="support" tone="amber" />
        </div>

        <div class="grid">
          <section class="card">
            <h2>Businesses by status</h2>
            @for (row of d.businesses.by_status | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            }
          </section>
          <section class="card">
            <h2>Subscriptions by status</h2>
            @for (row of d.subscriptions.by_status | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">No subscriptions yet.</p>
            }
          </section>
          <section class="card">
            <h2>Plan mix (active & trialing)</h2>
            @for (p of d.subscriptions.plan_mix; track p.plan_code) {
              <p class="row"><span>{{ p.plan_name }}</span><strong>{{ p.subscriptions }}</strong></p>
            } @empty {
              <p class="meta">No active plans yet.</p>
            }
          </section>
          <section class="card">
            <h2>Invoiced (GST invoices issued)</h2>
            @for (t of d.invoicing.last_30_days; track t.currency) {
              <p class="row"><span>Last 30 days · {{ t.invoices }} invoices</span><strong>{{ t.currency }} {{ t.total }}</strong></p>
            } @empty {
              <p class="meta">No invoices in the last 30 days.</p>
            }
            @for (t of d.invoicing.all_time; track t.currency) {
              <p class="row"><span>All time · {{ t.invoices }} invoices</span><strong>{{ t.currency }} {{ t.total }}</strong></p>
            }
            <p class="meta">{{ d.invoicing.note }}</p>
          </section>
          <section class="card">
            <h2>Add-on purchases</h2>
            @for (row of d.addons.by_status | keyvalue; track row.key) {
              <p class="row"><span>{{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">No add-on purchases yet.</p>
            }
            <p class="meta">Paid total: {{ d.addons.paid_amount }} (includes MOCK_PROVIDER test payments in non-production).</p>
          </section>
          <section class="card">
            <h2>Publishing jobs & integrations</h2>
            @for (row of d.publishing_jobs | keyvalue; track row.key) {
              <p class="row"><span>Job: {{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">No publishing jobs yet.</p>
            }
            @for (row of d.integrations | keyvalue; track row.key) {
              <p class="row"><span>Integration: {{ row.key }}</span><strong>{{ row.value }}</strong></p>
            } @empty {
              <p class="meta">No provider connections yet.</p>
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .overview {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .card h2 {
        font-size: 0.9rem;
        font-weight: var(--font-bold);
        margin: 0 0 4px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0;
        padding: 4px 0;
        border-bottom: 1px solid var(--color-border);
        font-size: var(--text-xs);
        font-variant-numeric: tabular-nums;
      }
      .row:last-of-type {
        border-bottom: none;
      }
      .meta {
        color: var(--color-text-muted);
        font-size: 0.72rem;
        margin: 4px 0 0;
      }
      .form-error {
        color: var(--color-danger);
        font-size: var(--text-xs);
        margin: 0;
      }
      @media (max-width: 1024px) {
        .stats {
          grid-template-columns: repeat(2, 1fr);
        }
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (max-width: 640px) {
        .stats,
        .grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminOverviewComponent implements OnInit {
  readonly data = signal<PlatformOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(private readonly platform: PlatformService) {}

  ngOnInit(): void {
    this.platform.overview().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  openTickets(d: PlatformOverview): number {
    return Object.entries(d.support.by_status)
      .filter(([status]) => status !== 'resolved' && status !== 'closed')
      .reduce((sum, [, n]) => sum + n, 0);
  }
}
