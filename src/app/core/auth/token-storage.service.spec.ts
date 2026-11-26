import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);
    service.clear();
  });

  afterEach(() => service.clear());

  it('starts with no tokens and isAuthenticated=false', () => {
    expect(service.readAccessToken()).toBeNull();
    expect(service.readRefreshToken()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('saves and reads back a token pair', () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'A' };
    service.save({ accessToken: 'acc', refreshToken: 'ref', expiresAt: Date.now() + 60_000, user });

    expect(service.readAccessToken()).toBe('acc');
    expect(service.readRefreshToken()).toBe('ref');
    expect(service.readUser()).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAccessTokenExpired()).toBe(false);
  });

  it('reports the access token expired once past expiresAt', () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'A' };
    service.save({ accessToken: 'acc', refreshToken: 'ref', expiresAt: Date.now() - 1, user });

    expect(service.isAccessTokenExpired()).toBe(true);
  });

  it('updateAccessToken rotates only the access token, keeping the refresh token', () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'A' };
    service.save({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt: Date.now() + 60_000, user });

    service.updateAccessToken('acc-2', Date.now() + 120_000);

    expect(service.readAccessToken()).toBe('acc-2');
    expect(service.readRefreshToken()).toBe('ref-1');
  });

  it('clear() removes everything', () => {
    const user = { id: 'u1', email: 'a@example.com', name: 'A' };
    service.save({ accessToken: 'acc', refreshToken: 'ref', expiresAt: Date.now() + 60_000, user });

    service.clear();

    expect(service.readAccessToken()).toBeNull();
    expect(service.readRefreshToken()).toBeNull();
    expect(service.readUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
