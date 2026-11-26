import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { MessageDelivery, MessageListFilters, MessageListResponse } from './message.models';

/**
 * Wraps `GET /tenants/{t}/messages` (`App\Http\Handlers\MessageHandler` →
 * `App\Application\Messaging\MessageService`). Read-only delivery log —
 * open to any active tenant member.
 */
@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string, filters: MessageListFilters = {}): Observable<MessageDelivery[]> {
    let params = new HttpParams();
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.lead_id) {
      params = params.set('lead_id', filters.lead_id);
    }
    return this.http
      .get<ApiSuccess<MessageListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/messages`, { params })
      .pipe(map((res) => res.data.messages));
  }
}
