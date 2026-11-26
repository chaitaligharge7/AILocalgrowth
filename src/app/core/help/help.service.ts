import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FeedbackItem, HelpArticle, Verification } from '../admin/platform-console.service';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

export interface FeedbackInput {
  category: string;
  message: string;
  rating?: number | null;
}

export interface VerificationInput {
  legal_name: string;
  gstin: string;
  website_url: string;
  note: string;
}

/** Tenant-facing help centre, feedback and business verification (ADR 0058). */
@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  articles(q?: string, category?: string): Observable<{ articles: HelpArticle[]; categories: string[] }> {
    let params = new HttpParams();
    if (q) {
      params = params.set('q', q);
    }
    if (category) {
      params = params.set('category', category);
    }
    return this.http.get<ApiSuccess<{ articles: HelpArticle[]; categories: string[] }>>(`${this.base}/help/articles`, { params }).pipe(map((r) => r.data));
  }

  article(slug: string): Observable<HelpArticle> {
    return this.http.get<ApiSuccess<HelpArticle>>(`${this.base}/help/articles/${encodeURIComponent(slug)}`).pipe(map((r) => r.data));
  }

  submitFeedback(tenantId: string, input: FeedbackInput): Observable<{ id: string }> {
    return this.http.post<ApiSuccess<{ id: string }>>(`${this.base}/tenants/${tenantId}/feedback`, input).pipe(map((r) => r.data));
  }

  myFeedback(tenantId: string): Observable<FeedbackItem[]> {
    return this.http.get<ApiSuccess<{ feedback: FeedbackItem[] }>>(`${this.base}/tenants/${tenantId}/feedback`).pipe(map((r) => r.data.feedback));
  }

  verification(tenantId: string): Observable<{ verification: Verification | null; notes: string[] }> {
    return this.http.get<ApiSuccess<{ verification: Verification | null; notes: string[] }>>(`${this.base}/tenants/${tenantId}/verification`).pipe(map((r) => r.data));
  }

  submitVerification(tenantId: string, input: VerificationInput): Observable<{ verification: Verification | null; notes: string[] }> {
    return this.http
      .put<ApiSuccess<{ verification: Verification | null; notes: string[] }>>(`${this.base}/tenants/${tenantId}/verification`, input)
      .pipe(map((r) => r.data));
  }
}
