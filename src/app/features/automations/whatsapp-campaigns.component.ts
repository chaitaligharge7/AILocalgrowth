import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LEAD_ALL_STATUSES } from '../../core/leads/lead.models';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { Campaign } from '../../core/automations/whatsapp-insights.models';
import { WhatsAppTemplate } from '../../core/automations/whatsapp-template.models';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';

const SKIP_REASON_LABELS: Record<string, string> = {
  CONSENT_NOT_GRANTED: 'No WhatsApp consent',
  LEAD_IN_TERMINAL_STATE: 'Lead already won/lost/archived',
  QUIET_HOURS: 'Outside sending hours',
  TENANT_QUOTA_EXCEEDED: 'Daily limit reached',
  TEMPLATE_NOT_APPROVED: 'Template not approved',
  NO_PHONE_ON_FILE: 'No phone number',
  LEAD_NOT_FOUND: 'Lead no longer exists',
};

/**
 * BW-108 "Campaign Execution" — one approved template to every lead in an
 * optional status/tag segment (`/tenants/{t}/whatsapp/campaigns`). Launching
 * only queues recipients; each send is consent/quiet-hours/quota guarded by
 * the worker, and the outcome chips below are the real per-lead results
 * (never "N delivered" assumed).
 */
@Component({
  selector: 'app-whatsapp-campaigns',
  standalone: true,
  imports: [ReactiveFormsModule, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="block">
      <h2>Campaigns <span class="badge badge--mock">MOCK_PROVIDER</span></h2>
      <p class="meta">
        A campaign sends one approved template to a segment of leads. Leads without WhatsApp consent are skipped
        automatically and reported below.
      </p>

      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (campaigns().length === 0) {
        <app-empty-state icon="campaigns" title="No campaigns yet" message="Create a campaign to message a group of consenting leads." />
      } @else {
        <ul class="campaigns">
          @for (campaign of campaigns(); track campaign.id) {
            <li class="card">
              <div class="head">
                <strong>{{ campaign.name }}</strong>
                <span class="badge badge--dot" [class]="campaign.status === 'launched' ? 'badge--info' : 'badge--neutral'">{{ campaign.status }}</span>
              </div>
              <p class="meta">
                Segment: {{ segmentLabel(campaign) }} · Template: {{ templateLabel(campaign.template_id) }}
              </p>
              @if (campaign.status === 'launched') {
                <p class="chips">
                  <span class="badge">{{ campaign.recipients_total }} recipients</span>
                  @for (entry of entries(campaign.outcomes); track entry[0]) {
                    <span class="badge badge--dot" [class]="outcomeClass(entry[0])">{{ entry[0] }} · {{ entry[1] }}</span>
                  }
                </p>
                @if (entries(campaign.skip_reasons).length > 0) {
                  <p class="meta">
                    Skipped:
                    @for (entry of entries(campaign.skip_reasons); track entry[0]; let last = $last) {
                      {{ skipLabel(entry[0]) }} ({{ entry[1] }}){{ last ? '' : ', ' }}
                    }
                  </p>
                }
              } @else if (canManage) {
                <button type="button" class="btn-primary" (click)="launch(campaign)" [disabled]="launchingId() === campaign.id">
                  {{ launchingId() === campaign.id ? 'Launching…' : 'Launch campaign' }}
                </button>
              }
            </li>
          }
        </ul>
        @if (actionError()) {
          <p class="form-error" role="alert">{{ actionError() }}</p>
        }
      }

      @if (canManage) {
        <h3>New campaign</h3>
        <form [formGroup]="form" (ngSubmit)="create()" novalidate>
          <label>
            Name
            <input type="text" formControlName="name" maxlength="120" />
          </label>
          @if (fieldError('name')) { <p class="field-error">{{ fieldError('name') }}</p> }

          <label>
            Template
            <select formControlName="templateId">
              <option value="">(choose an approved template)</option>
              @for (template of templates; track template.id) {
                <option [value]="template.id">{{ template.external_template_id }} ({{ template.language }})</option>
              }
            </select>
          </label>
          @if (fieldError('template_id')) { <p class="field-error">{{ fieldError('template_id') }}</p> }

          <label>
            Only leads in stage (optional)
            <select formControlName="segmentStatus">
              <option value="">Any stage</option>
              @for (status of statuses; track status) {
                <option [value]="status">{{ status }}</option>
              }
            </select>
          </label>
          @if (fieldError('segment_status')) { <p class="field-error">{{ fieldError('segment_status') }}</p> }

          <label>
            Only leads with tag (optional)
            <input type="text" formControlName="segmentTag" maxlength="60" placeholder="e.g. vip" />
          </label>
          @if (fieldError('segment_tag')) { <p class="field-error">{{ fieldError('segment_tag') }}</p> }

          @if (formError() && !hasFieldErrors()) { <p class="form-error" role="alert">{{ formError() }}</p> }
          <button type="submit" [disabled]="form.invalid || creating()">{{ creating() ? 'Creating…' : 'Create campaign' }}</button>
        </form>
      } @else {
        <p class="meta">Only an owner, admin or editor may create or launch campaigns (enforced server-side).</p>
      }
    </section>
  `,
  styles: [
    `
      .block { margin-bottom: 2rem; }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .campaigns { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: 0.75rem; }
      .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
      form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 420px; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; }
      select, input { padding: 0.5rem; font: inherit; }
      .field-error, .form-error { color: var(--color-danger); margin: 0; font-size: 0.875rem; }
      button { align-self: flex-start; }
    `,
  ],
})
export class WhatsAppCampaignsComponent implements OnInit {
  @Input() canManage = false;
  @Input() templates: WhatsAppTemplate[] = [];

  readonly statuses = LEAD_ALL_STATUSES;
  readonly campaigns = signal<Campaign[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly launchingId = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    templateId: ['', [Validators.required]],
    segmentStatus: [''],
    segmentTag: [''],
  });
  readonly creating = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly insights: WhatsAppInsightsService,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.listCampaigns(tenantId).subscribe({
      next: (campaigns) => {
        this.loading.set(false);
        this.campaigns.set(campaigns);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  create(): void {
    const tenantId = this.tenantId();
    if (this.form.invalid || this.creating() || !tenantId) {
      return;
    }
    this.creating.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);
    const { name, templateId, segmentStatus, segmentTag } = this.form.getRawValue();
    this.insights
      .createCampaign(tenantId, {
        name,
        template_id: templateId,
        segment_status: segmentStatus || undefined,
        segment_tag: segmentTag.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.form.reset({ name: '', templateId: '', segmentStatus: '', segmentTag: '' });
          this.refresh();
        },
        error: (err: unknown) => {
          this.creating.set(false);
          this.formError.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  launch(campaign: Campaign): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.launchingId()) {
      return;
    }
    this.launchingId.set(campaign.id);
    this.actionError.set(null);
    this.insights.launchCampaign(tenantId, campaign.id).subscribe({
      next: () => {
        this.launchingId.set(null);
        this.refresh();
      },
      error: (err: unknown) => {
        this.launchingId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  entries(record: Record<string, number>): [string, number][] {
    return Object.entries(record);
  }

  segmentLabel(campaign: Campaign): string {
    const parts: string[] = [];
    if (campaign.segment_status) {
      parts.push(`stage “${campaign.segment_status}”`);
    }
    if (campaign.segment_tag) {
      parts.push(`tag “${campaign.segment_tag}”`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'all leads';
  }

  templateLabel(templateId: string): string {
    return this.templates.find((t) => t.id === templateId)?.external_template_id ?? templateId;
  }

  skipLabel(reason: string): string {
    return SKIP_REASON_LABELS[reason] ?? reason;
  }

  outcomeClass(outcome: string): string {
    switch (outcome) {
      case 'sent':
        return 'badge--success';
      case 'skipped':
        return 'badge--warning';
      case 'unknown':
        return 'badge--danger';
      default:
        return 'badge--info';
    }
  }
}
