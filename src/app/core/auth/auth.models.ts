/**
 * Request/response shapes for `/auth/*`, `/me` — field names verified
 * against `services/api_php/src/Http/Handlers/AuthHandler.php`,
 * `src/Application/Auth/*Service.php` and
 * `tests/Http/Handlers/AuthHandlerTest.php` (ground truth per task brief).
 */

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  terms_accepted: boolean;
  phone_e164?: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  name: string;
  status: 'pending_verification';
  email_verified_at: string | null;
}

export type OtpPurpose = 'email_verify' | 'password_reset';

export interface OtpRequestRequest {
  destination: string;
  purpose: OtpPurpose;
}

export interface OtpRequestResponse {
  status: 'requested' | 'already_verified';
  challenge_id?: string;
  expires_in_minutes?: number;
}

export interface OtpVerifyRequest {
  destination: string;
  purpose: OtpPurpose;
  code: string;
}

export interface OtpVerifyResponse {
  status: 'verified';
  purpose: OtpPurpose;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  session_id: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutResponse {
  status: 'logged_out';
}

export interface PasswordResetConfirmRequest {
  email: string;
  code: string;
  new_password: string;
}

export interface PasswordResetConfirmResponse {
  status: 'password_reset';
}

export interface TenantMembershipSummary {
  tenant_id: string;
  role: string;
  status: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  phone_e164: string | null;
  email_verified_at: string | null;
  status: string;
  tenants: TenantMembershipSummary[];
}
