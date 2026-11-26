import { RoleCode } from '../tenancy/tenant.models';

/** `GET /tenants/{t}/members` (`App\Application\Members\MemberService`). */
export interface TenantMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  location_ids?: string[];
  created_at: string;
}

export interface SetMemberLocationsResult {
  user_id: string;
  location_ids: string[];
}

export interface MemberListResponse {
  members: TenantMember[];
}

/** `GET /tenants/{t}/roles` — the read-only role/permission matrix. */
export interface RoleMatrixRole {
  code: RoleCode;
  name: string;
  permissions: string[];
}

export interface RolePermission {
  code: string;
  description: string | null;
}

export interface RoleMatrix {
  roles: RoleMatrixRole[];
  permissions: RolePermission[];
}

export interface ChangeRoleResult {
  user_id: string;
  role: RoleCode;
  previous_role: RoleCode;
}

export interface RemoveMemberResult {
  user_id: string;
  status: 'removed';
}

/** `GET /tenants/{t}/invites` — never contains a token. */
export interface TenantInvite {
  id: string;
  email: string;
  role: RoleCode;
  status: 'pending' | 'expired' | 'accepted';
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteListResponse {
  invites: TenantInvite[];
}
