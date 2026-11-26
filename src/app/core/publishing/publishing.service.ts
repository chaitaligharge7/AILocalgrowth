import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  CalendarEntry,
  CalendarResponse,
  CancelScheduleResponse,
  PublishJob,
  PublishJobListResponse,
  PublishJobStatus,
  Schedule,
  ScheduleChannel,
  ScheduleContentRequest,
} from './publishing.models';

export interface BulkScheduleItemRequest {
  content_id: string;
  scheduled_at: string;
  provider_connection_id?: string;
  channel?: ScheduleChannel;
  timezone?: string;
}

export interface BulkScheduleRequest {
  items: BulkScheduleItemRequest[];
  provider_connection_id?: string;
  channel?: ScheduleChannel;
  timezone?: string;
}

export interface BulkScheduleResponse {
  scheduled_count: number;
  failed_count: number;
  scheduled: Schedule[];
  failed: Array<{ index: number; content_id: string | null; code: string; message: string }>;
}

export interface RescheduleRequest {
  scheduled_at: string;
  timezone?: string;
}

export interface ApprovedContentOption {
  id: string;
  title: string | null;
  objective: string;
  status: string;
}

/**
 * Wraps `POST /tenants/{t}/contents/{id}/schedule`,
 * `POST .../contents/{id}/cancel`, `GET /tenants/{t}/publish-jobs`,
 * `POST .../publish-jobs/{id}/retry`, `GET /tenants/{t}/calendar`
 * (`App\Http\Handlers\PublishingHandler` → `App\Application\Publishing\PublishingService`).
 */
@Injectable({ providedIn: 'root' })
export class PublishingService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  schedule(tenantId: string, contentId: string, payload: ScheduleContentRequest): Observable<Schedule> {
    return this.http
      .post<ApiSuccess<Schedule>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}/schedule`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  cancel(tenantId: string, contentId: string): Observable<CancelScheduleResponse> {
    return this.http
      .post<ApiSuccess<CancelScheduleResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/${encodeURIComponent(contentId)}/cancel`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  listPublishJobs(tenantId: string, status?: PublishJobStatus): Observable<PublishJob[]> {
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/publish-jobs${status ? `?status=${encodeURIComponent(status)}` : ''}`;
    return this.http.get<ApiSuccess<PublishJobListResponse>>(url).pipe(map((res) => res.data.publish_jobs));
  }

  retryPublishJob(tenantId: string, jobId: string): Observable<PublishJob> {
    return this.http
      .post<ApiSuccess<PublishJob>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/publish-jobs/${encodeURIComponent(jobId)}/retry`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /** `start`/`end` must be UTC ISO-8601 instants — both required by the backend. */
  calendar(tenantId: string, startUtcIso: string, endUtcIso: string): Observable<CalendarEntry[]> {
    const url = `${this.base}/tenants/${encodeURIComponent(tenantId)}/calendar?start=${encodeURIComponent(startUtcIso)}&end=${encodeURIComponent(endUtcIso)}`;
    return this.http.get<ApiSuccess<CalendarResponse>>(url).pipe(map((res) => res.data.schedules));
  }

  bulkSchedule(tenantId: string, payload: BulkScheduleRequest): Observable<BulkScheduleResponse> {
    return this.http
      .post<ApiSuccess<BulkScheduleResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents/bulk-schedule`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  reschedule(tenantId: string, scheduleId: string, payload: RescheduleRequest): Observable<Schedule> {
    return this.http
      .patch<ApiSuccess<Schedule>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/schedules/${encodeURIComponent(scheduleId)}/reschedule`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  listApprovedContents(tenantId: string): Observable<ApprovedContentOption[]> {
    return this.http
      .get<ApiSuccess<{ contents: ApprovedContentOption[] }>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/contents?status=approved`,
      )
      .pipe(map((res) => res.data.contents ?? []));
  }
}
