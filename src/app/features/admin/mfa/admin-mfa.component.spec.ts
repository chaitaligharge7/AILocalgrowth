import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminMfaComponent } from './admin-mfa.component';
import { AdminAuthService } from '../../../core/admin/admin-auth.service';

function httpError(status: number, code: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { error: { code, message } } });
}

describe('AdminMfaComponent', () => {
  function setup(redirectTo: string | null = null) {
    const adminAuthStub = { verifyMfa: jasmine.createSpy('verifyMfa') };
    const navigateByUrl = jasmine.createSpy('navigateByUrl');

    TestBed.configureTestingModule({
      imports: [AdminMfaComponent],
      providers: [
        { provide: AdminAuthService, useValue: adminAuthStub },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(redirectTo ? { redirectTo } : {}) } } },
      ],
    });
    const fixture = TestBed.createComponent(AdminMfaComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, adminAuthStub, navigateByUrl };
  }

  it('navigates to /admin/dashboard on a successful verify with no redirectTo', () => {
    const { component, adminAuthStub, navigateByUrl } = setup();
    adminAuthStub.verifyMfa.and.returnValue(of({ admin_session_token: 'x', expires_at: '2026-11-20T10:10:00.000Z' }));
    component.form.setValue({ code: '123456' });
    component.submit();
    expect(adminAuthStub.verifyMfa).toHaveBeenCalledWith('123456');
    expect(navigateByUrl).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('honors a redirectTo query param that points back into /admin/*', () => {
    const { component, adminAuthStub, navigateByUrl } = setup('/admin/tenants');
    adminAuthStub.verifyMfa.and.returnValue(of({ admin_session_token: 'x', expires_at: '2026-11-20T10:10:00.000Z' }));
    component.form.setValue({ code: '123456' });
    component.submit();
    expect(navigateByUrl).toHaveBeenCalledWith('/admin/tenants');
  });

  it('shows a distinct message for 401 MFA_INVALID_CODE', () => {
    const { component, adminAuthStub } = setup();
    adminAuthStub.verifyMfa.and.returnValue(throwError(() => httpError(401, 'MFA_INVALID_CODE', 'The MFA code is invalid or expired.')));
    component.form.setValue({ code: '000000' });
    component.submit();
    expect(component.errorCode()).toBe('MFA_INVALID_CODE');
  });

  it('shows a distinct message for 403 PLATFORM_ADMIN_REQUIRED', () => {
    const { component, adminAuthStub } = setup();
    adminAuthStub.verifyMfa.and.returnValue(
      throwError(() => httpError(403, 'PLATFORM_ADMIN_REQUIRED', 'This action requires a platform admin account.')),
    );
    component.form.setValue({ code: '123456' });
    component.submit();
    expect(component.errorCode()).toBe('PLATFORM_ADMIN_REQUIRED');
  });

  it('shows a distinct message for 409 MFA_NOT_ENROLLED', () => {
    const { component, adminAuthStub } = setup();
    adminAuthStub.verifyMfa.and.returnValue(
      throwError(() => httpError(409, 'MFA_NOT_ENROLLED', 'MFA is not enrolled for this admin account.')),
    );
    component.form.setValue({ code: '123456' });
    component.submit();
    expect(component.errorCode()).toBe('MFA_NOT_ENROLLED');
  });

  it('rejects a code that is not exactly 6 digits before ever calling the backend', () => {
    const { component, adminAuthStub } = setup();
    component.form.setValue({ code: '123' });
    expect(component.form.invalid).toBe(true);
    component.submit();
    expect(adminAuthStub.verifyMfa).not.toHaveBeenCalled();
  });
});
