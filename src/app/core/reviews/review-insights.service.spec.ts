import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReviewInsightsService } from './review-insights.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('ReviewInsightsService', () => {
  let service: ReviewInsightsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReviewInsightsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the filters that are set', () => {
    service.insights('t1').subscribe();
    const bare = http.expectOne('/api/v1/tenants/t1/review-insights');
    expect(bare.request.params.keys()).toEqual([]);
    bare.flush(ok({ summary: { total: 0 } }));

    service.insights('t1', { location_id: 'l1', from: '2026-10-01', to: '' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/review-insights');
    expect(req.request.params.get('location_id')).toBe('l1');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.has('to')).toBeFalse();
    req.flush(ok({ summary: { total: 0 } }));
  });

  it('downloads the CSV as a blob and reads the filename', () => {
    let result: { blob: Blob; filename: string } | undefined;
    service.exportCsv('t1', { location_id: 'l1' }).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/review-insights/export');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('location_id')).toBe('l1');
    req.flush(new Blob(['a,b']), { headers: { 'Content-Disposition': 'attachment; filename="review-report-2026-11-21.csv"' } });
    expect(result?.filename).toBe('review-report-2026-11-21.csv');
    expect(result?.blob.size).toBe(3);
  });

  it('re-parses a JSON error body that arrives as a blob', (done) => {
    service.exportCsv('t1').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(404);
        expect(err.error.error.code).toBe('NOT_FOUND');
        done();
      },
    });
    http
      .expectOne((r) => r.url === '/api/v1/tenants/t1/review-insights/export')
      .flush(new Blob([JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Tenant not found.' } })]), { status: 404, statusText: 'Not Found' });
  });

  it('reads and saves the auto-draft setting', () => {
    service.getSettings('t1').subscribe();
    http.expectOne('/api/v1/tenants/t1/review-insights/settings').flush(ok({ auto_draft_enabled: false, max_rating: 5 }));

    service.saveSettings('t1', { auto_draft_enabled: true, max_rating: 3 }).subscribe((s) => expect(s.auto_draft_enabled).toBeTrue());
    const put = http.expectOne('/api/v1/tenants/t1/review-insights/settings');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ auto_draft_enabled: true, max_rating: 3 });
    put.flush(ok({ auto_draft_enabled: true, max_rating: 3 }));
  });
});
