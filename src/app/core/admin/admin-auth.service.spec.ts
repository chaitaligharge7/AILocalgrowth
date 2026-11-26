import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionService } from './admin-session.service';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let session: AdminSessionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminAuthService);
    session = TestBed.inject(AdminSessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('verifies the MFA code and persists the admin session token separately', () => {
    service.verifyMfa('123456').subscribe();
    const req = httpMock.expectOne('/api/v1/admin/auth/mfa/verify');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({
      data: { admin_session_token: 'adm_tok', expires_at: '2026-11-20T10:10:00.000Z' },
      meta: { request_id: 'r1' },
    });
    expect(session.readToken()).toBe('adm_tok');
    expect(session.readExpiresAt()).toBe('2026-11-20T10:10:00.000Z');
  });

  it('surfaces 401 MFA_INVALID_CODE unchanged, without touching the session', () => {
    let error: unknown;
    service.verifyMfa('000000').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/admin/auth/mfa/verify');
    req.flush({ error: { code: 'MFA_INVALID_CODE', message: 'The MFA code is invalid or expired.' }, request_id: 'r1' }, { status: 401, statusText: 'Unauthorized' });
    expect((error as { status: number }).status).toBe(401);
    expect(session.hasSession()).toBe(false);
  });

  it('surfaces 403 PLATFORM_ADMIN_REQUIRED unchanged (the "not an admin account" case)', () => {
    let error: unknown;
    service.verifyMfa('123456').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/admin/auth/mfa/verify');
    req.flush({ error: { code: 'PLATFORM_ADMIN_REQUIRED', message: 'This action requires a platform admin account.' }, request_id: 'r1' }, { status: 403, statusText: 'Forbidden' });
    expect((error as { status: number }).status).toBe(403);
  });

  it('surfaces 409 MFA_NOT_ENROLLED unchanged', () => {
    let error: unknown;
    service.verifyMfa('123456').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/admin/auth/mfa/verify');
    req.flush({ error: { code: 'MFA_NOT_ENROLLED', message: 'MFA is not enrolled for this admin account.' }, request_id: 'r1' }, { status: 409, statusText: 'Conflict' });
    expect((error as { status: number }).status).toBe(409);
  });

  it('endAdminSession() clears only the local admin session', () => {
    service.verifyMfa('123456').subscribe();
    httpMock.expectOne('/api/v1/admin/auth/mfa/verify').flush({
      data: { admin_session_token: 'adm_tok', expires_at: '2026-11-20T10:10:00.000Z' },
      meta: { request_id: 'r1' },
    });
    service.endAdminSession();
    expect(session.hasSession()).toBe(false);
  });
});
