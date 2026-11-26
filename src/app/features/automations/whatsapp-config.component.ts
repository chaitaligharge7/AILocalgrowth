import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { WhatsAppConfig } from '../../core/automations/whatsapp-insights.models';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * BW-102 "Cloud API Configuration" — a READ-ONLY view of the platform-level
 * WhatsApp setup that governs this business's sends. Secrets are never
 * returned (only "is it set" flags). Per-business WABA onboarding needs real
 * Meta credentials that do not exist in this environment, so there is
 * deliberately no editable credentials form here.
 */
@Component({
  selector: 'app-whatsapp-config',
  standalone: true,
  imports: [SkeletonLoaderComponent],
  template: `
    <section class="block">
      <h2>WhatsApp setup @if (config()?.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }</h2>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
       @if (config(); as c) {
        @if (c.mock_provider) {
          <p class="notice">
            Messages are sent through a simulated provider. Nothing here reaches a real WhatsApp number until the
            platform is switched to live mode with real Meta credentials.
          </p>
        }
        <dl class="facts card">
          <div><dt>Provider mode</dt><dd>{{ c.mode }}</dd></div>
          <div><dt>Approved templates</dt><dd>{{ c.approved_templates }}</dd></div>
          <div><dt>Daily send limit</dt><dd>{{ c.daily_message_quota }} messages</dd></div>
          <div><dt>Sending window</dt><dd>{{ c.quiet_hours.start }}–{{ c.quiet_hours.end }} ({{ c.quiet_hours.timezone }})</dd></div>
          <div><dt>Webhook endpoint</dt><dd><code>{{ c.webhook_path }}</code></dd></div>
          <div>
            <dt>Credentials</dt>
            <dd>
              Phone number id: {{ c.credentials_configured.phone_number_id ? 'set' : 'not set' }} ·
              Access token: {{ c.credentials_configured.access_token ? 'set' : 'not set' }} ·
              App secret: {{ c.credentials_configured.app_secret ? 'set' : 'not set' }}
            </dd>
          </div>
        </dl>
        <p class="meta">These limits are platform settings; they are shown here so you know what governs your sends.</p>
       }
      }
    </section>
  `,
  styles: [
    `
      .block { margin-bottom: 2rem; }
      .notice { background: var(--color-warning-bg); color: var(--color-warning); padding: 0.75rem 1rem; border-radius: var(--radius-md); }
      .facts { display: grid; gap: 0.75rem; margin: 1rem 0; }
      .facts div { display: grid; grid-template-columns: 11rem 1fr; gap: 1rem; }
      .facts dt { font-weight: 600; color: var(--color-text-muted); }
      .facts dd { margin: 0; }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      @media (max-width: 640px) { .facts div { grid-template-columns: 1fr; gap: 0.15rem; } }
    `,
  ],
})
export class WhatsAppConfigComponent implements OnInit {
  readonly config = signal<WhatsAppConfig | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly insights: WhatsAppInsightsService,
  ) {}

  ngOnInit(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.insights.config(tenantId).subscribe({
      next: (config) => {
        this.loading.set(false);
        this.config.set(config);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }
}
