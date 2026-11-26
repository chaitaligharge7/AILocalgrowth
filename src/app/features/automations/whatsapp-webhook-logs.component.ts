import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { WebhookLogEntry } from '../../core/automations/whatsapp-insights.models';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';

const ACTION_LABELS: Record<string, string> = {
  delivery_status_updated: 'Delivery status updated',
  consent_revoked: 'Opt-out (STOP) — consent revoked',
  auto_reply_queued: 'Auto-reply queued',
  ignored_auto_reply_rate_limited: 'Auto-reply skipped (rate limited)',
  ignored_non_stop_inbound_message: 'Inbound message — no matching rule',
  ignored_unknown_message_id: 'Unknown message id (acknowledged)',
  ignored_stop_no_matching_lead: 'STOP received — no matching lead',
};

/**
 * BW-109 "Delivery / Webhook Logs" — the tenant's own trail of accepted
 * WhatsApp webhook events (`GET /tenants/{t}/whatsapp/webhook-logs`).
 * Events originate from the mock provider in this environment and the
 * panel says so.
 */
@Component({
  selector: 'app-whatsapp-webhook-logs',
  standalone: true,
  imports: [SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="block">
      <h2>Webhook &amp; delivery events @if (mock()) { <span class="badge badge--mock">MOCK_PROVIDER</span> }</h2>
      <p class="meta">Every provider webhook accepted for this business, newest first (signature-verified, replay-deduplicated).</p>
      <button type="button" (click)="load()" [disabled]="loading()">Refresh</button>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (logs().length === 0) {
        <app-empty-state icon="support" title="No webhook events yet" message="Delivery receipts and inbound replies will be listed here." />
      } @else {
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Delivery status</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of logs(); track entry.id) {
                <tr>
                  <td class="meta">{{ entry.received_at }}</td>
                  <td>{{ entry.event_kind }}</td>
                  <td>{{ actionLabel(entry) }}</td>
                  <td>
                    @if (entry.delivery_status) {
                      <span class="badge badge--dot" [class]="statusClass(entry.delivery_status)">{{ entry.delivery_status }}</span>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .block { margin-bottom: 2rem; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .table-scroll { overflow-x: auto; margin-top: 0.75rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    `,
  ],
})
export class WhatsAppWebhookLogsComponent implements OnInit {
  readonly logs = signal<WebhookLogEntry[]>([]);
  readonly mock = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly insights: WhatsAppInsightsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.webhookLogs(tenantId).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.logs.set(res.logs);
        this.mock.set(res.mock_provider);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  actionLabel(entry: WebhookLogEntry): string {
    return ACTION_LABELS[entry.action] ?? entry.action;
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
