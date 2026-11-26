/**
 * Field names verified against
 * `services/api_php/src/Application/Tenancy/{TenantService,InviteService}.php`
 * and `tests/Http/Handlers/TenantHandlerTest.php`.
 */

export type RoleCode = 'owner' | 'admin' | 'editor' | 'analyst' | 'viewer';

export interface Tenant {
  id: string;
  display_name: string;
  legal_name: string | null;
  business_type: string | null;
  currency: string;
  timezone: string;
  country: string;
  status: string;
  caller_role: RoleCode;
  created_at: string;
  updated_at: string;
  /** Only present on the `POST /tenants` create response. */
  default_location_id?: string;
}

export interface CreateTenantRequest {
  display_name: string;
  legal_name?: string;
  business_type?: string;
  country?: string;
}

export interface UpdateTenantRequest {
  display_name?: string;
  legal_name?: string;
  business_type?: string;
  country?: string;
}

export interface TenantListResponse {
  tenants: Tenant[];
}

export interface CreateInviteRequest {
  email: string;
  role_code: RoleCode;
}

export interface Invite {
  id: string;
  tenant_id: string;
  email: string;
  role_code: RoleCode;
  status: 'sent';
  expires_at: string;
}

export interface AcceptInviteResponse {
  tenant_id: string;
  role: RoleCode | null;
  status: 'joined';
}
