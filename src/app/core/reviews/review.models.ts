/**
 * Field names verified against
 * `services/api_php/src/Application/Google/ReviewService::{representReview,representDraft}()`
 * and `App\Infrastructure\Repositories\ReviewReplyEventRepository`.
 *
 * Approval gate (`docs/ADR/0017-location-linking-and-review-approval-threshold.md`):
 * `requires_approval` is `true` when `rating <= 2` or the comment matches a
 * sensitive-keyword heuristic — `send-reply` 409s `APPROVAL_REQUIRED` unless
 * the draft has been through `approve-reply` first.
 */

export interface GoogleReview {
  id: string;
  tenant_id: string;
  location_id: string;
  external_review_id: string;
  author_display: string;
  rating: number;
  comment: string | null;
  internal_notes?: string | null;
  tags?: string[];
  assigned_user_id?: string | null;
  escalated?: boolean;
  escalated_at?: string | null;
  escalation_reason?: string | null;
  mock_provider: boolean;
  requires_approval: boolean;
  has_reply: boolean;
  reviewed_at: string;
  last_synced_at: string;
}

export interface UpdateReviewTriageRequest {
  internal_notes?: string | null;
  tags?: string[];
  assigned_user_id?: string | null;
  escalated?: boolean;
  escalation_reason?: string | null;
}

export interface ReviewApprovalSettings {
  approval_max_rating: number;
  sensitive_keywords: string[];
  require_approval_for_all: boolean;
  is_default: boolean;
}

export type ReplyStatus = 'draft' | 'approved' | 'sent';

export interface ReviewReplyDraft {
  id: string;
  tenant_id: string;
  review_id: string;
  generated_by: string;
  body: string;
  status: ReplyStatus;
  draft: boolean;
  /** Only present on the `draft-reply` response. */
  requires_approval?: boolean;
  approved_by: string | null;
  approved_at: string | null;
  /** Only present on the `send-reply` response. */
  external_reply_id?: string;
  mock_provider?: boolean;
  created_at: string;
  updated_at: string;
}

export type ReviewReplyEventType = 'drafted' | 'edited' | 'approved' | 'sent';

export interface ReviewReplyEvent {
  id: string;
  review_id: string;
  draft_id: string;
  event_type: ReviewReplyEventType;
  external_reply_id: string | null;
  actor_id: string;
  event_at: string;
}

export interface ReviewListFilters {
  rating?: number;
  status?: 'replied' | 'unreplied';
}

export interface ReviewListResponse {
  reviews: GoogleReview[];
}

export interface ReviewHistoryResponse {
  events: ReviewReplyEvent[];
}
