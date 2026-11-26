/**
 * Shapes for the read-only WhatsApp insight endpoints and campaigns —
 * verified against `App\Application\Messaging\WhatsAppInsightsService` and
 * `App\Application\Messaging\CampaignService` (redesign backlog
 * BW-102/107/108/109/110).
 */

export interface WebhookLogEntry {
  id: string;
  provider_event_id: string;
  event_kind: string;
  action: string;
  delivery_status: string | null;
  message_delivery_id: string | null;
  lead_id: string | null;
  received_at: string;
}

export interface WebhookLogsResponse {
  mock_provider: boolean;
  logs: WebhookLogEntry[];
}

export interface ConsentSummary {
  leads_by_consent_status: { granted: number; declined: number; unknown: number };
  whatsapp_consent_records: { active: number; revoked: number };
  messageable_leads: number;
}

export interface UsageByTemplate {
  template_id: string | null;
  template_category: string | null;
  count: number;
  cost: string;
}

export interface UsageReport {
  days: number;
  total_messages: number;
  by_status: Record<string, number>;
  by_template: UsageByTemplate[];
  by_day: { day: string; count: number }[];
  total_cost: string;
  cost_basis: 'mock_provider_estimate' | 'provider_reported';
  mock_provider: boolean;
}

export interface WhatsAppConfig {
  mode: 'mock' | 'live';
  mock_provider: boolean;
  daily_message_quota: number;
  quiet_hours: { start: string; end: string; timezone: string };
  approved_templates: number;
  webhook_path: string;
  credentials_configured: { phone_number_id: boolean; access_token: boolean; app_secret: boolean };
}

export interface Campaign {
  id: string;
  name: string;
  template_id: string;
  segment_status: string | null;
  segment_tag: string | null;
  status: 'draft' | 'launched';
  recipients_total: number;
  outcomes: Record<string, number>;
  skip_reasons: Record<string, number>;
  mock_provider: boolean;
  launched_at: string | null;
  created_at: string;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
}

export interface CreateCampaignRequest {
  name: string;
  template_id: string;
  segment_status?: string;
  segment_tag?: string;
}
