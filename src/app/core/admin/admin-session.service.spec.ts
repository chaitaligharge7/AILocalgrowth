import { TestBed } from '@angular/core/testing';
import { AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  let service: AdminSessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdminSessionService);
  });

  afterEach(() => localStorage.clear());

  it('has no session by default', () => {
    expect(service.hasSession()).toBe(false);
    expect(service.isValid()).toBe(false);
  });

  it('is valid right after saving a future expiry', () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    service.save('tok123', future);
    expect(service.hasSession()).toBe(true);
    expect(service.readToken()).toBe('tok123');
    expect(service.isExpired()).toBe(false);
    expect(service.isValid()).toBe(true);
  });

  it('is invalid once past its expires_at (the 10-minute TTL)', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    service.save('tok123', past);
    expect(service.isExpired()).toBe(true);
    expect(service.isValid()).toBe(false);
  });

  it('clear() removes the token and flips hasSession to false', () => {
    service.save('tok123', new Date(Date.now() + 60_000).toISOString());
    service.clear();
    expect(service.hasSession()).toBe(false);
    expect(service.readToken()).toBeNull();
    expect(service.isValid()).toBe(false);
  });

  it('never stores the admin session under the normal auth token keys', () => {
    service.save('tok123', new Date(Date.now() + 60_000).toISOString());
    expect(localStorage.getItem('slg.auth.access_token')).toBeNull();
    expect(localStorage.getItem('slg.admin.session_token')).toBe('tok123');
  });
});
