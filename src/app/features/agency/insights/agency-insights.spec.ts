import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AgencyActivityComponent, AgencyClientOverviewComponent, AgencyTeamComponent } from './agency-insights.components';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('Agency insights components', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ linkId: 'l1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('team shows workload counts', () => {
    const f = TestBed.createComponent(AgencyTeamComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/team').flush(
      ok({ members: [{ user_id: 'u1', name: 'Ravi', email: 'r@x.test', role_code: 'editor', status: 'active', active_assignments: 3, client_count: 2 }] }),
    );
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('[data-testid="team-table"]')?.textContent).toContain('Ravi');
  });

  it('shows an honest error when the caller has no agency', () => {
    const f = TestBed.createComponent(AgencyActivityComponent);
    f.detectChanges();
    http
      .expectOne('/api/v1/agency/activity')
      .flush({ error: { code: 'NOT_FOUND', message: 'No active agency account found for your owner/admin memberships.' } }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('client overview renders the checklist from real flags', () => {
    const f = TestBed.createComponent(AgencyClientOverviewComponent);
    f.detectChanges();
    http.expectOne('/api/v1/agency/clients/l1/overview').flush(
      ok({
        link_id: 'l1',
        client_tenant_id: 't1',
        client_display_name: 'Client Co',
        locations: [{ id: 'loc1', name: 'Main', category: null }],
        google_status: 'not_connected',
        providers: [],
        brand_kit_set: false,
        counts: { content_items: 0, leads: 0, reviews: 0, open_tickets: 0 },
        subscription_status: 'trialing',
        active_staff_assignments: 0,
        checklist: [
          { key: 'location', label: 'Business location added', done: true },
          { key: 'google', label: 'Google Business Profile connected', done: false },
        ],
        checklist_done: 1,
        checklist_total: 2,
      }),
    );
    f.detectChanges();
    const items = (f.nativeElement as HTMLElement).querySelectorAll('[data-testid="checklist"] li');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-done')).toBe('true');
    expect(items[1].getAttribute('data-done')).toBe('false');
  });
});
