import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportResult, AnalyticsOverview, LocationMetricsResponse } from './analytics.models';

const sampleOverview: AnalyticsOverview = {
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
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the analytics overview', () => {
    let result: AnalyticsOverview | undefined;
    service.overview('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/overview');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleOverview, meta: { request_id: 'r1' } });

    expect(result).toEqual(sampleOverview);
  });

  it('reports leads as unavailable, never a fabricated count', () => {
    let result: AnalyticsOverview | undefined;
    service.overview('t1').subscribe((r) => (result = r));
    httpMock.expectOne('/api/v1/tenants/t1/analytics/overview').flush({ data: sampleOverview, meta: { request_id: 'r1' } });

    expect(result?.leads.available).toBe(false);
    expect(result?.leads.count).toBeNull();
  });

  it('fetches location metrics with provider/start/end query params, preserving null days', () => {
    let result: LocationMetricsResponse | undefined;
    service.locationMetrics('t1', 'loc1', 'meta', '2026-11-01', '2026-11-03').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/metrics?provider=meta&start=2026-11-01&end=2026-11-03');
    expect(req.request.method).toBe('GET');
    const response: LocationMetricsResponse = {
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
    };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
    expect(result?.metrics['page_impressions'][1].value).toBeNull();
    expect(result?.metrics['page_impressions'][2].value).toBe(0);
  });

  it('surfaces a 409 PROVIDER_REAUTH_REQUIRED when no connection exists for the metrics request', () => {
    let error: unknown;
    service.locationMetrics('t1', 'loc1', 'meta', '2026-11-01', '2026-11-03').subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/metrics?provider=meta&start=2026-11-01&end=2026-11-03');
    req.flush(
      { error: { code: 'PROVIDER_REAUTH_REQUIRED', message: 'No connected "meta" integration for this tenant.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );

    expect((error as { status: number }).status).toBe(409);
  });

  it('downloads the CSV export as a blob with the filename parsed from Content-Disposition', () => {
    let result: AnalyticsExportResult | undefined;
    service.exportCsv('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/export?format=csv');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    const csvBody = 'section,metric,value\r\naudit_coverage,locations_total,2\r\n';
    req.flush(new Blob([csvBody], { type: 'text/csv' }), {
      headers: { 'Content-Disposition': 'inline; filename="analytics-export-20261120-000000.csv"' },
      status: 200,
      statusText: 'OK',
    });

    expect(result?.filename).toBe('analytics-export-20261120-000000.csv');
    expect(result?.blob.type).toContain('csv');
  });

  it('re-parses a blob-typed 403 FORBIDDEN export error back into the normal {error:{code,message}} shape', (done) => {
    let error: unknown;
    service.exportCsv('t1').subscribe({
      error: (e) => {
        error = e;
        // Assert inside the subscription itself rather than after an
        // arbitrary delay — Blob#text() resolving is what drives this
        // error callback, so by the time it fires the re-parse is done.
        const httpError = error as { status: number; error: { error: { code: string } } };
        expect(httpError.status).toBe(403);
        expect(httpError.error.error.code).toBe('FORBIDDEN');
        done();
      },
    });

    const req = httpMock.expectOne('/api/v1/tenants/t1/analytics/export?format=csv');
    const errorBody = JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Only an owner or admin may export analytics.' }, request_id: 'r1' });
    req.flush(new Blob([errorBody], { type: 'application/json' }), { status: 403, statusText: 'Forbidden' });
  });
});
