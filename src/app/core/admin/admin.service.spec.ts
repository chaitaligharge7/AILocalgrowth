import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';
import { AdminTenant, FeatureFlag } from './admin.models';

const flag: FeatureFlag = {
  id: 'f1',
  flag_key: 'ai.generation.enabled',
  scope_type: 'global',
  scope_id: null,
  enabled: true,
  config: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const tenant: AdminTenant = {
  id: 't1',
  display_name: 'Acme Salon',
  legal_name: 'Acme Salon Pvt Ltd',
  status: 'active',
  owner_user_id: 'u1',
  currency: 'INR',
  country: 'IN',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('AdminService', () => {
  let service: AdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists feature flags', () => {
    service.listFeatureFlags().subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/feature-flags');
    req.flush({ data: { feature_flags: [flag] }, meta: { request_id: 'r1' } });
  });

  it('patches a feature flag with a required reason', () => {
    service
      .patchFeatureFlag({ flag_key: 'ai.generation.enabled', scope_type: 'global', enabled: false, reason: 'Incident #42' })
      .subscribe();
    const req = httpMock.expectOne('/api/v1/admin/feature-flags');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.reason).toBe('Incident #42');
    req.flush({ data: { ...flag, enabled: false }, meta: { request_id: 'r1' } });
  });

  it('lists tenants with an optional status filter', () => {
    service.listTenants('suspended').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/tenants');
    expect(req.request.params.get('status')).toBe('suspended');
    req.flush({ data: { tenants: [tenant] }, meta: { request_id: 'r1' } });
  });

  it('updates tenant status with a required reason', () => {
    service.updateTenantStatus('t1', { status: 'suspended', reason: 'Non-payment' }).subscribe();
    const req = httpMock.expectOne('/api/v1/admin/tenants/t1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'suspended', reason: 'Non-payment' });
    req.flush({ data: { ...tenant, status: 'suspended' }, meta: { request_id: 'r1' } });
  });

  it('lists plans', () => {
    service.listPlans().subscribe();
    const req = httpMock.expectOne('/api/v1/admin/plans');
    req.flush({ data: { plans: [] }, meta: { request_id: 'r1' } });
  });

  it('creates a new plan version with a required reason', () => {
    service
      .createPlan({ plan_code: 'pro', billing_period: 'monthly', price_inr: 1999, feature_limits: { ai_generations_per_month: 200 }, reason: 'New tier' })
      .subscribe();
    const req = httpMock.expectOne('/api/v1/admin/plans');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.reason).toBe('New tier');
    req.flush({
      data: { plan: { id: 'p1', code: 'pro', display_name: 'Pro', status: 'active' }, version: { id: 'v1', version_no: 1, billing_period: 'monthly', price_inr: '1999.00', tax_behavior: 'exclusive', feature_limits: {}, effective_from: '2026-11-01T00:00:00.000Z', created_at: '2026-11-01T00:00:00.000Z' } },
      meta: { request_id: 'r1' },
    });
  });

  it('lists jobs filtered by type and status', () => {
    service.listJobs('notification', 'dead_letter').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/jobs');
    expect(req.request.params.get('type')).toBe('notification');
    expect(req.request.params.get('status')).toBe('dead_letter');
    req.flush({ data: { jobs: [] }, meta: { request_id: 'r1' } });
  });

  it('retries a job with a required reason', () => {
    service.retryJob('j1', { type: 'publish', reason: 'Provider outage resolved' }).subscribe();
    const req = httpMock.expectOne('/api/v1/admin/jobs/j1/retry');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'publish', reason: 'Provider outage resolved' });
    req.flush({ data: { type: 'publish', id: 'j1', tenant_id: 't1', status: 'retry_wait', attempts: 2, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z' }, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 JOB_NOT_RETRYABLE unchanged', () => {
    let error: unknown;
    service.retryJob('j1', { type: 'publish', reason: 'test' }).subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/admin/jobs/j1/retry');
    req.flush({ error: { code: 'JOB_NOT_RETRYABLE', message: 'not retryable' }, request_id: 'r1' }, { status: 409, statusText: 'Conflict' });
    expect((error as { status: number }).status).toBe(409);
  });

  it('lists audit events with filters', () => {
    service.listAuditEvents({ tenant_id: 't1', action: 'tenant.status_changed', limit: 50 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/admin/audit-events');
    expect(req.request.params.get('tenant_id')).toBe('t1');
    expect(req.request.params.get('action')).toBe('tenant.status_changed');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush({ data: { audit_events: [] }, meta: { request_id: 'r1' } });
  });
});
