/**
 * Shapes for the Google Business Profile management endpoints — field names
 * verified against `services/api_php/src/Application/Google/GbpManagementService.php`
 * (redesign backlog BW-035..040, M04). Every outcome row carries
 * `mock_provider`: while Google runs in mock mode nothing is ever sent to a
 * real Google profile, and the UI must say so.
 */

export interface GbpConnection {
  id: string;
  status: string;
  external_account_id: string | null;
  last_checked_at: string | null;
  expires_at: string | null;
  granted_scopes: string[];
  capabilities: Record<'profile' | 'posts' | 'reviews', boolean>;
  missing_capabilities: string[];
}

export interface GbpHealthLocation {
  location_id: string;
  name: string;
  linked: boolean;
  external_location_id: string | null;
}

export interface GbpRunSummary {
  status: string;
  at: string | null;
  error_code: string | null;
}

export interface GbpHealth {
  mode: 'mock' | 'live';
  mock_provider: boolean;
  overall: 'healthy' | 'attention' | 'not_connected';
  attention: string[];
  connection: GbpConnection | null;
  locations: GbpHealthLocation[];
  last_runs: { profile: GbpRunSummary | null; review: GbpRunSummary | null };
  counters: {
    failed_pushes: number;
    unknown_pushes: number;
    failed_posts: number;
    unknown_posts: number;
    draft_posts: number;
  };
  checked_at: string;
}

export type HistorySource = 'sync_run' | 'push_job' | 'post';

export interface SyncHistoryItem {
  source: HistorySource;
  id: string;
  kind: string;
  status: string;
  error_code: string | null;
  error_hint: string | null;
  location_id: string | null;
  at: string | null;
  attempt_count: number;
  retryable: boolean;
  retry_hint: string | null;
  mock_provider: boolean | null;
}

export interface SyncHistory {
  mode: 'mock' | 'live';
  mock_provider: boolean;
  items: SyncHistoryItem[];
}

export type GbpPostType = 'update' | 'offer' | 'event';
export type GbpCtaType = 'book' | 'order' | 'learn_more' | 'sign_up' | 'call';
export type GbpPostStatus = 'draft' | 'published' | 'failed' | 'unknown';

export const GBP_POST_TYPES: GbpPostType[] = ['update', 'offer', 'event'];
export const GBP_CTA_TYPES: GbpCtaType[] = ['book', 'order', 'learn_more', 'sign_up', 'call'];

export interface GbpPost {
  id: string;
  location_id: string;
  post_type: GbpPostType;
  body: string;
  cta_type: GbpCtaType | null;
  cta_url: string | null;
  status: GbpPostStatus;
  external_post_id: string | null;
  error_code: string | null;
  error_hint: string | null;
  attempt_count: number;
  mock_provider: boolean | null;
  published_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GbpPostList {
  mock_provider: boolean;
  posts: GbpPost[];
}

export interface GbpPostRequest {
  post_type?: GbpPostType;
  body?: string;
  cta_type?: GbpCtaType | null;
  cta_url?: string | null;
}

export type PushField = 'description' | 'category' | 'phone' | 'website' | 'hours' | 'services' | 'service_areas';

export const PUSH_FIELDS: { code: PushField; label: string }[] = [
  { code: 'description', label: 'Business description (you write it below)' },
  { code: 'category', label: 'Primary category' },
  { code: 'phone', label: 'Phone number' },
  { code: 'website', label: 'Website' },
  { code: 'hours', label: 'Opening hours' },
  { code: 'services', label: 'Services' },
  { code: 'service_areas', label: 'Service areas' },
];

export type PhotoCategory = 'exterior' | 'interior' | 'product' | 'team' | 'logo' | 'other';

export const PHOTO_CATEGORIES: PhotoCategory[] = ['exterior', 'interior', 'product', 'team', 'logo', 'other'];

export interface GbpPushJob {
  id: string;
  location_id: string;
  kind: 'profile' | 'photo';
  summary: { fields?: string[]; asset_id?: string | null; photo_category?: string | null };
  status: 'succeeded' | 'failed' | 'unknown';
  external_ref: string | null;
  error_code: string | null;
  error_hint: string | null;
  attempt_count: number;
  mock_provider: boolean | null;
  last_attempt_at: string | null;
  created_at: string;
}

export interface GbpPushJobList {
  mock_provider: boolean;
  jobs: GbpPushJob[];
}

export interface ProfilePushRequest {
  fields: PushField[];
  description?: string;
}

export interface PhotoPushRequest {
  asset_id: string;
  photo_category: PhotoCategory;
}
