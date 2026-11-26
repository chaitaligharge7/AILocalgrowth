import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { BrandKit, BrandKitTemplateListResponse, UpdateBrandKitRequest } from './brand-kit.models';

/**
 * Wraps `GET/PUT /tenants/{tenantId}/brand-kit` and
 * `GET /tenants/{tenantId}/brand-kit/templates?industry=`.
 */
@Injectable({ providedIn: 'root' })
export class BrandKitService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  get(tenantId: string): Observable<BrandKit> {
    return this.http
      .get<ApiSuccess<BrandKit>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/brand-kit`)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, payload: UpdateBrandKitRequest): Observable<BrandKit> {
    return this.http
      .put<ApiSuccess<BrandKit>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/brand-kit`, payload)
      .pipe(map((res) => res.data));
  }

  templates(tenantId: string, industry?: string): Observable<BrandKitTemplateListResponse> {
    let params = new HttpParams();
    if (industry?.trim()) {
      params = params.set('industry', industry.trim());
    }
    return this.http
      .get<ApiSuccess<BrandKitTemplateListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/brand-kit/templates`, { params })
      .pipe(map((res) => res.data));
  }
}
