/** Field names verified against `CampaignHandler` -> `CampaignService` / `PublishingInsightsService` (services/api_php). */

export type CampaignChannel = 'google' | 'meta_page' | 'meta_instagram';

export interface ChannelRule {
  label: string;
  max_chars: number;
  note: string;
}

export interface ScheduledItem {
  content_id: string;
  title: string | null;
  channel: CampaignChannel;
  content_status: string;
  scheduled_utc: string;
  schedule_status: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string | null;
  starts_on: string | null;
  ends_on: string | null;
  item_count: number;
  status_counts: Record<string, number>;
  published_count: number;
  created_at: string;
  updated_at: string;
  scheduled_items?: ScheduledItem[];
}

export interface CampaignJob {
  id: string;
  status: string;
  attempts: number;
  external_post_id: string | null;
  last_error_code: string | null;
  provider: string;
  mock_provider: boolean;
}

export interface CampaignItem {
  item_id: string;
  content_id: string;
  title: string | null;
  body: string;
  location_id: string;
  intended_channel: CampaignChannel;
  content_status: string;
  scheduled_utc: string | null;
  schedule_status: string | null;
  scheduled_channel: string | null;
  publish_job: CampaignJob | null;
}

export interface CampaignDetail extends Campaign {
  channel_rules: Record<CampaignChannel, ChannelRule>;
  items: CampaignItem[];
}

export interface CampaignRequest {
  name: string;
  objective?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
}

export interface ComposeRequest {
  location_id: string;
  body: string;
  channels: CampaignChannel[];
  variants?: Partial<Record<CampaignChannel, string>>;
  title?: string;
}

export interface CampaignReport {
  campaign: { id: string; name: string; objective: string | null; starts_on: string | null; ends_on: string | null };
  items_total: number;
  channels: {
    channel: CampaignChannel;
    label: string;
    items: number;
    drafts: number;
    pending_approval: number;
    approved: number;
    scheduled: number;
    published: number;
    failed: number;
    cancelled: number;
  }[];
  publishing: {
    succeeded: number;
    failed: number;
    in_flight: number;
    cancelled: number;
    not_scheduled: number;
    attempts_total: number;
    success_rate_pct: number | null;
  };
  mock_provider: boolean;
  engagement: { available: boolean; reason: string };
}

export interface MonitorJob {
  id: string;
  status: string;
  provider: string;
  channel: string;
  content_id: string;
  content_title: string | null;
  attempts: number;
  last_outcome: string | null;
  last_error_code: string | null;
  external_post_id: string | null;
  scheduled_utc: string;
  next_run_at: string | null;
  updated_at: string;
  retryable: boolean;
  mock_provider: boolean;
}

export interface MonitorResponse {
  jobs: MonitorJob[];
  status_counts: Record<string, number>;
  viewer_can_retry: boolean;
}

export interface PerformanceResponse {
  from: string;
  to: string;
  totals: {
    scheduled: number;
    succeeded: number;
    failed: number;
    in_flight: number;
    cancelled: number;
    success_rate_pct: number | null;
    avg_attempts_per_success: number | null;
  };
  by_channel: {
    channel: string;
    provider: string;
    total: number;
    succeeded: number;
    failed: number;
    in_flight: number;
    cancelled: number;
    success_rate_pct: number | null;
  }[];
  by_day: { day: string; scheduled: number; succeeded: number; failed: number }[];
  mock_provider: boolean;
  engagement: { available: boolean; reason: string };
  timezone_note: string;
}

export interface PublishingAuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}
