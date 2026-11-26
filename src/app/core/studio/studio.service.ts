import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  Creative,
  CreativeListResponse,
  CreativeRequest,
  PromoRequest,
  PromoResponse,
  RevisionListResponse,
  TemplateCategory,
  TemplateDraftResponse,
  TemplateListResponse,
  TimelineResponse,
} from './studio.models';

/**
 * Content-studio extras: festival/seasonal/promo templates, the promo
 * designer, saved creative designs, and per-content version history and
 * timeline (`App\Http\Handlers\StudioHandler`). Reads are open to any
 * member; creating/editing needs `content.create` (enforced server-side).
 */
@Injectable({ providedIn: 'root' })
export class StudioService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private t(tenantId: string, suffix: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}${suffix}`;
  }

  templates(tenantId: string, category?: TemplateCategory): Observable<TemplateListResponse> {
    let params = new HttpParams();
    if (category) {
      params = params.set('category', category);
    }
    return this.http.get<ApiSuccess<TemplateListResponse>>(this.t(tenantId, '/content-templates'), { params }).pipe(map((r) => r.data));
  }

  draftFromTemplate(tenantId: string, templateId: string, locationId: string): Observable<TemplateDraftResponse> {
    return this.http
      .post<ApiSuccess<TemplateDraftResponse>>(this.t(tenantId, `/content-templates/${encodeURIComponent(templateId)}/draft`), { location_id: locationId })
      .pipe(map((r) => r.data));
  }

  promo(tenantId: string, payload: PromoRequest): Observable<PromoResponse> {
    return this.http.post<ApiSuccess<PromoResponse>>(this.t(tenantId, '/promo-designer'), payload).pipe(map((r) => r.data));
  }

  creatives(tenantId: string): Observable<CreativeListResponse> {
    return this.http.get<ApiSuccess<CreativeListResponse>>(this.t(tenantId, '/creatives')).pipe(map((r) => r.data));
  }

  createCreative(tenantId: string, payload: CreativeRequest): Observable<Creative> {
    return this.http.post<ApiSuccess<Creative>>(this.t(tenantId, '/creatives'), payload).pipe(map((r) => r.data));
  }

  updateCreative(tenantId: string, id: string, payload: Partial<CreativeRequest>): Observable<Creative> {
    return this.http.patch<ApiSuccess<Creative>>(this.t(tenantId, `/creatives/${encodeURIComponent(id)}`), payload).pipe(map((r) => r.data));
  }

  attachAsset(tenantId: string, id: string, assetId: string): Observable<Creative> {
    return this.http
      .post<ApiSuccess<Creative>>(this.t(tenantId, `/creatives/${encodeURIComponent(id)}/attach-asset`), { asset_id: assetId })
      .pipe(map((r) => r.data));
  }

  deleteCreative(tenantId: string, id: string): Observable<void> {
    return this.http.delete<ApiSuccess<{ deleted: boolean }>>(this.t(tenantId, `/creatives/${encodeURIComponent(id)}`)).pipe(map(() => undefined));
  }

  revisions(tenantId: string, contentId: string): Observable<RevisionListResponse> {
    return this.http
      .get<ApiSuccess<RevisionListResponse>>(this.t(tenantId, `/contents/${encodeURIComponent(contentId)}/revisions`))
      .pipe(map((r) => r.data));
  }

  restoreRevision(tenantId: string, contentId: string, revisionId: string): Observable<RevisionListResponse> {
    return this.http
      .post<ApiSuccess<RevisionListResponse>>(this.t(tenantId, `/contents/${encodeURIComponent(contentId)}/revisions/${encodeURIComponent(revisionId)}/restore`), {})
      .pipe(map((r) => r.data));
  }

  timeline(tenantId: string, contentId: string): Observable<TimelineResponse> {
    return this.http
      .get<ApiSuccess<TimelineResponse>>(this.t(tenantId, `/contents/${encodeURIComponent(contentId)}/timeline`))
      .pipe(map((r) => r.data));
  }
}
