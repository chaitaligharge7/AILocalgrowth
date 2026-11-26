/**
 * Field names verified against
 * `services/api_php/src/Application/Google/{AuditService,AuditScoringEngine}.php`
 * and `services/api_php/src/Infrastructure/Repositories/AuditActionRepository.php`.
 *
 * Tri-state check evaluation per blueprint §02 M05 "missing data is NOT
 * scored as zero without explanation; evidence coverage separately
 * displayed" — `unknown` must never be rendered identically to `fail`.
 */

export type CheckState = 'pass' | 'fail' | 'unknown';

export interface AuditCheck {
  code: string;
  label: string;
  weight: number;
  state: CheckState;
  value: unknown;
  provenance: 'tenant_data' | 'mock' | 'unverified_manual' | null;
}

export type RecommendationSeverity = 'needs_evidence' | 'action_needed';

export interface AuditRecommendation {
  rule_code: string;
  label: string;
  severity: RecommendationSeverity;
  remediation: string;
}

/**
 * `audit_actions` row. There is no dismiss/accept endpoint yet (backend
 * gap — see `AuditComponent`'s doc comment), so `status` is always the
 * server-assigned `"open"` today; this UI only ever displays it.
 */
export interface AuditAction {
  id: string;
  tenant_id: string;
  audit_id: string;
  rule_code: string;
  status: string;
  owner_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEvidence {
  rule_set_version: string;
  mock_provider_used: boolean;
  manual_evidence_used: boolean;
  checks: AuditCheck[];
}

export interface ProfileAudit {
  id: string;
  tenant_id: string;
  location_id: string;
  rule_set_id: string;
  /** A product-generated readiness indicator — never a search ranking. See `readiness_score_note`. */
  readiness_score: number;
  readiness_score_note: string;
  coverage_pct: number;
  evidence: AuditEvidence;
  recommendations: AuditRecommendation[];
  actions: AuditAction[];
  completed_at: string;
  created_at: string;
}

export interface CreateAuditRequest {
  manual_evidence_json?: Record<string, unknown>;
}

export interface AuditHistoryResponse {
  audits: ProfileAudit[];
}
