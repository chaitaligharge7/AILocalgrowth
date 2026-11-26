import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AuditCheck, AuditRecommendation, ProfileAudit } from '../../core/audit/audit.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { AuditComponent, checkStateView, recommendationForCheck } from './audit.component';

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

const checks: AuditCheck[] = [
  { code: 'category', label: 'Category set', weight: 10, state: 'pass', value: 'Cafe', provenance: 'tenant_data' },
  { code: 'hours', label: 'Hours published', weight: 10, state: 'unknown', value: null, provenance: null },
  { code: 'photos', label: 'At least 3 photos', weight: 10, state: 'fail', value: 0, provenance: 'tenant_data' },
];

const recommendations: AuditRecommendation[] = [
  { rule_code: 'photos', label: 'At least 3 photos', severity: 'action_needed', remediation: 'Upload at least 3 photos.' },
  { rule_code: 'hours', label: 'Hours published', severity: 'needs_evidence', remediation: 'Sync or enter business hours.' },
];

describe('checkStateView (pure mapping — pass/fail/unknown must be visually distinct)', () => {
  it('maps pass/fail/unknown to disjoint CSS classes and icons', () => {
    const pass = checkStateView('pass');
    const fail = checkStateView('fail');
    const unknown = checkStateView('unknown');

    expect(pass.cssClass).toBe('state-pass');
    expect(fail.cssClass).toBe('state-fail');
    expect(unknown.cssClass).toBe('state-unknown');

    // The whole point of tri-state evaluation (blueprint §02 M05): unknown
    // must never render identically to fail.
    expect(unknown.cssClass).not.toBe(fail.cssClass);
    expect(unknown.icon).not.toBe(fail.icon);
    expect(unknown.label).not.toBe(fail.label);
  });
});

describe('recommendationForCheck (pure)', () => {
  it('finds the matching recommendation by rule_code', () => {
    const rec = recommendationForCheck(checks[2], recommendations);
    expect(rec?.remediation).toBe('Upload at least 3 photos.');
  });

  it('returns null when a passing check has no recommendation', () => {
    expect(recommendationForCheck(checks[0], recommendations)).toBeNull();
  });
});

describe('AuditComponent (DOM rendering of the checklist)', () => {
  let httpMock: HttpTestingController;

  const sampleAudit: ProfileAudit = {
    id: 'audit1',
    tenant_id: 't1',
    location_id: 'loc1',
    rule_set_id: 'rs1',
    readiness_score: 66.67,
    readiness_score_note: 'Product-generated readiness indicator based on available evidence. Not a Google search ranking or guarantee of ranking improvement.',
    coverage_pct: 66.67,
    evidence: { rule_set_version: '1', mock_provider_used: false, manual_evidence_used: false, checks },
    recommendations,
    actions: [],
    completed_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ locationId: 'loc1' }) } } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  it('renders pass/fail/unknown checks with distinct CSS classes and never calls unknown a ranking or a failure', () => {
    const fixture = TestBed.createComponent(AuditComponent);
    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/audits');
    req.flush({ data: { audits: [sampleAudit] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll('.check-row');
    expect(rows.length).toBe(3);
    expect(rows[0].classList.contains('state-pass')).toBe(true);
    expect(rows[1].classList.contains('state-unknown')).toBe(true);
    expect(rows[2].classList.contains('state-fail')).toBe(true);
    // unknown row must not also carry the fail class
    expect(rows[1].classList.contains('state-fail')).toBe(false);

    // This screen's own authored copy (headings/state labels) must never
    // call the score a "rank"/"ranking" — only the backend's own
    // disclaimer text (rendered separately below) is allowed to use the
    // word, and only to deny it.
    const heading = el.querySelector('.score-card h2')?.textContent ?? '';
    expect(heading).toContain('Readiness indicator');
    expect(heading.toLowerCase()).not.toContain('rank');
    const stateLabels = Array.from(el.querySelectorAll('.check-state-text')).map((n) => n.textContent ?? '');
    for (const label of stateLabels) {
      expect(label.toLowerCase()).not.toContain('rank');
    }
  });
});
