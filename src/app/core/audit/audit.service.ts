import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { LocationSyncResponse } from '../integrations/integration.models';
import { AuditHistoryResponse, CreateAuditRequest, ProfileAudit } from './audit.models';

/**
 * Wraps `POST /tenants/{t}/locations/{id}/sync`
 * (`App\Http\Handlers\GoogleSyncHandler` → `App\Application\Google\LocationSyncService`)
 * and `POST/GET /tenants/{t}/locations/{id}/audits`, `GET /tenants/{t}/audits/{id}`
 * (`App\Http\Handlers\AuditHandler` → `App\Application\Google\AuditService`).
 *
 * `sync()` lives here rather than in `IntegrationService` because every
 * caller of it in this app is the Audit screen's "Sync from Google" step
 * (blueprint §3.1 "Audit detail" spec implies fresh evidence before
 * scoring); it is still the same `integration.manage`-gated endpoint.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  sync(tenantId: string, locationId: string): Observable<LocationSyncResponse> {
    return this.http
      .post<ApiSuccess<LocationSyncResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}/sync`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  create(tenantId: string, locationId: string, payload: CreateAuditRequest = {}): Observable<ProfileAudit> {
    return this.http
      .post<ApiSuccess<ProfileAudit>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}/audits`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  history(tenantId: string, locationId: string): Observable<ProfileAudit[]> {
    return this.http
      .get<ApiSuccess<AuditHistoryResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}/audits`,
      )
      .pipe(map((res) => res.data.audits));
  }

  get(tenantId: string, auditId: string): Observable<ProfileAudit> {
    return this.http
      .get<ApiSuccess<ProfileAudit>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/audits/${encodeURIComponent(auditId)}`)
      .pipe(map((res) => res.data));
  }
}
