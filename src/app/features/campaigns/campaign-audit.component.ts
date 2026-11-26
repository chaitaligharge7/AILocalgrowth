import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { PublishingAuditEvent } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Publishing audit log (BW-070): the content, publishing, campaign and
 * creative events recorded for this business. Owner/admin only (the API
 * enforces it); it never shows IP addresses and only names people who belong
 * to this business.
 */
@Component({
  selector: 'app-campaign-audit',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      @if (loading()) {
        <app-skeleton-loader [rows]="5" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (events().length === 0) {
        <app-empty-state icon="audit" title="No publishing activity yet" message="Content, scheduling and campaign events will be listed here." />
      } @else {
        <table class="data-table" data-testid="audit-table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr>
                <td class="meta">{{ e.created_at | date: 'medium' }}</td>
                <td>{{ e.actor_name || 'System / unknown' }}</td>
                <td><code>{{ e.action }}</code></td>
                <td class="meta">{{ summary(e) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      code { font-size: 0.8rem; }
    `,
  ],
})
export class CampaignAuditComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';

  readonly events = signal<PublishingAuditEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(private readonly api: CampaignService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.api.auditLog(this.tenantId).subscribe({
        next: (list) => {
          this.events.set(list);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(apiErrorMessage(err));
          this.loading.set(false);
        },
      });
    }
  }

  summary(e: PublishingAuditEvent): string {
    if (!e.detail) {
      return '—';
    }
    return Object.entries(e.detail)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  }
}
