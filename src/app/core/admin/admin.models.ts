/**
 * Request/response shapes for `/admin/*` — field names verified against
 * `services/api_php/src/Http/Handlers/{AdminAuthHandler,FeatureFlagAdminHandler,
 * TenantAdminHandler,PlanAdminHandler,JobAdminHandler,AuditEventAdminHandler}.php`
 * and their `src/Application/PlatformAdmin/*Service.php` counterparts
 * (ground truth per task brief). Every `/admin/*` call besides
 * `POST /admin/auth/mfa/verify` requires BOTH a normal bearer access token
 * AND the `X-Admin-Session` header — enforced server-side by
 * `App\Security\AdminAuthGuard`, attached client-side by
 * `adminSessionInterceptor`.
 */

export interface AdminMfaVerifyRequest {
  code: string;
}

export interface AdminMfaVerifyResponse {
  admin_session_token: string;
  /** ISO-8601; the session's 10-minute TTL per `AdminAuthService::ADMIN_SESSION_TTL_MINUTES`. */
  expires_at: string;
}

export type FeatureFlagScopeType = 'global' | 'tenant';

export interface FeatureFlag {
  id: string;
  flag_key: string;
  scope_type: FeatureFlagScopeType;
  scope_id: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagListResponse {
  feature_flags: FeatureFlag[];
}

export interface PatchFeatureFlagRequest {
  flag_key: string;
  scope_type: FeatureFlagScopeType;
  scope_id?: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  /** Required — the backend 422s without it (`AdminAuditTrail::requireReason`). */
  reason: string;
}

export type AdminTenantStatus = 'active' | 'suspended';

export interface AdminTenant {
  id: string;
  display_name: string;
  legal_name: string | null;
  status: AdminTenantStatus;
  owner_user_id: string;
  currency: string;
  country: string;
  created_at: string;
  updated_at: string;
}

export interface AdminTenantListResponse {
  tenants: AdminTenant[];
}

export interface UpdateTenantStatusRequest {
  status: AdminTenantStatus;
  /** Required — the backend 422s without it. */
  reason: string;
}

export type BillingPeriod = 'monthly' | 'yearly';
export type TaxBehavior = 'inclusive' | 'exclusive';

export interface AdminPlanVersion {
  id: string;
  version_no: number;
  billing_period: BillingPeriod;
  price_inr: string;
  tax_behavior: TaxBehavior;
  feature_limits: Record<string, number>;
  effective_from: string;
  created_at: string;
}

export interface AdminPlan {
  id: string;
  code: string;
  display_name: string;
  status: string;
  versions: AdminPlanVersion[];
}

export interface AdminPlanListResponse {
  plans: AdminPlan[];
}

export interface CreatePlanRequest {
  plan_code: string;
  /** Required only when plan_code does not already exist. */
  display_name?: string;
  billing_period: BillingPeriod;
  price_inr: number | string;
  tax_behavior?: TaxBehavior;
  feature_limits: Record<string, number>;
  /** Required — the backend 422s without it. */
  reason: string;
}

export interface CreatePlanResponse {
  plan: { id: string; code: string; display_name: string; status: string };
  version: AdminPlanVersion;
}

export type AdminJobType = 'publish' | 'notification';

export interface AdminJob {
  type: AdminJobType;
  id: string;
  tenant_id: string | null;
  status: string;
  attempts: number;
  last_error_code?: string | null;
  next_run_at?: string | null;
  event_type?: string;
  available_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminJobListResponse {
  jobs: AdminJob[];
}

export interface RetryJobRequest {
  type: AdminJobType;
  /** Required — the backend 422s without it. */
  reason: string;
}

export interface AdminAuditEvent {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminAuditEventListResponse {
  audit_events: AdminAuditEvent[];
}

export interface AdminAuditEventFilters {
  tenant_id?: string;
  actor_id?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}
