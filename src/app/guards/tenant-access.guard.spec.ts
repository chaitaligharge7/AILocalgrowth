import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap, provideRouter, UrlTree } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { tenantAccessGuard } from './tenant-access.guard';
import { TenantService } from '../core/tenancy/tenant.service';
import { CurrentTenantService } from '../core/tenancy/current-tenant.service';
import { Tenant } from '../core/tenancy/tenant.models';

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

describe('tenantAccessGuard', () => {
  let tenantServiceStub: Partial<TenantService>;
  let currentTenant: CurrentTenantService;

  function runGuard(tenantId: string | null) {
    const route = {
      paramMap: convertToParamMap(tenantId ? { tenantId } : {}),
    } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => tenantAccessGuard(route, {} as never));
  }

  beforeEach(() => {
    tenantServiceStub = { get: jasmine.createSpy('get') };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TenantService, useValue: tenantServiceStub }],
    });
    currentTenant = TestBed.inject(CurrentTenantService);
    currentTenant.clear();
  });

  it('redirects to choose-tenant when the route has no tenantId', () => {
    const result = runGuard(null);
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('allows and selects the tenant when the server confirms membership', (done) => {
    (tenantServiceStub.get as jasmine.Spy).and.returnValue(of(sampleTenant));

    const result = runGuard('t1') as Observable<boolean | UrlTree>;
    result.subscribe((value) => {
      expect(value).toBe(true);
      expect(currentTenant.selectedTenantId()).toBe('t1');
      done();
    });
  });

  it('redirects to choose-tenant when the server denies membership (404/403)', (done) => {
    (tenantServiceStub.get as jasmine.Spy).and.returnValue(throwError(() => new Error('not found')));

    const result = runGuard('t1') as Observable<boolean | UrlTree>;
    result.subscribe((value) => {
      expect(value).toBeInstanceOf(UrlTree);
      done();
    });
  });
});
