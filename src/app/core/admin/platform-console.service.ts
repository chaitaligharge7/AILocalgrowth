import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  keywords: string;
  status: ArticleStatus;
  published_at: string | null;
  updated_at: string;
  body?: string;
}

export interface ArticleInput {
  title: string;
  slug?: string;
  category: string;
  summary: string;
  body: string;
  keywords: string;
  reason: string;
}

export type FeedbackStatus = 'new' | 'triaged' | 'resolved' | 'dismissed';

export interface FeedbackItem {
  id: string;
  category: string;
  rating: number | null;
  message: string;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
  tenant_id?: string;
  tenant_name?: string | null;
}

export type VerificationStatus = 'submitted' | 'verified' | 'rejected';

export interface Verification {
  id: string;
  status: VerificationStatus;
  legal_name: string;
  gstin: string | null;
  website_url: string | null;
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  tenant_id?: string;
  tenant_name?: string | null;
}

export type AgencyReviewStatus = 'unreviewed' | 'approved' | 'rejected';

export interface AgencyReviewRow {
  id: string;
  brand_name: string;
  status: string;
  review_status: AgencyReviewStatus;
  review_note: string | null;
  reviewed_at: string | null;
  owner_tenant_id: string;
  owner_tenant_name: string;
  active_clients: number;
  created_at: string;
}

export interface MoneyTotal {
  status: string;
  currency: string;
  count: number;
  total: string;
}

export interface ReconItem {
  id?: string;
  invoice_id?: string;
  invoice_number?: string;
  tenant_id: string;
  tenant_name: string;
  amount?: string;
  currency: string;
  status?: string;
  external_order_id?: string;
  provider_payment_id?: string;
  invoice_total?: string;
  payment_amount?: string;
}

export interface Reconciliation {
  days: number;
  mock_provider: boolean;
  orders: MoneyTotal[];
  payments: MoneyTotal[];
  invoices: MoneyTotal[];
  discrepancies: Record<'captured_payments_without_invoice' | 'invoice_total_differs_from_payment' | 'paid_orders_without_payment', { count: number; items: ReconItem[] }>;
  notes: string[];
}

export interface PlatformOrder {
  id: string;
  tenant_id: string;
  tenant_name: string;
  external_order_id: string | null;
  amount: string;
  currency: string;
  status: string;
  payment_count: number;
  created_at: string;
}

export type PrivacyStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface PrivacyRequest {
  id: string;
  tenant_id: string;
  tenant_name: string;
  type: string;
  status: PrivacyStatus;
  requested_at: string;
  completed_at: string | null;
}

export interface PrivacyOverview {
  days: number;
  counts: Record<PrivacyStatus, number>;
  requests: PrivacyRequest[];
  audit_activity: { action: string; count: number }[];
  notes: string[];
}

/** Platform console: help centre, feedback, verification, agency review, reconciliation, privacy (ADR 0058). Needs the admin session header, added by the interceptor. */
@Injectable({ providedIn: 'root' })
export class PlatformConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  articles(status?: ArticleStatus, q?: string): Observable<HelpArticle[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    if (q) {
      params = params.set('q', q);
    }
    return this.http.get<ApiSuccess<{ articles: HelpArticle[] }>>(`${this.base}/admin/help/articles`, { params }).pipe(map((r) => r.data.articles));
  }

  article(id: string): Observable<HelpArticle> {
    return this.http.get<ApiSuccess<HelpArticle>>(`${this.base}/admin/help/articles/${encodeURIComponent(id)}`).pipe(map((r) => r.data));
  }

  createArticle(input: ArticleInput): Observable<HelpArticle> {
    return this.http.post<ApiSuccess<HelpArticle>>(`${this.base}/admin/help/articles`, input).pipe(map((r) => r.data));
  }

  updateArticle(id: string, input: ArticleInput): Observable<HelpArticle> {
    return this.http.patch<ApiSuccess<HelpArticle>>(`${this.base}/admin/help/articles/${encodeURIComponent(id)}`, input).pipe(map((r) => r.data));
  }

  setArticleStatus(id: string, status: ArticleStatus, reason: string): Observable<HelpArticle> {
    return this.http
      .post<ApiSuccess<HelpArticle>>(`${this.base}/admin/help/articles/${encodeURIComponent(id)}/status`, { status, reason })
      .pipe(map((r) => r.data));
  }

  feedback(status?: FeedbackStatus): Observable<{ counts: Record<FeedbackStatus, number>; feedback: FeedbackItem[] }> {
    const params = status ? new HttpParams().set('status', status) : new HttpParams();
    return this.http
      .get<ApiSuccess<{ counts: Record<FeedbackStatus, number>; feedback: FeedbackItem[] }>>(`${this.base}/admin/feedback`, { params })
      .pipe(map((r) => r.data));
  }

  triageFeedback(id: string, status: FeedbackStatus, note: string, reason: string): Observable<FeedbackItem> {
    return this.http
      .post<ApiSuccess<FeedbackItem>>(`${this.base}/admin/feedback/${encodeURIComponent(id)}/triage`, { status, note, reason })
      .pipe(map((r) => r.data));
  }

  verifications(status?: VerificationStatus): Observable<Verification[]> {
    const params = status ? new HttpParams().set('status', status) : new HttpParams();
    return this.http.get<ApiSuccess<{ verifications: Verification[] }>>(`${this.base}/admin/verifications`, { params }).pipe(map((r) => r.data.verifications));
  }

  decideVerification(id: string, decision: 'verified' | 'rejected', note: string, reason: string): Observable<Verification> {
    return this.http
      .post<ApiSuccess<Verification>>(`${this.base}/admin/verifications/${encodeURIComponent(id)}/decision`, { decision, note, reason })
      .pipe(map((r) => r.data));
  }

  agencyReviews(reviewStatus?: AgencyReviewStatus): Observable<{ agencies: AgencyReviewRow[]; notes: string[] }> {
    const params = reviewStatus ? new HttpParams().set('review_status', reviewStatus) : new HttpParams();
    return this.http.get<ApiSuccess<{ agencies: AgencyReviewRow[]; notes: string[] }>>(`${this.base}/admin/agency-reviews`, { params }).pipe(map((r) => r.data));
  }

  reviewAgency(id: string, reviewStatus: AgencyReviewStatus, note: string, reason: string): Observable<void> {
    return this.http
      .post<ApiSuccess<unknown>>(`${this.base}/admin/agencies/${encodeURIComponent(id)}/review`, { review_status: reviewStatus, note, reason })
      .pipe(map(() => undefined));
  }

  reconciliation(days: number): Observable<Reconciliation> {
    return this.http
      .get<ApiSuccess<Reconciliation>>(`${this.base}/admin/billing/reconciliation`, { params: new HttpParams().set('days', days) })
      .pipe(map((r) => r.data));
  }

  orders(days: number, status?: string): Observable<{ mock_provider: boolean; orders: PlatformOrder[] }> {
    let params = new HttpParams().set('days', days);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ApiSuccess<{ mock_provider: boolean; orders: PlatformOrder[] }>>(`${this.base}/admin/billing/orders`, { params }).pipe(map((r) => r.data));
  }

  privacy(days: number, status?: PrivacyStatus): Observable<PrivacyOverview> {
    let params = new HttpParams().set('days', days);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ApiSuccess<PrivacyOverview>>(`${this.base}/admin/privacy/requests`, { params }).pipe(map((r) => r.data));
  }

  setPrivacyStatus(id: string, status: 'in_progress' | 'completed' | 'rejected', reason: string): Observable<void> {
    return this.http
      .post<ApiSuccess<unknown>>(`${this.base}/admin/privacy/requests/${encodeURIComponent(id)}/status`, { status, reason })
      .pipe(map(() => undefined));
  }
}
