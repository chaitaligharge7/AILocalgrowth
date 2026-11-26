import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { adminSessionInterceptor } from './admin-session.interceptor';
import { AdminSessionService } from './admin-session.service';

describe('adminSessionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: AdminSessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([adminSessionInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AdminSessionService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches X-Admin-Session on an /admin/* request when a session exists', () => {
    session.save('adm_tok', new Date(Date.now() + 60_000).toISOString());
    http.get('/api/v1/admin/tenants').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/tenants');
    expect(req.request.headers.get('X-Admin-Session')).toBe('adm_tok');
    req.flush({ data: { tenants: [] }, meta: { request_id: 'r1' } });
  });

  it('does not attach the header on the mfa/verify call itself', () => {
    session.save('adm_tok', new Date(Date.now() + 60_000).toISOString());
    http.post('/api/v1/admin/auth/mfa/verify', { code: '123456' }).subscribe();
    const req = httpMock.expectOne('/api/v1/admin/auth/mfa/verify');
    expect(req.request.headers.has('X-Admin-Session')).toBe(false);
    req.flush({ data: { admin_session_token: 'x', expires_at: '2026-01-01T00:00:00.000Z' }, meta: { request_id: 'r1' } });
  });

  it('does not attach the header on a non-admin request', () => {
    session.save('adm_tok', new Date(Date.now() + 60_000).toISOString());
    http.get('/api/v1/tenants').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants');
    expect(req.request.headers.has('X-Admin-Session')).toBe(false);
    req.flush({ data: { tenants: [] }, meta: { request_id: 'r1' } });
  });

  it('omits the header entirely when no admin session is stored', () => {
    http.get('/api/v1/admin/tenants').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/tenants');
    expect(req.request.headers.has('X-Admin-Session')).toBe(false);
    req.flush({ data: { tenants: [] }, meta: { request_id: 'r1' } });
  });
});
