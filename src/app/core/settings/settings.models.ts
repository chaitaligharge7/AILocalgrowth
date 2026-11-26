/** `GET|PUT /tenants/{t}/notification-preferences` (`App\Application\Settings\SettingsService`). */
export interface NotificationPreference {
  event_type: string;
  label: string;
  enabled: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
}

export interface NotificationPreferenceResponse {
  preferences: NotificationPreference[];
}

/** `GET /tenants/{t}/activity-log` — the tenant's audit trail (owner/admin only). */
export interface ActivityEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  /** Null when the actor is not a member of this tenant (e.g. an outsider's denied probe). */
  actor_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityLogResponse {
  events: ActivityEvent[];
  actions: string[];
  filters: { action: string | null; from: string | null; to: string | null; limit: number };
}

export interface ActivityLogFilters {
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** `GET|POST /tenants/{t}/data-requests` — recorded requests only; fulfilled manually. */
export type DataRequestType = 'export' | 'erasure';

export interface DataRequest {
  id: string;
  type: DataRequestType;
  status: string;
  requested_by: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface DataRequestListResponse {
  requests: DataRequest[];
  note: string;
}

export interface CreatedDataRequest {
  id: string;
  type: DataRequestType;
  status: 'pending';
}
