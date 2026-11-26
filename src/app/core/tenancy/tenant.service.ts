import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AcceptInviteResponse,
  CreateInviteRequest,
  CreateTenantRequest,
  Invite,
  Tenant,
  TenantListResponse,
  UpdateTenantRequest,
} from './tenant.models';

/**
 * Wraps the 4 tenancy/invite endpoints (blueprint §4.5, §06 W01) —
 * `GET/POST /tenants`, `GET/PATCH /tenants/{tenantId}`,
 * `POST /tenants/{tenantId}/invites`, `POST /invites/{token}/accept`.
 * Every call is bearer-authenticated by `authInterceptor`; server-side
 * membership/role checks (`App\Security\Policy`) are the actual
 * authorization boundary — this service does not duplicate them.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Observable<Tenant[]> {
    return this.http
      .get<ApiSuccess<TenantListResponse>>(`${this.base}/tenants`)
      .pipe(map((res) => res.data.tenants));
  }

  create(payload: CreateTenantRequest): Observable<Tenant> {
    return this.http.post<ApiSuccess<Tenant>>(`${this.base}/tenants`, payload).pipe(map((res) => res.data));
  }

  get(tenantId: string): Observable<Tenant> {
    return this.http
      .get<ApiSuccess<Tenant>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}`)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, payload: UpdateTenantRequest): Observable<Tenant> {
    return this.http
      .patch<ApiSuccess<Tenant>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}`, payload)
      .pipe(map((res) => res.data));
  }

  invite(tenantId: string, payload: CreateInviteRequest): Observable<Invite> {
    return this.http
      .post<ApiSuccess<Invite>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/invites`, payload)
      .pipe(map((res) => res.data));
  }

  acceptInvite(token: string): Observable<AcceptInviteResponse> {
    return this.http
      .post<ApiSuccess<AcceptInviteResponse>>(`${this.base}/invites/${encodeURIComponent(token)}/accept`, {})
      .pipe(map((res) => res.data));
  }
}
