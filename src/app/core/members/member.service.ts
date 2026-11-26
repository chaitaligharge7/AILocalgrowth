import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { RoleCode } from '../tenancy/tenant.models';
import {
  ChangeRoleResult,
  InviteListResponse,
  MemberListResponse,
  RemoveMemberResult,
  RoleMatrix,
  SetMemberLocationsResult,
  TenantInvite,
  TenantMember,
} from './member.models';

/**
 * Wraps the team endpoints of `App\Http\Handlers\MemberHandler`:
 * `GET /tenants/{t}/members`, `GET /tenants/{t}/roles`,
 * `PATCH|DELETE /tenants/{t}/members/{userId}`, `GET /tenants/{t}/invites`,
 * `DELETE /tenants/{t}/invites/{inviteId}`. All authorization is enforced
 * server-side (`member.manage`, owner-only rules); the UI only hides what
 * the caller cannot do.
 */
@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, path: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/${path}`;
  }

  list(tenantId: string): Observable<TenantMember[]> {
    return this.http.get<ApiSuccess<MemberListResponse>>(this.url(tenantId, 'members')).pipe(map((res) => res.data.members));
  }

  roleMatrix(tenantId: string): Observable<RoleMatrix> {
    return this.http.get<ApiSuccess<RoleMatrix>>(this.url(tenantId, 'roles')).pipe(map((res) => res.data));
  }

  changeRole(tenantId: string, userId: string, roleCode: RoleCode): Observable<ChangeRoleResult> {
    return this.http
      .patch<ApiSuccess<ChangeRoleResult>>(this.url(tenantId, `members/${encodeURIComponent(userId)}`), { role_code: roleCode })
      .pipe(map((res) => res.data));
  }

  remove(tenantId: string, userId: string): Observable<RemoveMemberResult> {
    return this.http
      .delete<ApiSuccess<RemoveMemberResult>>(this.url(tenantId, `members/${encodeURIComponent(userId)}`))
      .pipe(map((res) => res.data));
  }

  setLocations(tenantId: string, userId: string, locationIds: string[]): Observable<SetMemberLocationsResult> {
    return this.http
      .put<ApiSuccess<SetMemberLocationsResult>>(this.url(tenantId, `members/${encodeURIComponent(userId)}/locations`), {
        location_ids: locationIds,
      })
      .pipe(map((res) => res.data));
  }

  listInvites(tenantId: string): Observable<TenantInvite[]> {
    return this.http.get<ApiSuccess<InviteListResponse>>(this.url(tenantId, 'invites')).pipe(map((res) => res.data.invites));
  }

  resendInvite(tenantId: string, inviteId: string): Observable<{ id: string; email: string; role: string; status: string; expires_at: string }> {
    return this.http
      .post<ApiSuccess<{ id: string; email: string; role: string; status: string; expires_at: string }>>(
        this.url(tenantId, `invites/${encodeURIComponent(inviteId)}/resend`),
        {},
      )
      .pipe(map((res) => res.data));
  }

  revokeInvite(tenantId: string, inviteId: string): Observable<{ id: string; status: 'revoked' }> {
    return this.http
      .delete<ApiSuccess<{ id: string; status: 'revoked' }>>(this.url(tenantId, `invites/${encodeURIComponent(inviteId)}`))
      .pipe(map((res) => res.data));
  }
}
