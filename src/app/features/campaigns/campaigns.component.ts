import { Component, OnInit, computed, signal } from '@angular/core';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { CampaignAuditComponent } from './campaign-audit.component';
import { CampaignCalendarComponent } from './campaign-calendar.component';
import { CampaignListComponent } from './campaign-list.component';
import { CampaignMonitorComponent } from './campaign-monitor.component';
import { CampaignPerformanceComponent } from './campaign-performance.component';

type CampaignTab = 'campaigns' | 'calendar' | 'monitor' | 'performance' | 'audit';

const EDIT_ROLES = ['owner', 'admin', 'editor'];
const ADMIN_ROLES = ['owner', 'admin'];

/**
 * `/app/:tenantId/campaigns` — multi-channel campaigns, campaign calendar,
 * publishing job monitor, publishing performance and the publishing audit
 * log. Drafts created here go through the normal approve -> schedule ->
 * publish steps; while the providers run in mock mode every job is labelled
 * MOCK_PROVIDER and nothing reaches a real account.
 */
@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CampaignListComponent,
    CampaignCalendarComponent,
    CampaignMonitorComponent,
    CampaignPerformanceComponent,
    CampaignAuditComponent,
  ],
  template: `
    <section class="campaigns">
      <app-page-header
        eyebrow="Publishing"
        eyebrowLabel="Campaigns"
        title="Campaigns & publishing"
        subtitle="Plan multi-channel posts, watch publishing jobs and review outcomes."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <nav class="tabs" role="tablist" aria-label="Campaign sections">
          @for (t of tabs(); track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
          }
        </nav>

        @switch (tab()) {
          @case ('campaigns') { <app-campaign-list [tenantId]="tenantId()" [canEdit]="canEdit()" [locations]="locations()" /> }
          @case ('calendar') { <app-campaign-calendar [tenantId]="tenantId()" /> }
          @case ('monitor') { <app-campaign-monitor [tenantId]="tenantId()" /> }
          @case ('performance') { <app-campaign-performance [tenantId]="tenantId()" /> }
          @case ('audit') { <app-campaign-audit [tenantId]="tenantId()" /> }
        }
      }
    </section>
  `,
  styles: [
    `
      .campaigns { width: 100%; font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
      .form-error { color: #b00020; }
      .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; }
      .tabs button { border-radius: 999px; padding: 0.4rem 1rem; cursor: pointer; }
      .tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
    `,
  ],
})
export class CampaignsComponent implements OnInit {
  readonly tab = signal<CampaignTab>('campaigns');
  readonly locations = signal<LocationSummary[]>([]);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly role = computed(() => this.currentTenant.tenant()?.caller_role ?? '');
  readonly canEdit = computed(() => EDIT_ROLES.includes(this.role()));
  readonly tabs = computed(() => {
    const base: { id: CampaignTab; label: string }[] = [
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'calendar', label: 'Campaign calendar' },
      { id: 'monitor', label: 'Job monitor' },
      { id: 'performance', label: 'Performance' },
    ];
    return ADMIN_ROLES.includes(this.role()) ? [...base, { id: 'audit' as CampaignTab, label: 'Audit log' }] : base;
  });

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly locationApi: LocationApiService,
  ) {}

  ngOnInit(): void {
    if (this.tenantId()) {
      this.locationApi.list(this.tenantId()).subscribe({ next: (l) => this.locations.set(l), error: () => this.locations.set([]) });
    }
  }
}
