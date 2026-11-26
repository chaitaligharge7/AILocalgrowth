/**
 * Field names verified against
 * `services/api_php/src/Application/Analytics/AnalyticsService.php`
 * (`overview()`/`locationMetrics()`/`exportCsv()`) and
 * `services/api_php/src/Integrations/{Google,Meta}/Mock*Provider.php::fetchLocationMetrics()`
 * (ground-truthed directly from source, not from the blueprint prose alone)
 * — Sprint S6, blueprint §02 M12 "Analytics and reporting".
 */

export interface AuditCoverage {
  locations_total: number;
  locations_audited: number;
  /** 0-100, already rounded server-side to 1 decimal; 0.0 (never NaN/Infinity) when `locations_total` is 0. */
  percentage: number;
}

export interface PostCounts {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Blueprint §02 M12 "do not infer ... from arbitrary external data": from
 * S6 through S7 this was reported as `available: false`/`count: null`
 * because the CRM module (S7) hadn't shipped `leads` yet. Post-S8 fix
 * (`docs/ADR/0049-analytics-leads-count-breakdown.md`): `count` is now a
 * real `COUNT(*)` and `by_status` is an additive per-pipeline-status
 * breakdown — `available` is unconditionally `true` today, but the UI
 * should keep branching on it rather than assuming, the same way it
 * already does for every other card here.
 */
export interface LeadsSummary {
  available: boolean;
  count: number | null;
  note: string;
  /** Additive (post-S8 fix) — one count per `LeadStateMachine` status. Optional for older cached responses. */
  by_status?: Record<string, number>;
}

export interface SubscriptionUsageRow {
  meter_code: string;
  limit_qty: number;
  used_qty: number;
  reserved_qty: number;
  period_start: string;
  period_end: string;
}

/** `GET /tenants/{t}/analytics/overview` response. */
export interface AnalyticsOverview {
  generated_at: string;
  audit_coverage: AuditCoverage;
  posts: PostCounts;
  pending_reviews: number;
  leads: LeadsSummary;
  subscription_usage: SubscriptionUsageRow[];
}

/**
 * One metric's daily series. `value` is `null` (never coerced to `0`) for a
 * day the provider reported no data for — blueprint §02 M12 "missing vs
 * zero distinguished". Every rendering of this type MUST visually
 * distinguish `null` from `0` (e.g. "No data" vs "0").
 */
export interface MetricPoint {
  date: string;
  value: number | null;
}

export type MetricsByName = Record<string, MetricPoint[]>;

/** `GET /tenants/{t}/locations/{id}/metrics?provider=&start=&end=` response. */
export interface LocationMetricsResponse {
  tenant_id: string;
  location_id: string;
  provider: string;
  external_location_id: string;
  start: string;
  end: string;
  granularity: string;
  metrics: MetricsByName;
  provenance: string;
  mock_provider: boolean;
  fetched_at: string;
}

export type AnalyticsExportFormat = 'csv' | 'pdf';

/** Result of a successful `GET /tenants/{t}/analytics/export?format=csv` download. */
export interface AnalyticsExportResult {
  blob: Blob;
  filename: string;
}
