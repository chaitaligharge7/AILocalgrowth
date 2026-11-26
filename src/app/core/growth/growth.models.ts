/** Growth score, rule-based recommendations, action items and dashboard widgets (ADR 0059). */

export interface GrowthComponent {
  code: string;
  label: string;
  weight: number;
  source: string;
  status: 'scored' | 'insufficient_data';
  value: number | null;
  effective_weight_pct: number | null;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface GrowthHistoryPoint {
  date: string;
  score: number | null;
  coverage_pct: number;
}

export interface GrowthScore {
  generated_at: string;
  method: 'transparent-formula';
  is_ai: false;
  formula_version: string;
  min_coverage_pct: number;
  score: number | null;
  band: 'strong' | 'fair' | 'needs_attention' | null;
  coverage_pct: number;
  explanation: string;
  components: GrowthComponent[];
  history: GrowthHistoryPoint[];
  history_note: string;
}

export interface Recommendation {
  code: string;
  priority: 'high' | 'medium' | 'low';
  basis: 'rule-based';
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
  action: { label: string; web_path: string; mobile_route: string };
  /** True when THIS user dismissed or snoozed it (only returned with include_dismissed). */
  dismissed?: boolean;
  /** ISO time a snooze ends; null for "dismissed until restored". */
  dismissed_until?: string | null;
}

export interface RecommendationsResponse {
  generated_at: string;
  method: 'rule-based';
  is_ai: false;
  note: string;
  /** How many of this user's recommendations are currently hidden. */
  dismissed_count?: number;
  recommendations: Recommendation[];
}

export interface ActionItem {
  type: 'content_approval' | 'review_reply' | 'failed_post' | 'uncontacted_leads';
  title: string;
  detail: string;
  created_at: string | null;
  web_path: string;
  mobile_route: string;
}

export interface ActionItems {
  generated_at: string;
  counts: { content_approvals: number; review_replies: number; failed_posts: number; uncontacted_leads: number };
  total: number;
  list_cap: number;
  items: ActionItem[];
}

export interface DashboardWidget {
  code: string;
  label: string;
  visible: boolean;
}

export interface DashboardWidgets {
  widgets: DashboardWidget[];
  is_default: boolean;
}

export type GoalMetricCode = 'reviews_total' | 'average_rating' | 'audit_score' | 'leads_in_period' | 'posts_published';

export interface GoalMetric {
  code: GoalMetricCode;
  label: string;
  unit: string;
  kind: 'point' | 'period';
  max: number | null;
  source: string;
  /** Real value right now for point metrics; null for period metrics or when there is no data. */
  current_value: number | null;
}

export type GoalStatus = 'in_progress' | 'achieved' | 'missed' | 'no_data';

export interface Goal {
  id: string;
  metric: GoalMetricCode;
  label: string;
  unit: string;
  kind: 'point' | 'period';
  source: string;
  target_value: number;
  baseline_value: number | null;
  /** Null when the metric has no data yet: shown as "no data", never as 0. */
  current_value: number | null;
  progress_pct: number | null;
  remaining: number | null;
  status: GoalStatus;
  starts_on: string;
  deadline_on: string;
  days_left: number;
  created_at: string;
}

export interface GoalsResponse {
  generated_at: string;
  note: string;
  can_edit: boolean;
  max_active_goals: number;
  metrics: GoalMetric[];
  goals: Goal[];
}

export interface GoalInput {
  metric: GoalMetricCode;
  target_value: string;
  deadline_on: string;
  starts_on?: string;
}
