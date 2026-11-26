import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { ReviewAutomationSettings, ReviewInsights, ReviewInsightsFilter } from './review-insights.models';

export interface CsvDownload {
  blob: Blob;
  filename: string;
}

/**
 * Review analytics, CSV report and the auto-draft setting
 * (`App\Http\Handlers\ReviewInsightsHandler`). Reads: any member; the
 * setting can only be changed by an owner/admin (enforced server-side).
 */
@Injectable({ providedIn: 'root' })
export class ReviewInsightsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, suffix = ''): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/review-insights${suffix}`;
  }

  private static params(filter: ReviewInsightsFilter): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v) {
        params = params.set(k, v);
      }
    }
    return params;
  }

  insights(tenantId: string, filter: ReviewInsightsFilter = {}): Observable<ReviewInsights> {
    return this.http.get<ApiSuccess<ReviewInsights>>(this.url(tenantId), { params: ReviewInsightsService.params(filter) }).pipe(map((r) => r.data));
  }

  /** Raw CSV bytes; a non-2xx JSON error body is re-parsed so `apiErrorMessage()` keeps working. */
  exportCsv(tenantId: string, filter: ReviewInsightsFilter = {}): Observable<CsvDownload> {
    return this.http
      .get(this.url(tenantId, '/export'), { params: ReviewInsightsService.params(filter), observe: 'response', responseType: 'blob' })
      .pipe(
        map((res) => {
          const blob = res.body ?? new Blob([''], { type: 'text/csv' });
          const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
          return { blob, filename: match?.[1] ?? 'review-report.csv' };
        }),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
            return from(err.error.text()).pipe(
              switchMap((text) => {
                let parsed: unknown = text;
                try {
                  parsed = JSON.parse(text);
                } catch {
                  // Not JSON (e.g. a proxy error page) — keep the raw text.
                }
                return throwError(() => new HttpErrorResponse({ error: parsed, headers: err.headers, status: err.status, statusText: err.statusText, url: err.url ?? undefined }));
              }),
            );
          }
          return throwError(() => err);
        }),
      );
  }

  getSettings(tenantId: string): Observable<ReviewAutomationSettings> {
    return this.http.get<ApiSuccess<ReviewAutomationSettings>>(this.url(tenantId, '/settings')).pipe(map((r) => r.data));
  }

  saveSettings(tenantId: string, payload: { auto_draft_enabled: boolean; max_rating: number }): Observable<ReviewAutomationSettings> {
    return this.http.put<ApiSuccess<ReviewAutomationSettings>>(this.url(tenantId, '/settings'), payload).pipe(map((r) => r.data));
  }
}
