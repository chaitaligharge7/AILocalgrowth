import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { AddonCatalog, AddonPurchase } from './addons.models';

/**
 * `GET /tenants/{t}/billing/addons`, `POST .../addons/{id}/purchase`,
 * `POST .../addon-purchases/{id}/mock-complete` (MOCK_PROVIDER only),
 * `POST .../addon-purchases/{id}/cancel`.
 */
@Injectable({ providedIn: 'root' })
export class AddonsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, path: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}/billing/${path}`;
  }

  catalog(tenantId: string): Observable<AddonCatalog> {
    return this.http.get<ApiSuccess<AddonCatalog>>(this.url(tenantId, 'addons')).pipe(map((r) => r.data));
  }

  purchase(tenantId: string, addonId: string): Observable<AddonPurchase> {
    return this.http
      .post<ApiSuccess<AddonPurchase>>(this.url(tenantId, `addons/${encodeURIComponent(addonId)}/purchase`), {})
      .pipe(map((r) => r.data));
  }

  /** DEV-ONLY: the API refuses this unless the payment provider is the mock provider. */
  mockComplete(tenantId: string, purchaseId: string): Observable<AddonPurchase> {
    return this.http
      .post<ApiSuccess<AddonPurchase>>(this.url(tenantId, `addon-purchases/${encodeURIComponent(purchaseId)}/mock-complete`), {})
      .pipe(map((r) => r.data));
  }

  cancel(tenantId: string, purchaseId: string): Observable<AddonPurchase> {
    return this.http
      .post<ApiSuccess<AddonPurchase>>(this.url(tenantId, `addon-purchases/${encodeURIComponent(purchaseId)}/cancel`), {})
      .pipe(map((r) => r.data));
  }
}
