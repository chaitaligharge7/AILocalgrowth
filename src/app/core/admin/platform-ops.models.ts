export interface OpsHealth {
  generated_at: string;
  webhooks: {
    provider_events: { by_status: Record<string, number>; by_provider: Record<string, number>; last_received_at: string | null };
    payment_events: { by_status: Record<string, number>; last_received_at: string | null };
    whatsapp: { last_24h_by_kind: Record<string, number>; last_received_at: string | null };
  };
  queues: {
    jobs_by_status: Record<string, number>;
    jobs_overdue_15m: number;
    outbox_by_status: Record<string, number>;
    outbox_oldest_pending_at: string | null;
  };
  connections: { by_provider_status: Record<string, number>; token_expired: number; token_expiring_7d: number };
  notes: string[];
}

export type OpsEventSource = 'provider' | 'payment' | 'whatsapp';

export interface OpsEvent {
  id: string;
  provider: string;
  event_id: string;
  status: string;
  verified: boolean | null;
  received_at: string;
  processed_at: string | null;
  tenant_name: string | null;
  detail: string | null;
}

export interface OpsFailures {
  days: number;
  counts: {
    publish_jobs_failed: number;
    ai_generations_not_completed: number;
    jobs_needing_attention: number;
    outbox_dead_letter: number;
  };
  jobs: { id: string; type: string; status: string; attempts: number; tenant_name: string | null; updated_at: string }[];
  publish_jobs: { id: string; provider: string; attempts: number; error_code: string | null; tenant_name: string; updated_at: string }[];
  notes: string[];
}

export interface AiUsage {
  days: number;
  totals: {
    generations: number;
    not_completed: number;
    tokens_in: number;
    tokens_out: number;
    recorded_cost: string;
    rows_with_recorded_cost: number;
  };
  by_provider_model: {
    provider: string;
    model: string;
    generations: number;
    not_completed: number;
    tokens_in: number;
    tokens_out: number;
    recorded_cost: string;
  }[];
  by_use_case: { use_case: string; generations: number; not_completed: number }[];
  daily: { day: string; generations: number; not_completed: number }[];
  top_tenants: { tenant_id: string; tenant_name: string; generations: number; tokens: number }[];
  not_completed: { id: string; use_case: string; provider: string; model: string; status: string; tenant_name: string; created_at: string }[];
  quota: { meter_code: string; wallets: number; limit_qty: number; used_qty: number; reserved_qty: number; near_limit_wallets: number }[];
  notes: string[];
}

export interface PlatformAdminUser {
  id: string;
  name: string;
  email: string;
  status: string;
  mfa_enrolled: boolean;
  mfa_last_verified_at: string | null;
  active_sessions: number;
  last_login_at: string | null;
  is_you: boolean;
}

export interface Announcement {
  id: string;
  kind: 'announcement' | 'maintenance';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  status: 'active' | 'retired';
  created_at: string;
}

export interface CreateAnnouncementRequest {
  kind: 'announcement' | 'maintenance';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  starts_at?: string;
  ends_at?: string;
  reason: string;
}

export interface SupportReport {
  days: number;
  created: number;
  closed: number;
  created_by_category: Record<string, number>;
  created_by_priority: Record<string, number>;
  resolution_hours: { average: number; median: number; p90: number } | null;
  open_now: number;
  open_age: { under_1_day: number; '1_to_3_days': number; '3_to_7_days': number; over_7_days: number };
  open_by_category: Record<string, number>;
  notes: string[];
}
