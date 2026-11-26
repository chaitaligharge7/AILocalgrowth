import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { AdminPlan, BillingPeriod, TaxBehavior } from '../../../core/admin/admin.models';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/premium/empty-state.component';

/**
 * `/admin/plans` — `GET/POST /admin/plans`. `POST` always creates a NEW
 * `plan_versions` row (immutable-after-sold per blueprint §5.7) — this
 * screen never offers to "edit" an existing version, only list them and
 * create a new one. `feature_limits` is entered as simple `key=value`
 * lines and parsed into an object client-side (no generic JSON editor —
 * kept consistent with how simple this sprint's feature-limit set is).
 */
@Component({
  selector: 'app-admin-plans',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="admin-plans">
      <app-page-header
        eyebrow="Platform admin"
        eyebrowLabel="Subscriptions"
        title="Plans"
        subtitle="List existing plan versions and create a new, immutable version."
      />
      <button type="button" class="btn-secondary" (click)="refresh()" [disabled]="loading()">Refresh</button>

      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (plans().length === 0) {
        <app-empty-state title="No plans yet" message="Create the first plan version below." />
      } @else {
        @for (plan of plans(); track plan.id) {
          <div class="plan-card">
            <h2>{{ plan.display_name }} <span class="meta">({{ plan.code }}, {{ plan.status }})</span></h2>
            <table>
              <thead>
                <tr>
                  <th>v</th>
                  <th>Billing period</th>
                  <th>Price (INR)</th>
                  <th>Tax</th>
                  <th>Effective from</th>
                </tr>
              </thead>
              <tbody>
                @for (version of plan.versions; track version.id) {
                  <tr>
                    <td>{{ version.version_no }}</td>
                    <td>{{ version.billing_period }}</td>
                    <td>{{ version.price_inr }}</td>
                    <td>{{ version.tax_behavior }}</td>
                    <td>{{ version.effective_from }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      <h2>Create a new plan version</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Plan code
          <input type="text" formControlName="plan_code" placeholder="e.g. pro" />
        </label>
        @if (fieldError('plan_code')) {
          <p class="field-error">{{ fieldError('plan_code') }}</p>
        }

        <label>
          Display name <span class="meta">(required only for a brand-new plan_code)</span>
          <input type="text" formControlName="display_name" />
        </label>
        @if (fieldError('display_name')) {
          <p class="field-error">{{ fieldError('display_name') }}</p>
        }

        <label>
          Billing period
          <select formControlName="billing_period">
            <option value="monthly">monthly</option>
            <option value="yearly">yearly</option>
          </select>
        </label>

        <label>
          Price (INR)
          <input type="number" min="0" step="0.01" formControlName="price_inr" />
        </label>
        @if (fieldError('price_inr')) {
          <p class="field-error">{{ fieldError('price_inr') }}</p>
        }

        <label>
          Tax behavior
          <select formControlName="tax_behavior">
            <option value="exclusive">exclusive</option>
            <option value="inclusive">inclusive</option>
          </select>
        </label>

        <label>
          Feature limits <span class="meta">(one meter_code=limit per line)</span>
          <textarea formControlName="feature_limits_raw" rows="3" placeholder="ai_generations_per_month=200"></textarea>
        </label>
        @if (fieldError('feature_limits')) {
          <p class="field-error">{{ fieldError('feature_limits') }}</p>
        }

        <label class="reason-label">
          Reason <span class="required-mark">(required)</span>
          <input type="text" formControlName="reason" placeholder="Why is this plan version being created?" />
        </label>
        @if (form.controls.reason.touched && form.controls.reason.invalid) {
          <p class="field-error">A reason is required for this privileged action.</p>
        }

        @if (errorMessage() && !hasFieldErrors()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }
        @if (created()) {
          <p class="success" role="status">Created plan version v{{ created() }}.</p>
        }

        <button type="submit" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Creating…' : 'Create plan version' }}
        </button>
      </form>
    </section>
  `,
  styles: [
    `
      .admin-plans {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .plan-card {
        margin: 0;
        padding: var(--space-4);
        background: #fff;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-card, 14px);
      }
      .meta {
        color: var(--color-text-muted);
        font-size: 0.8rem;
        font-weight: 400;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.5rem;
      }
      th,
      td {
        text-align: center;
        padding: 0.35rem;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.875rem;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
      }
      .reason-label {
        border-top: 1px solid var(--color-border);
        padding-top: var(--space-3);
      }
      .required-mark {
        color: var(--color-danger);
        font-weight: 700;
      }
      input,
      select,
      textarea {
        padding: 0.5rem;
        font: inherit;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: 0.875rem;
      }
      .success {
        color: var(--color-success, #146c2e);
        margin: 0;
      }
      .btn-secondary {
        align-self: flex-start;
      }
      button {
        padding: 0.6rem 1rem;
        cursor: pointer;
        align-self: flex-start;
      }
    `,
  ],
})
export class AdminPlansComponent implements OnInit {
  readonly plans = signal<AdminPlan[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly created = signal<number | null>(null);

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    plan_code: ['', [Validators.required]],
    display_name: [''],
    billing_period: ['monthly' as BillingPeriod, [Validators.required]],
    price_inr: [0, [Validators.required, Validators.min(0)]],
    tax_behavior: ['exclusive' as TaxBehavior, [Validators.required]],
    feature_limits_raw: ['', [Validators.required]],
    reason: ['', [Validators.required]],
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.admin.listPlans().subscribe({
      next: (plans) => {
        this.loading.set(false);
        this.plans.set(plans);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  private parseFeatureLimits(raw: string): Record<string, number> {
    const limits: Record<string, number> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [key, value] = trimmed.split('=').map((part) => part.trim());
      if (key && value !== undefined && value !== '') {
        const num = Number(value);
        if (Number.isFinite(num)) {
          limits[key] = num;
        }
      }
    }
    return limits;
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.created.set(null);

    const { plan_code, display_name, billing_period, price_inr, tax_behavior, feature_limits_raw, reason } = this.form.getRawValue();
    this.admin
      .createPlan({
        plan_code,
        display_name: display_name || undefined,
        billing_period,
        price_inr,
        tax_behavior,
        feature_limits: this.parseFeatureLimits(feature_limits_raw),
        reason,
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.created.set(result.version.version_no);
          this.refresh();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
