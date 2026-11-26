import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { ApiSuccess } from '../http/api-envelope.model';
import { TokenPairResponse } from './auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    tokenStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    tokenStorage.clear();
  });

  it('registers a user and returns the pending-verification payload', () => {
    let result: unknown;
    service
      .register({ email: 'a@example.com', password: 'Sm0keTest123', name: 'A', terms_accepted: true })
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/auth/register');
    expect(req.request.method).toBe('POST');
    req.flush({
      data: { id: 'u1', email: 'a@example.com', name: 'A', status: 'pending_verification', email_verified_at: null },
      meta: { request_id: 'r1' },
    });

    expect(result).toEqual({
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      status: 'pending_verification',
      email_verified_at: null,
    });
  });

  it('logs in, persists the token pair and exposes the current user', () => {
    service.login({ email: 'a@example.com', password: 'Sm0keTest123' }).subscribe();

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    const tokenPair: TokenPairResponse = {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      token_type: 'Bearer',
      expires_in: 900,
      session_id: 'sess-1',
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    };
    const body: ApiSuccess<TokenPairResponse> = { data: tokenPair, meta: { request_id: 'r1' } };
    req.flush(body);

    expect(tokenStorage.readAccessToken()).toBe('acc-1');
    expect(tokenStorage.readRefreshToken()).toBe('ref-1');
    expect(service.currentUser()).toEqual({ id: 'u1', email: 'a@example.com', name: 'A' });
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clears the session on logout', () => {
    tokenStorage.save({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      expiresAt: Date.now() + 100000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    service.logout().subscribe();

    const req = httpMock.expectOne('/api/v1/auth/logout');
    expect(req.request.headers.get('Authorization')).toBeNull(); // interceptor not installed in this unit test
    req.flush({ data: { status: 'logged_out' }, meta: { request_id: 'r1' } });

    expect(tokenStorage.readAccessToken()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('rotates tokens on refresh', () => {
    tokenStorage.save({
      accessToken: 'acc-old',
      refreshToken: 'ref-old',
      expiresAt: Date.now() - 1, // expired
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    service.refresh().subscribe();

    const req = httpMock.expectOne('/api/v1/auth/refresh');
    expect(req.request.body).toEqual({ refresh_token: 'ref-old' });
    req.flush({
      data: {
        access_token: 'acc-new',
        refresh_token: 'ref-new',
        token_type: 'Bearer',
        expires_in: 900,
        session_id: 'sess-2',
        user: { id: 'u1', email: 'a@example.com', name: 'A' },
      },
      meta: { request_id: 'r1' },
    });

    expect(tokenStorage.readAccessToken()).toBe('acc-new');
    expect(tokenStorage.readRefreshToken()).toBe('ref-new');
  });

  it('applyProfile updates the in-memory and cached user name without touching the tokens', () => {
    tokenStorage.save({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'a@example.com', name: 'Old Name' },
    });
    const fresh = TestBed.runInInjectionContext(() => new AuthService());
    fresh.applyProfile({ name: 'New Name' });

    expect(fresh.currentUser()?.name).toBe('New Name');
    expect(tokenStorage.readUser()).toEqual({ id: 'u1', email: 'a@example.com', name: 'New Name' });
    expect(tokenStorage.readAccessToken()).toBe('acc-1');
    expect(tokenStorage.readRefreshToken()).toBe('ref-1');
  });

  it('reports hasValidAccessToken false once the access token has expired', () => {
    tokenStorage.save({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    expect(service.hasValidAccessToken()).toBe(false);
    expect(service.hasRefreshToken()).toBe(true);
  });
});
