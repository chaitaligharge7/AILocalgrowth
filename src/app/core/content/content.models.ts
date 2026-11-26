/**
 * Field names verified against
 * `services/api_php/src/Application/Content/ContentService::represent()`
 * and `tests/Http/Handlers/ContentHandlerTest.php`.
 *
 * Status follows the blueprint §2.18 state machine
 * (`App\Application\Content\ContentStateMachine`); S2 only drives
 * draft -> pending_approval -> approved (approve) or -> draft (reject).
 * Only `draft` is PATCH-able — editing anything else 409s with
 * `CONTENT_NOT_EDITABLE`.
 */

export type ContentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export interface ContentItem {
  id: string;
  tenant_id: string;
  location_id: string;
  creator_id: string;
  objective: string;
  title: string | null;
  body: string;
  language: string;
  status: ContentStatus;
  draft: boolean;
  current_revision_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContentRequest {
  location_id: string;
  objective: string;
  body: string;
  title?: string;
  language?: string;
  assets_json?: string[];
}

export interface UpdateContentRequest {
  body?: string;
  title?: string;
  language?: string;
  assets_json?: string[];
}

export interface ApproveContentRequest {
  decision?: 'approve' | 'reject';
  comment?: string;
}

export interface ContentListResponse {
  contents: ContentItem[];
}
