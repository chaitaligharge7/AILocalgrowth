import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { BillingAddonsComponent } from './billing-addons.component';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });
const addon = {
  id: 'a1',
  code: 'ai_credits_100',
  name: '100 extra AI credits',
  description: 'top-up',
  meter_code: 'ai_generations_per_month',
  quantity: 100,
  price: '499.00',
  currency: 'INR',
  status: 'active',
};
const pending = {
  id: 'p1',
  addon_id: 'a1',
  addon_code: 'ai_credits_100',
  addon_name: '100 extra AI credits',
  meter_code: 'ai_generations_per_month',
  quantity: 100,
  amount: '499.00',
  currency: 'INR',
  status: 'pending',
  provider: 'mock',
  mock_provider: true,
  created_at: '2026-11-21T00:00:00.000Z',
  paid_at: null,
};

describe('BillingAddonsComponent', () => {
  let http: HttpTestingController;

  function setup(mock: boolean, purchases: unknown[] = []) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    TestBed.inject(CurrentTenantService).select({ id: 't1', caller_role: 'owner' } as never);
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BillingAddonsComponent);
    fixture.detectChanges();
    http.expectOne('/api/v1/tenants/t1/billing/addons').flush(ok({ mock_provider: mock, addons: [addon], purchases }));
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('lists add-ons and shows the MOCK_PROVIDER banner in mock mode', () => {
    const el: HTMLElement = setup(true).nativeElement;
    expect(el.querySelectorAll('[data-testid="addon-card"]').length).toBe(1);
    expect(el.querySelector('[data-testid="mock-banner"]')?.textContent).toContain('MOCK_PROVIDER');
    expect(el.querySelector('[data-testid="billing-support-link"]')).not.toBeNull();
  });

  it('hides the mock-complete control when the provider is not mock', () => {
    const el: HTMLElement = setup(false, [pending]).nativeElement;
    expect(el.querySelector('[data-testid="mock-banner"]')).toBeNull();
    expect(el.querySelector('[data-testid="mock-complete"]')).toBeNull();
  });

  it('buys an add-on then reloads the catalog', () => {
    const fixture = setup(true);
    (fixture.nativeElement.querySelector('[data-testid="addon-card"] button') as HTMLButtonElement).click();
    http.expectOne('/api/v1/tenants/t1/billing/addons/a1/purchase').flush(ok(pending));
    http.expectOne('/api/v1/tenants/t1/billing/addons').flush(ok({ mock_provider: true, addons: [addon], purchases: [pending] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-table"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="mock-complete"]')?.textContent).toContain('DEV ONLY');
  });
});
