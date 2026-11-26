/**
 * Field names verified against
 * `services/api_php/src/Application/Google/IntegrationService::represent()`/`oauthStart()`/`oauthCallback()`
 * and `services/api_php/src/Application/Google/LocationSyncService::sync()`
 * (ground-truthed directly from source, not from the blueprint prose alone).
 */

export type ProviderConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'reauth_required'
  | 'expired'
  | 'error'
  | 'revoked';

export interface ProviderConnection {
  id: string;
  tenant_id: string;
  provider: string;
  external_account_id: string;
  scopes: string[];
  mock_provider: boolean;
  status: ProviderConnectionStatus;
  expires_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `POST /tenants/{t}/integrations/{provider}/oauth/start` response (Sprint S6: `provider` is `"google"` or `"meta"`). */
export interface OauthStartResponse {
  /** Added in Sprint S6 — the backend has always echoed it (`IntegrationService::oauthStart()`), the Angular type just hadn't named it yet. Optional so S3-era test fixtures that omit it still type-check. */
  provider?: string;
  state: string;
  /**
   * Mock mode: this URL already points back at this codebase's own
   * `GET /integrations/{provider}/oauth/callback` with a ready-to-use
   * `state`+`code` baked in — calling it immediately "connects" the mock
   * account (see `IntegrationService` class docblock and
   * `docs/ADR/0018-angular-oauth-mock-callback-drive.md`). Live mode: not
   * reachable (the production adapter fails closed).
   */
  authorize_url: string;
  expires_at: string;
  mock_provider: boolean;
}

/** `GET /integrations/{provider}/oauth/callback` response: a `ProviderConnection` plus the auto-linked location, if any. */
export interface OauthCallbackResponse extends ProviderConnection {
  linked_location_id: string | null;
}

export interface IntegrationListResponse {
  connections: ProviderConnection[];
}

/**
 * `POST /tenants/{t}/integrations/{connectionId}/location-links` request/response
 * (Sprint S6 multi-location/multi-page picker, blueprint §02 M04/M13).
 * Field names verified against
 * `App\Application\Google\IntegrationService::createLocationLink()`.
 *
 * Backend gap (see `docs/ADR/0037-angular-meta-location-link-free-text-picker.md`):
 * there is no `GET` endpoint that lists a connection's eligible
 * Pages/Instagram-Professional targets (`listAccountLocations()` is only
 * called server-side, to re-validate this request) — so this screen cannot
 * render a real dropdown of "pick a Page"; the caller must already know the
 * `external_location_id` they want linked (shown, for the mock provider, in
 * the help manual / sprint report). Same category of gap as
 * `docs/ADR/0014-angular-asset-list-and-location-id-workarounds.md`.
 */
export interface CreateLocationLinkRequest {
  location_id: string;
  external_location_id: string;
}

export interface LocationLink {
  id: string;
  tenant_id: string;
  location_id: string;
  connection_id: string;
  external_location_id: string;
  status: string;
  /** True if this call created a new link row; false if it reassigned an existing one (upsert). */
  created: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalLocation {
  external_location_id: string;
  display_name: string;
  linked_location_id: string | null;
  linked_location_name: string | null;
}

export interface ExistingLocationLink {
  id: string;
  location_id: string;
  location_name: string | null;
  external_location_id: string;
  status: string;
}

export interface ExternalLocationsResponse {
  connection_id: string;
  provider: string;
  mock_provider: boolean;
  external_locations: ExternalLocation[];
  existing_links: ExistingLocationLink[];
}

export interface TenantLocationOption {
  id: string;
  name: string;
  city?: string | null;
  status: string;
}

/** `POST /tenants/{t}/locations/{id}/sync` response. */
export interface LocationSyncResponse {
  location_id: string;
  connection_id: string;
  profile_sync_run_id: string;
  review_sync_run_id: string;
  reviews_fetched: number;
  profile_snapshot: Record<string, unknown> | null;
  mock_provider: boolean;
  synced_at: string;
}
