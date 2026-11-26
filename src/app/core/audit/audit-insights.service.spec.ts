import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuditInsightsService } from './audit-insights.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('AuditInsightsService', () => {
  let service: AuditInsightsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuditInsightsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('compares audits, sending from/to only when chosen', () => {
    service.compare('t1', 'l1').subscribe();
    const bare = http.expectOne('/api/v1/tenants/t1/locations/l1/audits/compare');
    expect(bare.request.params.keys()).toEqual([]);
    bare.flush(ok({ comparable: false, trend: [] }));

    service.compare('t1', 'l1', 'a1', 'a2').subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/l1/audits/compare');
    expect(req.request.params.get('from')).toBe('a1');
    expect(req.request.params.get('to')).toBe('a2');
    req.flush(ok({ comparable: false, trend: [] }));
  });

  it('loads the board and patches a task', () => {
    service.board('t1', 'l1').subscribe();
    http.expectOne('/api/v1/tenants/t1/locations/l1/audit-actions').flush(ok({ items: [], counts: {} }));

    service.updateTask('t1', 'act1', { status: 'done' }).subscribe();
    const req = http.expectOne('/api/v1/tenants/t1/audit-actions/act1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'done' });
    req.flush(ok({ id: 'act1', status: 'done' }));
  });

  it('loads analysis and keyword suggestions', () => {
    service.analysis('t1', 'l1').subscribe();
    http.expectOne('/api/v1/tenants/t1/locations/l1/profile-analysis').flush(ok({ fields: [] }));
    service.keywords('t1', 'l1').subscribe();
    http.expectOne('/api/v1/tenants/t1/locations/l1/keyword-suggestions').flush(ok({ keywords: [] }));
  });

  it('downloads a report as a blob and reads the filename from Content-Disposition', () => {
    let result: { blob: Blob; filename: string } | undefined;
    service.exportReport('t1', 'aud1', 'csv').subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/audits/aud1/export');
    expect(req.request.params.get('format')).toBe('csv');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['a,b']), { headers: { 'Content-Disposition': 'attachment; filename="readiness-audit-x.csv"' } });
    expect(result?.filename).toBe('readiness-audit-x.csv');
    expect(result?.blob.size).toBe(3);
  });

  it('re-parses a blob error body so the API error envelope is usable', (done) => {
    service.exportReport('t1', 'aud1', 'pdf' as never).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(422);
        expect((err.error as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
        done();
      },
    });
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/audits/aud1/export');
    req.flush(new Blob([JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'bad' } })]), { status: 422, statusText: 'Unprocessable' });
  });
});
