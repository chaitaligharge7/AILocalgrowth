import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { adminAuthGuard } from './admin-auth.guard';
import { AuthService } from '../core/auth/auth.service';
import { AdminSessionService } from '../core/admin/admin-session.service';

describe('adminAuthGuard', () => {
  let auth: AuthService;
  let session: AdminSessionService;
  let router: Router;

  const run = (url = '/admin/tenants') =>
    TestBed.runInInjectionContext(() => adminAuthGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    session = TestBed.inject(AdminSessionService);
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  it('redirects to /admin/login when there is no valid access token', () => {
    spyOn(auth, 'hasValidAccessToken').and.returnValue(false);
    const result = run() as UrlTree;
    expect(router.serializeUrl(result)).toContain('/admin/login');
  });

  it('redirects to /admin/mfa (not /auth/login) when the access token is valid but the admin session is missing', () => {
    spyOn(auth, 'hasValidAccessToken').and.returnValue(true);
    expect(session.isValid()).toBe(false);
    const result = run() as UrlTree;
    expect(router.serializeUrl(result)).toContain('/admin/mfa');
    expect(router.serializeUrl(result)).not.toContain('/auth/login');
  });

  it('redirects to /admin/mfa when the admin session token exists but has expired', () => {
    spyOn(auth, 'hasValidAccessToken').and.returnValue(true);
    session.save('adm_tok', new Date(Date.now() - 1000).toISOString());
    const result = run() as UrlTree;
    expect(router.serializeUrl(result)).toContain('/admin/mfa');
  });

  it('allows navigation when both the access token and the admin session are valid', () => {
    spyOn(auth, 'hasValidAccessToken').and.returnValue(true);
    session.save('adm_tok', new Date(Date.now() + 60_000).toISOString());
    const result = run();
    expect(result).toBe(true);
  });
});
