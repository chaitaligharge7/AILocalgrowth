import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../http/api-base-url.token';
import { AdminSessionService } from './admin-session.service';

/**
 * Attaches `X-Admin-Session: <admin_session_token>` to every request under
 * `/admin/*` EXCEPT `POST /admin/auth/mfa/verify` itself (whose entire job
 * is to issue that token, so it cannot require one). This is additive to
 * `authInterceptor`, which still attaches the normal `Authorization:
 * Bearer` header to the same requests — `App\Security\AdminAuthGuard`
 * requires both independently.
 *
 * Deliberately a separate interceptor from `authInterceptor` rather than
 * extending it: the normal interceptor's job (attach/refresh a bearer
 * token, redirect to `/auth/login` on a 401) is completely orthogonal to
 * "is this an /admin/* call", and keeping them apart means a bug in one
 * can never silently change the other's behavior for the `/app/*` shell.
 */
export const adminSessionInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  const session = inject(AdminSessionService);

  const adminPrefix = `${base}/admin/`;
  const isAdminPath = req.url.startsWith(adminPrefix);
  const isMfaVerify = req.url === `${base}/admin/auth/mfa/verify`;

  const token = session.readToken();
  const authedReq = isAdminPath && !isMfaVerify && token ? req.clone({ setHeaders: { 'X-Admin-Session': token } }) : req;

  return next(authedReq);
};
