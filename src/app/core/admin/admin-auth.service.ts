import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { AdminMfaVerifyResponse } from './admin.models';
import { AdminSessionService } from './admin-session.service';

/**
 * Wraps `POST /admin/auth/mfa/verify` (`App\Http\Handlers\AdminAuthHandler`
 * → `App\Application\PlatformAdmin\AdminAuthService::verifyMfaAndIssueSession`).
 *
 * This one `/admin/*`-path endpoint is authenticated server-side by the
 * NORMAL `AuthGuard`, not `AdminAuthGuard` — its whole job is to issue the
 * elevated session, so it cannot itself require one. `authInterceptor`
 * attaches the normal bearer token automatically; `adminSessionInterceptor`
 * deliberately skips this exact path, so no `X-Admin-Session` header is
 * sent on this call.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly session = inject(AdminSessionService);

  verifyMfa(code: string): Observable<AdminMfaVerifyResponse> {
    return this.http.post<ApiSuccess<AdminMfaVerifyResponse>>(`${this.base}/admin/auth/mfa/verify`, { code }).pipe(
      map((res) => res.data),
      tap((result) => this.session.save(result.admin_session_token, result.expires_at)),
    );
  }

  /** Clears the local admin session only — there is no server-side admin-session logout endpoint. */
  endAdminSession(): void {
    this.session.clear();
  }
}
