import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/http/error.util';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { ReviewInsights } from '../../core/reviews/review-insights.models';
import { ReviewInsightsService } from '../../core/reviews/review-insights.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * `/app/:tenantId/reviews/insights` — review analytics: rating distribution,
 * monthly trend, reply rate and speed, a rating-band sentiment split with
 * keyword themes (a documented heuristic — NOT AI), a CSV report and the
 * opt-in "auto-draft replies" switch. Auto-drafting only ever creates drafts
 * for a person to approve; nothing is sent automatically.
 */
@Component({
  selector: 'app-review-insights',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, StatCardComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="insights">
      <app-page-header eyebrow="Reputation" eyebrowLabel="Reviews" title="Review insights" subtitle="Ratings, reply performance and themes across your Google reviews." />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="card filter-bar">
          <label>Location
            <select [ngModel]="locationId()" (ngModelChange)="locationId.set($event)">
              <option value="">All locations</option>
              @for (l of locations(); track l.id) { <option [value]="l.id">{{ l.name }}</option> }
            </select>
          </label>
          <label>From <input type="date" [ngModel]="from()" (ngModelChange)="from.set($event)" /></label>
          <label>To <input type="date" [ngModel]="to()" (ngModelChange)="to.set($event)" /></label>
          <button type="button" class="btn-primary btn-sm" (click)="load()">Apply</button>
          <button type="button" class="btn-secondary btn-sm" [disabled]="exporting()" (click)="exportCsv()">{{ exporting() ? 'Preparing…' : 'Download CSV report' }}</button>
          @if (locationId()) {
            <a class="btn-secondary btn-sm btn-link" [routerLink]="['/app', tenantId(), 'locations', locationId(), 'reviews']">Open reviews inbox</a>
          }
        </div>
        @if (actionError()) { <p class="form-error" role="alert">{{ actionError() }}</p> }

        @if (data(); as d) {
          @if (d.summary.total === 0) {
            <app-empty-state icon="reviews" title="No reviews in this view" message="Sync a Google location or widen the dates to see analytics." />
          } @else {
            <div class="stats">
              <app-stat-card label="Reviews" [value]="d.summary.total" />
              <app-stat-card label="Average rating" [value]="d.summary.avg_rating ?? '—'" />
              <app-stat-card label="Reply rate" [value]="d.summary.reply_rate_pct === null ? '—' : d.summary.reply_rate_pct + '%'" [hint]="d.summary.replied + ' replied · ' + d.summary.unreplied + ' waiting'" />
              <app-stat-card label="Avg time to reply" [value]="d.summary.avg_hours_to_reply === null ? '—' : d.summary.avg_hours_to_reply + ' h'" />
            </div>

            <div class="two">
              <article class="card">
                <h3>Rating distribution</h3>
                <ul class="dist" data-testid="distribution">
                  @for (r of d.distribution; track r.rating) {
                    <li><span class="star">{{ r.rating }}★</span><span class="track"><span class="fill" [style.width.%]="r.pct"></span></span><span class="num">{{ r.count }} ({{ r.pct }}%)</span></li>
                  }
                </ul>
              </article>
              <article class="card">
                <h3>Monthly trend</h3>
                <table class="data-table" data-testid="trend">
                  <thead><tr><th>Month</th><th>Reviews</th><th>Avg rating</th></tr></thead>
                  <tbody>
                    @for (t of d.trend; track t.month) { <tr><td>{{ t.month }}</td><td>{{ t.count }}</td><td>{{ t.avg_rating }}</td></tr> }
                  </tbody>
                </table>
              </article>
            </div>

            <article class="card">
              <h3>Sentiment (rating bands)</h3>
              <p class="meta">{{ d.sentiment.note }}</p>
              <div class="bands" data-testid="sentiment">
                <span class="band pos">Positive {{ d.sentiment.positive }}</span>
                <span class="band neu">Neutral {{ d.sentiment.neutral }}</span>
                <span class="band neg">Negative {{ d.sentiment.negative }}</span>
              </div>
              <div class="themes">
                <div>
                  <h4>Often praised</h4>
                  @for (t of d.sentiment.themes.positive; track t.word) { <span class="chip pos">{{ t.word }} · {{ t.count }}</span> }
                  @if (d.sentiment.themes.positive.length === 0) { <span class="meta">None found</span> }
                </div>
                <div>
                  <h4>Often criticised</h4>
                  @for (t of d.sentiment.themes.negative; track t.word) { <span class="chip neg">{{ t.word }} · {{ t.count }}</span> }
                  @if (d.sentiment.themes.negative.length === 0) { <span class="meta">None found</span> }
                </div>
              </div>
              <p class="meta">{{ d.sentiment.themes_note }}</p>
            </article>
          }

          <article class="card" data-testid="automation">
            <h3>Auto-draft replies</h3>
            <p class="meta">{{ data()!.automation.behaviour }}</p>
            @if (canAdmin()) {
              <div class="auto">
                <label class="check"><input type="checkbox" [ngModel]="autoOn()" (ngModelChange)="autoOn.set($event)" /> Draft replies automatically after a sync</label>
                <label>Up to rating
                  <select [ngModel]="autoMax()" (ngModelChange)="autoMax.set(+$event)">
                    @for (n of [1, 2, 3, 4, 5]; track n) { <option [value]="n">{{ n }} star{{ n === 1 ? '' : 's' }}</option> }
                  </select>
                </label>
                <button type="button" [disabled]="savingAuto()" (click)="saveAuto()">{{ savingAuto() ? 'Saving…' : 'Save' }}</button>
              </div>
              @if (autoNotice()) { <p class="success" role="status">{{ autoNotice() }}</p> }
            } @else {
              <p class="meta">Currently {{ data()!.automation.auto_draft_enabled ? 'on (up to ' + data()!.automation.max_rating + ' stars)' : 'off' }}. Only an owner or admin can change this.</p>
            }
          </article>
          @if (data()!.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }
        } @else if (loading()) {
          <app-skeleton-loader [rows]="5" />
        } @else if (loadError()) {
          <p class="form-error" role="alert">{{ loadError() }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .insights { width: 100%; font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
      .filter-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 12px 16px; }
      .filter-bar label, .auto label { display: flex; flex-direction: column; gap: 4px; font-weight: var(--font-semibold); font-size: var(--text-xs); color: var(--color-text-muted); }
      .filter-bar input, .filter-bar select, .auto select { height: 36px; padding: 0 10px; font: inherit; font-weight: 400; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); }
      .btn-link { text-decoration: none; display: inline-flex; align-items: center; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
      .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-3); }
      .card { padding: 16px 20px; }
      .card h3 { margin: 0 0 0.6rem; font-size: var(--text-md, 1rem); }
      .dist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
      .dist li { display: grid; grid-template-columns: 2.5rem 1fr 6.5rem; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
      .track { background: var(--color-surface-muted, #eef2f5); border-radius: 6px; height: 10px; overflow: hidden; }
      .fill { display: block; height: 100%; background: var(--color-primary); }
      .bands { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
      .band, .chip { border-radius: 999px; padding: 0.25rem 0.8rem; font-size: 0.82rem; font-weight: 600; display: inline-block; margin: 0 0.3rem 0.3rem 0; }
      .pos { background: #e3f6ec; color: #17653a; }
      .neu { background: #eef2f5; color: #4a5a68; }
      .neg { background: #fde8e8; color: #9b1c1c; }
      .themes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
      .themes h4 { margin: 0.4rem 0; font-size: 0.85rem; }
      .auto { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; }
      .check { flex-direction: row !important; align-items: center; gap: 0.5rem !important; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .success { color: #1b6b3a; }
    `,
  ],
})
export class ReviewInsightsComponent implements OnInit {
  readonly locations = signal<LocationSummary[]>([]);
  readonly locationId = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly data = signal<ReviewInsights | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly exporting = signal(false);
  readonly autoOn = signal(false);
  readonly autoMax = signal(5);
  readonly savingAuto = signal(false);
  readonly autoNotice = signal<string | null>(null);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canAdmin = computed(() => ['owner', 'admin'].includes(this.currentTenant.tenant()?.caller_role ?? ''));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly locationApi: LocationApiService,
    private readonly api: ReviewInsightsService,
  ) {}

  ngOnInit(): void {
    if (!this.tenantId()) {
      return;
    }
    this.locationApi.list(this.tenantId()).subscribe({ next: (l) => this.locations.set(l), error: () => this.locations.set([]) });
    this.load();
  }

  private filter() {
    return { location_id: this.locationId() || undefined, from: this.from() || undefined, to: this.to() || undefined };
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.insights(this.tenantId(), this.filter()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.autoOn.set(d.automation.auto_draft_enabled);
        this.autoMax.set(d.automation.max_rating);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  exportCsv(): void {
    this.exporting.set(true);
    this.actionError.set(null);
    this.api.exportCsv(this.tenantId(), this.filter()).subscribe({
      next: ({ blob, filename }) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  saveAuto(): void {
    this.savingAuto.set(true);
    this.autoNotice.set(null);
    this.api.saveSettings(this.tenantId(), { auto_draft_enabled: this.autoOn(), max_rating: this.autoMax() }).subscribe({
      next: (s) => {
        this.savingAuto.set(false);
        this.autoNotice.set(s.auto_draft_enabled ? `On: new reviews up to ${s.max_rating} stars get a draft reply for you to approve.` : 'Off.');
        this.load();
      },
      error: (err: unknown) => {
        this.savingAuto.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }
}
