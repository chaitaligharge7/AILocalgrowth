import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';

/**
 * Function-based `CanActivate` guard for `/app/*` (blueprint §3.3 shells).
 * This is UX-only convenience — the backend re-checks the bearer token on
 * every request (`App\Security\AuthGuard`) and tenant membership on every
 * `/tenants/{id}` call (`App\Security\Policy`), so a user who bypassed
 * this guard entirely could still never read another tenant's data.
 *
 * Behavior:
 * - No access token and no refresh token at all → redirect to `/auth/login`.
 * - Access token present and not expired → allow immediately.
 * - Access token missing/expired but a refresh token exists → attempt one
 *   silent `POST /auth/refresh` before deciding (matches the task brief's
 *   "attempt silent refresh if only the access token expired").
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const loginRedirect = () => router.createUrlTree(['/auth/login'], { queryParams: { redirectTo: state.url } });

  if (auth.hasValidAccessToken()) {
    return true;
  }

  if (!auth.hasRefreshToken()) {
    return loginRedirect();
  }

  return auth.refresh().pipe(
    map(() => true),
    catchError(() => {
      auth.clearSession();
      return of(loginRedirect());
    }),
  );
};
