import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';
import { Campaign, ScheduledItem } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

interface Cell {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
  campaigns: Campaign[];
  items: ScheduledItem[];
}

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Campaign calendar (BW-087): a month grid of campaign date ranges plus the
 * posts already scheduled through the publishing pipeline (local time). It
 * only reads — scheduling itself happens on the Calendar screen.
 */
@Component({
  selector: 'app-campaign-calendar',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      <div class="bar">
        <button type="button" class="btn-secondary" (click)="shift(-1)" aria-label="Previous month">‹</button>
        <h3>{{ anchor() | date: 'MMMM y' }}</h3>
        <button type="button" class="btn-secondary" (click)="shift(1)" aria-label="Next month">›</button>
        <button type="button" class="btn-secondary" (click)="today()">Today</button>
      </div>

      @if (loading()) {
        <app-skeleton-loader [rows]="5" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
        @if (campaigns().length === 0) {
          <app-empty-state icon="calendar" title="No campaigns this month" message="Campaigns with dates in this month appear here." />
        }
        <div class="grid" role="grid" data-testid="campaign-calendar">
          @for (h of heads; track h) { <div class="head" role="columnheader">{{ h }}</div> }
          @for (c of cells(); track c.date) {
            <div class="cell" role="gridcell" [class.out]="!c.inMonth" [class.today]="c.date === todayStr">
              <span class="d">{{ c.day }}</span>
              @for (k of c.campaigns.slice(0, 2); track k.id) { <span class="camp" [title]="k.name">{{ k.name }}</span> }
              @if (c.campaigns.length > 2) { <span class="more">+{{ c.campaigns.length - 2 }} more</span> }
              @for (i of c.items.slice(0, 2); track i.content_id + i.scheduled_utc) {
                <span class="post" [title]="(i.title || '') + ' · ' + i.channel">{{ i.scheduled_utc | date: 'shortTime' }} {{ i.channel === 'meta_instagram' ? 'IG' : i.channel === 'meta_page' ? 'FB' : 'GBP' }}</span>
              }
              @if (c.items.length > 2) { <span class="more">+{{ c.items.length - 2 }} posts</span> }
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
      .bar h3 { margin: 0; min-width: 9rem; text-align: center; }
      .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
      .head { font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-align: center; padding: 0.25rem 0; }
      .cell { min-height: 92px; border: 1px solid var(--color-border); border-radius: 8px; padding: 0.3rem; display: flex; flex-direction: column; gap: 2px; background: var(--color-surface, #fff); overflow: hidden; }
      .cell.out { opacity: 0.45; }
      .cell.today { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
      .d { font-size: 0.75rem; font-weight: 700; }
      .camp { font-size: 0.7rem; background: var(--color-primary-light); color: var(--color-primary); border-radius: 4px; padding: 1px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .post { font-size: 0.7rem; background: #fdf3df; color: #8a5a00; border-radius: 4px; padding: 1px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .more { font-size: 0.68rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      @media (max-width: 700px) { .cell { min-height: 64px; } .camp, .post { font-size: 0.62rem; } }
    `,
  ],
})
export class CampaignCalendarComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';

  readonly heads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly todayStr = ymd(new Date());
  readonly anchor = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly campaigns = signal<Campaign[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly cells = computed<Cell[]>(() => {
    const first = this.anchor();
    const month = first.getMonth();
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(first.getFullYear(), month, 1 - offset);
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const date = ymd(d);
      out.push({
        date,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        campaigns: this.campaigns().filter((c) => (!c.starts_on || c.starts_on <= date) && (!c.ends_on || c.ends_on >= date) && (c.starts_on || c.ends_on)),
        items: this.campaigns()
          .flatMap((c) => c.scheduled_items ?? [])
          .filter((it) => ymd(new Date(it.scheduled_utc)) === date),
      });
    }
    return out;
  });

  constructor(private readonly api: CampaignService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.load();
    }
  }

  shift(delta: number): void {
    const a = this.anchor();
    this.anchor.set(new Date(a.getFullYear(), a.getMonth() + delta, 1));
    this.load();
  }

  today(): void {
    const n = new Date();
    this.anchor.set(new Date(n.getFullYear(), n.getMonth(), 1));
    this.load();
  }

  private load(): void {
    const a = this.anchor();
    const from = ymd(new Date(a.getFullYear(), a.getMonth(), 1));
    const to = ymd(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    this.loading.set(true);
    this.api.list(this.tenantId, from, to).subscribe({
      next: (list) => {
        this.campaigns.set(list);
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
