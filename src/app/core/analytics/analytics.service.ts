import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { AnalyticsExportResult, AnalyticsOverview, LocationMetricsResponse } from './analytics.models';

/**
 * Wraps `GET /tenants/{t}/analytics/overview`,
 * `GET /tenants/{t}/locations/{id}/metrics?provider=&start=&end=`,
 * `GET /tenants/{t}/analytics/export?format=csv`
 * (`App\Http\Handlers\AnalyticsHandler` → `App\Application\Analytics\AnalyticsService`,
 * Sprint S6, blueprint §02 M12).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  overview(tenantId: string, filters?: { locationId?: string | null; days?: number | null }): Observable<AnalyticsOverview> {
    const params = new URLSearchParams();
    if (filters?.locationId) {
      params.set('location_id', filters.locationId);
    }
    if (filters?.days) {
      params.set('days', String(filters.days));
    }
    const qs = params.toString();
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/analytics/overview${qs ? `?${qs}` : ''}`;
    return this.http.get<ApiSuccess<AnalyticsOverview>>(url).pipe(map((res) => res.data));
  }

  /** `start`/`end` are `YYYY-MM-DD` dates (or full UTC ISO-8601 instants) — both required by the backend. */
  locationMetrics(
    tenantId: string,
    locationId: string,
    provider: string,
    start: string,
    end: string,
  ): Observable<LocationMetricsResponse> {
    const query = `provider=${encodeURIComponent(provider)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}/metrics?${query}`;
    return this.http.get<ApiSuccess<LocationMetricsResponse>>(url).pipe(map((res) => res.data));
  }

  /**
   * `GET /tenants/{t}/analytics/export?format=csv` returns raw CSV bytes
   * (never the `{data,meta}` envelope — see `AnalyticsHandler::export()`'s
   * `is_binary` convention), owner/admin only. `format=pdf` is a deferred
   * stretch goal that always 422s server-side (`AnalyticsService::exportCsv()`)
   * — deliberately NOT wired up here; the component disables that option
   * instead of calling an endpoint known to fail.
   *
   * Because this request's `responseType` is `'blob'`, Angular delivers a
   * non-2xx response's JSON error body as an un-parsed `Blob`
   * (`HttpErrorResponse.error instanceof Blob`), not the usual parsed
   * `{error:{code,message}}` object `apiErrorMessage()` expects —
   * {@link normalizeBlobError} reads and re-parses it so the exact same
   * error-handling convention keeps working.
   */
  exportCsv(
    tenantId: string,
    metricsScope?: { locationId: string; provider: string; start: string; end: string },
  ): Observable<AnalyticsExportResult> {
    return this.exportReport(tenantId, 'csv', metricsScope);
  }

  exportPdf(
    tenantId: string,
    metricsScope?: { locationId: string; provider: string; start: string; end: string },
  ): Observable<AnalyticsExportResult> {
    return this.exportReport(tenantId, 'pdf', metricsScope);
  }

  private exportReport(
    tenantId: string,
    format: 'csv' | 'pdf',
    metricsScope?: { locationId: string; provider: string; start: string; end: string },
  ): Observable<AnalyticsExportResult> {
    const params = new URLSearchParams({ format });
    if (metricsScope?.locationId && metricsScope.start && metricsScope.end) {
      params.set('location_id', metricsScope.locationId);
      params.set('provider', metricsScope.provider);
      params.set('start', metricsScope.start);
      params.set('end', metricsScope.end);
    }
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/analytics/export?${params.toString()}`;
    return this.http.get(url, { observe: 'response', responseType: 'blob' }).pipe(
      map((res) => {
        const mime = format === 'pdf' ? 'application/pdf' : 'text/csv';
        const blob = res.body ?? new Blob([''], { type: mime });
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const match = /filename="?([^";]+)"?/.exec(disposition);
        const filename = match?.[1] ?? `analytics-export-${new Date().toISOString().slice(0, 10)}.${format}`;
        return { blob, filename };
      }),
      catchError((err: unknown) => this.normalizeBlobError(err)),
    );
  }

  private normalizeBlobError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
      return from(err.error.text()).pipe(
        switchMap((text) => {
          let parsedBody: unknown = text;
          try {
            parsedBody = JSON.parse(text);
          } catch {
            // Not JSON (e.g. an HTML error page from a proxy) — fall back to raw text.
          }
          return throwError(
            () =>
              new HttpErrorResponse({
                error: parsedBody,
                status: err.status,
                statusText: err.statusText,
                url: err.url ?? undefined,
              }),
          );
        }),
      );
    }
    return throwError(() => err);
  }
}
