import { Injectable, signal } from '@angular/core';
import { AuthUser } from './auth.models';

const ACCESS_TOKEN_KEY = 'slg.auth.access_token';
const REFRESH_TOKEN_KEY = 'slg.auth.refresh_token';
const EXPIRES_AT_KEY = 'slg.auth.expires_at';
const USER_KEY = 'slg.auth.user';

export interface StoredTokenPair {
  accessToken: string;
  refreshToken: string;
  /** Epoch millis. */
  expiresAt: number;
  user: AuthUser;
}

/**
 * Wraps browser storage for the auth token pair + cached user profile.
 *
 * ADR: see `docs/ADR/0007-angular-token-storage.md`. Blueprint §3.3 asks
 * for "secure SameSite cookies" rather than localStorage for web session
 * tokens, with CSRF protection on cookie-auth endpoints. The S1 backend
 * (`App\Security\AuthGuard`) only implements bearer-token auth — there is
 * no cookie-session endpoint to call yet — so storing the opaque bearer
 * tokens in `localStorage` is the pragmatic S1 choice, explicitly logged
 * as a deferred hardening item rather than silently diverging from the
 * blueprint.
 *
 * Exposes a `isAuthenticated` signal so guards/UI can react synchronously
 * without re-reading storage on every check.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly hasAccessTokenSignal = signal<boolean>(this.readAccessToken() !== null);

  /** True while a (possibly expired) access token is present. Guards still
   *  must check expiry/attempt refresh themselves. */
  readonly isAuthenticated = this.hasAccessTokenSignal.asReadonly();

  save(pair: StoredTokenPair): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, pair.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
      localStorage.setItem(EXPIRES_AT_KEY, String(pair.expiresAt));
      localStorage.setItem(USER_KEY, JSON.stringify(pair.user));
    } catch {
      // localStorage unavailable (private browsing, etc.) — session simply
      // will not persist across reloads; nothing else in this service
      // depends on the write having succeeded.
    }
    this.hasAccessTokenSignal.set(true);
  }

  /** Updates only the cached display profile (e.g. after the user renames themselves in Settings). */
  saveUser(user: AuthUser): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* see save() */
    }
  }

  updateAccessToken(accessToken: string, expiresAt: number): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
    } catch {
      /* see save() */
    }
    this.hasAccessTokenSignal.set(true);
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(EXPIRES_AT_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* see save() */
    }
    this.hasAccessTokenSignal.set(false);
  }

  readAccessToken(): string | null {
    return this.safeRead(ACCESS_TOKEN_KEY);
  }

  readRefreshToken(): string | null {
    return this.safeRead(REFRESH_TOKEN_KEY);
  }

  readExpiresAt(): number | null {
    const raw = this.safeRead(EXPIRES_AT_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  readUser(): AuthUser | null {
    const raw = this.safeRead(USER_KEY);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  isAccessTokenExpired(): boolean {
    const expiresAt = this.readExpiresAt();
    if (expiresAt === null) {
      return true;
    }
    return Date.now() >= expiresAt;
  }

  private safeRead(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
