import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  CreateLocationLinkRequest,
  ExternalLocationsResponse,
  IntegrationListResponse,
  LocationLink,
  OauthCallbackResponse,
  OauthStartResponse,
  ProviderConnection,
  TenantLocationOption,
} from './integration.models';

/** The only two providers `App\Integrations\ProviderRegistry` supports as of Sprint S6. */
export type IntegrationProvider = 'google' | 'meta';

/**
 * Wraps `POST /tenants/{t}/integrations/{provider}/oauth/start`,
 * `GET /integrations/{provider}/oauth/callback`, `GET /tenants/{t}/integrations`,
 * `POST /tenants/{t}/integrations/{id}/disconnect`,
 * `POST /tenants/{t}/integrations/{id}/location-links`
 * (`App\Http\Handlers\IntegrationHandler` → `App\Application\Google\IntegrationService`,
 * which — despite the namespace, kept for S3 compatibility — dispatches
 * across providers as of Sprint S6).
 *
 * The callback route is deliberately NOT under `/tenants/{t}` and carries no
 * bearer token server-side — it is authorized by the signed `state` param a
 * real Google/Meta redirect would echo back. See {@link completeOauthCallback}
 * and `docs/ADR/0018-angular-oauth-mock-callback-drive.md` for how this
 * screen drives that leg in mock mode without a real consent screen to
 * redirect a browser to.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * `provider` defaults to `"google"` for exact backward compatibility with
   * every S3-era caller/test — Sprint S6 callers pass `"meta"` explicitly.
   * Hits `POST /tenants/{t}/integrations/meta/oauth/start` (not
   * `.../integrations/oauth/start?provider=meta`) because that is the
   * literal route the backend added for Meta (`IntegrationHandler::oauthStartMeta()`),
   * mirroring Google's own route shape exactly.
   */
  oauthStart(tenantId: string, provider: IntegrationProvider = 'google'): Observable<OauthStartResponse> {
    return this.http
      .post<ApiSuccess<OauthStartResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/integrations/${provider}/oauth/start`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /**
   * Drives the "browser redirect back from Google" leg of the OAuth dance
   * for the mock provider. `authorizeUrl` is the exact string the backend's
   * `oauthStart()` returned (never reconstructed client-side, so this stays
   * driven by the real backend response rather than an assumption about the
   * callback contract). Only its path+query is reused — see the ADR for why
   * a relative same-origin request is used instead of a full-page
   * navigation to the absolute URL.
   */
  completeOauthCallback(authorizeUrl: string): Observable<OauthCallbackResponse> {
    const relativePath = IntegrationService.toRelativePath(authorizeUrl);
    if (!IntegrationService.isOwnCallbackPath(relativePath)) {
      // Mirrors the Flutter client's `OAUTH_EXTERNAL_REDIRECT_UNSUPPORTED`
      // guard (see the ADR's "Reconciliation" section): a real (non-mock)
      // `authorize_url` would be an external `accounts.google.com/...`
      // consent page, which a same-origin XHR could never load correctly.
      // Fail loudly here instead of silently requesting the wrong path.
      return throwError(
        () =>
          new Error(
            'This authorize_url does not look like this API\'s own mock oauth callback — ' +
              'driving it as a background request is unsupported. A real (non-mock) Google ' +
              'consent flow needs a full-page redirect, not implemented yet.',
          ),
      );
    }
    return this.http.get<ApiSuccess<OauthCallbackResponse>>(relativePath).pipe(map((res) => res.data));
  }

  list(tenantId: string): Observable<ProviderConnection[]> {
    return this.http
      .get<ApiSuccess<IntegrationListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/integrations`)
      .pipe(map((res) => res.data.connections));
  }

  disconnect(tenantId: string, connectionId: string): Observable<ProviderConnection> {
    return this.http
      .post<ApiSuccess<ProviderConnection>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(connectionId)}/disconnect`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /**
   * `POST /tenants/{t}/integrations/{connectionId}/location-links` — Sprint
   * S6 multi-location/multi-page picker (blueprint §02 M04/M13). See
   * `CreateLocationLinkRequest`'s doc comment for the backend gap that
   * limits this to a free-text `external_location_id` on the calling
   * screen rather than a real dropdown.
   */
  createLocationLink(
    tenantId: string,
    connectionId: string,
    payload: CreateLocationLinkRequest,
  ): Observable<LocationLink> {
    return this.http
      .post<ApiSuccess<LocationLink>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(connectionId)}/location-links`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  /**
   * `GET /tenants/{t}/integrations/{connectionId}/external-locations` —
   * Lists eligible Google Business Profile / Meta targets for the
   * multi-location picker.
   */
  listExternalLocations(tenantId: string, connectionId: string): Observable<ExternalLocationsResponse> {
    return this.http
      .get<ApiSuccess<ExternalLocationsResponse>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(connectionId)}/external-locations`,
      )
      .pipe(map((res) => res.data));
  }

  /**
   * `GET /tenants/{t}/locations` — Lists internal business locations for the
   * multi-location picker dropdown.
   */
  listTenantLocations(tenantId: string): Observable<TenantLocationOption[]> {
    return this.http
      .get<ApiSuccess<{ locations: TenantLocationOption[] }>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations`,
      )
      .pipe(map((res) => res.data.locations ?? []));
  }

  /** True when `authorize_url` points to a real external OAuth consent screen (e.g. accounts.google.com). */
  isExternalAuthorizeUrl(authorizeUrl: string): boolean {
    const relativePath = IntegrationService.toRelativePath(authorizeUrl);
    return !IntegrationService.isOwnCallbackPath(relativePath) && /^https?:\/\//i.test(authorizeUrl);
  }

  /**
   * `authorize_url` is an absolute URL built from the backend's own
   * `APP_URL` (e.g. `http://localhost:8080/api/v1/integrations/google/oauth/callback?state=...&code=...`).
   * Reusing it as-is would either leave the SPA to render raw JSON (a full
   * navigation) or hit a different origin with no CORS headers configured
   * (a background XHR in local dev, where the Angular dev-server and PHP
   * dev-server run on different ports). Stripping it down to its
   * path+query and requesting that keeps the exact real state/code the
   * backend minted while staying same-origin — in local dev that is
   * `ng serve`'s own proxy (`proxy.conf.json` forwards `/api/*`), and in
   * production the API is reverse-proxied under the same origin as the
   * app per `API_BASE_URL`'s own doc comment.
   */
  private static toRelativePath(absoluteUrl: string): string {
    try {
      const url = new URL(absoluteUrl, window.location.origin);
      return `${url.pathname}${url.search}`;
    } catch {
      return absoluteUrl;
    }
  }

  /**
   * True only for this API's own mock oauth callback path — see
   * {@link completeOauthCallback}. Covers both `/integrations/google/oauth/callback`
   * and `/integrations/meta/oauth/callback` (Sprint S6).
   */
  private static isOwnCallbackPath(relativePath: string): boolean {
    return /\/integrations\/(google|meta)\/oauth\/callback(\?|$)/.test(relativePath);
  }
}
