import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AgencyClientLink } from '../../core/agency/agency.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { AgencyInvitesComponent } from './agency-invites.component';

const ownerTenant: Tenant = {
  id: 't-client',
  display_name: 'Client Co',
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

const editorTenant: Tenant = { ...ownerTenant, caller_role: 'editor' };

const pendingInvite: AgencyClientLink = {
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

describe('AgencyInvitesComponent', () => {
  let httpMock: HttpTestingController;

  async function setUp(tenant: Tenant) {
    await TestBed.configureTestingModule({
      imports: [AgencyInvitesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(tenant);

    const fixture = TestBed.createComponent(AgencyInvitesComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('lists invites for the client tenant and renders a pending one', async () => {
    const fixture = await setUp(ownerTenant);
    const req = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { invites: [pendingInvite] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(fixture.componentInstance.invites()).toEqual([pendingInvite]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('agency1');
    expect(text).toContain('pending');
  });

  it('accepts a pending invite, which the backend returns as active', async () => {
    const fixture = await setUp(ownerTenant);
    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [pendingInvite] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    fixture.componentInstance.accept(pendingInvite);
    const acceptReq = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/accept');
    expect(acceptReq.request.method).toBe('POST');
    acceptReq.flush({
      data: { ...pendingInvite, status: 'active', approved_by: 'u-owner' },
      meta: { request_id: 'r1' },
    });

    // accept() triggers a refresh() afterwards.
    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [{ ...pendingInvite, status: 'active', approved_by: 'u-owner' }] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.notice()).toContain('accepted');
    expect(fixture.componentInstance.invites()[0].status).toBe('active');
  });

  it('rejects a pending invite', async () => {
    const fixture = await setUp(ownerTenant);
    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [pendingInvite] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    fixture.componentInstance.reject(pendingInvite);
    const rejectReq = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/reject');
    expect(rejectReq.request.method).toBe('POST');
    rejectReq.flush({ data: { ...pendingInvite, status: 'rejected' }, meta: { request_id: 'r1' } });

    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [{ ...pendingInvite, status: 'rejected' }] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.notice()).toContain('rejected');
    expect(fixture.componentInstance.invites()[0].status).toBe('rejected');
  });

  it('surfaces a 409 INVITE_NOT_PENDING from a double-accept attempt without crashing', async () => {
    const fixture = await setUp(ownerTenant);
    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [pendingInvite] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    fixture.componentInstance.accept(pendingInvite);
    const acceptReq = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/accept');
    acceptReq.flush(
      { error: { code: 'INVITE_NOT_PENDING', message: 'This invite is not pending (already rejected).' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.errorMessage()).toContain('not pending');
  });

  it('does not call the API and shows an owner/admin-only note for a non-owner/admin caller', async () => {
    const fixture = await setUp(editorTenant);
    httpMock.expectNone('/api/v1/tenants/t-client/agency-invites');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Only this business');
  });

  it('saves granular module permission preferences via PATCH', async () => {
    const fixture = await setUp(ownerTenant);
    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [pendingInvite] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    fixture.componentInstance.openPermissions(pendingInvite);
    fixture.componentInstance.permLeads.set(true);
    fixture.componentInstance.permBilling.set(false);
    fixture.componentInstance.savePermissions();

    const patchReq = httpMock.expectOne('/api/v1/tenants/t-client/agency-invites/link1/permissions');
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({
      content: true,
      reviews: true,
      analytics: true,
      leads: true,
      billing: false,
    });
    const updatedInvite: AgencyClientLink = {
      ...pendingInvite,
      permissions: { pooled_billing: false, content: true, reviews: true, analytics: true, leads: true, billing: false },
    };
    patchReq.flush({ data: updatedInvite, meta: { request_id: 'r2' } });

    httpMock.expectOne('/api/v1/tenants/t-client/agency-invites').flush({
      data: { invites: [updatedInvite] },
      meta: { request_id: 'r3' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.editingPermInvite()).toBeNull();
    expect(fixture.componentInstance.invites()[0].permissions?.leads).toBe(true);
    expect(fixture.componentInstance.invites()[0].permissions?.billing).toBe(false);
    expect(fixture.componentInstance.notice()).toContain('saved');
  });
});
