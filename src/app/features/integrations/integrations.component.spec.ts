import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { IntegrationsComponent } from './integrations.component';

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

describe('IntegrationsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IntegrationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  it('drives oauth-start then the same-origin callback replay, and shows the MOCK_PROVIDER badge + linked location', () => {
    const fixture = TestBed.createComponent(IntegrationsComponent);
    const listReq = httpMock.expectOne('/api/v1/tenants/t1/integrations');
    listReq.flush({ data: { connections: [] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    fixture.componentInstance.connect('google');
    const startReq = httpMock.expectOne('/api/v1/tenants/t1/integrations/google/oauth/start');
    expect(startReq.request.method).toBe('POST');
    startReq.flush({
      data: {
        state: 'signed-state',
        authorize_url: 'http://localhost:8080/api/v1/integrations/google/oauth/callback?state=signed-state&code=mock-auth-code',
        expires_at: '2026-01-01T00:10:00.000Z',
        mock_provider: true,
      },
      meta: { request_id: 'r1' },
    });

    const callbackReq = httpMock.expectOne('/api/v1/integrations/google/oauth/callback?state=signed-state&code=mock-auth-code');
    expect(callbackReq.request.method).toBe('GET');
    callbackReq.flush({
      data: {
        id: 'conn1',
        tenant_id: 't1',
        provider: 'google',
        external_account_id: 'mock-acct-abc',
        scopes: ['business.manage'],
        mock_provider: true,
        status: 'connected',
        expires_at: '2026-06-01T00:00:00.000Z',
        last_checked_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        linked_location_id: 'loc1',
      },
      meta: { request_id: 'r1' },
    });

    const refreshReq = httpMock.expectOne('/api/v1/tenants/t1/integrations');
    refreshReq.flush({
      data: {
        connections: [
          {
            id: 'conn1',
            tenant_id: 't1',
            provider: 'google',
            external_account_id: 'mock-acct-abc',
            scopes: ['business.manage'],
            mock_provider: true,
            status: 'connected',
            expires_at: '2026-06-01T00:00:00.000Z',
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.lastConnectedLocationId()).toBe('loc1');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('MOCK_PROVIDER');
    expect(text).toContain('loc1');
  });

  it('drives the Meta oauth-start/callback dance via the dedicated meta routes and shows the auto-linked location', () => {
    const fixture = TestBed.createComponent(IntegrationsComponent);
    httpMock.expectOne('/api/v1/tenants/t1/integrations').flush({ data: { connections: [] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    fixture.componentInstance.connect('meta');
    const startReq = httpMock.expectOne('/api/v1/tenants/t1/integrations/meta/oauth/start');
    expect(startReq.request.method).toBe('POST');
    startReq.flush({
      data: {
        provider: 'meta',
        state: 'signed-state-meta',
        authorize_url: 'http://localhost:8080/api/v1/integrations/meta/oauth/callback?state=signed-state-meta&code=mock-auth-code',
        expires_at: '2026-01-01T00:10:00.000Z',
        mock_provider: true,
      },
      meta: { request_id: 'r1' },
    });

    const callbackReq = httpMock.expectOne('/api/v1/integrations/meta/oauth/callback?state=signed-state-meta&code=mock-auth-code');
    expect(callbackReq.request.method).toBe('GET');
    callbackReq.flush({
      data: {
        id: 'conn-meta',
        tenant_id: 't1',
        provider: 'meta',
        external_account_id: 'mock-meta-acct-1',
        scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
        mock_provider: true,
        status: 'connected',
        expires_at: '2026-06-01T00:00:00.000Z',
        last_checked_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        linked_location_id: 'loc1',
      },
      meta: { request_id: 'r1' },
    });

    const refreshReq = httpMock.expectOne('/api/v1/tenants/t1/integrations');
    refreshReq.flush({
      data: {
        connections: [
          {
            id: 'conn-meta',
            tenant_id: 't1',
            provider: 'meta',
            external_account_id: 'mock-meta-acct-1',
            scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
            mock_provider: true,
            status: 'connected',
            expires_at: '2026-06-01T00:00:00.000Z',
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.lastConnectedLocationId()).toBe('loc1');
    expect(fixture.componentInstance.lastConnectedProvider()).toBe('meta');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Connect Meta');
  });

  it('submits a location link for a connection and shows the created/reassigned result', () => {
    const fixture = TestBed.createComponent(IntegrationsComponent);
    httpMock.expectOne('/api/v1/tenants/t1/integrations').flush({
      data: {
        connections: [
          {
            id: 'conn-meta',
            tenant_id: 't1',
            provider: 'meta',
            external_account_id: 'mock-meta-acct-1',
            scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
            mock_provider: true,
            status: 'connected',
            expires_at: '2026-06-01T00:00:00.000Z',
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.locationLinkForm.controls.connectionId.value).toBe('conn-meta');
    component.locationLinkForm.patchValue({ locationId: 'loc1', externalLocationId: 'mock-fbpage-secondary' });
    component.submitLocationLink();

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn-meta/location-links');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ location_id: 'loc1', external_location_id: 'mock-fbpage-secondary' });
    req.flush({
      data: {
        id: 'link1',
        tenant_id: 't1',
        location_id: 'loc1',
        connection_id: 'conn-meta',
        external_location_id: 'mock-fbpage-secondary',
        status: 'active',
        created: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.lastLocationLink()?.external_location_id).toBe('mock-fbpage-secondary');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('reassigned');
  });

  it('shows the location-link validation error unchanged when external_location_id is ineligible', () => {
    const fixture = TestBed.createComponent(IntegrationsComponent);
    httpMock.expectOne('/api/v1/tenants/t1/integrations').flush({
      data: {
        connections: [
          {
            id: 'conn-meta',
            tenant_id: 't1',
            provider: 'meta',
            external_account_id: 'mock-meta-acct-1',
            scopes: [],
            mock_provider: true,
            status: 'connected',
            expires_at: null,
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.locationLinkForm.patchValue({ locationId: 'loc1', externalLocationId: 'bogus' });
    component.submitLocationLink();

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn-meta/location-links');
    req.flush(
      { error: { code: 'VALIDATION_ERROR', message: 'external_location_id is not an eligible target reported by this connection.' }, request_id: 'r1' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(component.locationLinkError()).toBe('external_location_id is not an eligible target reported by this connection.');
  });

  it('loads multi-location picker targets and renders broken-connection reauth banner', () => {
    const fixture = TestBed.createComponent(IntegrationsComponent);
    httpMock.expectOne('/api/v1/tenants/t1/integrations').flush({
      data: {
        connections: [
          {
            id: 'conn-g1',
            tenant_id: 't1',
            provider: 'google',
            external_account_id: 'mock-acct-1',
            scopes: ['business.manage'],
            mock_provider: true,
            status: 'reauth_required',
            expires_at: '2026-01-01T00:00:00.000Z',
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Connection attention required');
    expect(text).toContain('reauth_required');

    const component = fixture.componentInstance;
    component.loadPickerOptions();

    const locReq = httpMock.expectOne('/api/v1/tenants/t1/locations');
    locReq.flush({
      data: { locations: [{ id: 'loc1', name: 'Main Branch', city: 'Chennai', status: 'active' }] },
      meta: { request_id: 'r2' },
    });
    const extReq = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn-g1/external-locations');
    extReq.flush({
      data: {
        connection_id: 'conn-g1',
        provider: 'google',
        mock_provider: true,
        external_locations: [
          { external_location_id: 'mock-loc-1', display_name: 'Primary Location (mock)', linked_location_id: 'loc1', linked_location_name: 'Main Branch' },
          { external_location_id: 'mock-loc-2', display_name: 'Branch Location (mock)', linked_location_id: null, linked_location_name: null },
        ],
        existing_links: [{ id: 'lnk1', location_id: 'loc1', location_name: 'Main Branch', external_location_id: 'mock-loc-1', status: 'active' }],
      },
      meta: { request_id: 'r3' },
    });
    fixture.detectChanges();

    expect(component.tenantLocations().length).toBe(1);
    expect(component.externalLocations().length).toBe(2);
    expect(component.locationLinkForm.controls.locationId.value).toBe('loc1');
    expect(component.locationLinkForm.controls.externalLocationId.value).toBe('mock-loc-1');
  });
});
