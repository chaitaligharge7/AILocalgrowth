import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { UsageReport } from '../../core/automations/whatsapp-insights.models';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';

/**
 * BW-110 "Reports / Usage" — message counts by status, template and day
 * over a chosen window, plus the summed provider-reported cost
 * (`GET .../whatsapp/usage-report?days=`). The cost is only ever the
 * per-message figure stored on each delivery; while the mock provider is
 * active it is labelled a simulated estimate, never a real charge.
 */
@Component({
  selector: 'app-whatsapp-usage',
  standalone: true,
  imports: [StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="block">
      <h2>Usage report @if (report()?.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }</h2>
      <label class="window">
        Window
        <select [value]="days()" (change)="onDaysChange($event)">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </label>

      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
       @if (report(); as r) {
        @if (r.total_messages === 0) {
          <app-empty-state icon="analytics" title="No messages in this window" message="Sends triggered by automations or campaigns will be counted here." />
        } @else {
          <div class="stat-grid">
            <app-stat-card label="Messages" [value]="r.total_messages" [hint]="'Last ' + r.days + ' days'" />
            <app-stat-card
              label="Provider-reported cost"
              [value]="'₹' + r.total_cost"
              [hint]="r.cost_basis === 'mock_provider_estimate' ? 'Simulated by the mock provider — not a real charge' : 'As reported by the provider'"
            />
          </div>

          <h3>By status</h3>
          <p class="chips">
            @for (entry of statusEntries(); track entry[0]) {
              <span class="badge badge--dot" [class]="statusClass(entry[0])">{{ entry[0] }} · {{ entry[1] }}</span>
            }
          </p>

          <h3>By template</h3>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Template</th><th>Messages</th><th>Cost</th></tr></thead>
              <tbody>
                @for (row of r.by_template; track row.template_id) {
                  <tr>
                    <td>{{ row.template_category || row.template_id || '—' }}</td>
                    <td>{{ row.count }}</td>
                    <td>₹{{ row.cost }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <h3>By day</h3>
          <ul class="bars" aria-label="Messages per day">
            @for (day of r.by_day; track day.day) {
              <li>
                <span class="bar-label">{{ day.day }}</span>
                <span class="bar-track"><span class="bar-fill" [style.width.%]="barWidth(day.count)"></span></span>
                <span class="bar-value">{{ day.count }}</span>
              </li>
            }
          </ul>
        }
       }
      }
    </section>
  `,
  styles: [
    `
      .block { margin-bottom: 2rem; }
      .window { display: inline-flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.875rem; margin-bottom: 1rem; }
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .table-scroll { overflow-x: auto; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
      .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
      .bars li { display: grid; grid-template-columns: 6.5rem 1fr 2.5rem; align-items: center; gap: 0.75rem; font-size: 0.85rem; }
      .bar-track { background: var(--color-border); border-radius: 999px; height: 0.6rem; overflow: hidden; }
      .bar-fill { display: block; height: 100%; background: var(--color-primary); border-radius: 999px; }
      .bar-label { color: var(--color-text-muted); }
      .bar-value { text-align: right; font-weight: 600; }
    `,
  ],
})
export class WhatsAppUsageComponent implements OnInit {
  readonly report = signal<UsageReport | null>(null);
  readonly days = signal(30);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly statusEntries = computed(() => Object.entries(this.report()?.by_status ?? {}));
  private readonly maxDayCount = computed(() => Math.max(1, ...(this.report()?.by_day ?? []).map((d) => d.count)));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly insights: WhatsAppInsightsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  onDaysChange(event: Event): void {
    this.days.set(Number((event.target as HTMLSelectElement).value));
    this.load();
  }

  load(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.usageReport(tenantId, this.days()).subscribe({
      next: (report) => {
        this.loading.set(false);
        this.report.set(report);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  barWidth(count: number): number {
    return Math.round((count / this.maxDayCount()) * 100);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'delivered':
      case 'read':
        return 'badge--success';
      case 'failed':
        return 'badge--danger';
      case 'sent':
        return 'badge--info';
      default:
        return 'badge--warning';
    }
  }
}
