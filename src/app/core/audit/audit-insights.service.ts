import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AuditComparison,
  AuditTask,
  ExportFormat,
  KeywordSuggestions,
  ProfileAnalysis,
  TaskBoard,
  UpdateTaskRequest,
} from './audit-insights.models';

export interface ReportDownload {
  blob: Blob;
  filename: string;
}

/**
 * Wraps the audit-insights endpoints
 * (`App\Http\Handlers\AuditInsightsHandler` → `AuditInsightsService` /
 * `ProfileAnalysisService`): history comparison, improvement-task board,
 * report export, category/info analysis and generated keyword ideas.
 * Reads are open to any member; task edits need `content.create`
 * (enforced server-side).
 */
@Injectable({ providedIn: 'root' })
export class AuditInsightsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private loc(tenantId: string, locationId: string, suffix: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}${suffix}`;
  }

  compare(tenantId: string, locationId: string, fromId?: string, toId?: string): Observable<AuditComparison> {
    let params = new HttpParams();
    if (fromId) {
      params = params.set('from', fromId);
    }
    if (toId) {
      params = params.set('to', toId);
    }
    return this.http
      .get<ApiSuccess<AuditComparison>>(this.loc(tenantId, locationId, '/audits/compare'), { params })
      .pipe(map((res) => res.data));
  }

  board(tenantId: string, locationId: string): Observable<TaskBoard> {
    return this.http.get<ApiSuccess<TaskBoard>>(this.loc(tenantId, locationId, '/audit-actions')).pipe(map((res) => res.data));
  }

  updateTask(tenantId: string, actionId: string, payload: UpdateTaskRequest): Observable<AuditTask> {
    return this.http
      .patch<ApiSuccess<AuditTask>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/audit-actions/${encodeURIComponent(actionId)}`, payload)
      .pipe(map((res) => res.data));
  }

  analysis(tenantId: string, locationId: string): Observable<ProfileAnalysis> {
    return this.http.get<ApiSuccess<ProfileAnalysis>>(this.loc(tenantId, locationId, '/profile-analysis')).pipe(map((res) => res.data));
  }

  keywords(tenantId: string, locationId: string): Observable<KeywordSuggestions> {
    return this.http
      .get<ApiSuccess<KeywordSuggestions>>(this.loc(tenantId, locationId, '/keyword-suggestions'))
      .pipe(map((res) => res.data));
  }

  /**
   * `GET /tenants/{t}/audits/{id}/export?format=` returns raw bytes (never
   * the JSON envelope). Because the request uses `responseType: 'blob'`, a
   * non-2xx JSON error body arrives as a `Blob`; it is re-parsed so
   * `apiErrorMessage()` keeps working (same approach as the analytics export).
   */
  exportReport(tenantId: string, auditId: string, format: ExportFormat): Observable<ReportDownload> {
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/audits/${encodeURIComponent(auditId)}/export`;
    return this.http.get(url, { params: { format }, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => {
        const blob = res.body ?? new Blob([''], { type: 'text/plain' });
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const match = /filename="?([^";]+)"?/.exec(disposition);
        return { blob, filename: match?.[1] ?? `readiness-audit-${auditId.slice(0, 8)}.${format}` };
      }),
      catchError((err: unknown) => this.normalizeBlobError(err)),
    );
  }

  private normalizeBlobError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
      return from(err.error.text()).pipe(
        switchMap((text) => {
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // Not JSON (e.g. a proxy HTML error page) — keep the raw text.
          }
          return throwError(
            () => new HttpErrorResponse({ error: parsed, headers: err.headers, status: err.status, statusText: err.statusText, url: err.url ?? undefined }),
          );
        }),
      );
    }
    return throwError(() => err);
  }
}
