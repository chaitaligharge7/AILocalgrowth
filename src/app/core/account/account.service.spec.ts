import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { AccountService } from './account.service';

describe('AccountService', () => {
  let service: AccountService;
  let httpMock: HttpTestingController;
  let auth: jasmine.SpyObj<Pick<AuthService, 'applyProfile'>>;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['applyProfile']);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }],
    });
    service = TestBed.inject(AccountService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('PATCHes /me and mirrors the new name into the cached user', () => {
    service.updateProfile({ name: 'Asha Rao', phone_e164: '+919812345678' }).subscribe();
    const req = httpMock.expectOne('/api/v1/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Asha Rao', phone_e164: '+919812345678' });
    req.flush({ data: { id: 'u1', email: 'a@example.test', name: 'Asha Rao', phone_e164: '+919812345678' }, meta: { request_id: 'r' } });
    expect(auth.applyProfile).toHaveBeenCalledWith({ name: 'Asha Rao' });
  });

  it('POSTs the current and new password to /me/password', () => {
    service.changePassword('Old12345678', 'New12345678').subscribe();
    const req = httpMock.expectOne('/api/v1/me/password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ current_password: 'Old12345678', new_password: 'New12345678' });
    req.flush({ data: { status: 'password_changed', other_sessions_revoked: 1 }, meta: { request_id: 'r' } });
  });

  it('lists, revokes and bulk-revokes sessions', () => {
    let sessions: unknown;
    service.sessions().subscribe((s) => (sessions = s));
    const list = httpMock.expectOne('/api/v1/me/sessions');
    expect(list.request.method).toBe('GET');
    list.flush({
      data: { sessions: [{ id: 's1', device: 'Chrome', signed_in_at: 'x', expires_at: 'y', current: true }] },
      meta: { request_id: 'r' },
    });
    expect(sessions).toEqual([{ id: 's1', device: 'Chrome', signed_in_at: 'x', expires_at: 'y', current: true }]);

    service.revokeSession('s 2').subscribe();
    const revoke = httpMock.expectOne('/api/v1/me/sessions/s%202');
    expect(revoke.request.method).toBe('DELETE');
    revoke.flush({ data: { id: 's 2', status: 'revoked', was_current: false }, meta: { request_id: 'r' } });

    service.revokeOtherSessions().subscribe();
    const others = httpMock.expectOne('/api/v1/me/sessions/revoke-others');
    expect(others.request.method).toBe('POST');
    others.flush({ data: { revoked: 2 }, meta: { request_id: 'r' } });
  });
});
