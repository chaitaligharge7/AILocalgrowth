import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { AgencyAnalytics, AgencyBranding, AgencyConsoleService } from '../../../core/agency/agency-console.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

/**
 * `/agency/reports` — a printable client report composed in the browser from
 * the same real aggregates as the Analytics page, headed with the agency's
 * saved branding. "Print / save as PDF" uses the browser's print dialog; the
 * server does not generate PDFs. No reach or engagement is shown because no
 * provider returns it.
 */
@Component({
  selector: 'app-agency-report',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="page">
      <div class="no-print">
        <app-page-header
          eyebrow="Agency"
          eyebrowLabel="Reports"
          title="Client report"
          subtitle="A printable summary of your active clients, ready to share."
        />
        <div class="card toolbar">
          <label>
            <span>Period</span>
            <select data-testid="report-days" (change)="setDays(+$any($event.target).value)">
              @for (d of dayOptions; track d) {
                <option [value]="d" [selected]="d === days()">Last {{ d }} days</option>
              }
            </select>
          </label>
          <div class="toolbar-actions">
            <button type="button" class="btn-primary" data-testid="print" [disabled]="!data()" (click)="print()">
              Print / save as PDF
            </button>
            <button type="button" class="btn-secondary" data-testid="csv" [disabled]="!data()" (click)="exportCsv()">
              Download CSV
            </button>
          </div>
        </div>
      </div>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="card"><app-skeleton-loader [rows]="4" /></div>
      } @else {
        @let d = data()!;
        <article class="card report" data-testid="report" [style.--rc]="branding()?.primary_color || '#078d7e'">
          <header class="report-head">
            <div>
              <h1>{{ branding()?.brand_name || 'Client report' }}</h1>
              @if (branding()?.tagline) {
                <p class="tag">{{ branding()!.tagline }}</p>
              }
              <p class="meta">Client performance — last {{ d.days }} days · generated {{ generatedAt | date: 'medium' }}</p>
            </div>
          </header>
          <div class="totals" data-testid="report-totals">
            <div class="stat-tile"><strong>{{ d.client_count }}</strong><span>Active clients</span></div>
            <div class="stat-tile"><strong>{{ d.totals.leads_new }}</strong><span>New leads</span></div>
            <div class="stat-tile"><strong>{{ d.totals.content_created }}</strong><span>Content created</span></div>
            <div class="stat-tile"><strong>{{ d.totals.posts_succeeded }}</strong><span>Posts published</span></div>
            <div class="stat-tile"><strong>{{ d.totals.reviews_new }}</strong><span>New reviews</span></div>
            <div class="stat-tile"><strong>{{ d.totals.avg_rating ?? '—' }}</strong><span>Average rating</span></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Leads</th>
                  <th>Content</th>
                  <th>Published</th>
                  <th>Failed</th>
                  <th>Reviews</th>
                  <th>Rating</th>
                  <th>Open tickets</th>
                </tr>
              </thead>
              <tbody>
                @for (c of d.clients; track c.link_id) {
                  <tr>
                    <td><strong>{{ c.client_name }}</strong></td>
                    <td>{{ c.leads_new }}</td>
                    <td>{{ c.content_created }}</td>
                    <td>{{ c.posts_succeeded }}</td>
                    <td>{{ c.posts_failed }}</td>
                    <td>{{ c.reviews_new }}</td>
                    <td>{{ c.avg_rating ?? '—' }}</td>
                    <td>{{ c.open_tickets }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (d.clients.length === 0) {
            <p class="meta">No active clients in this period.</p>
          }
          @for (n of d.notes; track n) {
            <p class="meta foot">{{ n }}</p>
          }
        </article>
      }
    </section>
  `,
  styles: [
    `
      .page {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .no-print {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .toolbar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        padding: 12px 16px;
      }
      .toolbar-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: var(--font-semibold);
        font-size: var(--text-xs);
      }
      .report {
        background: var(--color-surface);
        color: var(--color-text);
        border: 1px solid var(--color-border);
        border-top: 5px solid var(--rc, var(--color-primary));
        border-radius: var(--radius-md);
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .report-head h1 {
        margin: 0;
        font-size: 1.35rem;
        color: var(--rc, var(--color-primary));
      }
      .tag {
        margin: 4px 0 0;
        font-size: var(--text-sm);
        color: var(--color-text-subtle);
      }
      .meta {
        margin: 4px 0 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .totals {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
        gap: 10px;
      }
      .stat-tile {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px 14px;
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
      }
      .stat-tile strong {
        font-size: 1.35rem;
        color: var(--color-text);
      }
      .stat-tile span {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      @media print {
        .no-print {
          display: none !important;
        }
        .report {
          border: 0;
          padding: 0;
          box-shadow: none;
        }
      }
    `,
  ],
})
export class AgencyReportComponent implements OnInit {
  readonly dayOptions = [7, 14, 30, 60, 90];
  readonly days = signal(30);
  readonly data = signal<AgencyAnalytics | null>(null);
  readonly branding = signal<AgencyBranding | null>(null);
  readonly error = signal<string | null>(null);
  generatedAt = new Date();

  constructor(private readonly console: AgencyConsoleService) {}

  ngOnInit(): void {
    this.console.branding().subscribe({ next: (b) => this.branding.set(b), error: () => undefined });
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  print(): void {
    window.print();
  }

  csv(): string {
    const d = this.data();
    if (!d) {
      return '';
    }
    const esc = (v: string | number | null): string => {
      const s = v === null ? '' : String(v);
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = ['Client', 'New leads', 'Content created', 'Posts published', 'Posts failed', 'New reviews', 'Avg rating', 'Open tickets'];
    const rows = d.clients.map((c) =>
      [c.client_name, c.leads_new, c.content_created, c.posts_succeeded, c.posts_failed, c.reviews_new, c.avg_rating, c.open_tickets].map(esc).join(','),
    );
    return [header.join(','), ...rows].join('\n');
  }

  exportCsv(): void {
    const blob = new Blob([this.csv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-report-${this.days()}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private load(): void {
    this.data.set(null);
    this.generatedAt = new Date();
    this.console.analytics(this.days()).subscribe({
      next: (d) => this.data.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}
