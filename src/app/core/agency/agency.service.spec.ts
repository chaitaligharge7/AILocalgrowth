import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AgencyService } from './agency.service';
import { AgencyAccount, AgencyClientLink, AgencyStaffAssignment, AgencyUsage } from './agency.models';

const agency: AgencyAccount = {
  id: 'agency1',
  owner_tenant_id: 't-agency',
  brand_name: 'Acme Agency',
  status: 'active',
  settings: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const link: AgencyClientLink = {
  id: 'link1',
  agency_id: 'agency1',
  client_tenant_id: 't-client',
  status: 'pending',
  permissions: { pooled_billing: false },
  approved_by: null,
  expires_at: '2026-12-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const assignment: AgencyStaffAssignment = {
  id: 'assign1',
  agency_id: 'agency1',
  client_tenant_id: 't-client',
  agency_user_id: 'u-staff',
  role_code: 'editor',
  location_id: null,
  status: 'active',
  created_by: 'u-owner',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('AgencyService', () => {
  let service: AgencyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AgencyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('enables agency mode on a tenant', () => {
    let result: AgencyAccount | undefined;
    service.enable('t-agency', { brand_name: 'Acme Agency' }).subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t-agency/agency/enable');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ brand_name: 'Acme Agency' });
    req.flush({ data: agency, meta: { request_id: 'r1' } });
    expect(result).toEqual(agency);
  });

  it('lists agency clients', () => {
    let result: AgencyClientLink[] | undefined;
    service.listClients().subscribe((r) => (result = r.clients));
    const req = httpMock.expectOne('/api/v1/agency/clients');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { agency, clients: [link] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([link]);
  });

  it('invites a client tenant', () => {
    service.inviteClient({ client_tenant_id: 't-client' }).subscribe();
    const req = httpMock.expectOne('/api/v1/agency/clients');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ client_tenant_id: 't-client' });
    req.flush({ data: link, meta: { request_id: 'r1' } });
  });

  it('lists invites for a client tenant', () => {
    let result: AgencyClientLink[] | undefined;
    service.listInvitesForClient('t-client').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { invites: [link] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([link]);
  });

  it('accepts an invite (client owner/admin side)', () => {
    service.acceptInvite('t-client', 'link1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/accept');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ data: { ...link, status: 'active', approved_by: 'u-owner' }, meta: { request_id: 'r1' } });
  });

  it('rejects an invite', () => {
    service.rejectInvite('t-client', 'link1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/reject');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...link, status: 'rejected' }, meta: { request_id: 'r1' } });
  });

  it('revokes an invite from the client side', () => {
    service.revokeByClient('t-client', 'link1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/revoke');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...link, status: 'revoked' }, meta: { request_id: 'r1' } });
  });

  it('revokes a client link from the agency side', () => {
    service.revokeByAgency('link1').subscribe();
    const req = httpMock.expectOne('/api/v1/agency/clients/link1/revoke');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...link, status: 'revoked' }, meta: { request_id: 'r1' } });
  });

  it('assigns staff to a client link', () => {
    let result: AgencyStaffAssignment | undefined;
    service.assignStaff('link1', { user_id: 'u-staff', role_code: 'editor' }).subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/agency/clients/link1/assign');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ user_id: 'u-staff', role_code: 'editor' });
    req.flush({ data: assignment, meta: { request_id: 'r1' } });
    expect(result).toEqual(assignment);
  });

  it('lists assignments for a client link', () => {
    let result: AgencyStaffAssignment[] | undefined;
    service.listAssignments('link1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/agency/clients/link1/assignments');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { assignments: [assignment] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([assignment]);
  });

  it('revokes an assignment', () => {
    service.revokeAssignment('link1', 'assign1').subscribe();
    const req = httpMock.expectOne('/api/v1/agency/clients/link1/assignments/assign1/revoke');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...assignment, status: 'revoked' }, meta: { request_id: 'r1' } });
  });

  it('reads pooled usage and never hides pooled_billing_wired:false', () => {
    let result: AgencyUsage | undefined;
    service.usage().subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/agency/usage');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        agency_id: 'agency1',
        pooled_billing_wired: false,
        totals: [],
        clients: [],
      },
      meta: { request_id: 'r1' },
    });
    expect(result?.pooled_billing_wired).toBe(false);
  });

  it('reads the consolidated calendar with required start/end params', () => {
    service.calendar('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z').subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/agency/calendar' && r.params.get('start') === '2026-11-01T00:00:00Z' && r.params.get('end') === '2026-12-01T00:00:00Z',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { schedules: [] }, meta: { request_id: 'r1' } });
  });
});
