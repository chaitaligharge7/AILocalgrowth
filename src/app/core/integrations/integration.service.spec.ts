import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IntegrationService } from './integration.service';
import { LocationLink, OauthCallbackResponse, OauthStartResponse, ProviderConnection } from './integration.models';

const sampleConnection: ProviderConnection = {
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
};

describe('IntegrationService', () => {
  let service: IntegrationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(IntegrationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts the oauth flow for a tenant', () => {
    let result: OauthStartResponse | undefined;
    service.oauthStart('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/google/oauth/start');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    const response: OauthStartResponse = {
      state: 'signed-state',
      authorize_url: 'http://localhost:8080/api/v1/integrations/google/oauth/callback?state=signed-state&code=mock-auth-code',
      expires_at: '2026-01-01T00:10:00.000Z',
      mock_provider: true,
    };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('drives the mock oauth callback via the authorize_url path+query, same-origin', () => {
    let result: OauthCallbackResponse | undefined;
    service
      .completeOauthCallback('http://localhost:8080/api/v1/integrations/google/oauth/callback?state=signed-state&code=mock-auth-code')
      .subscribe((r) => (result = r));

    // Must NOT request the absolute http://localhost:8080 origin — only the
    // relative path+query, so it stays same-origin through the dev proxy /
    // production reverse proxy instead of hitting a different-origin host.
    const req = httpMock.expectOne('/api/v1/integrations/google/oauth/callback?state=signed-state&code=mock-auth-code');
    expect(req.request.method).toBe('GET');
    const response: OauthCallbackResponse = { ...sampleConnection, linked_location_id: 'loc1' };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('falls back to the raw string if authorize_url is not a parseable absolute URL', () => {
    service.completeOauthCallback('/api/v1/integrations/google/oauth/callback?state=x').subscribe();
    const req = httpMock.expectOne('/api/v1/integrations/google/oauth/callback?state=x');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { ...sampleConnection, linked_location_id: null }, meta: { request_id: 'r1' } });
  });

  it('refuses to drive a real external authorize_url (e.g. a real Google consent page) instead of mis-requesting it', () => {
    let error: unknown;
    service.completeOauthCallback('https://accounts.google.com/o/oauth2/v2/auth?client_id=real').subscribe({
      error: (e) => (error = e),
    });

    httpMock.expectNone(() => true);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('unsupported');
  });

  it('starts the oauth flow for Meta via the dedicated /integrations/meta/oauth/start route', () => {
    let result: OauthStartResponse | undefined;
    service.oauthStart('t1', 'meta').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/meta/oauth/start');
    expect(req.request.method).toBe('POST');
    const response: OauthStartResponse = {
      provider: 'meta',
      state: 'signed-state-meta',
      authorize_url: 'http://localhost:8080/api/v1/integrations/meta/oauth/callback?state=signed-state-meta&code=mock-auth-code',
      expires_at: '2026-01-01T00:10:00.000Z',
      mock_provider: true,
    };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('drives the mock Meta oauth callback via the authorize_url path+query, same-origin', () => {
    let result: OauthCallbackResponse | undefined;
    service
      .completeOauthCallback('http://localhost:8080/api/v1/integrations/meta/oauth/callback?state=signed-state-meta&code=mock-auth-code')
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/integrations/meta/oauth/callback?state=signed-state-meta&code=mock-auth-code');
    expect(req.request.method).toBe('GET');
    const response: OauthCallbackResponse = { ...sampleConnection, provider: 'meta', linked_location_id: 'loc1' };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('creates a location link for a connection', () => {
    let result: LocationLink | undefined;
    service.createLocationLink('t1', 'conn-meta', { location_id: 'loc1', external_location_id: 'mock-fbpage-abc' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn-meta/location-links');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ location_id: 'loc1', external_location_id: 'mock-fbpage-abc' });
    const response: LocationLink = {
      id: 'link1',
      tenant_id: 't1',
      location_id: 'loc1',
      connection_id: 'conn-meta',
      external_location_id: 'mock-fbpage-abc',
      status: 'active',
      created: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    req.flush({ data: response, meta: { request_id: 'r1' } });

    expect(result).toEqual(response);
  });

  it('surfaces a 422 VALIDATION_ERROR for an ineligible external_location_id unchanged', () => {
    let error: unknown;
    service.createLocationLink('t1', 'conn-meta', { location_id: 'loc1', external_location_id: 'bogus' }).subscribe({
      error: (e) => (error = e),
    });

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn-meta/location-links');
    req.flush(
      { error: { code: 'VALIDATION_ERROR', message: 'external_location_id is not an eligible target reported by this connection.' }, request_id: 'r1' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect((error as { status: number }).status).toBe(422);
  });

  it('lists connections for a tenant', () => {
    let result: ProviderConnection[] | undefined;
    service.list('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { connections: [sampleConnection] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([sampleConnection]);
  });

  it('disconnects a connection', () => {
    let result: ProviderConnection | undefined;
    service.disconnect('t1', 'conn1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/conn1/disconnect');
    expect(req.request.method).toBe('POST');
    const disconnected = { ...sampleConnection, status: 'disconnected' as const };
    req.flush({ data: disconnected, meta: { request_id: 'r1' } });

    expect(result).toEqual(disconnected);
  });

  it('surfaces a 409 INTEGRATION_NOT_CONNECTED-style error unchanged', () => {
    let error: unknown;
    service.disconnect('t1', 'missing').subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/integrations/missing/disconnect');
    req.flush(
      { error: { code: 'NOT_FOUND', message: 'Integration connection not found.' }, request_id: 'r1' },
      { status: 404, statusText: 'Not Found' },
    );

    expect((error as { status: number }).status).toBe(404);
  });
});
