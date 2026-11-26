import { RouterLink } from '@angular/router';
import { Component, computed, signal } from '@angular/core';
import { BillingService } from '../../core/billing/billing.service';
import {
  BillingPeriod,
  Invoice,
  PaymentOrder,
  PlanVersion,
  SUBSCRIPTION_ACTIVE_STATUSES,
  SubscriptionChangeResult,
  TenantSubscription,
  UsageMeter,
  isPaymentOrder,
} from '../../core/billing/billing.models';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';

interface PlanGroup {
  planCode: string;
  displayName: string;
  monthly: PlanVersion | null;
  yearly: PlanVersion | null;
}

/**
 * `/app/:tenantId/billing` — blueprint §3.1 "Subscription checkout" spec:
 * "Dynamic plan prices/limits, GST/tax summary, billing period, consent
 * to renewal terms; redirect/provider SDK; confirmation pending webhook,
 * never immediate access assumption."
 *
 * Every price/limit rendered here comes from `GET /plans` or
 * `GET /tenants/{t}/subscription` — never hardcoded (blueprint M09).
 *
 * CRITICAL invariant this component enforces client-side (mirroring
 * `CheckoutService`'s own server-side invariant, blueprint §02 M10-R3 /
 * AC-11 "Checkout cannot be activated by falsified frontend state"): a
 * `POST .../checkout` or `.../subscription/change` response is NEVER
 * treated as "paid" — {@see isOrderConfirmedActive} only reports success
 * once a FRESH `GET /tenants/{t}/subscription` call shows a status in
 * {@see SUBSCRIPTION_ACTIVE_STATUSES} (deliberately excluding
 * `"pending"`). `pendingOrder` stays visible with a "payment pending —
 * waiting for confirmation" banner the whole time in between.
 *
 * DEV-ONLY mock-payment button: real Razorpay credentials do not exist in
 * this environment (blueprint §07, §10.1 "clearly label mock mode").
 * `completeMockPayment()` is an explicit, unmistakably-labelled local
 * testing/demo aid — see `docs/ADR/0027-dev-only-mock-payment-button-placement.md`
 * for why it lives inline on this screen rather than e.g. a separate admin
 * tool, and `BillingService.completeMockPayment()`'s docblock for exactly
 * what it does (POSTs the backend's own `mock_webhook_payload_raw` +
 * `mock_webhook_signature` to the REAL `POST /webhooks/razorpay`, which
 * performs REAL HMAC verification — only the event's origin is simulated).
 */
@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="billing">
      <app-page-header eyebrow="Billing" eyebrowLabel="Subscription" title="Billing" subtitle="Plan, usage, payments and GST invoices for this business." />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <section class="subscription-card card">
          <h2>Current subscription</h2>
          @if (loadingSubscription()) {
            <app-skeleton-loader [rows]="1" />
          } @else if (subscription()) {
            <p>
              Status: <span class="badge" [class]="subscriptionBadgeClass(subscription()!.status)">{{ subscription()!.status }}</span>
              @if (subscription()!.status === 'pending') {
                <span class="pending-note">— waiting for payment confirmation via webhook. Access is not yet granted.</span>
              }
            </p>
            @if (subscription()!.plan) {
              <p>
                Plan: <strong>{{ subscription()!.plan!.display_name }}</strong> ({{ subscription()!.plan!.billing_period }}) —
                ₹{{ subscription()!.plan!.price_inr }}
              </p>
            }
            @if (subscription()!.current_period_end) {
              <p>Current period ends: {{ subscription()!.current_period_end }}</p>
            }
            @if (subscription()!.cancel_at) {
              <p class="cancel-note">Scheduled to cancel at: {{ subscription()!.cancel_at }}</p>
            }
            @if (canCancel()) {
              <button type="button" (click)="cancelSubscription()" [disabled]="cancelling()">
                {{ cancelling() ? 'Cancelling…' : 'Cancel subscription' }}
              </button>
            }
            <p class="billing-links">
              <a [routerLink]="['/app', tenant()!.id, 'billing', 'addons']" data-testid="addons-link">Buy add-ons</a>
              ·
              <a [routerLink]="['/app', tenant()!.id, 'support']" [queryParams]="{ category: 'billing' }" data-testid="billing-support-link">Billing or cancellation help? Contact support</a>
            </p>
          }
          @if (subscriptionError()) {
            <p class="form-error" role="alert">{{ subscriptionError() }}</p>
          }
        </section>

        <section class="usage-card card">
          <h2>Usage this period</h2>
          @if (loadingUsage()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (usage().length === 0) {
            <app-empty-state icon="analytics" title="No usage data yet" message="Usage meters will appear once this subscription starts consuming AI generations or posts." />
          } @else {
            @for (meter of usage(); track meter.id) {
              <div class="meter">
                <div class="meter-label">
                  <span>{{ meter.meter_code }}</span>
                  <span>
                    {{ meter.used_qty }}/{{ meter.limit_qty }} used
                    @if (meter.reserved_qty) {
                      <span>(+{{ meter.reserved_qty }} reserved)</span>
                    }
                  </span>
                </div>
                <div class="meter-bar">
                  <div class="meter-fill used" [style.width.%]="pct(meter.used_qty, meter.limit_qty)"></div>
                  <div class="meter-fill reserved" [style.width.%]="pct(meter.reserved_qty, meter.limit_qty)" [style.left.%]="pct(meter.used_qty, meter.limit_qty)"></div>
                </div>
              </div>
            }
          }
          @if (usageError()) {
            <p class="form-error" role="alert">{{ usageError() }}</p>
          }
        </section>

        @if (pendingOrder()) {
          <section class="pending-order card" role="alert">
            <h2>Payment pending — waiting for confirmation</h2>
            <p>
              Order <code>{{ pendingOrder()!.external_order_id }}</code> for plan <strong>{{ pendingOrder()!.plan_code }}</strong>,
              amount ₹{{ pendingOrder()!.amount }} {{ pendingOrder()!.currency }}. Status is always <code>"created"</code> here —
              this screen will never claim the plan is active until a fresh subscription check confirms it.
            </p>
            <p class="gst-note">
              GST is computed by the backend at invoicing time (flat-rate policy) and will appear on the invoice
              line items below once this payment is confirmed — no tax estimate is fabricated here.
            </p>
            @if (pendingOrder()!.mock_provider) {
              <div class="mock-panel">
                <p class="mock-badge">DEV-ONLY — MOCK PAYMENT. No real Razorpay checkout exists in this environment.</p>
                <p>{{ pendingOrder()!.dev_only_note }}</p>
                <button type="button" (click)="completeMockPayment()" [disabled]="completingMock()">
                  {{ completingMock() ? 'Completing mock payment…' : 'DEV ONLY: Complete mock payment' }}
                </button>
              </div>
            } @else {
              <p class="gap-note">
                No mock payment helper is available for this order (not running in mock provider mode) — a real
                Razorpay checkout SDK redirect is not implemented in this environment.
              </p>
            }
            <button type="button" (click)="pollSubscriptionStatus()" [disabled]="polling()">
              {{ polling() ? 'Checking…' : 'Check payment status now' }}
            </button>
          </section>
        }
        @if (checkoutNotice()) {
          <p class="success" role="status">{{ checkoutNotice() }}</p>
        }

        <section class="plans">
          <h2>Plans</h2>
          <div class="period-toggle">
            <label><input type="radio" name="period" value="monthly" [checked]="billingPeriod() === 'monthly'" (change)="setPeriod('monthly')" /> Monthly</label>
            <label><input type="radio" name="period" value="yearly" [checked]="billingPeriod() === 'yearly'" (change)="setPeriod('yearly')" /> Yearly</label>
          </div>

          @if (loadingPlans()) {
            <app-skeleton-loader [rows]="3" />
          } @else {
            <div class="plan-grid">
              @for (group of planGroups(); track group.planCode) {
                @if (planForPeriod(group)) {
                  <article class="plan-card card" [class.current]="isCurrentPlan(planForPeriod(group)!)">
                    <h3>{{ group.displayName }}</h3>
                    <p class="price">₹{{ planForPeriod(group)!.price_inr }} / {{ planForPeriod(group)!.billing_period }}</p>
                    <p class="tax-behavior">Tax: {{ planForPeriod(group)!.tax_behavior }}</p>
                    <ul class="limits">
                      <li>{{ planForPeriod(group)!.feature_limits.location_count }} location(s)</li>
                      <li>{{ planForPeriod(group)!.feature_limits.posts_published_per_month }} posts published / month</li>
                      <li>{{ planForPeriod(group)!.feature_limits.ai_generations_per_month }} AI generations / month</li>
                    </ul>
                    @if (isCurrentPlan(planForPeriod(group)!)) {
                      <span class="badge badge--success">Current plan</span>
                    } @else {
                      <label class="consent">
                        <input type="checkbox" [checked]="consentByPlan()[planForPeriod(group)!.plan_version_id]" (change)="toggleConsent(planForPeriod(group)!.plan_version_id, $event)" />
                        I consent to subscribe to this plan and its renewal/billing terms.
                      </label>
                      <button
                        type="button"
                        [disabled]="!consentByPlan()[planForPeriod(group)!.plan_version_id] || checkingOut()"
                        (click)="choosePlan(planForPeriod(group)!)"
                      >
                        {{ checkingOut() ? 'Processing…' : 'Choose this plan' }}
                      </button>
                    }
                  </article>
                }
              }
            </div>
          }
          @if (checkoutError()) {
            <p class="form-error" role="alert">{{ checkoutError() }}</p>
          }
        </section>

        <section class="invoices">
          <h2>Invoices</h2>
          @if (loadingInvoices()) {
            <app-skeleton-loader [rows]="2" />
          } @else if (invoices().length === 0) {
            <app-empty-state icon="subscription" title="No invoices yet" message="GST invoices appear here once a subscription payment is confirmed." />
          } @else {
            @for (invoice of invoices(); track invoice.id) {
              <article class="invoice card">
                <div class="invoice-head">
                  <h3>{{ invoice.invoice_number }} — <span class="badge" [class]="invoiceBadgeClass(invoice.status)">{{ invoice.status }}</span></h3>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    data-testid="download-invoice-pdf"
                    [disabled]="downloadingInvoiceId() === invoice.id"
                    (click)="downloadInvoicePdf(invoice)"
                  >
                    {{ downloadingInvoiceId() === invoice.id ? 'Preparing PDF…' : 'Download PDF' }}
                  </button>
                </div>
                <p>Issued: {{ invoice.issued_at }} · Subtotal ₹{{ invoice.subtotal }} · GST ₹{{ invoice.gst_amount }} · Total ₹{{ invoice.total }}</p>
                <table class="list-view">
                  <thead>
                    <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Tax rate</th><th>Tax</th><th>Line total</th></tr>
                  </thead>
                  <tbody>
                    @for (line of invoice.lines; track line.description) {
                      <tr>
                        <td>{{ line.description }}</td>
                        <td>{{ line.qty }}</td>
                        <td>₹{{ line.unit_price }}</td>
                        <td>{{ line.tax_rate }}%</td>
                        <td>₹{{ line.tax_amount }}</td>
                        <td>₹{{ line.line_total }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </article>
            }
          }
          @if (invoicesError()) {
            <p class="form-error" role="alert">{{ invoicesError() }}</p>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .billing {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      section > h2 {
        margin-top: 0;
      }
      .pending-note {
        color: var(--color-warning);
        font-size: var(--text-sm);
      }
      .cancel-note {
        color: var(--color-danger);
      }
      .meter {
        margin-bottom: var(--space-3);
      }
      .meter-label {
        display: flex;
        justify-content: space-between;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .meter-bar {
        position: relative;
        height: 10px;
        border-radius: var(--radius-sm);
        background: var(--color-neutral-bg);
        overflow: hidden;
      }
      .meter-fill {
        position: absolute;
        top: 0;
        height: 100%;
      }
      .meter-fill.used {
        background: var(--color-primary);
        left: 0;
      }
      .meter-fill.reserved {
        background: var(--color-primary-light);
      }
      .pending-order {
        border-color: var(--color-warning-border);
        background: var(--color-warning-bg);
      }
      .gst-note {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .mock-panel {
        border: 2px dashed var(--color-danger);
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        margin: var(--space-3) 0;
      }
      .mock-badge {
        color: var(--color-danger);
        font-weight: var(--font-bold);
        letter-spacing: 0.02em;
      }
      .period-toggle {
        display: flex;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .plan-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--space-4);
      }
      .plan-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .plan-card.current {
        border-color: var(--color-success);
        box-shadow: 0 0 0 1px var(--color-success);
      }
      .price {
        font-size: var(--text-lg);
        font-weight: var(--font-bold);
      }
      .tax-behavior {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .limits {
        font-size: var(--text-sm);
        padding-left: 1.1rem;
      }
      .consent {
        font-size: var(--text-xs);
        display: flex;
        gap: var(--space-2);
        align-items: flex-start;
      }
      .invoice + .invoice {
        margin-top: var(--space-4);
      }
      table.list-view {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-xs);
      }
      th,
      td {
        text-align: center;
        padding: var(--space-2);
        border-bottom: 1px solid var(--color-border);
      }
      .gap-note {
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        font-size: var(--text-sm);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .success {
        color: var(--color-success);
        margin: 0;
      }
      .placeholder {
        color: var(--color-text-subtle);
      }
    `,
  ],
})
export class BillingComponent {
  readonly tenant = computed(() => this.currentTenant.tenant());

  /** Maps a subscription status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  subscriptionBadgeClass(status: string): string {
    if (this.isActiveStatus(status)) {
      return 'badge--success';
    }
    if (status === 'pending') {
      return 'badge--warning';
    }
    if (status === 'past_due' || status === 'cancelled') {
      return 'badge--danger';
    }
    return 'badge--neutral';
  }

  /** Maps an invoice status to the shared `.badge--*` semantic modifier. */
  invoiceBadgeClass(status: string): string {
    switch (status) {
      case 'paid':
        return 'badge--success';
      case 'void':
      case 'failed':
        return 'badge--danger';
      case 'open':
        return 'badge--warning';
      default:
        return 'badge--neutral';
    }
  }

  readonly subscription = signal<TenantSubscription | null>(null);
  readonly loadingSubscription = signal(true);
  readonly subscriptionError = signal<string | null>(null);
  readonly cancelling = signal(false);
  readonly canCancel = computed(() => {
    const s = this.subscription();
    return !!s && ['trialing', 'active', 'past_due', 'grace'].includes(s.status);
  });

  readonly usage = signal<UsageMeter[]>([]);
  readonly loadingUsage = signal(true);
  readonly usageError = signal<string | null>(null);

  readonly plans = signal<PlanVersion[]>([]);
  readonly loadingPlans = signal(true);
  readonly billingPeriod = signal<BillingPeriod>('monthly');
  readonly planGroups = computed<PlanGroup[]>(() => {
    const byCode = new Map<string, PlanGroup>();
    for (const plan of this.plans()) {
      const existing = byCode.get(plan.plan_code) ?? {
        planCode: plan.plan_code,
        displayName: plan.display_name,
        monthly: null,
        yearly: null,
      };
      if (plan.billing_period === 'monthly') {
        existing.monthly = plan;
      } else {
        existing.yearly = plan;
      }
      byCode.set(plan.plan_code, existing);
    }
    return Array.from(byCode.values());
  });
  readonly consentByPlan = signal<Record<string, boolean>>({});
  readonly checkingOut = signal(false);
  readonly checkoutError = signal<string | null>(null);

  readonly pendingOrder = signal<PaymentOrder | null>(null);
  readonly completingMock = signal(false);
  readonly polling = signal(false);
  readonly checkoutNotice = signal<string | null>(null);

  readonly invoices = signal<Invoice[]>([]);
  readonly loadingInvoices = signal(true);
  readonly invoicesError = signal<string | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly billingService: BillingService,
  ) {
    this.refreshSubscription();
    this.refreshUsage();
    this.refreshPlans();
    this.refreshInvoices();
  }

  isActiveStatus(status: string): boolean {
    return SUBSCRIPTION_ACTIVE_STATUSES.has(status as TenantSubscription['status']);
  }

  isCurrentPlan(plan: PlanVersion): boolean {
    const current = this.subscription()?.plan;
    return !!current && current.plan_version_id === plan.plan_version_id;
  }

  planForPeriod(group: PlanGroup): PlanVersion | null {
    return this.billingPeriod() === 'monthly' ? group.monthly ?? group.yearly : group.yearly ?? group.monthly;
  }

  setPeriod(period: BillingPeriod): void {
    this.billingPeriod.set(period);
  }

  toggleConsent(planVersionId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.consentByPlan.update((map) => ({ ...map, [planVersionId]: checked }));
  }

  pct(value: number, limit: number): number {
    if (limit <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (value / limit) * 100));
  }

  private refreshSubscription(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingSubscription.set(false);
      return;
    }
    this.loadingSubscription.set(true);
    this.billingService.getSubscription(tenantId).subscribe({
      next: (sub) => {
        this.loadingSubscription.set(false);
        this.subscription.set(sub);
      },
      error: (err: unknown) => {
        this.loadingSubscription.set(false);
        this.subscriptionError.set(apiErrorMessage(err));
      },
    });
  }

  private refreshUsage(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingUsage.set(false);
      return;
    }
    this.loadingUsage.set(true);
    this.billingService.usage(tenantId).subscribe({
      next: (usage) => {
        this.loadingUsage.set(false);
        this.usage.set(usage);
      },
      error: (err: unknown) => {
        this.loadingUsage.set(false);
        this.usageError.set(apiErrorMessage(err));
      },
    });
  }

  private refreshPlans(): void {
    this.loadingPlans.set(true);
    this.billingService.listPlans().subscribe({
      next: (plans) => {
        this.loadingPlans.set(false);
        this.plans.set(plans);
      },
      error: () => {
        this.loadingPlans.set(false);
      },
    });
  }

  private refreshInvoices(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingInvoices.set(false);
      return;
    }
    this.loadingInvoices.set(true);
    this.billingService.invoices(tenantId).subscribe({
      next: (invoices) => {
        this.loadingInvoices.set(false);
        this.invoices.set(invoices);
      },
      error: (err: unknown) => {
        this.loadingInvoices.set(false);
        this.invoicesError.set(apiErrorMessage(err));
      },
    });
  }

  choosePlan(plan: PlanVersion): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.checkingOut() || !this.consentByPlan()[plan.plan_version_id]) {
      return;
    }
    this.checkingOut.set(true);
    this.checkoutError.set(null);
    this.checkoutNotice.set(null);

    // A tenant already has a subscription row by the time this screen loads
    // (ensureSubscription() auto-provisions a trial on first GET), so
    // "choosing a plan" here is always `subscription/change` — a brand-new
    // tenant with literally no subscription row yet would hit the same
    // `POST .../checkout` endpoint with identical pending-order semantics;
    // both return the same PaymentOrder|TenantSubscription union.
    const hasSubscription = this.subscription() !== null;
    const call = hasSubscription
      ? this.billingService.changeSubscription(tenantId, { plan_version_id: plan.plan_version_id })
      : this.billingService.checkout(tenantId, { plan_version_id: plan.plan_version_id });

    call.subscribe({
      next: (result: SubscriptionChangeResult) => {
        this.checkingOut.set(false);
        if (isPaymentOrder(result)) {
          // Upgrade/lateral move: NEVER treat this as active — see class docblock.
          this.pendingOrder.set(result);
          this.checkoutNotice.set(null);
        } else {
          // Downgrade: backend already activated it immediately (no payment step).
          this.subscription.set(result);
          this.checkoutNotice.set('Plan changed immediately (downgrade — no payment required).');
          this.refreshUsage();
        }
      },
      error: (err: unknown) => {
        this.checkingOut.set(false);
        this.checkoutError.set(apiErrorMessage(err));
        const fields = apiErrorFields(err);
        if (fields) {
          this.checkoutError.set(`${apiErrorMessage(err)} (${Object.values(fields).join(', ')})`);
        }
      },
    });
  }

  completeMockPayment(): void {
    const order = this.pendingOrder();
    if (!order?.mock_webhook_payload_raw || !order.mock_webhook_signature || this.completingMock()) {
      return;
    }
    this.completingMock.set(true);
    this.billingService.completeMockPayment(order.mock_webhook_payload_raw, order.mock_webhook_signature).subscribe({
      next: (result) => {
        this.completingMock.set(false);
        this.checkoutNotice.set(
          result.status === 'duplicate'
            ? 'This mock payment was already processed earlier (safe replay, no double-charge).'
            : `Mock payment processed (invoice ${result.invoice_number ?? '—'}). Confirming activation…`,
        );
        this.pollSubscriptionStatus();
      },
      error: (err: unknown) => {
        this.completingMock.set(false);
        this.checkoutError.set(apiErrorMessage(err));
      },
    });
  }

  /**
   * The ONLY path that may clear `pendingOrder()` — always re-fetches a
   * FRESH subscription from the server rather than trusting the webhook
   * response's own content, per the class docblock's invariant.
   */
  pollSubscriptionStatus(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.polling()) {
      return;
    }
    this.polling.set(true);
    this.billingService.getSubscription(tenantId).subscribe({
      next: (sub) => {
        this.polling.set(false);
        this.subscription.set(sub);
        if (this.isActiveStatus(sub.status)) {
          this.pendingOrder.set(null);
          this.checkoutNotice.set(`Subscription is now "${sub.status}" — payment confirmed.`);
          this.refreshUsage();
          this.refreshInvoices();
        } else {
          this.checkoutNotice.set(`Still "${sub.status}" — payment not confirmed yet. Try again shortly.`);
        }
      },
      error: (err: unknown) => {
        this.polling.set(false);
        this.subscriptionError.set(apiErrorMessage(err));
      },
    });
  }

  readonly downloadingInvoiceId = signal<string | null>(null);

  downloadInvoicePdf(invoice: Invoice): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.downloadingInvoiceId()) {
      return;
    }
    this.downloadingInvoiceId.set(invoice.id);
    this.invoicesError.set(null);
    this.billingService.downloadInvoicePdf(tenantId, invoice.id).subscribe({
      next: ({ blob, filename }) => {
        this.downloadingInvoiceId.set(null);
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      error: (err: unknown) => {
        this.downloadingInvoiceId.set(null);
        this.invoicesError.set(apiErrorMessage(err));
      },
    });
  }

  cancelSubscription(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.subscriptionError.set(null);
    this.billingService.cancelSubscription(tenantId).subscribe({
      next: (sub) => {
        this.cancelling.set(false);
        this.subscription.set(sub);
      },
      error: (err: unknown) => {
        this.cancelling.set(false);
        this.subscriptionError.set(apiErrorMessage(err));
      },
    });
  }
}
