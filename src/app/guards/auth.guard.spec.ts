import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../core/auth/auth.service';

describe('authGuard', () => {
  let authServiceStub: Partial<AuthService>;
  let router: Router;

  function runGuard() {
    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = { url: '/app/t1/dashboard' } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));
  }

  beforeEach(() => {
    authServiceStub = {
      hasValidAccessToken: jasmine.createSpy('hasValidAccessToken'),
      hasRefreshToken: jasmine.createSpy('hasRefreshToken'),
      refresh: jasmine.createSpy('refresh'),
      clearSession: jasmine.createSpy('clearSession'),
    };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'createUrlTree').and.callThrough();
  });

  it('allows navigation when the access token is valid', () => {
    (authServiceStub.hasValidAccessToken as jasmine.Spy).and.returnValue(true);

    const result = runGuard();

    expect(result).toBe(true);
  });

  it('redirects to login when there is no access or refresh token', () => {
    (authServiceStub.hasValidAccessToken as jasmine.Spy).and.returnValue(false);
    (authServiceStub.hasRefreshToken as jasmine.Spy).and.returnValue(false);

    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
  });

  it('attempts a silent refresh when the access token expired but a refresh token exists, then allows', (done) => {
    (authServiceStub.hasValidAccessToken as jasmine.Spy).and.returnValue(false);
    (authServiceStub.hasRefreshToken as jasmine.Spy).and.returnValue(true);
    (authServiceStub.refresh as jasmine.Spy).and.returnValue(
      of({
        access_token: 'a',
        refresh_token: 'b',
        token_type: 'Bearer' as const,
        expires_in: 900,
        session_id: 's',
        user: { id: 'u1', email: 'a@example.com', name: 'A' },
      }),
    );

    const result = runGuard();
    expect(result).not.toBe(true);
    (result as Observable<boolean | UrlTree>).subscribe((value) => {
      expect(value).toBe(true);
      expect(authServiceStub.refresh).toHaveBeenCalled();
      done();
    });
  });

  it('clears the session and redirects to login when the silent refresh fails', (done) => {
    (authServiceStub.hasValidAccessToken as jasmine.Spy).and.returnValue(false);
    (authServiceStub.hasRefreshToken as jasmine.Spy).and.returnValue(true);
    (authServiceStub.refresh as jasmine.Spy).and.returnValue(throwError(() => new Error('refresh failed')));

    const result = runGuard();
    (result as Observable<boolean | UrlTree>).subscribe((value) => {
      expect(value).toBeInstanceOf(UrlTree);
      expect(authServiceStub.clearSession).toHaveBeenCalled();
      done();
    });
  });
});
