import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BillingService } from './billing.service';
import { PaymentOrder, PlanVersion, TenantSubscription } from './billing.models';

const starterMonthly: PlanVersion = {
  plan_version_id: 'pv1',
  plan_code: 'starter',
  display_name: 'Starter',
  version_no: 1,
  billing_period: 'monthly',
  price_inr: '999.00',
  tax_behavior: 'exclusive',
  feature_limits: { location_count: 1, posts_published_per_month: 30, ai_generations_per_month: 60 },
  effective_from: '2026-01-01T00:00:00.000Z',
};

const pendingOrder: PaymentOrder = {
  id: 'order1',
  tenant_id: 't1',
  subscription_id: 'sub1',
  plan_version_id: 'pv1',
  plan_code: 'starter',
  external_order_id: 'ext_order1',
  provider: 'razorpay',
  amount: '999.00',
  currency: 'INR',
  status: 'created',
  idempotency_key: 'idem1',
  is_replay: false,
  created_at: '2026-11-01T00:00:00.000Z',
  mock_provider: true,
  mock_webhook_payload_raw: '{"event":"payment.captured"}',
  mock_webhook_signature: 'sig123',
};

const activeSubscription: TenantSubscription = {
  id: 'sub1',
  tenant_id: 't1',
  status: 'active',
  provider: 'razorpay',
  external_subscription_id: null,
  starts_at: '2026-11-01T00:00:00.000Z',
  current_period_end: '2026-12-01T00:00:00.000Z',
  cancel_at: null,
  plan: starterMonthly,
  created_at: '2026-11-01T00:00:00.000Z',
};

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists plans with dynamic price/limits (no frontend hardcoding)', () => {
    let plans: PlanVersion[] | undefined;
    service.listPlans().subscribe((p) => (plans = p));
    const req = httpMock.expectOne('/api/v1/plans');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { plans: [starterMonthly] }, meta: { request_id: 'r1' } });
    expect(plans).toEqual([starterMonthly]);
  });

  it('gets the tenant subscription', () => {
    service.getSubscription('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/subscription');
    expect(req.request.method).toBe('GET');
    req.flush({ data: activeSubscription, meta: { request_id: 'r1' } });
  });

  it('checks out a plan and returns a pending PaymentOrder (never "paid")', () => {
    let result: PaymentOrder | undefined;
    service.checkout('t1', { plan_version_id: 'pv1' }).subscribe((r) => (result = r as PaymentOrder));
    const req = httpMock.expectOne('/api/v1/tenants/t1/checkout');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ plan_version_id: 'pv1' });
    req.flush({ data: pendingOrder, meta: { request_id: 'r1' } });
    expect(result?.status).toBe('created');
    expect(result?.mock_webhook_payload_raw).toBeTruthy();
  });

  it('reads usage meters', () => {
    service.usage('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/usage');
    req.flush({
      data: {
        usage: [
          { id: 'w1', meter_code: 'ai_generations_per_month', limit_qty: 60, used_qty: 3, reserved_qty: 0, remaining_qty: 57, period_start: '2026-11-01T00:00:00.000Z', period_end: '2026-12-01T00:00:00.000Z' },
        ],
      },
      meta: { request_id: 'r1' },
    });
  });

  it('lists invoices with line items', () => {
    service.invoices('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/invoices');
    req.flush({
      data: {
        invoices: [
          {
            id: 'inv1',
            tenant_id: 't1',
            invoice_number: 'INV-202611-0001',
            payment_id: 'pay1',
            currency: 'INR',
            subtotal: '999.00',
            gst_amount: '179.82',
            total: '1178.82',
            status: 'paid',
            issued_at: '2026-11-01T00:00:00.000Z',
            lines: [{ description: 'Starter (monthly)', qty: '1', unit_price: '999.00', tax_rate: '18.00', tax_amount: '179.82', line_total: '1178.82' }],
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
  });

  it('changes the subscription plan', () => {
    service.changeSubscription('t1', { plan_version_id: 'pv2' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/subscription/change');
    expect(req.request.method).toBe('POST');
    req.flush({ data: activeSubscription, meta: { request_id: 'r1' } });
  });

  it('cancels the subscription', () => {
    service.cancelSubscription('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/subscription/cancel');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...activeSubscription, status: 'cancel_at_period_end' }, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 NOTHING_TO_CANCEL unchanged', () => {
    let error: unknown;
    service.cancelSubscription('t1').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/subscription/cancel');
    req.flush(
      { error: { code: 'NOTHING_TO_CANCEL', message: 'Subscription in status "cancelled" cannot be cancelled.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((error as { status: number }).status).toBe(409);
  });

  it('posts the dev-only mock webhook completion with the raw payload and signature header', () => {
    service.completeMockPayment('{"event":"payment.captured"}', 'sig123').subscribe();
    const req = httpMock.expectOne('/api/v1/webhooks/razorpay');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Razorpay-Signature')).toBe('sig123');
    expect(req.request.body).toBe('{"event":"payment.captured"}');
    req.flush({
      data: { event_id: 'evt1', status: 'processed', processed: true, payment_id: 'pay1', subscription_id: 'sub1', invoice_id: 'inv1', invoice_number: 'INV-202611-0001' },
      meta: { request_id: 'r1' },
    });
  });
});
