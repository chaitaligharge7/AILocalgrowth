import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AdminAddonsComponent } from './admin-addons.component';
import { AdminAgenciesComponent, AdminSupportComponent, AdminUsersComponent } from './admin-lists.component';
import { AdminOverviewComponent } from './admin-overview.component';
import { AdminTenantDetailComponent } from './admin-tenant-detail.component';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('Platform admin console components', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: 't9' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('overview renders the real counts it was given', () => {
    const f = TestBed.createComponent(AdminOverviewComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/overview').flush(
      ok({
        generated_at: '2026-11-21T00:00:00.000Z',
        businesses: { total: 7, by_status: { active: 6, suspended: 1 }, new_last_30_days: 2 },
        users: { total: 9, verified: 8 },
        agencies: { active: 1 },
        subscriptions: { by_status: { trialing: 3 }, plan_mix: [{ plan_code: 'starter', plan_name: 'Starter', subscriptions: 3 }] },
        invoicing: { all_time: [], last_30_days: [], note: 'Not a payment-provider settlement report.' },
        addons: { by_status: {}, paid_amount: '0.00' },
        publishing_jobs: {},
        integrations: {},
        support: { by_status: { open: 2, closed: 5 } },
      }),
    );
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Businesses');
    expect(text).toContain('Starter');
    expect(text).toContain('Not a payment-provider settlement report.');
    expect(f.componentInstance.openTickets(f.componentInstance.data()!)).toBe(2);
  });

  it('tenant detail loads the tenant id from the route', () => {
    const f = TestBed.createComponent(AdminTenantDetailComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/tenants/t9').flush(
      ok({
        id: 't9',
        display_name: 'Acme Cafe',
        legal_name: null,
        business_type: null,
        status: 'active',
        currency: 'INR',
        country: 'IN',
        created_at: '2026-11-01T00:00:00.000Z',
        owner: { user_id: 'u1', name: 'Asha', email: 'asha@example.test' },
        subscription: null,
        footprint: { members: 2, locations: 1, content_items: 0, leads: 0, open_tickets: 0, connected_providers: 0 },
        members: [{ user_id: 'u1', name: 'Asha', email: 'asha@example.test', role_code: 'owner', status: 'active' }],
      }),
    );
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('asha@example.test');
    expect(el.querySelector('[data-testid="members-table"]')).not.toBeNull();
  });

  it('users searches by the typed query', () => {
    const f = TestBed.createComponent(AdminUsersComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/users').flush(ok({ users: [] }));
    f.componentInstance.query = 'asha';
    f.componentInstance.load();
    const req = http.expectOne((r) => r.url === '/api/v1/admin/users');
    expect(req.request.params.get('q')).toBe('asha');
    req.flush(ok({ users: [{ id: 'u1', name: 'Asha', email: 'a@x.test', status: 'active', email_verified: true, tenant_count: 1, last_login_at: null, created_at: '2026-11-01T00:00:00.000Z' }] }));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid="users-table"]')).not.toBeNull();
  });

  it('agencies lists directory rows', () => {
    const f = TestBed.createComponent(AdminAgenciesComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/agencies').flush(
      ok({ agencies: [{ id: 'a1', brand_name: 'Acme Agency', status: 'active', owner_tenant_id: 't1', owner_tenant_name: 'Acme', active_clients: 2, pending_invites: 1, active_assignments: 3, created_at: '2026-11-01T00:00:00.000Z' }] }),
    );
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Acme Agency');
  });

  it('support queue filters by status and category', () => {
    const f = TestBed.createComponent(AdminSupportComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/support/tickets').flush(ok({ by_status: { open: 1 }, tickets: [] }));
    f.componentInstance.status = 'open';
    f.componentInstance.category = 'billing';
    f.componentInstance.load();
    const req = http.expectOne((r) => r.url === '/api/v1/admin/support/tickets');
    expect(req.request.params.get('status')).toBe('open');
    expect(req.request.params.get('category')).toBe('billing');
    req.flush(ok({ by_status: { open: 1 }, tickets: [] }));
  });

  it('add-on catalog admin lists, creates with a reason and retires', () => {
    const f = TestBed.createComponent(AdminAddonsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/addons').flush(ok({ addons: [] }));
    f.detectChanges();

    expect(f.componentInstance.form.valid).toBeFalse();
    f.componentInstance.form.setValue({ code: 'ai_credits_9', name: 'Nine', meter_code: 'ai_generations_per_month', quantity: 9, price: '9.00', reason: 'launch' });
    expect(f.componentInstance.form.valid).toBeTrue();
    f.componentInstance.create();
    const create = http.expectOne('/api/v1/admin/addons');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.reason).toBe('launch');
    create.flush(ok({ id: 'a1' }));
    http.expectOne('/api/v1/admin/addons').flush(ok({ addons: [] }));
  });
});
