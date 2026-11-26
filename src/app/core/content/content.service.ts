import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  ApproveContentRequest,
  ContentItem,
  ContentListResponse,
  CreateContentRequest,
  UpdateContentRequest,
} from './content.models';

/**
 * Wraps `GET/POST /tenants/{t}/contents`, `GET/PATCH /tenants/{t}/contents/{id}`,
 * `POST .../submit`, `POST .../approve` (blueprint §02 M06, §4.5). `update()`
 * only succeeds server-side while the item is `draft` — a `409
 * CONTENT_NOT_EDITABLE` otherwise; see `ContentComponent` for how that's
 * surfaced.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string): Observable<ContentItem[]> {
    return this.http
      .get<ApiSuccess<ContentListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/contents`)
      .pipe(map((res) => res.data.contents));
  }

  create(tenantId: string, payload: CreateContentRequest): Observable<ContentItem> {
    return this.http
      .post<ApiSuccess<ContentItem>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/contents`, payload)
      .pipe(map((res) => res.data));
  }

  get(tenantId: string, contentId: string): Observable<ContentItem> {
    return this.http
      .get<ApiSuccess<ContentItem>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}`)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, contentId: string, payload: UpdateContentRequest): Observable<ContentItem> {
    return this.http
      .patch<ApiSuccess<ContentItem>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  submit(tenantId: string, contentId: string): Observable<ContentItem> {
    return this.http
      .post<ApiSuccess<ContentItem>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}/submit`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  approve(tenantId: string, contentId: string, payload: ApproveContentRequest = {}): Observable<ContentItem> {
    return this.http
      .post<ApiSuccess<ContentItem>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}/approve`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  bulkAction(
    tenantId: string,
    action: 'submit' | 'approve' | 'reject' | 'delete',
    contentIds: string[],
  ): Observable<{ action: string; succeeded: string[]; failed: { id: string; code: string; message: string }[] }> {
    return this.http
      .post<
        ApiSuccess<{ action: string; succeeded: string[]; failed: { id: string; code: string; message: string }[] }>
      >(`${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/bulk-action`, {
        action,
        content_ids: contentIds,
      })
      .pipe(map((res) => res.data));
  }
}
