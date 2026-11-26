import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  ActivityLogFilters,
  ActivityLogResponse,
  CreatedDataRequest,
  DataRequestListResponse,
  DataRequestType,
  NotificationPreference,
  NotificationPreferenceResponse,
} from './settings.models';

/**
 * Wraps the tenant Settings endpoints of `App\Http\Handlers\SettingsHandler`:
 * notification preferences (+ mark-all-read), the activity log and recorded
 * data requests. Permission rules (member.manage / tenant.manage) are
 * enforced server-side.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, path: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/${path}`;
  }

  notificationPreferences(tenantId: string): Observable<NotificationPreference[]> {
    return this.http
      .get<ApiSuccess<NotificationPreferenceResponse>>(this.url(tenantId, 'notification-preferences'))
      .pipe(map((res) => res.data.preferences));
  }

  saveNotificationPreferences(
    tenantId: string,
    changes: { event_type: string; enabled: boolean; email_enabled?: boolean; push_enabled?: boolean }[],
  ): Observable<NotificationPreference[]> {
    return this.http
      .put<ApiSuccess<NotificationPreferenceResponse>>(this.url(tenantId, 'notification-preferences'), { preferences: changes })
      .pipe(map((res) => res.data.preferences));
  }

  markAllNotificationsRead(tenantId: string): Observable<{ marked_read: number }> {
    return this.http
      .post<ApiSuccess<{ marked_read: number }>>(this.url(tenantId, 'notifications/read-all'), {})
      .pipe(map((res) => res.data));
  }

  activityLog(tenantId: string, filters: ActivityLogFilters = {}): Observable<ActivityLogResponse> {
    let params = new HttpParams();
    if (filters.action) {
      params = params.set('action', filters.action);
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }
    if (filters.limit) {
      params = params.set('limit', String(filters.limit));
    }

    return this.http.get<ApiSuccess<ActivityLogResponse>>(this.url(tenantId, 'activity-log'), { params }).pipe(map((res) => res.data));
  }

  exportActivityLogCsv(tenantId: string, filters: ActivityLogFilters = {}): Observable<Blob> {
    let params = new HttpParams();
    if (filters.action) {
      params = params.set('action', filters.action);
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }

    return this.http.get(this.url(tenantId, 'activity-log/export'), { params, responseType: 'blob' });
  }

  downloadDataExport(tenantId: string): Observable<Blob> {
    return this.http.get(this.url(tenantId, 'data-export/download'), { responseType: 'blob' });
  }

  dataRequests(tenantId: string): Observable<DataRequestListResponse> {
    return this.http.get<ApiSuccess<DataRequestListResponse>>(this.url(tenantId, 'data-requests')).pipe(map((res) => res.data));
  }

  createDataRequest(tenantId: string, type: DataRequestType): Observable<CreatedDataRequest> {
    return this.http
      .post<ApiSuccess<CreatedDataRequest>>(this.url(tenantId, 'data-requests'), { type })
      .pipe(map((res) => res.data));
  }
}
