/**
 * Request/response shapes for `/tenants/{t}/leads*` — field names verified
 * against `services/api_php/src/Http/Handlers/LeadHandler.php`,
 * `src/Application/Leads/LeadService.php` and
 * `src/Application/Leads/LeadStateMachine.php` (ground truth per task
 * brief).
 */

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | 'archived';
export type LeadConsentStatus = 'granted' | 'declined' | 'unknown';
export type LeadActivityType =
  | 'note'
  | 'task'
  | 'reminder'
  | 'created'
  | 'status_change'
  | 'owner_assigned'
  | 'whatsapp_sent'
  | 'whatsapp_opt_out';

export const LEAD_ALL_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
  'archived',
];

export const LEAD_CONSENT_STATUSES: LeadConsentStatus[] = ['granted', 'declined', 'unknown'];

/** Activity types a tenant member may add via `addActivity()`; the rest are system-only. */
export const LEAD_CREATABLE_ACTIVITY_TYPES: Array<'note' | 'task' | 'reminder'> = ['note', 'task', 'reminder'];

/**
 * Mirrors `App\Application\Leads\LeadStateMachine::TRANSITIONS` exactly, so
 * the UI can hide/disable a transition the backend would reject with 409
 * `INVALID_STATE_TRANSITION` — UX convenience only; the backend
 * independently re-validates every transition.
 */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'qualified', 'lost', 'archived'],
  contacted: ['qualified', 'lost', 'archived'],
  qualified: ['proposal', 'lost', 'archived'],
  proposal: ['won', 'lost', 'archived'],
  won: ['archived'],
  lost: ['archived'],
  archived: [],
};

export function canTransitionLeadStatus(from: LeadStatus, to: LeadStatus): boolean {
  return (LEAD_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export function isLeadStatusTerminal(status: LeadStatus): boolean {
  return status === 'won' || status === 'lost' || status === 'archived';
}

export interface Lead {
  id: string;
  tenant_id: string;
  location_id: string | null;
  source: string;
  external_lead_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  owner_id: string | null;
  consent_status: LeadConsentStatus;
  created_at: string;
  updated_at: string;
  /** Present on list/detail responses (BW-099). */
  tags?: string[];
  /** Only present on `POST /leads` when the dedupe logic matched an existing lead instead of creating a new one. */
  deduped?: boolean;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  actor_id: string;
  type: LeadActivityType;
  note: string | null;
  due_at: string | null;
  created_at: string;
}

export interface LeadDetail extends Lead {
  activities: LeadActivity[];
  /** field_key => value for the tenant's custom lead fields that have a value (BW-099). */
  custom_fields?: Record<string, string>;
}

export type LeadCustomFieldType = 'text' | 'number' | 'date' | 'select';

/** A tenant-defined custom lead field (`GET /tenants/{t}/lead-fields`, BW-099). */
export interface LeadCustomFieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: LeadCustomFieldType;
  options: string[] | null;
}

export interface CreateLeadCustomFieldRequest {
  label: string;
  field_type: LeadCustomFieldType;
  options?: string[];
}

export interface LeadListResponse {
  leads: Lead[];
}

export interface LeadListFilters {
  status?: LeadStatus;
  owner_id?: string;
  /** Normalised (lower-case) tag text. */
  tag?: string;
  /** Inclusive UTC calendar dates, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
}

/** Inclusive UTC date range accepted by the summary endpoints. */
export interface LeadDateRange {
  from?: string;
  to?: string;
}

export interface CreateLeadRequest {
  name?: string;
  phone?: string;
  email?: string;
  location_id?: string;
  source: string;
  external_lead_id?: string;
  owner_id?: string;
  consent_status: LeadConsentStatus;
}

export interface UpdateLeadRequest {
  status?: LeadStatus;
  owner_id?: string | null;
}

/** `GET /tenants/{t}/leads/sources-summary` (BW-098) — source => count, real aggregate. */
export interface LeadSourcesSummary {
  by_source: Record<string, number>;
  from?: string | null;
  to?: string | null;
}

/** `GET /tenants/{t}/leads/status-summary` (BW-100) — one key per LeadStatus, 0 when empty. */
export interface LeadStatusSummary {
  by_status: Record<LeadStatus, number>;
  from?: string | null;
  to?: string | null;
}

export interface AddLeadActivityRequest {
  type: 'note' | 'task' | 'reminder';
  note: string;
  /** Required by the backend for type `task`/`reminder`; ignored for `note`. */
  due_at?: string;
}
