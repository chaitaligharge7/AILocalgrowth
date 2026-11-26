import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgencyConsoleService } from '../../../core/agency/agency-console.service';
import {
  AgencyAnalyticsComponent,
  AgencyBillingComponent,
  AgencyBrandingComponent,
  AgencyNotificationsComponent,
  AgencyRolesComponent,
} from './agency-console.components';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });
const text = (f: { nativeElement: unknown }): string => (f.nativeElement as HTMLElement).textContent ?? '';

describe('Agency console pages', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('billing shows own plan, client counts, invoices and labels mock add-on purchases', () => {
    const f = TestBed.createComponent(AgencyBillingComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/billing').flush(
      ok({
        agency_tenant_id: 't-ag',
        subscription: { status: 'trialing', plan_code: 'growth', plan_name: 'Growth', current_period_end: '2026-12-01T00:00:00.000Z', cancel_at: null },
        usage_meters: [{ meter_code: 'ai_generations_per_month', limit_qty: 100, used_qty: 40, reserved_qty: 0 }],
        invoices: [{ id: 'i1', invoice_number: 'INV-202611-1', currency: 'INR', total: '1180.00', status: 'paid', issued_at: '2026-11-01T00:00:00.000Z' }],
        addon_purchases: [{ id: 'p1', addon_name: 'AI credits 250', quantity: 250, amount: '499.00', currency: 'INR', status: 'paid', mock_provider: true, created_at: '2026-11-02T00:00:00.000Z' }],
        clients: { active: 3, with_live_subscription: 2, without_live_subscription: 1, pooled_billing_opt_in: 1, pooled_billing_wired: false },
        notes: ['Pooled billing is recorded as an opt-in but is not wired to usage yet (ADR 0047).'],
      }),
    );
    f.detectChanges();
    const t = text(f);
    expect(t).toContain('Growth');
    expect(t).toContain('INV-202611-1');
    expect(t).toContain('40 / 100');
    expect(t).toContain('MOCK_PROVIDER');
    expect(t).toContain('not wired to usage');
    const links = Array.from((f.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/app/t-ag/billing/addons');
  });

  it('billing shows the server error for a non-agency caller', () => {
    const f = TestBed.createComponent(AgencyBillingComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/billing').flush({ error: { code: 'NOT_FOUND', message: 'No active agency account found.' }, request_id: 'r' }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(text(f)).toContain('No active agency account found.');
  });

  it('branding loads, validates server-side and publishes the saved branding for the shell', () => {
    const f = TestBed.createComponent(AgencyBrandingComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/branding').flush(
      ok({ brand_name: 'Glow Agency', tagline: '', primary_color: null, accent_color: null, support_email: '', website_url: '', custom_domain: null, notes: ['A custom domain is not supported.'] }),
    );
    f.detectChanges();
    expect(f.componentInstance.form.controls.brand_name.value).toBe('Glow Agency');
    expect(f.componentInstance.form.controls.primary_color.value).toBe('#078d7e');
    expect(text(f)).toContain('A custom domain is not supported.');

    f.componentInstance.form.patchValue({ website_url: 'http://insecure.example' });
    f.componentInstance.save();
    http.expectOne('/api/v1/agency/branding').flush(
      { error: { code: 'VALIDATION_ERROR', message: 'Branding failed validation.', fields: { website_url: 'website_url must be an https:// URL (max 200 chars).' } }, request_id: 'r' },
      { status: 422, statusText: 'Unprocessable' },
    );
    f.detectChanges();
    expect(text(f)).toContain('website_url: website_url must be an https://');
    expect(f.componentInstance.saved()).toBeFalse();

    f.componentInstance.form.patchValue({ website_url: 'https://glow.example', tagline: 'We grow local', primary_color: '#0b1f38' });
    f.componentInstance.save();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/agency/branding');
    expect(put.request.body).toEqual(jasmine.objectContaining({ brand_name: 'Glow Agency', tagline: 'We grow local', primary_color: '#0b1f38' }));
    put.flush(ok({ brand_name: 'Glow Agency', tagline: 'We grow local', primary_color: '#0b1f38', accent_color: '#d6a354', support_email: '', website_url: 'https://glow.example', custom_domain: null, notes: [] }));
    f.detectChanges();
    expect(f.componentInstance.saved()).toBeTrue();
    expect(TestBed.inject(AgencyConsoleService).currentBranding()?.primary_color).toBe('#0b1f38');
  });

  it('roles lists the permissions the server returned and assignments only for delegable roles', () => {
    const f = TestBed.createComponent(AgencyRolesComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/roles').flush(
      ok({
        roles: [
          { code: 'owner', name: 'Owner', scope: 'agency_management', permissions: ['billing.manage'], active_assignments: 0 },
          { code: 'editor', name: 'Editor', scope: 'delegable_to_client', permissions: ['content.write'], active_assignments: 2 },
        ],
        notes: ['Roles are fixed system roles; custom roles are not supported.'],
      }),
    );
    f.detectChanges();
    const rows = Array.from((f.nativeElement as HTMLElement).querySelectorAll('[data-testid="roles-table"] tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('billing.manage');
    expect(rows[0].textContent).toContain('—');
    expect(rows[1].textContent).toContain('content.write');
    expect(rows[1].textContent).toContain('2');
    expect(text(f)).toContain('custom roles are not supported');
  });

  it('notifications show an all-clear state and list items with the right links', () => {
    const empty = TestBed.createComponent(AgencyNotificationsComponent);
    empty.detectChanges();
    http.expectOne('/api/v1/agency/notifications').flush(ok({ notifications: [], notes: [] }));
    empty.detectChanges();
    expect(text(empty)).toContain('All clear');

    const f = TestBed.createComponent(AgencyNotificationsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/notifications').flush(
      ok({
        notifications: [
          { kind: 'no_subscription', severity: 'warning', client_tenant_id: 'c1', client_name: 'Acme Cafe', link_id: 'l1', message: 'Acme Cafe has no active subscription.', at: '2026-11-20T00:00:00.000Z' },
          { kind: 'invite_pending', severity: 'info', client_tenant_id: 'c2', client_name: 'Beta Salon', link_id: 'l2', message: 'Waiting for Beta Salon to accept your invite.', at: '2026-11-19T00:00:00.000Z' },
        ],
        notes: ['Computed live from your client links. These are not delivered messages.'],
      }),
    );
    f.detectChanges();
    expect(text(f)).toContain('Acme Cafe has no active subscription.');
    const hrefs = Array.from((f.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/agency/clients/l1/overview');
    expect(hrefs).toContain('/agency/clients');
    expect(text(f)).toContain('not delivered messages');
  });

  it('analytics totals, empty state, window change and CSV with formula-injection protection', () => {
    const none = TestBed.createComponent(AgencyAnalyticsComponent);
    none.detectChanges();
    http.expectOne('/api/v1/agency/analytics?days=30').flush(ok({ days: 30, client_count: 0, totals: { leads_new: 0, content_created: 0, posts_succeeded: 0, posts_failed: 0, reviews_new: 0, open_tickets: 0, avg_rating: null }, clients: [], notes: [] }));
    none.detectChanges();
    expect(text(none)).toContain('No active clients');

    const f = TestBed.createComponent(AgencyAnalyticsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/analytics?days=30').flush(
      ok({
        days: 30,
        client_count: 2,
        totals: { leads_new: 7, content_created: 3, posts_succeeded: 4, posts_failed: 1, reviews_new: 2, open_tickets: 1, avg_rating: 4.5 },
        clients: [
          { link_id: 'l1', client_tenant_id: 'c1', client_name: 'Acme, Cafe', leads_new: 5, content_created: 2, posts_succeeded: 3, posts_failed: 0, reviews_new: 1, avg_rating: 4.5, open_tickets: 1 },
          { link_id: 'l2', client_tenant_id: 'c2', client_name: '=HYPERLINK("x")', leads_new: 2, content_created: 1, posts_succeeded: 1, posts_failed: 1, reviews_new: 1, avg_rating: null, open_tickets: 0 },
        ],
        notes: ['Reach and engagement are not available from providers and are not shown.'],
      }),
    );
    f.detectChanges();
    expect(text(f)).toContain('Avg rating 4.5');
    expect(text(f)).toContain('Reach and engagement are not available');
    const csv = f.componentInstance.csv().split('\n');
    expect(csv[0]).toBe('Client,New leads,Content created,Posts published,Posts failed,New reviews,Avg rating,Open tickets');
    expect(csv[1]).toBe('"Acme, Cafe",5,2,3,0,1,4.5,1');
    expect(csv[2].startsWith(`"'=HYPERLINK(""x"")"`)).toBeTrue();
    expect(csv[2].endsWith(',2,1,1,1,1,,0')).toBeTrue();

    f.componentInstance.setDays(7);
    http.expectOne('/api/v1/agency/analytics?days=7').flush(ok({ days: 7, client_count: 0, totals: { leads_new: 0, content_created: 0, posts_succeeded: 0, posts_failed: 0, reviews_new: 0, open_tickets: 0, avg_rating: null }, clients: [], notes: [] }));
  });
});
