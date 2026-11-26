import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgencyUsage } from '../../../core/agency/agency.models';
import { AgencyUsageComponent } from './agency-usage.component';

const usageResponse: AgencyUsage = {
  agency_id: 'agency1',
  pooled_billing_wired: false,
  totals: [
    { meter_code: 'ai_generations_per_month', limit_qty: 200, used_qty: 20, reserved_qty: 0, remaining_qty: 180 },
  ],
  clients: [
    {
      client_tenant_id: 't-client',
      client_display_name: 'Client Co',
      pooled_billing_opt_in: true,
      subscription_status: 'active',
      plan_code: 'starter',
      meters: [
        { meter_code: 'ai_generations_per_month', limit_qty: 60, used_qty: 20, reserved_qty: 0, remaining_qty: 40 },
      ],
    },
  ],
};

describe('AgencyUsageComponent', () => {
  let httpMock: HttpTestingController;

  async function setUp() {
    await TestBed.configureTestingModule({
      imports: [AgencyUsageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AgencyUsageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('renders a prominent pooled_billing_wired:false banner, never hiding it', async () => {
    const fixture = await setUp();
    const req = httpMock.expectOne('/api/v1/agency/usage');
    expect(req.request.method).toBe('GET');
    req.flush({ data: usageResponse, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    const banner = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="pooled-billing-banner"]');
    expect(banner).not.toBeNull();
    const bannerText = banner!.textContent ?? '';
    expect(bannerText).toContain('Reporting only');
    expect(bannerText).toContain('not yet billed through the agency');
    expect(bannerText).toContain('false');
    expect(fixture.componentInstance.usage()?.pooled_billing_wired).toBe(false);
  });

  it('still renders per-client and total usage data alongside the banner', async () => {
    const fixture = await setUp();
    httpMock.expectOne('/api/v1/agency/usage').flush({ data: usageResponse, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Client Co');
    expect(text).toContain('starter');
    expect(text).toContain('ai_generations_per_month');
  });

  it('shows a clear "not an agency yet" message on a 404 NOT_FOUND, not a generic error', async () => {
    const fixture = await setUp();
    const req = httpMock.expectOne('/api/v1/agency/usage');
    req.flush(
      { error: { code: 'NOT_FOUND', message: 'No active agency account found for your owner/admin memberships.' }, request_id: 'r1' },
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.notAnAgency()).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain("don't have an active agency account");
  });
});
