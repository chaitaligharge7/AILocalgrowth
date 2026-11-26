import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { AnalyticsComponent } from './analytics.component';

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

describe('AnalyticsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  function flushOverview(overridesPartial: Record<string, unknown> = {}) {
    httpMock.expectOne('/api/v1/tenants/t1/analytics/overview').flush({
      data: {
        generated_at: '2026-11-20T00:00:00.000Z',
        audit_coverage: { locations_total: 2, locations_audited: 1, percentage: 50.0 },
        posts: { attempted: 10, succeeded: 8, failed: 2 },
        pending_reviews: 3,
        leads: { available: false, count: null, note: 'Lead tracking (S7 CRM) is not yet implemented.' },
        subscription_usage: [
          {
            meter_code: 'posts_published_per_month',
            limit_qty: 50,
            used_qty: 8,
            reserved_qty: 1,
            period_start: '2026-11-01T00:00:00.000Z',
            period_end: '2026-11-30T23:59:59.000Z',
          },
        ],
        ...overridesPartial,
      },
      meta: { request_id: 'r1' },
    });
    httpMock.expectOne('/api/v1/tenants/t1/locations').flush({
      data: {
        locations: [
          { id: 'loc1', name: 'Main Branch', address: { city: 'Chennai' } },
          { id: 'loc2', name: 'Adyar Branch', address: { city: 'Chennai' } },
        ],
      },
      meta: { request_id: 'r-loc' },
    });
  }

  it('renders audit coverage %, posts attempted/succeeded/failed and pending reviews from the real overview response', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('50%');
    expect(text).toContain('8 / 10');
    expect(text).toContain('2 failed');
    expect(text).toContain('3'); // pending reviews
  });

  it('shows leads as an explicit "not yet available" placeholder, never a fabricated number', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Not yet available');
    expect(text).toContain('Lead tracking (S7 CRM) is not yet implemented.');
    expect(fixture.componentInstance.overview()?.leads.count).toBeNull();
  });

  it('renders subscription usage rows', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('posts_published_per_month');
  });

  it('distinguishes a null metric day ("No data") from a real zero value, never rendering null as 0', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.metricsForm.patchValue({ locationId: 'loc1', provider: 'meta', start: '2026-11-01', end: '2026-11-03' });
    component.loadMetrics();

    const req = httpMock.expectOne((r) => r.url.includes('/locations/loc1/metrics'));
    req.flush({
      data: {
        tenant_id: 't1',
        location_id: 'loc1',
        provider: 'meta',
        external_location_id: 'mock-fbpage-abc',
        start: '2026-11-01',
        end: '2026-11-03',
        granularity: 'daily',
        metrics: {
          page_impressions: [
            { date: '2026-11-01', value: 42 },
            { date: '2026-11-02', value: null },
            { date: '2026-11-03', value: 0 },
          ],
        },
        provenance: 'mock',
        mock_provider: true,
        fetched_at: '2026-11-20T00:00:00.000Z',
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.metricRows()).toEqual([
      { date: '2026-11-01', values: [42] },
      { date: '2026-11-02', values: [null] },
      { date: '2026-11-03', values: [0] },
    ]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No data');
    // The real 0 for 2026-11-03 must render as "0", not be swallowed by the "No data" treatment.
    const cells = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('td'));
    const zeroCell = cells.find((c) => c.textContent?.trim() === '0');
    expect(zeroCell).toBeTruthy();
    expect(zeroCell?.classList.contains('no-data')).toBe(false);
  });

  it('maps a PROVIDER_REAUTH_REQUIRED metrics error to its backend message, not a silent empty table', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.metricsForm.patchValue({ locationId: 'loc1', provider: 'meta', start: '2026-11-01', end: '2026-11-03' });
    component.loadMetrics();

    const req = httpMock.expectOne((r) => r.url.includes('/locations/loc1/metrics'));
    req.flush(
      { error: { code: 'PROVIDER_REAUTH_REQUIRED', message: 'No connected "meta" integration for this tenant.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(component.metricsError()).toBe('No connected "meta" integration for this tenant.');
  });

  it('downloads the PDF export (format=pdf) and shows a confirmation notice', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const pdfButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export PDF'),
    ) as HTMLButtonElement | undefined;
    expect(pdfButton?.disabled).toBe(false);

    const createObjectURLSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-pdf');
    const revokeObjectURLSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    const originalCreateElement = document.createElement.bind(document);
    spyOn(document, 'createElement').and.callFake((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    fixture.componentInstance.exportPdf();
    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/export?format=pdf');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'inline; filename="analytics-export-20261120-000000.pdf"' },
      status: 200,
      statusText: 'OK',
    });
    fixture.detectChanges();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.exportNotice()).toContain('analytics-export-20261120-000000.pdf');
  });

  it('downloads the CSV export and shows a confirmation notice', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    const createObjectURLSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:mock');
    const revokeObjectURLSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    const originalCreateElement = document.createElement.bind(document);
    spyOn(document, 'createElement').and.callFake((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    fixture.componentInstance.exportCsv();
    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/export?format=csv');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['section,metric,value\r\n'], { type: 'text/csv' }), {
      headers: { 'Content-Disposition': 'inline; filename="analytics-export-20261120-000000.csv"' },
      status: 200,
      statusText: 'OK',
    });
    fixture.detectChanges();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.exportNotice()).toContain('analytics-export-20261120-000000.csv');
  });

  it('shows the owner/admin-only export error message on a 403 FORBIDDEN', (done) => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    flushOverview();
    fixture.detectChanges();

    fixture.componentInstance.exportCsv();
    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/export?format=csv');
    const errorBody = JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Only an owner or admin may export analytics.' }, request_id: 'r1' });
    req.flush(new Blob([errorBody], { type: 'application/json' }), { status: 403, statusText: 'Forbidden' });

    // Blob->text() (inside AnalyticsService.normalizeBlobError) resolves
    // asynchronously (a real browser Blob/Promise, not a fake-async-friendly
    // timer) — same "real setTimeout" pattern asset.service.spec.ts already
    // uses for its FileReader-driven test, rather than fakeAsync/tick.
    // 200ms (not 50ms): under Karma/ChromeHeadless the zone.js-wrapped
    // microtask chain (Blob.text() -> JSON.parse -> rethrow -> catchError ->
    // subscribe) occasionally takes long enough that a 50ms real timer fires
    // first, failing the assertion before the chain lands — confirmed by
    // instrumenting every step and reproducing a pass at 300ms, a fail at
    // 50ms. This is a timer-margin bug in the test, not the app code.
    setTimeout(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.exportError()).toBe('Only an owner or admin may export analytics.');
      done();
    }, 200);
  });
});
