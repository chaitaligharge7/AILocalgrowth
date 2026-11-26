import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  CheckoutRequest,
  Invoice,
  InvoiceListResponse,
  PaymentOrder,
  PlanListResponse,
  PlanVersion,
  SubscriptionChangeResult,
  TenantSubscription,
  UsageMeter,
  UsageResponse,
  WebhookResult,
} from './billing.models';

/**
 * Wraps `GET /plans`, `GET /tenants/{t}/subscription`,
 * `POST /tenants/{t}/checkout`, `GET /tenants/{t}/usage`,
 * `GET /tenants/{t}/invoices`, `POST /tenants/{t}/subscription/change`,
 * `POST /tenants/{t}/subscription/cancel`
 * (`App\Http\Handlers\{PlanHandler,SubscriptionHandler,CheckoutHandler}`).
 *
 * `completeMockPayment()` additionally wraps `POST /webhooks/razorpay` —
 * a DEV-ONLY helper for local demo/testing only (see `BillingComponent`'s
 * "complete mock payment" button), never a real payment flow. It POSTs
 * the exact `mock_webhook_payload_raw` string the backend generated as
 * the raw body (never re-serialized client-side — the backend's HMAC
 * signature is computed over those exact bytes) with the
 * `X-Razorpay-Signature` header the backend also generated.
 */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  listPlans(): Observable<PlanVersion[]> {
    return this.http.get<ApiSuccess<PlanListResponse>>(`${this.base}/plans`).pipe(map((res) => res.data.plans));
  }

  getSubscription(tenantId: string): Observable<TenantSubscription> {
    return this.http
      .get<ApiSuccess<TenantSubscription>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/subscription`)
      .pipe(map((res) => res.data));
  }

  checkout(tenantId: string, payload: CheckoutRequest): Observable<PaymentOrder> {
    return this.http
      .post<ApiSuccess<PaymentOrder>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/checkout`, payload)
      .pipe(map((res) => res.data));
  }

  usage(tenantId: string): Observable<UsageMeter[]> {
    return this.http
      .get<ApiSuccess<UsageResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/usage`)
      .pipe(map((res) => res.data.usage));
  }

  invoices(tenantId: string): Observable<Invoice[]> {
    return this.http
      .get<ApiSuccess<InvoiceListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/invoices`)
      .pipe(map((res) => res.data.invoices));
  }

  downloadInvoicePdf(tenantId: string, invoiceId: string): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .get(`${this.base}/tenants/${encodeURIComponent(tenantId)}/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((res) => {
          const disp = res.headers.get('Content-Disposition') ?? '';
          const match = /filename="?([^";]+)"?/.exec(disp);
          const filename = match?.[1] ?? `invoice-${invoiceId}.pdf`;
          return { blob: res.body ?? new Blob([''], { type: 'application/pdf' }), filename };
        }),
      );
  }

  changeSubscription(tenantId: string, payload: CheckoutRequest): Observable<SubscriptionChangeResult> {
    return this.http
      .post<ApiSuccess<SubscriptionChangeResult>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/subscription/change`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  cancelSubscription(tenantId: string): Observable<TenantSubscription> {
    return this.http
      .post<ApiSuccess<TenantSubscription>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/subscription/cancel`, {})
      .pipe(map((res) => res.data));
  }

  /** DEV-ONLY: see class docblock. Never used for a real payment. */
  completeMockPayment(payloadRaw: string, signature: string): Observable<WebhookResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': signature,
    });
    return this.http
      .post<ApiSuccess<WebhookResult>>(`${this.base}/webhooks/razorpay`, payloadRaw, { headers })
      .pipe(map((res) => res.data));
  }
}
