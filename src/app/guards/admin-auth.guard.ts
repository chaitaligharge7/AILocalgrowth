import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { AdminSessionService } from '../core/admin/admin-session.service';

/**
 * Guards the `/admin/*` dashboard sub-tree (blueprint §3.3 "/admin/* is a
 * SEPARATE shell from /app/*"). Two independent checks, mirroring the
 * server-side layers `App\Security\AdminAuthGuard` enforces (minus the
 * `PLATFORM_ADMIN_REQUIRED` check, which this client cannot make without
 * calling the server — see `docs/ADR/0032-admin-session-storage.md`):
 *
 * 1. No valid normal access token at all → `/admin/login` (not `/auth/login`
 *    — a user mid-way through the admin flow should land back on the admin
 *    login screen, not the tenant one).
 * 2. A valid access token but no live (unexpired) admin session → `/admin/mfa`.
 *
 * This is UX convenience only: every `/admin/*` HTTP call independently
 * re-validates both conditions (plus `PLATFORM_ADMIN_REQUIRED`) server-side
 * regardless of whether this guard ran.
 */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const session = inject(AdminSessionService);
  const router = inject(Router);

  if (!auth.hasValidAccessToken()) {
    return router.createUrlTree(['/admin/login'], { queryParams: { redirectTo: state.url } });
  }

  if (!session.isValid()) {
    return router.createUrlTree(['/admin/mfa'], { queryParams: { redirectTo: state.url } });
  }

  return true;
};
