/**
 * Field names verified against
 * `services/api_php/src/Application/Agency/AgencyService.php`'s
 * `represent{Agency,Link,Assignment}()` methods and
 * `tests/Http/Handlers/AgencyHandlerTest.php` — not a paraphrase of the
 * blueprint. See `docs/ADR/0045-agency-invites-client-approves.md`,
 * `docs/ADR/0046-policy-agency-delegation-extension.md`,
 * `docs/ADR/0047-pooled-billing-scope-decision.md`.
 */

export type AgencyStaffRoleCode = 'editor' | 'analyst' | 'viewer';

export type AgencyLinkStatus = 'pending' | 'active' | 'rejected' | 'revoked';

export type AgencyAssignmentStatus = 'active' | 'revoked';

export interface AgencyAccount {
  id: string;
  owner_tenant_id: string;
  brand_name: string;
  status: string;
  settings: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgencyLinkPermissions {
  pooled_billing?: boolean;
  content?: boolean;
  reviews?: boolean;
  analytics?: boolean;
  leads?: boolean;
  billing?: boolean;
}

export interface AgencyClientLink {
  id: string;
  agency_id: string;
  agency_brand_name?: string | null;
  client_tenant_id: string;
  status: AgencyLinkStatus;
  permissions: AgencyLinkPermissions | null;
  approved_by: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgencyStaffAssignment {
  id: string;
  agency_id: string;
  client_tenant_id: string;
  agency_user_id: string;
  role_code: AgencyStaffRoleCode;
  location_id: string | null;
  status: AgencyAssignmentStatus;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface ListClientsResponse {
  agency: AgencyAccount;
  clients: AgencyClientLink[];
}

export interface EnableAgencyRequest {
  brand_name?: string;
  settings?: Record<string, unknown>;
}

export interface InviteClientRequest {
  client_tenant_id: string;
  permissions?: AgencyLinkPermissions;
}

export interface AcceptInviteRequest {
  /** Optional ISO-8601 expiry for the now-active relationship; omit for no expiry. */
  expires_at?: string;
}

export interface AssignStaffRequest {
  user_id: string;
  role_code: AgencyStaffRoleCode;
  location_id?: string;
}

export interface AgencyUsageMeterTotal {
  meter_code: string;
  limit_qty: number;
  used_qty: number;
  reserved_qty: number;
  remaining_qty: number;
}

export interface AgencyClientUsage {
  client_tenant_id: string;
  client_display_name: string | null;
  pooled_billing_opt_in: boolean;
  subscription_status: string | null;
  plan_code: string | null;
  meters: AgencyUsageMeterTotal[];
}

export interface AgencyUsage {
  agency_id: string;
  /**
   * Honest, durable marker (ADR 0047): pooled usage REPORTING is real, but
   * no client's quota consumption is actually settled against the
   * agency's own wallet. Always `false` today — surface this prominently,
   * never hide it.
   */
  pooled_billing_wired: boolean;
  totals: AgencyUsageMeterTotal[];
  clients: AgencyClientUsage[];
}

export interface AgencyCalendarEntry {
  id: string;
  client_tenant_id: string;
  content_id: string;
  content_title: string | null;
  content_objective: string | null;
  channel: string;
  scheduled_utc: string;
  status: string;
  publish_job_id: string | null;
  publish_job_status: string | null;
  external_post_id: string | null;
  last_error_code: string | null;
}

export const AGENCY_STAFF_ROLE_CODES: AgencyStaffRoleCode[] = ['editor', 'analyst', 'viewer'];
