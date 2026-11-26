import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { AppNotification, NotificationListResponse } from './notification.models';

/**
 * Wraps `GET /tenants/{t}/notifications`, `POST /tenants/{t}/notifications/{id}/read`
 * (`App\Http\Handlers\NotificationHandler` → `App\Application\Notifications\NotificationService`).
 * Rows are only ever written server-side (the notification outbox worker);
 * this service is read/mark-read only.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string, unreadOnly = false): Observable<AppNotification[]> {
    let params = new HttpParams();
    if (unreadOnly) {
      params = params.set('unread', '1');
    }
    return this.http
      .get<ApiSuccess<NotificationListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/notifications`, { params })
      .pipe(map((res) => res.data.notifications));
  }

  markRead(tenantId: string, notificationId: string): Observable<AppNotification> {
    return this.http
      .post<ApiSuccess<AppNotification>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/notifications/${encodeURIComponent(notificationId)}/read`,
        {},
      )
      .pipe(map((res) => res.data));
  }
}
