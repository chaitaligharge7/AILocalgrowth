import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AdminBillingReconComponent,
  AdminFeedbackComponent,
  AdminHelpArticlesComponent,
  AdminPrivacyComponent,
  AdminVerificationsComponent,
} from './admin-platform.components';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });
const el = (f: { nativeElement: unknown }): HTMLElement => f.nativeElement as HTMLElement;

describe('Platform admin console (ADR 0058)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const article = { id: 'a1', slug: 'reset', title: 'Reset it', category: 'basics', summary: 's', keywords: '', status: 'draft', published_at: null, updated_at: '2026-11-21T00:00:00.000Z' };

  it('help articles: lists, publishes with a reason, and creates a draft with a reason', () => {
    const f = TestBed.createComponent(AdminHelpArticlesComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/help/articles').flush(ok({ articles: [article] }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="help-table"]')!.textContent).toContain('Reset it');

    spyOn(window, 'prompt').and.returnValue('ready to go' as never);
    (el(f).querySelector('[data-testid="publish"]') as HTMLButtonElement).click();
    const pub = http.expectOne('/api/v1/admin/help/articles/a1/status');
    expect(pub.request.body).toEqual({ status: 'published', reason: 'ready to go' });
    pub.flush(ok({ ...article, status: 'published' }));
    http.expectOne('/api/v1/admin/help/articles').flush(ok({ articles: [{ ...article, status: 'published' }] }));

    f.componentInstance.form.patchValue({ title: 'New one', body: 'Body text', reason: 'seed' });
    f.componentInstance.save();
    const create = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/admin/help/articles');
    expect(create.request.body).toEqual(jasmine.objectContaining({ title: 'New one', body: 'Body text', reason: 'seed' }));
    create.flush(ok(article));
    http.expectOne('/api/v1/admin/help/articles').flush(ok({ articles: [] }));
  });

  it('help articles: cancelling the reason prompt sends nothing', () => {
    const f = TestBed.createComponent(AdminHelpArticlesComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/help/articles').flush(ok({ articles: [article] }));
    f.detectChanges();
    const prompt = spyOn(window, 'prompt').and.returnValue(null as never);
    (el(f).querySelector('[data-testid="publish"]') as HTMLButtonElement).click();
    expect(prompt).toHaveBeenCalled();
    http.expectNone('/api/v1/admin/help/articles/a1/status');
  });

  it('feedback: shows counts and resolves with reason and note', () => {
    const f = TestBed.createComponent(AdminFeedbackComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/feedback').flush(
      ok({
        counts: { new: 1, triaged: 0, resolved: 0, dismissed: 0 },
        feedback: [{ id: 'f1', category: 'idea', rating: 4, message: 'Add dark mode', status: 'new', admin_note: null, created_at: '2026-11-21T00:00:00.000Z', handled_at: null, tenant_id: 't1', tenant_name: 'Glow Salon' }],
      }),
    );
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="feedback-stats"]')!.textContent).toContain('New');
    expect(el(f).querySelector('[data-testid="feedback-table"]')!.textContent).toContain('Add dark mode');
    const prompt = spyOn(window, 'prompt');
    prompt.and.returnValues('triage pass', 'Planned for Q1');
    (el(f).querySelector('[data-testid="resolve"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/v1/admin/feedback/f1/triage');
    expect(req.request.body).toEqual({ status: 'resolved', note: 'Planned for Q1', reason: 'triage pass' });
    req.flush(ok({}));
    http.expectOne('/api/v1/admin/feedback').flush(ok({ counts: { new: 0, triaged: 0, resolved: 1, dismissed: 0 }, feedback: [] }));
  });

  it('verification and agency review: decisions carry the reason and call the right endpoints', () => {
    const f = TestBed.createComponent(AdminVerificationsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/verifications').flush(
      ok({ verifications: [{ id: 'v1', status: 'submitted', legal_name: 'Glow Pvt Ltd', gstin: '27ABCDE1234F1Z5', website_url: null, note: null, submitted_at: '2026-11-21T00:00:00.000Z', reviewed_at: null, review_note: null, tenant_id: 't1', tenant_name: 'Glow' }] }),
    );
    http.expectOne('/api/v1/admin/agency-reviews').flush(
      ok({ agencies: [{ id: 'g1', brand_name: 'Agency One', status: 'active', review_status: 'unreviewed', review_note: null, reviewed_at: null, owner_tenant_id: 't2', owner_tenant_name: 'AgOwner', active_clients: 2, created_at: '2026-11-21T00:00:00.000Z' }], notes: ['Informational only.'] }),
    );
    f.detectChanges();
    expect(el(f).textContent).toContain('Glow Pvt Ltd');
    expect(el(f).textContent).toContain('Informational only.');

    spyOn(window, 'prompt').and.returnValue('docs ok');
    (el(f).querySelector('[data-testid="verify"]') as HTMLButtonElement).click();
    const dec = http.expectOne('/api/v1/admin/verifications/v1/decision');
    expect(dec.request.body).toEqual(jasmine.objectContaining({ decision: 'verified', reason: 'docs ok' }));
    dec.flush(ok({}));
    http.expectOne('/api/v1/admin/verifications').flush(ok({ verifications: [] }));
    http.expectOne('/api/v1/admin/agency-reviews').flush(ok({ agencies: [], notes: [] }));

  });

  it('agency approve button sends review_status with reason', () => {
    const f = TestBed.createComponent(AdminVerificationsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/verifications').flush(ok({ verifications: [] }));
    http.expectOne('/api/v1/admin/agency-reviews').flush(
      ok({ agencies: [{ id: 'g1', brand_name: 'Agency One', status: 'active', review_status: 'unreviewed', review_note: null, reviewed_at: null, owner_tenant_id: 't2', owner_tenant_name: 'AgOwner', active_clients: 0, created_at: '2026-11-21T00:00:00.000Z' }], notes: [] }),
    );
    f.detectChanges();
    const prompt = spyOn(window, 'prompt');
    prompt.and.returnValues('looks fine', '');
    (el(f).querySelector('[data-testid="approve-agency"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/v1/admin/agencies/g1/review');
    expect(req.request.body).toEqual({ review_status: 'approved', note: '', reason: 'looks fine' });
    req.flush(ok({}));
    http.expectOne('/api/v1/admin/verifications').flush(ok({ verifications: [] }));
    http.expectOne('/api/v1/admin/agency-reviews').flush(ok({ agencies: [], notes: [] }));
  });

  it('billing reconciliation: shows the MOCK_PROVIDER badge, discrepancy counts and the orphan order', () => {
    const f = TestBed.createComponent(AdminBillingReconComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/billing/reconciliation?days=30').flush(
      ok({
        days: 30,
        mock_provider: true,
        orders: [{ status: 'paid', currency: 'INR', count: 2, total: '2360.00' }],
        payments: [],
        invoices: [],
        discrepancies: {
          captured_payments_without_invoice: { count: 0, items: [] },
          invoice_total_differs_from_payment: { count: 0, items: [] },
          paid_orders_without_payment: { count: 1, items: [{ id: 'o1', tenant_id: 't1', tenant_name: 'Glow', external_order_id: 'order_x', amount: '1180.00', currency: 'INR' }] },
        },
        notes: ['Computed live from stored rows.'],
      }),
    );
    http.expectOne('/api/v1/admin/billing/orders?days=30').flush(ok({ mock_provider: true, orders: [] }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="mock-badge"]')!.textContent).toContain('MOCK_PROVIDER');
    expect(el(f).querySelector('[data-testid="recon-totals"]')!.textContent).toContain('2360.00');
    expect(el(f).querySelector('[data-testid="orphan-orders"]')!.textContent).toContain('order_x');
    expect(el(f).textContent).toContain('Computed live from stored rows.');

    f.componentInstance.setDays(7);
    http.expectOne('/api/v1/admin/billing/reconciliation?days=7').flush(ok({ days: 7, mock_provider: false, orders: [], payments: [], invoices: [], discrepancies: { captured_payments_without_invoice: { count: 0, items: [] }, invoice_total_differs_from_payment: { count: 0, items: [] }, paid_orders_without_payment: { count: 0, items: [] } }, notes: [] }));
    http.expectOne('/api/v1/admin/billing/orders?days=7').flush(ok({ mock_provider: false, orders: [] }));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="mock-badge"]')).toBeNull();
    expect(el(f).textContent).toContain('No billing activity');
  });

  it('privacy requests: counts, mark completed with reason, and the manual-fulfilment note', () => {
    const f = TestBed.createComponent(AdminPrivacyComponent);
    f.detectChanges();
    const payload = {
      days: 30,
      counts: { pending: 1, in_progress: 0, completed: 0, rejected: 0 },
      requests: [{ id: 'r1', tenant_id: 't1', tenant_name: 'Glow', type: 'export', status: 'pending', requested_at: '2026-11-21T00:00:00.000Z', completed_at: null }],
      audit_activity: [{ action: 'tenant.data_request.created', count: 1 }],
      notes: ['Fulfilled by hand.'],
    };
    http.expectOne('/api/v1/admin/privacy/requests?days=30').flush(ok(payload));
    f.detectChanges();
    expect(el(f).querySelector('[data-testid="privacy-table"]')!.textContent).toContain('export');
    expect(el(f).textContent).toContain('Fulfilled by hand.');
    spyOn(window, 'prompt').and.returnValue('export emailed' as never);
    (el(f).querySelector('[data-testid="complete"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/v1/admin/privacy/requests/r1/status');
    expect(req.request.body).toEqual({ status: 'completed', reason: 'export emailed' });
    req.flush(ok({}));
    http.expectOne('/api/v1/admin/privacy/requests?days=30').flush(ok({ ...payload, requests: [] }));
  });

  it('a failed load shows the API error instead of an empty page', () => {
    const f = TestBed.createComponent(AdminPrivacyComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/privacy/requests?days=30').flush({ error: { code: 'PLATFORM_ADMIN_REQUIRED', message: 'Admin only.' } }, { status: 403, statusText: 'Forbidden' });
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')).not.toBeNull();
  });
});
