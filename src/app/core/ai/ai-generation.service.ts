import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { AiGenerationRequest, AiGenerationResponse } from './ai-generation.models';

/**
 * Wraps `POST /tenants/{tenantId}/ai/generations` (blueprint §02 M06, §3.1
 * "AI composer"). A `429 QUOTA_EXCEEDED` is a normal, expected outcome the
 * caller must handle (not just log) — see `AiStudioComponent`.
 */
@Injectable({ providedIn: 'root' })
export class AiGenerationService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  generate(tenantId: string, payload: AiGenerationRequest): Observable<AiGenerationResponse> {
    return this.http
      .post<ApiSuccess<AiGenerationResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/ai/generations`, payload)
      .pipe(map((res) => res.data));
  }
}
