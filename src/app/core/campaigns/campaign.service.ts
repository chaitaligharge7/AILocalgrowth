import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  Campaign,
  CampaignDetail,
  CampaignReport,
  CampaignRequest,
  ComposeRequest,
  MonitorResponse,
  PerformanceResponse,
  PublishingAuditEvent,
} from './campaign.models';

/**
 * Campaigns plus the publishing monitor / performance / audit-log views
 * (`App\Http\Handlers\CampaignHandler`). Reads: any member (performance needs
 * `analytics.view`, audit log is owner/admin only); writes need
 * `content.create` — all enforced server-side.
 */
@Injectable({ providedIn: 'root' })
export class CampaignService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private t(tenantId: string, suffix: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}${suffix}`;
  }

  private static params(values: Record<string, string | number | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return params;
  }

  list(tenantId: string, from?: string, to?: string): Observable<Campaign[]> {
    return this.http
      .get<ApiSuccess<{ campaigns: Campaign[] }>>(this.t(tenantId, '/campaigns'), { params: CampaignService.params({ from, to }) })
      .pipe(map((r) => r.data.campaigns));
  }

  create(tenantId: string, payload: CampaignRequest): Observable<CampaignDetail> {
    return this.http.post<ApiSuccess<CampaignDetail>>(this.t(tenantId, '/campaigns'), payload).pipe(map((r) => r.data));
  }

  get(tenantId: string, id: string): Observable<CampaignDetail> {
    return this.http.get<ApiSuccess<CampaignDetail>>(this.t(tenantId, `/campaigns/${encodeURIComponent(id)}`)).pipe(map((r) => r.data));
  }

  update(tenantId: string, id: string, payload: Partial<CampaignRequest>): Observable<CampaignDetail> {
    return this.http.patch<ApiSuccess<CampaignDetail>>(this.t(tenantId, `/campaigns/${encodeURIComponent(id)}`), payload).pipe(map((r) => r.data));
  }

  archive(tenantId: string, id: string): Observable<void> {
    return this.http.delete<ApiSuccess<{ archived: boolean }>>(this.t(tenantId, `/campaigns/${encodeURIComponent(id)}`)).pipe(map(() => undefined));
  }

  compose(tenantId: string, id: string, payload: ComposeRequest): Observable<CampaignDetail> {
    return this.http
      .post<ApiSuccess<CampaignDetail>>(this.t(tenantId, `/campaigns/${encodeURIComponent(id)}/compose`), payload)
      .pipe(map((r) => r.data));
  }

  report(tenantId: string, id: string): Observable<CampaignReport> {
    return this.http.get<ApiSuccess<CampaignReport>>(this.t(tenantId, `/campaigns/${encodeURIComponent(id)}/report`)).pipe(map((r) => r.data));
  }

  monitor(tenantId: string, status?: string, limit = 50): Observable<MonitorResponse> {
    return this.http
      .get<ApiSuccess<MonitorResponse>>(this.t(tenantId, '/publishing/monitor'), { params: CampaignService.params({ status, limit }) })
      .pipe(map((r) => r.data));
  }

  performance(tenantId: string, from?: string, to?: string): Observable<PerformanceResponse> {
    return this.http
      .get<ApiSuccess<PerformanceResponse>>(this.t(tenantId, '/publishing/performance'), { params: CampaignService.params({ from, to }) })
      .pipe(map((r) => r.data));
  }

  auditLog(tenantId: string, from?: string, to?: string, limit = 50): Observable<PublishingAuditEvent[]> {
    return this.http
      .get<ApiSuccess<{ events: PublishingAuditEvent[] }>>(this.t(tenantId, '/publishing/audit-log'), {
        params: CampaignService.params({ from, to, limit }),
      })
      .pipe(map((r) => r.data.events));
  }
}
