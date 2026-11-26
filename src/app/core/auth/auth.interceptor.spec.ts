import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { TokenStorageService } from './token-storage.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: TokenStorageService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStorageService);
    router = TestBed.inject(Router);
    tokens.clear();
  });

  afterEach(() => {
    httpMock.verify();
    tokens.clear();
  });

  it('attaches the bearer token to a non-auth request', () => {
    tokens.save({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    http.get('/api/v1/me').subscribe();

    const req = httpMock.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
    req.flush({ data: {}, meta: { request_id: 'r1' } });
  });

  it('does not attach a bearer token to /auth/login', () => {
    tokens.save({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    http.post('/api/v1/auth/login', { email: 'a@example.com', password: 'x' }).subscribe();

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush({ data: {}, meta: { request_id: 'r1' } });
  });

  it('on a 401, refreshes once and retries the original request with the new token', () => {
    tokens.save({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });

    let result: unknown;
    http.get('/api/v1/me').subscribe((r) => (result = r));

    const firstReq = httpMock.expectOne('/api/v1/me');
    firstReq.flush({ error: { code: 'UNAUTHENTICATED', message: 'expired' }, request_id: 'r1' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne('/api/v1/auth/refresh');
    expect(refreshReq.request.body).toEqual({ refresh_token: 'ref-token' });
    refreshReq.flush({
      data: {
        access_token: 'new-token',
        refresh_token: 'new-ref-token',
        token_type: 'Bearer',
        expires_in: 900,
        session_id: 's2',
        user: { id: 'u1', email: 'a@example.com', name: 'A' },
      },
      meta: { request_id: 'r2' },
    });

    const retryReq = httpMock.expectOne('/api/v1/me');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-token');
    retryReq.flush({ data: { ok: true }, meta: { request_id: 'r3' } });

    expect(result).toEqual({ data: { ok: true }, meta: { request_id: 'r3' } });
    expect(tokens.readAccessToken()).toBe('new-token');
  });

  it('clears the session and redirects to /auth/login when refresh itself fails', () => {
    tokens.save({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
    });
    const navigateSpy = spyOn(router, 'navigate');

    let erred = false;
    http.get('/api/v1/me').subscribe({ error: () => (erred = true) });

    const firstReq = httpMock.expectOne('/api/v1/me');
    firstReq.flush({ error: { code: 'UNAUTHENTICATED', message: 'expired' }, request_id: 'r1' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne('/api/v1/auth/refresh');
    refreshReq.flush(
      { error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'expired' }, request_id: 'r2' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(erred).toBe(true);
    expect(tokens.readAccessToken()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
  });
});
