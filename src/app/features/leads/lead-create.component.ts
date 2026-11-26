import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../core/feedback/toast.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LEAD_CONSENT_STATUSES, LeadConsentStatus } from '../../core/leads/lead.models';
import { LeadService } from '../../core/leads/lead.service';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { TenantMember } from '../../core/members/member.models';
import { MemberService } from '../../core/members/member.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';

/** Cross-field validator: the backend requires at least one of phone/email (`LeadService::create()`). */
export function phoneOrEmailRequired(control: AbstractControl): ValidationErrors | null {
  const phone = (control.get('phone')?.value ?? '').trim();
  const email = (control.get('email')?.value ?? '').trim();
  return phone === '' && email === '' ? { phoneOrEmailRequired: true } : null;
}

interface SourcePreset {
  value: string;
  label: string;
}

interface ConsentOptionMeta {
  value: LeadConsentStatus;
  title: string;
  description: string;
  badgeClass: string;
}

const SOURCE_PRESETS: SourcePreset[] = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'google', label: 'Google Business' },
  { value: 'meta', label: 'Meta / Instagram' },
  { value: 'referral', label: 'Referral' },
];

const CONSENT_OPTIONS_META: ConsentOptionMeta[] = [
  {
    value: 'granted',
    title: 'Granted (Opted in)',
    description: 'Contact agreed to receive WhatsApp & marketing follow-ups.',
    badgeClass: 'badge--success',
  },
  {
    value: 'unknown',
    title: 'Unknown (Not confirmed)',
    description: 'Consent not yet verified. Use transactional follow-up only.',
    badgeClass: 'badge--warning',
  },
  {
    value: 'declined',
    title: 'Declined (Opted out)',
    description: 'Do not send automated or promotional messages.',
    badgeClass: 'badge--danger',
  },
];

/**
 * `/app/:tenantId/leads/new` — Dedicated, clean SaaS form page for adding a new lead.
 */
@Component({
  selector: 'app-lead-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, IconComponent],
  template: `
    <section class="lead-create">
      <app-page-header
        eyebrow="CRM"
        eyebrowLabel="Leads"
        title="Add new lead"
        subtitle="Capture contact information, source attribution, and communication consent."
      />

      @if (!tenantId()) {
        <div class="card notice-card" role="alert">
          <p class="form-error">No business selected. Go back to "Choose a business".</p>
        </div>
      } @else if (!canManage()) {
        <div class="card notice-card">
          <div class="notice-card__body">
            <span class="icon-tile icon-tile--amber">
              <ui-icon name="security" [size]="18" />
            </span>
            <div>
              <h2>Permission required</h2>
              <p class="meta">Only a business owner, admin, or editor can add new leads.</p>
            </div>
          </div>
          <div>
            <a class="btn-secondary" [routerLink]="['/app', tenantId(), 'leads']">Back to leads</a>
          </div>
        </div>
      } @else {
        <form class="create-form-shell" [formGroup]="form" (ngSubmit)="submit(false)" novalidate>
          @if (savedNotice()) {
            <div class="alert-banner alert-banner--success" role="status">
              <ui-icon name="approvals" [size]="16" />
              <span>{{ savedNotice() }}</span>
            </div>
          }
          @if (dedupedNotice()) {
            <div class="alert-banner alert-banner--warning" role="status">
              <ui-icon name="help" [size]="16" />
              <span>Matched an existing lead with the same contact details instead of creating a duplicate.</span>
            </div>
          }
          @if (errorMessage() && !hasFieldErrors()) {
            <div class="alert-banner alert-banner--danger" role="alert">
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- Section 1: Contact Information -->
          <div class="card form-section">
            <div class="section-header">
              <span class="icon-tile">
                <ui-icon name="leads" [size]="17" />
              </span>
              <div>
                <h2>Contact details</h2>
                <p class="meta">Enter the prospect's name and at least one contact method (phone or email).</p>
              </div>
            </div>

            <div class="field-grid">
              <label class="field field--full">
                <span class="field-label">Full name</span>
                <input
                  type="text"
                  formControlName="name"
                  placeholder="e.g. Priya Sharma"
                  autocomplete="name"
                />
                @if (fieldError('name')) {
                  <span class="field-error">{{ fieldError('name') }}</span>
                }
              </label>

              <label class="field">
                <span class="field-label">
                  Phone number
                  <span class="field-hint">Phone or email required</span>
                </span>
                <input
                  type="tel"
                  formControlName="phone"
                  placeholder="e.g. +91 98765 43210"
                  autocomplete="tel"
                />
                @if (fieldError('phone')) {
                  <span class="field-error">{{ fieldError('phone') }}</span>
                }
              </label>

              <label class="field">
                <span class="field-label">
                  Email address
                  <span class="field-hint">Phone or email required</span>
                </span>
                <input
                  type="email"
                  formControlName="email"
                  placeholder="e.g. priya@example.com"
                  autocomplete="email"
                />
                @if (fieldError('email')) {
                  <span class="field-error">{{ fieldError('email') }}</span>
                }
              </label>
            </div>

            @if (form.errors?.['phoneOrEmailRequired'] && (form.dirty || submitAttempted())) {
              <p class="contact-req-error" role="alert">
                Please provide at least a phone number or an email address so your team can follow up.
              </p>
            }
          </div>

          <!-- Section 2: Attribution & Ownership -->
          <div class="card form-section">
            <div class="section-header">
              <span class="icon-tile icon-tile--mint">
                <ui-icon name="target" [size]="17" />
              </span>
              <div>
                <h2>Source &amp; assignment</h2>
                <p class="meta">Select how this enquiry arrived and optionally assign a team owner or location.</p>
              </div>
            </div>

            <div class="source-block">
              <span class="field-label">Lead source <span class="req-star">*</span></span>
              <div class="source-pills" role="group" aria-label="Quick lead sources">
                @for (preset of sourcePresets; track preset.value) {
                  <button
                    type="button"
                    class="source-pill"
                    [class.source-pill--active]="form.controls.source.value === preset.value"
                    (click)="selectSource(preset.value)"
                  >
                    {{ preset.label }}
                  </button>
                }
              </div>
              <input
                type="text"
                formControlName="source"
                placeholder="Or enter a custom source (e.g. expo_booth, partner_referral)…"
                aria-label="Source"
              />
              @if (fieldError('source')) {
                <span class="field-error">{{ fieldError('source') }}</span>
              }
            </div>

            <div class="field-grid">
              <label class="field">
                <span class="field-label">
                  Assigned owner
                  <span class="field-hint">Optional</span>
                </span>
                <select formControlName="ownerId">
                  <option value="">Unassigned (use default routing)</option>
                  @for (member of activeMembers(); track member.user_id) {
                    <option [value]="member.user_id">{{ member.name }} ({{ member.role }})</option>
                  }
                </select>
                @if (fieldError('owner_id')) {
                  <span class="field-error">{{ fieldError('owner_id') }}</span>
                }
              </label>

              <label class="field">
                <span class="field-label">
                  Business location
                  <span class="field-hint">Optional</span>
                </span>
                <select formControlName="locationId">
                  <option value="">No specific location</option>
                  @for (location of locations(); track location.id) {
                    <option [value]="location.id">{{ location.name }}</option>
                  }
                </select>
                @if (fieldError('location_id')) {
                  <span class="field-error">{{ fieldError('location_id') }}</span>
                }
              </label>
            </div>
          </div>

          <!-- Section 3: Communication Consent -->
          <div class="card form-section">
            <div class="section-header">
              <span class="icon-tile icon-tile--amber">
                <ui-icon name="security" [size]="17" />
              </span>
              <div>
                <h2>Communication consent</h2>
                <p class="meta">Record whether this lead has opted in to receive WhatsApp or promotional messages.</p>
              </div>
            </div>

            <div class="consent-grid" role="radiogroup" aria-label="Consent status">
              @for (opt of consentMeta; track opt.value) {
                <label
                  class="consent-card"
                  [class.consent-card--selected]="form.controls.consentStatus.value === opt.value"
                >
                  <input
                    type="radio"
                    formControlName="consentStatus"
                    [value]="opt.value"
                  />
                  <div class="consent-card__top">
                    <span class="badge badge--dot" [class]="opt.badgeClass">{{ opt.value }}</span>
                    <span class="consent-card__check" aria-hidden="true"></span>
                  </div>
                  <span class="consent-card__title">{{ opt.title }}</span>
                  <span class="consent-card__desc">{{ opt.description }}</span>
                </label>
              }
            </div>
            @if (fieldError('consent_status')) {
              <p class="field-error">{{ fieldError('consent_status') }}</p>
            }
          </div>

          <!-- Action Footer -->
          <div class="form-actions-bar">
            <a class="btn-secondary" [routerLink]="['/app', tenantId(), 'leads']">Cancel</a>
            <div class="form-actions-bar__right">
              <button
                type="button"
                class="btn-secondary"
                (click)="submit(true)"
                [disabled]="submitting()"
                data-testid="save-and-add-another"
              >
                {{ submitting() && stayAfterSave() ? 'Saving…' : 'Save & add another' }}
              </button>
              <button
                type="submit"
                class="btn-primary submit-lead-btn"
                [disabled]="submitting()"
                data-testid="submit-create-lead"
              >
                <ui-icon name="plus" [size]="15" />
                <span>{{ submitting() && !stayAfterSave() ? 'Adding lead…' : 'Add lead' }}</span>
              </button>
            </div>
          </div>
        </form>
      }
    </section>
  `,
  styles: [
    `
      .lead-create {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .meta {
        margin: 2px 0 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        line-height: 1.4;
      }
      .notice-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        flex-wrap: wrap;
      }
      .notice-card__body {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .notice-card h2 {
        margin: 0;
        font-size: var(--text-base);
      }

      .create-form-shell {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .alert-banner {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: 0.65rem 0.9rem;
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
      }
      .alert-banner--success {
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        color: var(--color-success);
      }
      .alert-banner--warning {
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        color: var(--color-warning);
      }
      .alert-banner--danger {
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
      }

      .form-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
      }
      .section-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding-bottom: var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }
      .section-header h2 {
        margin: 0;
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
      }

      .field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
      }
      @media (max-width: 640px) {
        .field-grid {
          grid-template-columns: 1fr;
        }
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .field--full {
        grid-column: 1 / -1;
      }
      .field-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .field-hint {
        font-size: 0.7rem;
        font-weight: var(--font-normal);
        color: var(--color-text-subtle);
      }
      .req-star {
        color: var(--color-danger);
      }
      .field input,
      .field select,
      .source-block input {
        width: 100%;
        height: 38px;
        padding: 0 0.75rem;
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        font-size: var(--text-sm);
        color: var(--color-text);
      }

      .contact-req-error {
        margin: 0;
        padding: 0.55rem 0.75rem;
        border-radius: var(--radius-sm);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
      }

      .source-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .source-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .source-pill {
        padding: 0.3rem 0.7rem;
        border-radius: var(--radius-pill);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.14s ease;
      }
      .source-pill:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
        background: var(--color-primary-light);
      }
      .source-pill--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .source-pill--active:hover {
        background: var(--color-primary-hover);
        border-color: var(--color-primary-hover);
        color: var(--color-primary-contrast);
      }

      .consent-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      @media (max-width: 720px) {
        .consent-grid {
          grid-template-columns: 1fr;
        }
      }
      .consent-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: var(--space-3);
        border: 1.5px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        cursor: pointer;
        transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
      }
      .consent-card:hover {
        border-color: var(--color-border-hover);
        background: var(--color-surface-alt);
      }
      .consent-card--selected {
        border-color: var(--color-primary);
        background: rgba(7, 141, 126, 0.04);
        box-shadow: 0 0 0 3px var(--color-primary-ring);
      }
      .consent-card input[type='radio'] {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
      }
      .consent-card__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .consent-card__top .badge {
        text-transform: capitalize;
      }
      .consent-card__check {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 1.5px solid var(--color-border-strong);
        background: var(--color-surface);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .consent-card--selected .consent-card__check {
        border-color: var(--color-primary);
        background: var(--color-primary);
        box-shadow: inset 0 0 0 3px #ffffff;
      }
      .consent-card__title {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .consent-card__desc {
        font-size: var(--text-xs);
        font-weight: var(--font-normal);
        color: var(--color-text-muted);
        line-height: 1.4;
      }

      .field-error,
      .form-error {
        color: var(--color-danger);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        margin: 0;
      }

      .form-actions-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
      }
      .form-actions-bar__right {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .submit-lead-btn {
        padding: 0.48rem 1.15rem;
      }
    `,
  ],
})
export class LeadCreateComponent implements OnInit {
  private readonly fb = new FormBuilder();
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly currentTenant = inject(CurrentTenantService);
  private readonly leadService = inject(LeadService);
  private readonly memberService = inject(MemberService);
  private readonly locationService = inject(LocationApiService);

  readonly sourcePresets = SOURCE_PRESETS;
  readonly consentOptions = LEAD_CONSENT_STATUSES;
  readonly consentMeta = CONSENT_OPTIONS_META;

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canManage = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly members = signal<TenantMember[]>([]);
  readonly activeMembers = computed(() => this.members().filter((m) => m.status === 'active'));
  readonly locations = signal<LocationSummary[]>([]);

  readonly form = this.fb.nonNullable.group(
    {
      name: [''],
      phone: [''],
      email: [''],
      source: ['manual', [Validators.required]],
      consentStatus: ['unknown' as LeadConsentStatus, [Validators.required]],
      ownerId: [''],
      locationId: [''],
    },
    { validators: [phoneOrEmailRequired] },
  );

  readonly submitting = signal(false);
  readonly stayAfterSave = signal(false);
  readonly submitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly dedupedNotice = signal(false);
  readonly savedNotice = signal<string | null>(null);

  ngOnInit(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.memberService.list(tenantId).subscribe({
      next: (members) => this.members.set(members),
      error: () => this.members.set([]),
    });
    this.locationService.list(tenantId).subscribe({
      next: (locations) => this.locations.set(locations),
      error: () => this.locations.set([]),
    });
  }

  selectSource(source: string): void {
    this.form.controls.source.setValue(source);
    this.form.controls.source.markAsDirty();
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  submit(addAnother = false): void {
    this.submitAttempted.set(true);
    const tenantId = this.tenantId();
    if (this.form.invalid || this.submitting() || !tenantId) {
      return;
    }

    this.stayAfterSave.set(addAnother);
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.dedupedNotice.set(false);
    this.savedNotice.set(null);

    const { name, phone, email, source, consentStatus, ownerId, locationId } = this.form.getRawValue();
    this.leadService
      .create(tenantId, {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        source: source.trim(),
        consent_status: consentStatus,
        owner_id: ownerId || undefined,
        location_id: locationId || undefined,
      })
      .subscribe({
        next: (lead) => {
          this.submitting.set(false);
          this.submitAttempted.set(false);
          const wasDeduped = Boolean(lead.deduped);

          if (addAnother) {
            this.dedupedNotice.set(wasDeduped);
            if (!wasDeduped) {
              this.savedNotice.set(`Added "${lead.name || lead.phone || lead.email || 'lead'}". Ready for the next entry.`);
            }
            this.form.reset({
              name: '',
              phone: '',
              email: '',
              source: 'manual',
              consentStatus: 'unknown',
              ownerId: '',
              locationId: '',
            });
            return;
          }

          if (wasDeduped) {
            this.toast.info('Matched an existing lead with the same contact details.', 'Duplicate prevented');
          }
          void this.router.navigate(['/app', tenantId, 'leads']);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
