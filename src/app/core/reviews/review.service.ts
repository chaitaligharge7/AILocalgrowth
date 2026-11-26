import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  GoogleReview,
  ReviewApprovalSettings,
  ReviewHistoryResponse,
  ReviewListFilters,
  ReviewListResponse,
  ReviewReplyDraft,
  ReviewReplyEvent,
  UpdateReviewTriageRequest,
} from './review.models';

/**
 * Wraps `GET /tenants/{t}/locations/{id}/reviews`,
 * `POST /tenants/{t}/reviews/{id}/draft-reply`, `.../approve-reply`,
 * `.../send-reply`, `GET /tenants/{t}/reviews/{id}/history`
 * (`App\Http\Handlers\ReviewHandler` → `App\Application\Google\ReviewService`).
 *
 * Backend gap: there is no endpoint to edit a draft's `body` before
 * approving/sending it — `approveReply()`/`sendReply()` always act on the
 * latest draft for the review (or an explicit `draftId`). Re-running
 * `draftReply()` creates a fresh draft rather than editing the old one.
 * `ReviewsComponent` surfaces this rather than fabricating an edit call.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(tenantId: string, locationId: string, filters: ReviewListFilters = {}): Observable<GoogleReview[]> {
    let params = new HttpParams();
    if (filters.rating !== undefined) {
      params = params.set('rating', String(filters.rating));
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    return this.http
      .get<ApiSuccess<ReviewListResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(locationId)}/reviews`,
        { params },
      )
      .pipe(map((res) => res.data.reviews));
  }

  draftReply(tenantId: string, reviewId: string): Observable<ReviewReplyDraft> {
    return this.http
      .post<ApiSuccess<ReviewReplyDraft>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/draft-reply`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  updateDraftReply(tenantId: string, reviewId: string, body: string, draftId?: string): Observable<ReviewReplyDraft> {
    return this.http
      .patch<ApiSuccess<ReviewReplyDraft>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/draft-reply`,
        draftId ? { body, draft_id: draftId } : { body },
      )
      .pipe(map((res) => res.data));
  }

  updateTriage(tenantId: string, reviewId: string, payload: UpdateReviewTriageRequest): Observable<GoogleReview> {
    return this.http
      .patch<ApiSuccess<GoogleReview>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/triage`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  getSettings(tenantId: string): Observable<ReviewApprovalSettings> {
    return this.http
      .get<ApiSuccess<ReviewApprovalSettings>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/review-settings`)
      .pipe(map((res) => res.data));
  }

  updateSettings(
    tenantId: string,
    payload: Pick<ReviewApprovalSettings, 'approval_max_rating' | 'sensitive_keywords' | 'require_approval_for_all'>,
  ): Observable<ReviewApprovalSettings> {
    return this.http
      .put<ApiSuccess<ReviewApprovalSettings>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/review-settings`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  approveReply(tenantId: string, reviewId: string, draftId?: string): Observable<ReviewReplyDraft> {
    return this.http
      .post<ApiSuccess<ReviewReplyDraft>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/approve-reply`,
        draftId ? { draft_id: draftId } : {},
      )
      .pipe(map((res) => res.data));
  }

  sendReply(tenantId: string, reviewId: string, draftId?: string): Observable<ReviewReplyDraft> {
    return this.http
      .post<ApiSuccess<ReviewReplyDraft>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/send-reply`,
        draftId ? { draft_id: draftId } : {},
      )
      .pipe(map((res) => res.data));
  }

  history(tenantId: string, reviewId: string): Observable<ReviewReplyEvent[]> {
    return this.http
      .get<ApiSuccess<ReviewHistoryResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/${encodeURIComponent(reviewId)}/history`,
      )
      .pipe(map((res) => res.data.events));
  }

  bulkAction(
    tenantId: string,
    action: 'draft' | 'approve' | 'approve_and_send',
    reviewIds: string[],
  ): Observable<{ action: string; succeeded: string[]; failed: { id: string; code: string; message: string }[] }> {
    return this.http
      .post<
        ApiSuccess<{ action: string; succeeded: string[]; failed: { id: string; code: string; message: string }[] }>
      >(`${this.base}/tenants/${encodeURIComponent(tenantId)}/reviews/bulk-action`, {
        action,
        review_ids: reviewIds,
      })
      .pipe(map((res) => res.data));
  }
}
