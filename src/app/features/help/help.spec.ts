import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { AgencyReportComponent } from '../agency/console/agency-report.component';
import { HelpComponent } from './help.component';
import { VerificationComponent } from './verification.component';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });
const el = (f: { nativeElement: unknown }): HTMLElement => f.nativeElement as HTMLElement;

describe('Help centre, verification and agency report (ADR 0058)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    TestBed.inject(CurrentTenantService).select({ id: 't1', caller_role: 'owner' } as never);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const art = { id: 'a1', slug: 'billing-and-invoices', title: 'Billing and invoices', category: 'billing', summary: 'Find invoices.', keywords: '', status: 'published', published_at: '2026-11-21T00:00:00.000Z', updated_at: '2026-11-21T00:00:00.000Z' };

  it('help: lists published guides, opens one, and sends feedback', () => {
    const f = TestBed.createComponent(HelpComponent);
    f.detectChanges();
    http.expectOne('/api/v1/help/articles').flush(ok({ articles: [art], categories: ['billing'] }));
    http.expectOne('/api/v1/tenants/t1/feedback').flush(ok({ feedback: [] }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="help-list"]')!.textContent).toContain('Billing and invoices');

    (el(f).querySelector('.link') as HTMLButtonElement).click();
    http.expectOne('/api/v1/help/articles/billing-and-invoices').flush(ok({ ...art, body: 'Open Billing to see invoices.' }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="help-article"]')!.textContent).toContain('Open Billing to see invoices.');

    f.componentInstance.form.patchValue({ category: 'bug', rating: '3', message: 'Button misaligned' });
    f.componentInstance.send();
    const req = http.expectOne('/api/v1/tenants/t1/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ category: 'bug', message: 'Button misaligned', rating: 3 });
    req.flush(ok({ id: 'f1' }));
    http.expectOne('/api/v1/tenants/t1/feedback').flush(ok({ feedback: [{ id: 'f1', category: 'bug', rating: 3, message: 'Button misaligned', status: 'new', admin_note: 'Fixed in the next release', created_at: '2026-11-21T00:00:00.000Z', handled_at: null }] }));
    f.detectChanges();
    expect(el(f).textContent).toContain('Thanks');
    expect(el(f).querySelector('[data-testid="my-feedback"]')!.textContent).toContain('Fixed in the next release');
  });

  it('help: empty search result shows the empty state; an API error is surfaced', () => {
    const f = TestBed.createComponent(HelpComponent);
    f.detectChanges();
    http.expectOne('/api/v1/help/articles').flush(ok({ articles: [], categories: [] }));
    http.expectOne('/api/v1/tenants/t1/feedback').flush(ok({ feedback: [] }));
    f.detectChanges();
    expect(el(f).textContent).toContain('No guides found');
    f.componentInstance.onCategory('billing');
    http.expectOne('/api/v1/help/articles?category=billing').flush({ error: { code: 'X', message: 'Boom' } }, { status: 500, statusText: 'Err' });
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('verification: shows the self-declared notice, submits, and hides the form once verified', () => {
    const f = TestBed.createComponent(VerificationComponent);
    f.detectChanges();
    http.expectOne('/api/v1/tenants/t1/verification').flush(ok({ verification: null, notes: ['Details are self-declared.'] }));
    f.detectChanges();
    expect(el(f).textContent).toContain('Details are self-declared.');
    f.componentInstance.form.patchValue({ legal_name: 'Glow Pvt Ltd', gstin: '27ABCDE1234F1Z5' });
    f.componentInstance.submit();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/tenants/t1/verification');
    expect(req.request.body).toEqual(jasmine.objectContaining({ legal_name: 'Glow Pvt Ltd', gstin: '27ABCDE1234F1Z5' }));
    req.flush(ok({ verification: { id: 'v1', status: 'verified', legal_name: 'Glow Pvt Ltd', gstin: null, website_url: null, note: null, submitted_at: '2026-11-21T00:00:00.000Z', reviewed_at: '2026-11-21T01:00:00.000Z', review_note: null }, notes: [] }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="verification-status"]')!.textContent).toContain('verified');
    expect(el(f).querySelector('[data-testid="verification-form"]')).toBeNull();
  });

  it('verification: server-side field error is shown', () => {
    const f = TestBed.createComponent(VerificationComponent);
    f.detectChanges();
    http.expectOne('/api/v1/tenants/t1/verification').flush(ok({ verification: null, notes: [] }));
    f.componentInstance.form.patchValue({ legal_name: 'X', gstin: 'bad' });
    f.componentInstance.submit();
    http.expectOne((r) => r.method === 'PUT').flush({ error: { code: 'VALIDATION_ERROR', message: 'Verification details failed validation.', fields: { gstin: 'gstin must be a 15-character GSTIN' } } }, { status: 422, statusText: 'Unprocessable' });
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')!.textContent).toContain('GSTIN');
  });

  it('agency report: uses real analytics + branding, escapes CSV formulas, and print is a browser action', () => {
    const f = TestBed.createComponent(AgencyReportComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/branding').flush(ok({ brand_name: 'Rise Agency', tagline: 'Growth, simply', primary_color: '#112233', accent_color: null, support_email: '', website_url: '', custom_domain: null, notes: [] }));
    http.expectOne('/api/v1/agency/analytics?days=30').flush(
      ok({
        days: 30,
        client_count: 1,
        totals: { leads_new: 5, content_created: 2, posts_succeeded: 3, posts_failed: 0, reviews_new: 1, open_tickets: 0, avg_rating: 4.5 },
        clients: [{ link_id: 'l1', client_tenant_id: 'c1', client_name: '=EVIL()', leads_new: 5, content_created: 2, posts_succeeded: 3, posts_failed: 0, reviews_new: 1, avg_rating: 4.5, open_tickets: 0 }],
        notes: ['Reach and engagement are not shown.'],
      }),
    );
    f.detectChanges();
    const report = el(f).querySelector('[data-testid="report"]')!;
    expect(report.textContent).toContain('Rise Agency');
    expect(report.textContent).toContain('Growth, simply');
    expect(report.textContent).toContain('Reach and engagement are not shown.');
    expect(el(f).querySelector('[data-testid="report-totals"]')!.textContent).toContain('5');
    expect(f.componentInstance.csv()).toContain("'=EVIL()");
    const print = spyOn(window, 'print').and.stub();
    (el(f).querySelector('[data-testid="print"]') as HTMLButtonElement).click();
    expect(print).toHaveBeenCalled();
    f.componentInstance.setDays(7);
    http.expectOne('/api/v1/agency/analytics?days=7').flush(ok({ days: 7, client_count: 0, totals: { leads_new: 0, content_created: 0, posts_succeeded: 0, posts_failed: 0, reviews_new: 0, open_tickets: 0, avg_rating: null }, clients: [], notes: [] }));
  });
});
