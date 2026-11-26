import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AdminAddon,
  CreateAddonRequest,
  PlatformAgency,
  PlatformOverview,
  PlatformTenantDetail,
  PlatformTicketList,
  PlatformUser,
} from './platform.models';

/**
 * `GET /admin/overview`, `/admin/tenants/{id}`, `/admin/users`, `/admin/agencies`,
 * `/admin/support/tickets`, `GET|POST /admin/addons`, `PATCH /admin/addons/{id}`.
 * Needs the bearer token AND `X-Admin-Session` (attached by interceptors).
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  overview(): Observable<PlatformOverview> {
    return this.http.get<ApiSuccess<PlatformOverview>>(`${this.base}/admin/overview`).pipe(map((r) => r.data));
  }

  tenantDetail(tenantId: string): Observable<PlatformTenantDetail> {
    return this.http
      .get<ApiSuccess<PlatformTenantDetail>>(`${this.base}/admin/tenants/${encodeURIComponent(tenantId)}`)
      .pipe(map((r) => r.data));
  }

  users(q?: string): Observable<PlatformUser[]> {
    let params = new HttpParams();
    if (q) {
      params = params.set('q', q);
    }
    return this.http.get<ApiSuccess<{ users: PlatformUser[] }>>(`${this.base}/admin/users`, { params }).pipe(map((r) => r.data.users));
  }

  agencies(): Observable<PlatformAgency[]> {
    return this.http.get<ApiSuccess<{ agencies: PlatformAgency[] }>>(`${this.base}/admin/agencies`).pipe(map((r) => r.data.agencies));
  }

  tickets(status?: string, category?: string): Observable<PlatformTicketList> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    if (category) {
      params = params.set('category', category);
    }
    return this.http.get<ApiSuccess<PlatformTicketList>>(`${this.base}/admin/support/tickets`, { params }).pipe(map((r) => r.data));
  }

  addons(): Observable<AdminAddon[]> {
    return this.http.get<ApiSuccess<{ addons: AdminAddon[] }>>(`${this.base}/admin/addons`).pipe(map((r) => r.data.addons));
  }

  createAddon(payload: CreateAddonRequest): Observable<AdminAddon> {
    return this.http.post<ApiSuccess<AdminAddon>>(`${this.base}/admin/addons`, payload).pipe(map((r) => r.data));
  }

  setAddonStatus(id: string, status: 'active' | 'retired', reason: string): Observable<AdminAddon> {
    return this.http
      .patch<ApiSuccess<AdminAddon>>(`${this.base}/admin/addons/${encodeURIComponent(id)}`, { status, reason })
      .pipe(map((r) => r.data));
  }
}
