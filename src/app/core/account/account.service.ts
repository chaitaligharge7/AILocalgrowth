import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

/** `PATCH /me` response — never contains a password hash. */
export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  phone_e164: string | null;
}

/** One active login session. Never carries token material or an IP. */
export interface UserSession {
  id: string;
  device: string | null;
  signed_in_at: string;
  expires_at: string;
  current: boolean;
}

/**
 * Wraps the signed-in user's account endpoints of
 * `App\Http\Handlers\AccountHandler`: `PATCH /me`, `POST /me/password`,
 * `GET /me/sessions`, `DELETE /me/sessions/{id}`,
 * `POST /me/sessions/revoke-others`.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  updateProfile(payload: { name?: string; phone_e164?: string }): Observable<AccountProfile> {
    return this.http.patch<ApiSuccess<AccountProfile>>(`${this.base}/me`, payload).pipe(
      map((res) => res.data),
      tap((profile) => this.auth.applyProfile({ name: profile.name })),
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ status: string; other_sessions_revoked: number }> {
    return this.http
      .post<ApiSuccess<{ status: string; other_sessions_revoked: number }>>(`${this.base}/me/password`, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .pipe(map((res) => res.data));
  }

  sessions(): Observable<UserSession[]> {
    return this.http.get<ApiSuccess<{ sessions: UserSession[] }>>(`${this.base}/me/sessions`).pipe(map((res) => res.data.sessions));
  }

  revokeSession(sessionId: string): Observable<{ id: string; status: string; was_current: boolean }> {
    return this.http
      .delete<ApiSuccess<{ id: string; status: string; was_current: boolean }>>(`${this.base}/me/sessions/${encodeURIComponent(sessionId)}`)
      .pipe(map((res) => res.data));
  }

  revokeOtherSessions(): Observable<{ revoked: number }> {
    return this.http.post<ApiSuccess<{ revoked: number }>>(`${this.base}/me/sessions/revoke-others`, {}).pipe(map((res) => res.data));
  }
}
