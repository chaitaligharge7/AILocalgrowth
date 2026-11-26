import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  AuditComparison,
  KeywordSuggestions,
  ProfileAnalysis,
  TaskBoard,
} from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { AuditService } from '../../core/audit/audit.service';
import { LocationApiService } from '../../core/locations/location.service';
import { MemberService } from '../../core/members/member.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { AuditAnalysisComponent } from './audit-analysis.component';
import { AuditHistoryComponent } from './audit-history.component';
import { AuditInsightsComponent } from './audit-insights.component';
import { AuditKeywordsComponent } from './audit-keywords.component';
import { AuditTasksComponent } from './audit-tasks.component';

const board: TaskBoard = {
  location_id: 'l1',
  latest_audit: { id: 'a2', completed_at: '2026-11-20T10:00:00.000Z', readiness_score: 55, coverage_pct: 70 },
  counts: { open: 1, in_progress: 1, done: 1, dismissed: 0 },
  items: [
    { id: 'x1', rule_code: 'website', label: 'Website linked', remediation: 'Link your website.', weight: 10, severity: 'action_needed', status: 'open', owner_id: null, owner_name: null, audit_id: 'a2', audit_completed_at: '2026-11-20T10:00:00.000Z', resolved_at: null, updated_at: '2026-11-20T10:00:00.000Z' },
    { id: 'x2', rule_code: 'hours', label: 'Business hours published', remediation: 'Publish hours.', weight: 10, severity: 'needs_evidence', status: 'in_progress', owner_id: 'u1', owner_name: 'Asha', audit_id: 'a2', audit_completed_at: '2026-11-20T10:00:00.000Z', resolved_at: null, updated_at: '2026-11-20T10:00:00.000Z' },
    { id: 'x3', rule_code: 'photos', label: 'Photos uploaded', remediation: 'Upload photos.', weight: 10, severity: 'action_needed', status: 'done', owner_id: null, owner_name: null, audit_id: 'a1', audit_completed_at: '2026-11-19T10:00:00.000Z', resolved_at: '2026-11-20T10:00:00.000Z', updated_at: '2026-11-20T10:00:00.000Z' },
  ],
};

function insightsStub(overrides: Record<string, unknown> = {}) {
  return {
    board: jasmine.createSpy('board').and.returnValue(of(board)),
    updateTask: jasmine.createSpy('updateTask').and.returnValue(of(board.items[0])),
    compare: jasmine.createSpy('compare').and.returnValue(of({ location_id: 'l1', comparable: false, reason: 'At least two audits are needed.', trend: [], readiness_score_note: '' })),
    analysis: jasmine.createSpy('analysis').and.returnValue(
      of({ location_id: 'l1', google_snapshot: { available: false, mock_provider: null, fetched_at: null, provenance: null }, fields: [], summary: { fields_total: 0, complete: 0, needs_attention: 0, differs_from_google: 0 }, note: '' }),
    ),
    keywords: jasmine.createSpy('keywords').and.returnValue(
      of({ location_id: 'l1', generated: true, keywords: [], count: 0, needs_input: [], note: 'Generated.', generated_at: '2026-11-20T10:00:00.000Z' }),
    ),
    exportReport: jasmine.createSpy('exportReport').and.returnValue(of({ blob: new Blob(['x']), filename: 'r.html' })),
    ...overrides,
  };
}

const memberStub = { list: () => of([{ user_id: 'u1', name: 'Asha', email: 'a@example.test', role: 'owner', status: 'active', created_at: '2026-01-01T00:00:00.000Z' }]) };

describe('AuditTasksComponent', () => {
  function setup(canEdit: boolean, stub = insightsStub()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AuditTasksComponent],
      providers: [
        { provide: AuditInsightsService, useValue: stub },
        { provide: MemberService, useValue: memberStub },
      ],
    });
    const fixture = TestBed.createComponent(AuditTasksComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('groups tasks into status columns with counts', () => {
    const { el } = setup(true);
    const cols = Array.from(el.querySelectorAll('.column'));
    expect(cols.map((c) => c.getAttribute('data-status'))).toEqual(['open', 'in_progress', 'done', 'dismissed']);
    expect(cols[0].textContent).toContain('Website linked');
    expect(cols[1].textContent).toContain('Business hours published');
    expect(cols[2].textContent).toContain('Photos uploaded');
    expect(cols[3].textContent).toContain('Nothing here');
  });

  it('moves a task through PATCH and reloads the board', () => {
    const { fixture, el, stub } = setup(true);
    const select = el.querySelector('.column[data-status="open"] select') as HTMLSelectElement;
    select.value = 'in_progress';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(stub.updateTask).toHaveBeenCalledWith('t1', 'x1', { status: 'in_progress' });
    expect(stub.board).toHaveBeenCalledTimes(2);
  });

  it('assigns and clears an owner', () => {
    const { fixture, el, stub } = setup(true);
    const ownerSelect = el.querySelectorAll('.column[data-status="open"] select')[1] as HTMLSelectElement;
    ownerSelect.value = 'u1';
    ownerSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(stub.updateTask).toHaveBeenCalledWith('t1', 'x1', { owner_id: 'u1' });
    ownerSelect.value = '';
    ownerSelect.dispatchEvent(new Event('change'));
    expect(stub.updateTask).toHaveBeenCalledWith('t1', 'x1', { owner_id: null });
  });

  it('disables the controls for roles that cannot edit', () => {
    const { el } = setup(false);
    const selects = Array.from(el.querySelectorAll('select')) as HTMLSelectElement[];
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.every((s) => s.disabled)).toBeTrue();
    expect(el.textContent).toContain('Only owner, admin and editor roles can move tasks');
  });

  it('shows the server error when a move is refused', () => {
    const stub = insightsStub({
      updateTask: jasmine.createSpy('updateTask').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { error: { code: 'FORBIDDEN', message: 'You do not have permission to update improvement tasks.' }, request_id: 'r' } })),
      ),
    });
    const { fixture, el } = setup(true, stub);
    const select = el.querySelector('.column[data-status="open"] select') as HTMLSelectElement;
    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('do not have permission');
  });

  it('shows an empty state when there are no tasks', () => {
    const { el } = setup(true, insightsStub({ board: jasmine.createSpy().and.returnValue(of({ ...board, items: [], counts: { open: 0, in_progress: 0, done: 0, dismissed: 0 } })) }));
    expect(el.textContent).toContain('No improvement tasks yet');
  });
});

describe('AuditHistoryComponent', () => {
  const comparison: AuditComparison = {
    location_id: 'l1',
    comparable: true,
    from: { id: 'a1', completed_at: '2026-11-19T10:00:00.000Z', readiness_score: 40, coverage_pct: 55 },
    to: { id: 'a2', completed_at: '2026-11-20T10:00:00.000Z', readiness_score: 55, coverage_pct: 70 },
    score_delta: 15,
    coverage_delta: 15,
    summary: { improved: 1, regressed: 0, unchanged: 0, evidence_added: 1, evidence_lost: 0 },
    checks: [
      { code: 'hours', label: 'Business hours published', weight: 10, from_state: 'unknown', to_state: 'pass', change: 'evidence_added' },
      { code: 'photos', label: 'Photos uploaded', weight: 10, from_state: 'fail', to_state: 'pass', change: 'improved' },
    ],
    trend: [
      { audit_id: 'a1', completed_at: '2026-11-19T10:00:00.000Z', readiness_score: 40, coverage_pct: 55 },
      { audit_id: 'a2', completed_at: '2026-11-20T10:00:00.000Z', readiness_score: 55, coverage_pct: 70 },
    ],
    readiness_score_note: 'Product-generated readiness indicator. Not a Google search ranking.',
  };

  function setup(result: AuditComparison) {
    TestBed.resetTestingModule();
    const stub = insightsStub({ compare: jasmine.createSpy('compare').and.returnValue(of(result)) });
    TestBed.configureTestingModule({ imports: [AuditHistoryComponent], providers: [{ provide: AuditInsightsService, useValue: stub }] });
    const fixture = TestBed.createComponent(AuditHistoryComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('shows score deltas and a per-check diff', () => {
    const { el } = setup(comparison);
    expect(el.textContent).toContain('40 → 55');
    expect(el.textContent).toContain('+15');
    const rows = Array.from(el.querySelectorAll('[data-testid="compare-table"] tbody tr')).map((r) => r.textContent);
    expect(rows[0]).toContain('Evidence added');
    expect(rows[1]).toContain('Improved');
  });

  it('never calls missing evidence a failure', () => {
    const { el } = setup(comparison);
    const first = el.querySelector('[data-testid="compare-table"] tbody tr')?.textContent ?? '';
    expect(first).toContain('Evidence missing');
    expect(first).not.toContain('Needs attention');
  });

  it('re-compares when a different audit is picked', () => {
    const { fixture, el, stub } = setup(comparison);
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'a2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(stub.compare).toHaveBeenCalledWith('t1', 'l1', 'a2', undefined);
  });

  it('explains when fewer than two audits exist', () => {
    const { el } = setup({ ...comparison, comparable: false, reason: 'At least two audits are needed to compare.', trend: [comparison.trend[0]] });
    expect(el.textContent).toContain('Nothing to compare yet');
    expect(el.textContent).toContain('At least two audits are needed');
  });
});

describe('AuditAnalysisComponent', () => {
  const analysis: ProfileAnalysis = {
    location_id: 'l1',
    google_snapshot: { available: true, mock_provider: true, fetched_at: '2026-11-20T10:00:00.000Z', provenance: 'mock' },
    fields: [
      { code: 'category', label: 'Primary category', rule_code: 'category', local: { present: true, value: 'Salon' }, google: { present: true, value: 'salon_and_spa' }, comparison: 'differs', suggestion: 'Local and Google values differ — decide which is correct, then push or edit.' },
      { code: 'hours', label: 'Opening hours', rule_code: 'hours', local: { present: true, value: { days_configured: 5, days: {} } }, google: null, comparison: 'not_synced', suggestion: 'Hours are set for 5 of 7 days; set the remaining days (or mark them closed).' },
      { code: 'services', label: 'Services / products', rule_code: 'services', local: { present: true, value: ['Haircut'] }, google: { present: true, value: ['Spa'] }, comparison: 'differs', suggestion: null, detail: { missing_on_google: ['Haircut'], only_on_google: ['Spa'] } },
    ],
    summary: { fields_total: 3, complete: 1, needs_attention: 2, differs_from_google: 2 },
    note: 'While Google runs in mock mode the "Google" side is fabricated sample data.',
  };

  it('labels the Google side as mock and renders suggestions', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AuditAnalysisComponent], providers: [{ provide: AuditInsightsService, useValue: insightsStub({ analysis: () => of(analysis) }) }] });
    const fixture = TestBed.createComponent(AuditAnalysisComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge--mock')?.textContent).toContain('MOCK_PROVIDER');
    expect(el.textContent).toContain('2 of 3 areas need attention');
    expect(el.textContent).toContain('5 of 7 days set');
    expect(el.textContent).toContain('Not on Google: Haircut');
    expect(el.textContent).toContain('Only on Google: Spa');
    expect(fixture.componentInstance.show(null, false)).toBe('Not set');
  });
});

describe('AuditKeywordsComponent', () => {
  const keywords: KeywordSuggestions = {
    location_id: 'l1',
    generated: true,
    keywords: [{ keyword: 'Salon in Adyar', kind: 'category_area', basis: [{ type: 'category', value: 'Salon' }, { type: 'service_area', value: 'Adyar' }], estimated: true, volume: null }],
    count: 1,
    needs_input: ['Add services to Business profile to get service-based keywords.'],
    note: 'Generated from your own Business Profile. These are ideas, not Google search data: no search volume.',
    generated_at: '2026-11-20T10:00:00.000Z',
  };

  it('shows generated ideas with their basis and no search volume', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AuditKeywordsComponent], providers: [{ provide: AuditInsightsService, useValue: insightsStub({ keywords: () => of(keywords) }) }] });
    const fixture = TestBed.createComponent(AuditKeywordsComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Salon in Adyar');
    expect(el.textContent).toContain('category: Salon');
    expect(el.textContent).toContain('service area: Adyar');
    expect(el.textContent).toContain('Generated · no search volume');
    expect(el.textContent).toContain('Add services to Business profile');
    expect(el.textContent?.toLowerCase()).not.toContain('searches/month');
  });
});

describe('AuditInsightsComponent', () => {
  function setup(role: string, stub = insightsStub()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AuditInsightsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'l1' } } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => ({ caller_role: role }) } },
        { provide: AuditService, useValue: { history: () => of([{ id: 'a2' }]) } },
        { provide: AuditInsightsService, useValue: stub },
        { provide: LocationApiService, useValue: { get: () => of({ id: 'l1', name: 'Glow Salon' }) } },
        { provide: MemberService, useValue: memberStub },
      ],
    });
    const fixture = TestBed.createComponent(AuditInsightsComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('shows the four tabs and switches content', () => {
    const { fixture, el } = setup('owner');
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim())).toEqual([
      'Improvement tasks', 'Audit history', 'Profile analysis', 'Keyword ideas',
    ]);
    expect(el.querySelector('app-audit-tasks')).not.toBeNull();
    (el.querySelectorAll('[role="tab"]')[3] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-audit-keywords')).not.toBeNull();
  });

  it('lets only owner/admin/editor edit tasks', () => {
    expect(setup('owner').fixture.componentInstance.canEdit()).toBeTrue();
    expect(setup('editor').fixture.componentInstance.canEdit()).toBeTrue();
    expect(setup('viewer').fixture.componentInstance.canEdit()).toBeFalse();
  });

  it('exports the latest audit in the chosen format', () => {
    const { fixture, el, stub } = setup('owner');
    const html = Array.from(el.querySelectorAll('.report-actions button')).find((b) => b.textContent?.includes('HTML')) as HTMLButtonElement;
    expect(html.disabled).toBeFalse();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(URL, 'revokeObjectURL');
    html.click();
    fixture.detectChanges();
    expect(stub.exportReport).toHaveBeenCalledWith('t1', 'a2', 'html');
  });

  it('shows the export error from the server', () => {
    const stub = insightsStub({
      exportReport: jasmine.createSpy().and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'NOT_FOUND', message: 'Audit not found.' }, request_id: 'r' } })),
      ),
    });
    const { fixture, el } = setup('owner', stub);
    (el.querySelector('.report-actions button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Audit not found.');
  });
});
