import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { BillingComponent } from './billing.component';

const sampleTenant: Tenant = {
  id: 't1',
  display_name: 'Acme Cafe',
  legal_name: null,
  business_type: null,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  country: 'IN',
  status: 'active',
  caller_role: 'owner',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const starterMonthly = {
  plan_version_id: 'pv-starter-m',
  plan_code: 'starter',
  display_name: 'Starter',
  version_no: 1,
  billing_period: 'monthly' as const,
  price_inr: '999.00',
  tax_behavior: 'exclusive',
  feature_limits: { location_count: 1, posts_published_per_month: 30, ai_generations_per_month: 60 },
  effective_from: '2026-01-01T00:00:00.000Z',
};

const growthMonthly = {
  ...starterMonthly,
  plan_version_id: 'pv-growth-m',
  plan_code: 'growth',
  display_name: 'Growth',
  price_inr: '2499.00',
  feature_limits: { location_count: 3, posts_published_per_month: 100, ai_generations_per_month: 200 },
};

const trialingSubscription = {
  id: 'sub1',
  tenant_id: 't1',
  status: 'trialing',
  provider: 'razorpay',
  external_subscription_id: null,
  starts_at: '2026-11-01T00:00:00.000Z',
  current_period_end: '2026-11-15T00:00:00.000Z',
  cancel_at: null,
  plan: starterMonthly,
  created_at: '2026-11-01T00:00:00.000Z',
};

describe('BillingComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  function createAndFlushInitialLoads() {
    const fixture = TestBed.createComponent(BillingComponent);
    const component = fixture.componentInstance;

    httpMock.expectOne('/api/v1/tenants/t1/subscription').flush({ data: trialingSubscription, meta: { request_id: 'r1' } });
    httpMock.expectOne('/api/v1/tenants/t1/usage').flush({ data: { usage: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne('/api/v1/plans').flush({ data: { plans: [starterMonthly, growthMonthly] }, meta: { request_id: 'r1' } });
    httpMock.expectOne('/api/v1/tenants/t1/invoices').flush({ data: { invoices: [] }, meta: { request_id: 'r1' } });

    fixture.detectChanges();
    return { fixture, component };
  }

  it('never shows the plan as active/paid immediately after checkout returns a PaymentOrder', () => {
    const { fixture, component } = createAndFlushInitialLoads();

    component.consentByPlan.set({ 'pv-growth-m': true });
    component.choosePlan(growthMonthly);

    const changeReq = httpMock.expectOne('/api/v1/tenants/t1/subscription/change');
    expect(changeReq.request.method).toBe('POST');
    changeReq.flush({
      data: {
        id: 'order1',
        tenant_id: 't1',
        subscription_id: 'sub1',
        plan_version_id: 'pv-growth-m',
        plan_code: 'growth',
        external_order_id: 'ext_order1',
        provider: 'razorpay',
        amount: '2499.00',
        currency: 'INR',
        status: 'created',
        idempotency_key: 'idem1',
        is_replay: false,
        created_at: '2026-11-05T00:00:00.000Z',
        mock_provider: true,
        dev_only_note: 'mock only',
        mock_webhook_payload_raw: '{"event":"payment.captured"}',
        mock_webhook_signature: 'sig123',
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    // CRITICAL: still "trialing", never flipped to active/paid from the
    // checkout/change response alone.
    expect(component.subscription()?.status).toBe('trialing');
    expect(component.pendingOrder()?.status).toBe('created');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Payment pending — waiting for confirmation');
    expect(text).not.toContain('Subscription is now "active"');
  });

  it('only flips to active after a FRESH GET /subscription confirms it (via the dev-only mock webhook completion)', () => {
    const { fixture, component } = createAndFlushInitialLoads();

    component.pendingOrder.set({
      id: 'order1',
      tenant_id: 't1',
      subscription_id: 'sub1',
      plan_version_id: 'pv-growth-m',
      plan_code: 'growth',
      external_order_id: 'ext_order1',
      provider: 'razorpay',
      amount: '2499.00',
      currency: 'INR',
      status: 'created',
      idempotency_key: 'idem1',
      is_replay: false,
      created_at: '2026-11-05T00:00:00.000Z',
      mock_provider: true,
      mock_webhook_payload_raw: '{"event":"payment.captured"}',
      mock_webhook_signature: 'sig123',
    });
    fixture.detectChanges();

    component.completeMockPayment();
    const webhookReq = httpMock.expectOne('/api/v1/webhooks/razorpay');
    expect(webhookReq.request.headers.get('X-Razorpay-Signature')).toBe('sig123');
    webhookReq.flush({
      data: { event_id: 'evt1', status: 'processed', processed: true, payment_id: 'pay1', subscription_id: 'sub1', invoice_id: 'inv1', invoice_number: 'INV-202611-0001' },
      meta: { request_id: 'r1' },
    });

    // completeMockPayment() must re-poll GET /subscription rather than trust the webhook body.
    const pollReq = httpMock.expectOne('/api/v1/tenants/t1/subscription');
    pollReq.flush({ data: { ...trialingSubscription, status: 'active' }, meta: { request_id: 'r1' } });

    const usageReq = httpMock.expectOne('/api/v1/tenants/t1/usage');
    usageReq.flush({ data: { usage: [] }, meta: { request_id: 'r1' } });
    const invoicesReq = httpMock.expectOne('/api/v1/tenants/t1/invoices');
    invoicesReq.flush({ data: { invoices: [] }, meta: { request_id: 'r1' } });

    fixture.detectChanges();

    expect(component.subscription()?.status).toBe('active');
    expect(component.pendingOrder()).toBeNull();
    expect(fixture.nativeElement.textContent as string).toContain('payment confirmed');
  });

  it('labels the mock-payment button as a dev-only testing aid, never a real payment flow', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.pendingOrder.set({
      id: 'order1',
      tenant_id: 't1',
      subscription_id: 'sub1',
      plan_version_id: 'pv-growth-m',
      plan_code: 'growth',
      external_order_id: 'ext_order1',
      provider: 'razorpay',
      amount: '2499.00',
      currency: 'INR',
      status: 'created',
      idempotency_key: 'idem1',
      is_replay: false,
      created_at: '2026-11-05T00:00:00.000Z',
      mock_provider: true,
      dev_only_note: 'No real Razorpay order exists.',
      mock_webhook_payload_raw: '{}',
      mock_webhook_signature: 'sig',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('DEV-ONLY');
    expect(text).toContain('No real Razorpay order exists.');
  });

  it('downgrade response (a plain TenantSubscription, not a PaymentOrder) activates immediately with no pending state', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.consentByPlan.set({ 'pv-starter-m': true });
    component.choosePlan(starterMonthly);

    const changeReq = httpMock.expectOne('/api/v1/tenants/t1/subscription/change');
    changeReq.flush({ data: { ...trialingSubscription, status: 'active', plan: starterMonthly }, meta: { request_id: 'r1' } });

    const usageReq = httpMock.expectOne('/api/v1/tenants/t1/usage');
    usageReq.flush({ data: { usage: [] }, meta: { request_id: 'r1' } });

    fixture.detectChanges();

    expect(component.pendingOrder()).toBeNull();
    expect(component.subscription()?.status).toBe('active');
    expect(fixture.nativeElement.textContent as string).toContain('downgrade');
  });
});
