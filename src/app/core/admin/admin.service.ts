import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AdminAuditEvent,
  AdminAuditEventFilters,
  AdminAuditEventListResponse,
  AdminJob,
  AdminJobListResponse,
  AdminJobType,
  AdminPlan,
  AdminPlanListResponse,
  AdminTenant,
  AdminTenantListResponse,
  AdminTenantStatus,
  CreatePlanRequest,
  CreatePlanResponse,
  FeatureFlag,
  FeatureFlagListResponse,
  PatchFeatureFlagRequest,
  RetryJobRequest,
  UpdateTenantStatusRequest,
} from './admin.models';

/**
 * Wraps `GET/PATCH /admin/feature-flags`, `GET /admin/tenants`,
 * `PATCH /admin/tenants/{id}/status`, `GET/POST /admin/plans`,
 * `GET /admin/jobs`, `POST /admin/jobs/{id}/retry`,
 * `GET /admin/audit-events` (`App\Http\Handlers\{FeatureFlagAdminHandler,
 * TenantAdminHandler,PlanAdminHandler,JobAdminHandler,AuditEventAdminHandler}`).
 *
 * Every call here needs BOTH the normal bearer access token (attached by
 * `authInterceptor`) AND the `X-Admin-Session` header (attached by
 * `adminSessionInterceptor`) — `App\Security\AdminAuthGuard` rejects a
 * request missing either with 401/403, regardless of this service.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  listFeatureFlags(scopeType?: string, scopeId?: string): Observable<FeatureFlag[]> {
    let params = new HttpParams();
    if (scopeType) {
      params = params.set('scope_type', scopeType);
    }
    if (scopeId) {
      params = params.set('scope_id', scopeId);
    }
    return this.http
      .get<ApiSuccess<FeatureFlagListResponse>>(`${this.base}/admin/feature-flags`, { params })
      .pipe(map((res) => res.data.feature_flags));
  }

  patchFeatureFlag(payload: PatchFeatureFlagRequest): Observable<FeatureFlag> {
    return this.http.patch<ApiSuccess<FeatureFlag>>(`${this.base}/admin/feature-flags`, payload).pipe(map((res) => res.data));
  }

  listTenants(status?: AdminTenantStatus): Observable<AdminTenant[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<ApiSuccess<AdminTenantListResponse>>(`${this.base}/admin/tenants`, { params })
      .pipe(map((res) => res.data.tenants));
  }

  updateTenantStatus(tenantId: string, payload: UpdateTenantStatusRequest): Observable<AdminTenant> {
    return this.http
      .patch<ApiSuccess<AdminTenant>>(`${this.base}/admin/tenants/${encodeURIComponent(tenantId)}/status`, payload)
      .pipe(map((res) => res.data));
  }

  listPlans(): Observable<AdminPlan[]> {
    return this.http.get<ApiSuccess<AdminPlanListResponse>>(`${this.base}/admin/plans`).pipe(map((res) => res.data.plans));
  }

  createPlan(payload: CreatePlanRequest): Observable<CreatePlanResponse> {
    return this.http.post<ApiSuccess<CreatePlanResponse>>(`${this.base}/admin/plans`, payload).pipe(map((res) => res.data));
  }

  listJobs(type?: AdminJobType, status?: string): Observable<AdminJob[]> {
    let params = new HttpParams();
    if (type) {
      params = params.set('type', type);
    }
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ApiSuccess<AdminJobListResponse>>(`${this.base}/admin/jobs`, { params }).pipe(map((res) => res.data.jobs));
  }

  retryJob(jobId: string, payload: RetryJobRequest): Observable<AdminJob> {
    return this.http
      .post<ApiSuccess<AdminJob>>(`${this.base}/admin/jobs/${encodeURIComponent(jobId)}/retry`, payload)
      .pipe(map((res) => res.data));
  }

  listAuditEvents(filters: AdminAuditEventFilters = {}): Observable<AdminAuditEvent[]> {
    let params = new HttpParams();
    if (filters.tenant_id) {
      params = params.set('tenant_id', filters.tenant_id);
    }
    if (filters.actor_id) {
      params = params.set('actor_id', filters.actor_id);
    }
    if (filters.action) {
      params = params.set('action', filters.action);
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }
    if (filters.limit !== undefined) {
      params = params.set('limit', String(filters.limit));
    }
    return this.http
      .get<ApiSuccess<AdminAuditEventListResponse>>(`${this.base}/admin/audit-events`, { params })
      .pipe(map((res) => res.data.audit_events));
  }
}
