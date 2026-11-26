import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AddLeadActivityRequest,
  CreateLeadCustomFieldRequest,
  CreateLeadRequest,
  Lead,
  LeadCustomFieldDef,
  LeadDateRange,
  LeadDetail,
  LeadListFilters,
  LeadListResponse,
  LeadSourcesSummary,
  LeadStatusSummary,
  UpdateLeadRequest,
} from './lead.models';

/**
 * Wraps `POST/GET /tenants/{t}/leads`, `GET/PATCH /tenants/{t}/leads/{id}`,
 * `POST /tenants/{t}/leads/{id}/activities`
 * (`App\Http\Handlers\LeadHandler` → `App\Application\Leads\LeadService`).
 * Every call is bearer-authenticated by `authInterceptor`; server-side
 * membership/`lead.manage` checks are the actual authorization boundary.
 */
@Injectable({ providedIn: 'root' })
export class LeadService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  create(tenantId: string, payload: CreateLeadRequest): Observable<Lead> {
    return this.http
      .post<ApiSuccess<Lead>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads`, payload)
      .pipe(map((res) => res.data));
  }

  list(tenantId: string, filters: LeadListFilters = {}): Observable<Lead[]> {
    let params = new HttpParams();
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.owner_id) {
      params = params.set('owner_id', filters.owner_id);
    }
    if (filters.tag) {
      params = params.set('tag', filters.tag);
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }
    return this.http
      .get<ApiSuccess<LeadListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads`, { params })
      .pipe(map((res) => res.data.leads));
  }

  get(tenantId: string, leadId: string): Observable<LeadDetail> {
    return this.http
      .get<ApiSuccess<LeadDetail>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}`)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, leadId: string, payload: UpdateLeadRequest): Observable<LeadDetail> {
    return this.http
      .patch<ApiSuccess<LeadDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  /** `GET /tenants/{t}/leads/sources-summary` (BW-098). */
  sourcesSummary(tenantId: string, range: LeadDateRange = {}): Observable<LeadSourcesSummary> {
    return this.http
      .get<ApiSuccess<LeadSourcesSummary>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/sources-summary`, {
        params: LeadService.rangeParams(range),
      })
      .pipe(map((res) => res.data));
  }

  /** `GET /tenants/{t}/leads/status-summary` (BW-100). */
  statusSummary(tenantId: string, range: LeadDateRange = {}): Observable<LeadStatusSummary> {
    return this.http
      .get<ApiSuccess<LeadStatusSummary>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/status-summary`, {
        params: LeadService.rangeParams(range),
      })
      .pipe(map((res) => res.data));
  }

  /** `POST /tenants/{t}/leads/{id}/tags` (BW-099). */
  addTag(tenantId: string, leadId: string, tag: string): Observable<LeadDetail> {
    return this.http
      .post<ApiSuccess<LeadDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/tags`,
        { tag },
      )
      .pipe(map((res) => res.data));
  }

  /** `DELETE /tenants/{t}/leads/{id}/tags/{tag}` (BW-099). */
  removeTag(tenantId: string, leadId: string, tag: string): Observable<LeadDetail> {
    return this.http
      .delete<ApiSuccess<LeadDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/tags/${encodeURIComponent(tag)}`,
      )
      .pipe(map((res) => res.data));
  }

  addActivity(tenantId: string, leadId: string, payload: AddLeadActivityRequest): Observable<LeadDetail> {
    return this.http
      .post<ApiSuccess<LeadDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/activities`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  exportCsv(tenantId: string, filters: LeadListFilters = {}): Observable<{ blob: Blob; filename: string }> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.owner_id) params = params.set('owner_id', filters.owner_id);
    if (filters.tag) params = params.set('tag', filters.tag);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    return this.http
      .get(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/export`, {
        params,
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((res) => {
          const disp = res.headers.get('Content-Disposition') ?? '';
          const match = /filename="?([^";]+)"?/.exec(disp);
          const filename = match?.[1] ?? `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
          return { blob: res.body ?? new Blob([''], { type: 'text/csv' }), filename };
        }),
      );
  }

  bulkImport(
    tenantId: string,
    csv: string,
  ): Observable<{ created_count: number; deduped_count: number; error_count: number; errors: { row: number; message: string }[] }> {
    return this.http
      .post<
        ApiSuccess<{ created_count: number; deduped_count: number; error_count: number; errors: { row: number; message: string }[] }>
      >(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/bulk-import`, { csv })
      .pipe(map((res) => res.data));
  }

  bulkAction(
    tenantId: string,
    payload: { lead_ids: string[]; status?: string; owner_id?: string | null },
  ): Observable<{ succeeded: string[]; failed: { id: string; code: string; message: string }[] }> {
    return this.http
      .post<
        ApiSuccess<{ succeeded: string[]; failed: { id: string; code: string; message: string }[] }>
      >(`${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/bulk-action`, payload)
      .pipe(map((res) => res.data));
  }

  /** `GET /tenants/{t}/lead-fields` (BW-099 custom fields). */
  listFields(tenantId: string): Observable<LeadCustomFieldDef[]> {
    return this.http
      .get<ApiSuccess<{ fields: LeadCustomFieldDef[] }>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/lead-fields`)
      .pipe(map((res) => res.data.fields));
  }

  /** `POST /tenants/{t}/lead-fields` — needs `lead.manage`. */
  createField(tenantId: string, payload: CreateLeadCustomFieldRequest): Observable<LeadCustomFieldDef> {
    return this.http
      .post<ApiSuccess<LeadCustomFieldDef>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/lead-fields`, payload)
      .pipe(map((res) => res.data));
  }

  /** `DELETE /tenants/{t}/lead-fields/{id}` — needs `lead.manage`; also removes every stored value. */
  deleteField(tenantId: string, fieldId: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<unknown>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/lead-fields/${encodeURIComponent(fieldId)}`,
      )
      .pipe(map(() => undefined));
  }

  /** `PUT /tenants/{t}/leads/{id}/fields` — `field_key => value`; an empty string clears a value. */
  setFieldValues(tenantId: string, leadId: string, fields: Record<string, string>): Observable<LeadDetail> {
    return this.http
      .put<ApiSuccess<LeadDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/fields`,
        { fields },
      )
      .pipe(map((res) => res.data));
  }

  private static rangeParams(range: LeadDateRange): HttpParams {
    let params = new HttpParams();
    if (range.from) {
      params = params.set('from', range.from);
    }
    if (range.to) {
      params = params.set('to', range.to);
    }
    return params;
  }
}
