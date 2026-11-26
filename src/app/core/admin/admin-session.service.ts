import { Injectable, signal } from '@angular/core';

const ADMIN_SESSION_TOKEN_KEY = 'slg.admin.session_token';
const ADMIN_SESSION_EXPIRES_AT_KEY = 'slg.admin.session_expires_at';

/**
 * Holds the short-lived (10-minute TTL) MFA-elevated `admin_session_token`
 * that `POST /admin/auth/mfa/verify` issues (blueprint §07 "Admin MFA
 * mandatory"). Deliberately a SEPARATE service from `TokenStorageService`
 * — see `docs/ADR/0032-admin-session-storage.md` — because this token:
 *
 * - is sent as a custom `X-Admin-Session` header, never `Authorization:
 *   Bearer`, so it must never be picked up by `authInterceptor`;
 * - has its own much shorter TTL, independent of (and often shorter than)
 *   the normal access token's lifetime, so "the admin session expired"
 *   and "the normal access token expired" must be distinguishable;
 * - is irrelevant to, and must not leak into, the `/app/*` tenant shell.
 *
 * Storage mechanism mirrors `TokenStorageService` (localStorage, so a page
 * reload inside one admin working session does not immediately bounce the
 * user back to `/admin/mfa`) but under entirely separate keys.
 */
@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly hasSessionSignal = signal<boolean>(this.readToken() !== null);

  /** True while a (possibly expired) admin session token is present. Callers must still check `isValid()`. */
  readonly hasSession = this.hasSessionSignal.asReadonly();

  save(token: string, expiresAtIso: string): void {
    try {
      localStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_SESSION_EXPIRES_AT_KEY, expiresAtIso);
    } catch {
      // localStorage unavailable — session simply won't persist across reloads.
    }
    this.hasSessionSignal.set(true);
  }

  clear(): void {
    try {
      localStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
      localStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_KEY);
    } catch {
      /* see save() */
    }
    this.hasSessionSignal.set(false);
  }

  readToken(): string | null {
    return this.safeRead(ADMIN_SESSION_TOKEN_KEY);
  }

  readExpiresAt(): string | null {
    return this.safeRead(ADMIN_SESSION_EXPIRES_AT_KEY);
  }

  isExpired(): boolean {
    const raw = this.readExpiresAt();
    if (raw === null) {
      return true;
    }
    const parsed = Date.parse(raw);
    return !Number.isFinite(parsed) || Date.now() >= parsed;
  }

  /** True only when a token is present AND not past its `expires_at`. */
  isValid(): boolean {
    return this.readToken() !== null && !this.isExpired();
  }

  private safeRead(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
