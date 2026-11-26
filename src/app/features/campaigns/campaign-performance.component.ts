import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PerformanceResponse } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Publishing performance and social analytics (BW-070/BW-089): publishing
 * OUTCOMES per channel and per day from the real job rows. It deliberately
 * shows no reach/likes/clicks — the connected providers do not return them —
 * and says so on the page. Days are UTC.
 */
@Component({
  selector: 'app-campaign-performance',
  standalone: true,
  imports: [FormsModule, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      <div class="range">
        <label>From <input type="date" [ngModel]="from()" (ngModelChange)="from.set($event)" /></label>
        <label>To <input type="date" [ngModel]="to()" (ngModelChange)="to.set($event)" /></label>
        <button type="button" (click)="load()">Apply</button>
      </div>

      @if (data(); as d) {
        <div class="stats">
          <app-stat-card label="Scheduled" [value]="d.totals.scheduled" />
          <app-stat-card label="Published" [value]="d.totals.succeeded" />
          <app-stat-card label="Failed" [value]="d.totals.failed" />
          <app-stat-card label="Success rate" [value]="d.totals.success_rate_pct === null ? '—' : d.totals.success_rate_pct + '%'" hint="Published ÷ (published + failed)" />
        </div>
        @if (d.totals.scheduled === 0) {
          <app-empty-state icon="performance" title="Nothing scheduled in this period" message="Schedule an approved post to see outcomes here." />
        } @else {
          <h3>By channel</h3>
          <table class="data-table" data-testid="perf-channels">
            <thead><tr><th>Channel</th><th>Total</th><th>Published</th><th>Failed</th><th>In progress</th><th>Success rate</th></tr></thead>
            <tbody>
              @for (c of d.by_channel; track c.channel) {
                <tr><td>{{ c.channel }}</td><td>{{ c.total }}</td><td>{{ c.succeeded }}</td><td>{{ c.failed }}</td><td>{{ c.in_flight }}</td><td>{{ c.success_rate_pct === null ? '—' : c.success_rate_pct + '%' }}</td></tr>
              }
            </tbody>
          </table>
          <h3>By day</h3>
          <div class="bars" data-testid="perf-days">
            @for (day of d.by_day; track day.day) {
              <div class="bar" [title]="day.day + ': ' + day.scheduled + ' scheduled, ' + day.succeeded + ' published, ' + day.failed + ' failed'">
                <span class="fill" [style.height.%]="pct(day.scheduled, d)"></span>
                <span class="lbl">{{ day.day.slice(5) }}</span>
              </div>
            }
          </div>
          <p class="meta">{{ d.timezone_note }}</p>
        }
        <p class="meta">{{ d.engagement.reason }}</p>
        @if (d.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }
      } @else if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: [
    `
      .range { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
      .range label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.82rem; }
      .range input { padding: 0.4rem; font: inherit; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
      .bars { display: flex; align-items: flex-end; gap: 4px; height: 130px; overflow-x: auto; padding-bottom: 1.4rem; }
      .bar { position: relative; flex: 0 0 22px; height: 100%; display: flex; align-items: flex-end; }
      .fill { display: block; width: 100%; background: var(--color-primary); border-radius: 4px 4px 0 0; min-height: 3px; }
      .lbl { position: absolute; bottom: -1.3rem; left: 50%; transform: translateX(-50%) rotate(-40deg); font-size: 0.62rem; white-space: nowrap; color: var(--color-text-muted); }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
    `,
  ],
})
export class CampaignPerformanceComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';

  readonly from = signal(ymd(new Date(Date.now() - 29 * 86400000)));
  readonly to = signal(ymd(new Date()));
  readonly data = signal<PerformanceResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(private readonly api: CampaignService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.load();
    }
  }

  pct(n: number, d: PerformanceResponse): number {
    const max = Math.max(1, ...d.by_day.map((x) => x.scheduled));
    return Math.max(4, Math.round((n / max) * 100));
  }

  load(): void {
    this.loading.set(true);
    this.api.performance(this.tenantId, this.from(), this.to()).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
