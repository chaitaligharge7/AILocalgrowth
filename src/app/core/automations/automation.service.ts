import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  Automation,
  AutomationListResponse,
  CreateAutomationRequest,
  UpdateAutomationRequest,
} from './automation.models';

/**
 * Wraps `GET/POST/PATCH/DELETE /tenants/{t}/automations`
 * (`App\Http\Handlers\AutomationHandler` →
 * `App\Application\Messaging\AutomationService`). Bearer-authenticated by
 * `authInterceptor`; server-side `lead.manage` check is the actual
 * authorization boundary for every write.
 */
@Injectable({ providedIn: 'root' })
export class AutomationService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string): Observable<Automation[]> {
    return this.http
      .get<ApiSuccess<AutomationListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/automations`)
      .pipe(map((res) => res.data.automations));
  }

  create(tenantId: string, payload: CreateAutomationRequest): Observable<Automation> {
    return this.http
      .post<ApiSuccess<Automation>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/automations`, payload)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, automationId: string, payload: UpdateAutomationRequest): Observable<Automation> {
    return this.http
      .patch<ApiSuccess<Automation>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/automations/${encodeURIComponent(automationId)}`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  delete(tenantId: string, automationId: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<{ deleted: boolean }>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/automations/${encodeURIComponent(automationId)}`,
      )
      .pipe(map(() => undefined));
  }
}
