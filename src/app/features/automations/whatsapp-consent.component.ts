import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { ConsentSummary } from '../../core/automations/whatsapp-insights.models';
import { StatCardComponent } from '../../shared/dashboard-pattern/stat-card.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * BW-107 "Contacts / Consent" — real counts of leads by recorded WhatsApp
 * consent plus the consent-record ledger (`GET .../whatsapp/consent-summary`).
 * Per-contact consent is edited on the lead itself; this is the overview.
 */
@Component({
  selector: 'app-whatsapp-consent',
  standalone: true,
  imports: [RouterLink, StatCardComponent, SkeletonLoaderComponent],
  template: `
    <section class="block">
      <h2>Contacts &amp; consent</h2>
      <p class="meta">
        Only leads with <strong>granted</strong> WhatsApp consent can ever be messaged — every send re-checks consent
        at send time, and a STOP reply revokes it immediately.
      </p>
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
       @if (summary(); as s) {
        <div class="stat-grid">
          <app-stat-card label="Messageable leads" [value]="s.messageable_leads" hint="Consent granted" />
          <app-stat-card label="Declined" [value]="s.leads_by_consent_status.declined" hint="Never messaged" />
          <app-stat-card label="Unknown" [value]="s.leads_by_consent_status.unknown" hint="No consent captured — never messaged" />
          <app-stat-card
            label="Opt-outs recorded"
            [value]="s.whatsapp_consent_records.revoked"
            [hint]="s.whatsapp_consent_records.active + ' active consent records'"
          />
        </div>
        <p class="meta">
          To review or change an individual contact's consent, open the lead in
          <a [routerLink]="['/app', tenantId(), 'leads']">Leads</a>.
        </p>
       }
      }
    </section>
  `,
  styles: [
    `
      .block { margin-bottom: 2rem; }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin: 1rem 0; }
    `,
  ],
})
export class WhatsAppConsentComponent implements OnInit {
  readonly summary = signal<ConsentSummary | null>(null);
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
    this.insights.consentSummary(tenantId).subscribe({
      next: (summary) => {
        this.loading.set(false);
        this.summary.set(summary);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }
}
