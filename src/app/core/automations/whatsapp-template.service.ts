import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { WhatsAppTemplate, WhatsAppTemplateListResponse } from './whatsapp-template.models';

/**
 * Wraps `GET /tenants/{t}/whatsapp/templates`
 * (`App\Http\Handlers\WhatsAppTemplateHandler` →
 * `App\Application\Messaging\WhatsAppTemplateService`). Read-only — there is
 * no create/update endpoint; templates are seeded server-side from the mock
 * WhatsApp provider's catalog.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string): Observable<WhatsAppTemplate[]> {
    return this.http
      .get<ApiSuccess<WhatsAppTemplateListResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/whatsapp/templates`,
      )
      .pipe(map((res) => res.data.templates));
  }
}
