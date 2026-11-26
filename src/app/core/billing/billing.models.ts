/**
 * Field names verified against
 * `services/api_php/src/Application/Billing/{PlanService,CheckoutService,SubscriptionService,UsageWalletService}.php`.
 *
 * Money (`price_inr`, `amount`, invoice line amounts) is always a decimal
 * STRING on the wire (blueprint §4.4 "decimal strings for INR money") —
 * never parse these as `number` for display beyond simple formatting,
 * and never hardcode a price/limit in this frontend (blueprint M09):
 * every price/limit shown here comes from `GET /plans`/`GET /tenants/{t}/subscription`.
 */

export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanFeatureLimits {
  location_count: number;
  posts_published_per_month: number;
  ai_generations_per_month: number;
  [key: string]: number;
}

export interface PlanVersion {
  plan_version_id: string;
  plan_code: string;
  display_name: string;
  version_no: number;
  billing_period: BillingPeriod;
  price_inr: string;
  tax_behavior: string;
  feature_limits: PlanFeatureLimits;
  effective_from: string;
}

export interface PlanListResponse {
  plans: PlanVersion[];
}

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'cancel_at_period_end'
  | 'cancelled'
  | 'expired';

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  status: SubscriptionStatus;
  provider: string;
  external_subscription_id: string | null;
  starts_at: string;
  current_period_end: string | null;
  cancel_at: string | null;
  plan: PlanVersion | null;
  created_at: string;
}

/**
 * The single statuses that mean "this tenant currently has paid/active
 * access" (blueprint §3.1 Subscription checkout "confirmation pending
 * webhook, never immediate access assumption"). `pending` is deliberately
 * excluded — see `BillingComponent`'s checkout flow.
 */
export const SUBSCRIPTION_ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trialing',
  'active',
  'past_due',
  'grace',
  'cancel_at_period_end',
]);

export interface PaymentOrder {
  id: string;
  tenant_id: string;
  subscription_id: string;
  plan_version_id: string;
  plan_code: string;
  external_order_id: string;
  provider: 'razorpay';
  amount: string;
  currency: string;
  /** ALWAYS "created" here — a paid order is never represented by this shape; see CheckoutService class docblock AC-11. */
  status: 'created';
  idempotency_key: string;
  is_replay: boolean;
  created_at: string;
  mock_provider?: boolean;
  dev_only_note?: string;
  mock_webhook_payload?: Record<string, unknown>;
  mock_webhook_payload_raw?: string;
  mock_webhook_signature?: string;
}

/** `POST /tenants/{t}/subscription/change` returns either an already-active TenantSubscription (downgrade) or a PaymentOrder (upgrade). */
export type SubscriptionChangeResult = TenantSubscription | PaymentOrder;

export function isPaymentOrder(value: SubscriptionChangeResult): value is PaymentOrder {
  return (value as PaymentOrder).provider === 'razorpay' && (value as PaymentOrder).status === 'created';
}

export interface CheckoutRequest {
  plan_version_id: string;
  idempotency_key?: string;
}

export interface UsageMeter {
  id: string;
  meter_code: string;
  limit_qty: number;
  used_qty: number;
  reserved_qty: number;
  remaining_qty: number;
  period_start: string;
  period_end: string;
}

export interface UsageResponse {
  usage: UsageMeter[];
}

export interface InvoiceLine {
  id?: string;
  description: string;
  qty: string;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  line_total: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  payment_id: string;
  currency: string;
  subtotal: string;
  gst_amount: string;
  total: string;
  status: string;
  issued_at: string;
  lines: InvoiceLine[];
}

export interface InvoiceListResponse {
  invoices: Invoice[];
}

/** `POST /webhooks/razorpay` response — see `WebhookHandler`/`WebhookService`. DEV-ONLY mock-payment-completion helper, never a real payment flow. */
export interface WebhookResult {
  event_id: string;
  status: 'processed' | 'duplicate';
  processed: boolean;
  payment_id?: string;
  subscription_id?: string;
  invoice_id?: string;
  invoice_number?: string;
}
