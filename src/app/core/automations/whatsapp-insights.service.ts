import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  Campaign,
  CampaignListResponse,
  ConsentSummary,
  CreateCampaignRequest,
  UsageReport,
  WebhookLogsResponse,
  WhatsAppConfig,
} from './whatsapp-insights.models';

/**
 * Wraps the read-only `GET /tenants/{t}/whatsapp/{config,webhook-logs,
 * consent-summary,usage-report}` endpoints plus the campaign endpoints
 * (`App\Http\Handlers\WhatsAppInsightsHandler` /
 * `WhatsAppCampaignHandler`). Writes (campaign create/launch) are
 * authorized server-side by the `lead.manage` permission.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppInsightsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, path: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/whatsapp/${path}`;
  }

  config(tenantId: string): Observable<WhatsAppConfig> {
    return this.http.get<ApiSuccess<WhatsAppConfig>>(this.url(tenantId, 'config')).pipe(map((res) => res.data));
  }

  webhookLogs(tenantId: string): Observable<WebhookLogsResponse> {
    return this.http.get<ApiSuccess<WebhookLogsResponse>>(this.url(tenantId, 'webhook-logs')).pipe(map((res) => res.data));
  }

  consentSummary(tenantId: string): Observable<ConsentSummary> {
    return this.http.get<ApiSuccess<ConsentSummary>>(this.url(tenantId, 'consent-summary')).pipe(map((res) => res.data));
  }

  usageReport(tenantId: string, days = 30): Observable<UsageReport> {
    const params = new HttpParams().set('days', String(days));
    return this.http
      .get<ApiSuccess<UsageReport>>(this.url(tenantId, 'usage-report'), { params })
      .pipe(map((res) => res.data));
  }

  listCampaigns(tenantId: string): Observable<Campaign[]> {
    return this.http
      .get<ApiSuccess<CampaignListResponse>>(this.url(tenantId, 'campaigns'))
      .pipe(map((res) => res.data.campaigns));
  }

  createCampaign(tenantId: string, payload: CreateCampaignRequest): Observable<Campaign> {
    return this.http.post<ApiSuccess<Campaign>>(this.url(tenantId, 'campaigns'), payload).pipe(map((res) => res.data));
  }

  launchCampaign(tenantId: string, campaignId: string): Observable<Campaign> {
    return this.http
      .post<ApiSuccess<Campaign>>(this.url(tenantId, `campaigns/${encodeURIComponent(campaignId)}/launch`), {})
      .pipe(map((res) => res.data));
  }
}
