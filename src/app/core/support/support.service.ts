import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AddSupportMessageRequest,
  ChangeSupportStatusRequest,
  CreateSupportTicketRequest,
  RateSupportTicketRequest,
  SupportAttachment,
  SupportStatus,
  SupportTicket,
  SupportTicketDetail,
  SupportTicketListResponse,
} from './support.models';

/**
 * Wraps `POST/GET /tenants/{t}/support/tickets`,
 * `GET /tenants/{t}/support/tickets/{id}`,
 * `POST /tenants/{t}/support/tickets/{id}/messages`,
 * `POST /tenants/{t}/support/tickets/{id}/status`
 * (`App\Http\Handlers\SupportHandler` → `App\Application\Support\SupportService`).
 * Every call is bearer-authenticated by `authInterceptor`; server-side
 * membership/role checks are the actual authorization boundary.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  create(tenantId: string, payload: CreateSupportTicketRequest): Observable<SupportTicketDetail> {
    return this.http
      .post<ApiSuccess<SupportTicketDetail>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets`, payload)
      .pipe(map((res) => res.data));
  }

  list(tenantId: string, status?: SupportStatus): Observable<SupportTicket[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<ApiSuccess<SupportTicketListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets`, { params })
      .pipe(map((res) => res.data.tickets));
  }

  get(tenantId: string, ticketId: string): Observable<SupportTicketDetail> {
    return this.http
      .get<ApiSuccess<SupportTicketDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets/${encodeURIComponent(ticketId)}`,
      )
      .pipe(map((res) => res.data));
  }

  addMessage(tenantId: string, ticketId: string, payload: AddSupportMessageRequest): Observable<SupportTicketDetail> {
    return this.http
      .post<ApiSuccess<SupportTicketDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets/${encodeURIComponent(ticketId)}/messages`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  changeStatus(tenantId: string, ticketId: string, payload: ChangeSupportStatusRequest): Observable<SupportTicketDetail> {
    return this.http
      .post<ApiSuccess<SupportTicketDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets/${encodeURIComponent(ticketId)}/status`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  rateTicket(tenantId: string, ticketId: string, payload: RateSupportTicketRequest): Observable<SupportTicketDetail> {
    return this.http
      .post<ApiSuccess<SupportTicketDetail>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets/${encodeURIComponent(ticketId)}/rating`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  uploadAttachment(tenantId: string, ticketId: string, file: File): Observable<SupportAttachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http
      .post<ApiSuccess<SupportAttachment>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/support/tickets/${encodeURIComponent(ticketId)}/attachments`,
        form,
      )
      .pipe(map((res) => res.data));
  }
}
