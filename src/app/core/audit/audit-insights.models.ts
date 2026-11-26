/**
 * Shapes for the audit-insights endpoints — field names verified against
 * `services/api_php/src/Application/Google/{AuditInsightsService,ProfileAnalysisService}.php`
 * (redesign backlog BW-045/046/048/049/050).
 */
import { CheckState } from './audit.models';

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'dismissed';

export const TASK_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'dismissed'];

export interface AuditHeader {
  id: string;
  completed_at: string;
  readiness_score: number;
  coverage_pct: number;
}

export interface AuditTask {
  id: string;
  rule_code: string;
  label: string;
  remediation: string;
  weight: number | null;
  severity: 'needs_evidence' | 'action_needed' | null;
  status: TaskStatus;
  owner_id: string | null;
  owner_name: string | null;
  audit_id: string;
  audit_completed_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export interface TaskBoard {
  location_id: string;
  latest_audit: AuditHeader | null;
  counts: Record<TaskStatus, number>;
  items: AuditTask[];
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  owner_id?: string | null;
}

export type CheckChange = 'improved' | 'regressed' | 'unchanged' | 'evidence_added' | 'evidence_lost';

export interface AuditCompareCheck {
  code: string;
  label: string;
  weight: number;
  from_state: CheckState;
  to_state: CheckState;
  change: CheckChange;
}

export interface TrendPoint {
  audit_id: string;
  completed_at: string;
  readiness_score: number;
  coverage_pct: number;
}

export interface AuditComparison {
  location_id: string;
  comparable: boolean;
  reason?: string;
  from?: AuditHeader;
  to?: AuditHeader;
  score_delta?: number;
  coverage_delta?: number;
  summary?: Record<CheckChange, number>;
  checks?: AuditCompareCheck[];
  trend: TrendPoint[];
  readiness_score_note: string;
}

export type ExportFormat = 'html' | 'csv' | 'json';

export type FieldComparison = 'match' | 'differs' | 'local_only' | 'google_only' | 'missing' | 'not_synced';

export interface AnalysisSide {
  present: boolean;
  value: unknown;
}

export interface AnalysisField {
  code: string;
  label: string;
  rule_code: string | null;
  local: AnalysisSide;
  google: AnalysisSide | null;
  comparison: FieldComparison;
  suggestion: string | null;
  detail?: { missing_on_google: string[]; only_on_google: string[] };
}

export interface ProfileAnalysis {
  location_id: string;
  google_snapshot: {
    available: boolean;
    mock_provider: boolean | null;
    fetched_at: string | null;
    provenance: string | null;
  };
  fields: AnalysisField[];
  summary: { fields_total: number; complete: number; needs_attention: number; differs_from_google: number };
  note: string;
}

export interface KeywordBasis {
  type: 'category' | 'city' | 'service' | 'service_area';
  value: string;
}

export interface KeywordSuggestion {
  keyword: string;
  kind: string;
  basis: KeywordBasis[];
  estimated: true;
  /** Always null: LocalGrowth never invents search volume. */
  volume: null;
}

export interface KeywordSuggestions {
  location_id: string;
  generated: true;
  keywords: KeywordSuggestion[];
  count: number;
  needs_input: string[];
  note: string;
  generated_at: string;
}
