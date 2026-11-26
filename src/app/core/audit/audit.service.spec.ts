import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuditService } from './audit.service';
import { ProfileAudit } from './audit.models';
import { LocationSyncResponse } from '../integrations/integration.models';

const sampleAudit: ProfileAudit = {
  id: 'audit1',
  tenant_id: 't1',
  location_id: 'loc1',
  rule_set_id: 'rs1',
  readiness_score: 62.5,
  readiness_score_note: 'Product-generated readiness indicator based on available evidence. Not a Google search ranking or guarantee of ranking improvement.',
  coverage_pct: 88.89,
  evidence: {
    rule_set_version: '1',
    mock_provider_used: true,
    manual_evidence_used: false,
    checks: [
      { code: 'category', label: 'Category set', weight: 10, state: 'pass', value: 'Cafe', provenance: 'tenant_data' },
      { code: 'hours', label: 'Hours published', weight: 10, state: 'unknown', value: null, provenance: null },
      { code: 'photos', label: 'At least 3 photos', weight: 10, state: 'fail', value: 0, provenance: 'tenant_data' },
    ],
  },
  recommendations: [
    { rule_code: 'photos', label: 'At least 3 photos', severity: 'action_needed', remediation: 'Upload at least 3 photos.' },
    { rule_code: 'hours', label: 'Hours published', severity: 'needs_evidence', remediation: 'Sync or enter business hours.' },
  ],
  actions: [
    { id: 'a1', tenant_id: 't1', audit_id: 'audit1', rule_code: 'photos', status: 'open', owner_id: null, resolved_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
  ],
  completed_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('AuditService', () => {
  let service: AuditService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuditService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('syncs a location from Google', () => {
    let result: LocationSyncResponse | undefined;
    service.sync('t1', 'loc1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/sync');
    expect(req.request.method).toBe('POST');
    const response: LocationSyncResponse = {
      location_id: 'loc1',
      connection_id: 'conn1',
      profile_sync_run_id: 'run1',
      review_sync_run_id: 'run2',
      reviews_fetched: 3,
      profile_snapshot: { category: 'Cafe' },
      mock_provider: true,
      synced_at: '2026-01-01T00:00:00.000Z',
    };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('creates an audit for a location, optionally with manual evidence', () => {
    service.create('t1', 'loc1', { manual_evidence_json: { website: 'https://example.com' } }).subscribe();

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/audits');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ manual_evidence_json: { website: 'https://example.com' } });
    req.flush({ data: sampleAudit, meta: { request_id: 'r1' } });
  });

  it('lists audit history for a location', () => {
    let result: ProfileAudit[] | undefined;
    service.history('t1', 'loc1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/audits');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { audits: [sampleAudit] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([sampleAudit]);
  });

  it('gets a single audit by id', () => {
    let result: ProfileAudit | undefined;
    service.get('t1', 'audit1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/audits/audit1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleAudit, meta: { request_id: 'r1' } });

    expect(result).toEqual(sampleAudit);
  });

  it('surfaces a 503 AUDIT_RULES_UNAVAILABLE error unchanged', () => {
    let error: unknown;
    service.create('t1', 'loc1').subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/audits');
    req.flush(
      { error: { code: 'AUDIT_RULES_UNAVAILABLE', message: 'No active audit rule set is published.' }, request_id: 'r1' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect((error as { status: number }).status).toBe(503);
  });
});
