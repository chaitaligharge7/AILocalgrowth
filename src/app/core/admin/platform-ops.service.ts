import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AiUsage,
  Announcement,
  CreateAnnouncementRequest,
  OpsEvent,
  OpsEventSource,
  OpsFailures,
  OpsHealth,
  PlatformAdminUser,
  SupportReport,
} from './platform-ops.models';

/**
 * Platform operations console (ADR 0057). Needs the bearer token AND
 * `X-Admin-Session`, attached by the interceptors.
 */
@Injectable({ providedIn: 'root' })
export class PlatformOpsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  health(): Observable<OpsHealth> {
    return this.http.get<ApiSuccess<OpsHealth>>(`${this.base}/admin/ops/health`).pipe(map((r) => r.data));
  }

  events(source: OpsEventSource, status?: string): Observable<OpsEvent[]> {
    let params = new HttpParams().set('source', source);
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<ApiSuccess<{ source: string; events: OpsEvent[] }>>(`${this.base}/admin/ops/events`, { params })
      .pipe(map((r) => r.data.events));
  }

  failures(days: number): Observable<OpsFailures> {
    return this.http
      .get<ApiSuccess<OpsFailures>>(`${this.base}/admin/ops/failures`, { params: new HttpParams().set('days', days) })
      .pipe(map((r) => r.data));
  }

  aiUsage(days: number): Observable<AiUsage> {
    return this.http
      .get<ApiSuccess<AiUsage>>(`${this.base}/admin/ai/usage`, { params: new HttpParams().set('days', days) })
      .pipe(map((r) => r.data));
  }

  admins(): Observable<{ admins: PlatformAdminUser[]; notes: string[] }> {
    return this.http.get<ApiSuccess<{ admins: PlatformAdminUser[]; notes: string[] }>>(`${this.base}/admin/admins`).pipe(map((r) => r.data));
  }

  revokeAdmin(userId: string, reason: string): Observable<void> {
    return this.http
      .post<ApiSuccess<unknown>>(`${this.base}/admin/admins/${encodeURIComponent(userId)}/revoke`, { reason })
      .pipe(map(() => undefined));
  }

  announcements(): Observable<Announcement[]> {
    return this.http
      .get<ApiSuccess<{ announcements: Announcement[] }>>(`${this.base}/admin/announcements`)
      .pipe(map((r) => r.data.announcements));
  }

  createAnnouncement(body: CreateAnnouncementRequest): Observable<Announcement> {
    return this.http.post<ApiSuccess<Announcement>>(`${this.base}/admin/announcements`, body).pipe(map((r) => r.data));
  }

  retireAnnouncement(id: string, reason: string): Observable<Announcement> {
    return this.http
      .post<ApiSuccess<Announcement>>(`${this.base}/admin/announcements/${encodeURIComponent(id)}/retire`, { reason })
      .pipe(map((r) => r.data));
  }

  supportReport(days: number): Observable<SupportReport> {
    return this.http
      .get<ApiSuccess<SupportReport>>(`${this.base}/admin/support/report`, { params: new HttpParams().set('days', days) })
      .pipe(map((r) => r.data));
  }
}
