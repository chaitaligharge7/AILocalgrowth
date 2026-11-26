import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TenantService } from './tenant.service';
import { Tenant } from './tenant.models';

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

describe('TenantService', () => {
  let service: TenantService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists only the caller tenants', () => {
    let result: Tenant[] | undefined;
    service.list().subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { tenants: [sampleTenant] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([sampleTenant]);
  });

  it('creates a tenant with the given display_name', () => {
    let result: Tenant | undefined;
    service.create({ display_name: 'Acme Cafe' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ display_name: 'Acme Cafe' });
    req.flush({ data: { ...sampleTenant, default_location_id: 'loc1' }, meta: { request_id: 'r1' } });

    expect(result?.default_location_id).toBe('loc1');
  });

  it('gets a single tenant by id', () => {
    service.get('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleTenant, meta: { request_id: 'r1' } });
  });

  it('patches a tenant', () => {
    service.update('t1', { display_name: 'New Name' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ display_name: 'New Name' });
    req.flush({ data: { ...sampleTenant, display_name: 'New Name' }, meta: { request_id: 'r1' } });
  });

  it('sends an invite with email and role_code', () => {
    service.invite('t1', { email: 'b@example.com', role_code: 'editor' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/invites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'b@example.com', role_code: 'editor' });
    req.flush({
      data: { id: 'inv1', tenant_id: 't1', email: 'b@example.com', role_code: 'editor', status: 'sent', expires_at: '2026-01-08T00:00:00.000Z' },
      meta: { request_id: 'r1' },
    });
  });

  it('accepts an invite by token', () => {
    service.acceptInvite('raw-token').subscribe();
    const req = httpMock.expectOne('/api/v1/invites/raw-token/accept');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { tenant_id: 't1', role: 'editor', status: 'joined' }, meta: { request_id: 'r1' } });
  });
});
