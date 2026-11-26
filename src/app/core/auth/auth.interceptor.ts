import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

/**
 * Attaches `Authorization: Bearer <access_token>` to every request that
 * isn't one of the unauthenticated `/auth/*` endpoints, and on a `401`
 * attempts exactly one silent refresh (`POST /auth/refresh`) before
 * retrying the original request. If there is no refresh token, or the
 * refresh itself fails, the local session is cleared and the user is sent
 * to `/auth/login` — matching blueprint §3.3 "policy guards checked again
 * on server" (a 401 here always means the server, not just the client,
 * considers the session invalid).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  const tokens = inject(TokenStorageService);
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthEndpoint =
    req.url.startsWith(`${base}/auth/login`) ||
    req.url.startsWith(`${base}/auth/register`) ||
    req.url.startsWith(`${base}/auth/refresh`) ||
    req.url.startsWith(`${base}/auth/otp/`) ||
    req.url.startsWith(`${base}/auth/password/reset`);

  const accessToken = tokens.readAccessToken();
  const authedReq =
    !isAuthEndpoint && accessToken
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(authedReq).pipe(
    catchError((error: unknown): Observable<never> | ReturnType<typeof next> => {
      const isUnauthorized = error instanceof HttpErrorResponse && error.status === 401;
      const canRetryWithRefresh = isUnauthorized && !isAuthEndpoint && tokens.readRefreshToken() !== null;

      if (!canRetryWithRefresh) {
        if (isUnauthorized && !isAuthEndpoint) {
          auth.clearSession();
          void router.navigate(['/auth/login']);
        }
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap(() => {
          const refreshedToken = tokens.readAccessToken();
          const retryReq = refreshedToken
            ? req.clone({ setHeaders: { Authorization: `Bearer ${refreshedToken}` } })
            : req;
          return next(retryReq);
        }),
        catchError((refreshError: unknown) => {
          auth.clearSession();
          void router.navigate(['/auth/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
