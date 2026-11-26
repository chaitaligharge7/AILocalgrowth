import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AcceptInviteRequest,
  AgencyAccount,
  AgencyCalendarEntry,
  AgencyClientLink,
  AgencyStaffAssignment,
  AgencyUsage,
  AssignStaffRequest,
  EnableAgencyRequest,
  InviteClientRequest,
  ListClientsResponse,
} from './agency.models';

/**
 * Typed wrappers for every `AgencyHandler` endpoint (blueprint §02 M16,
 * §04 "Agency/admin", §06 W09). Exact paths/methods/status codes verified
 * against `services/api_php/routes/v1.php`,
 * `src/Http/Handlers/AgencyHandler.php` and
 * `tests/Http/Handlers/AgencyHandlerTest.php` — not this task's prose.
 *
 * Two route families, deliberately kept separate (see
 * `AgencyService` (PHP) class docblock):
 * - `/tenants/{tenantId}/agency*` — resolved against the PATH tenant (the
 *   CLIENT side: enabling agency mode on your own tenant, and viewing/
 *   accepting/rejecting/revoking invites addressed to your own tenant).
 * - `/agency/*` (bare, no `{tenantId}`) — resolved against the CALLER's
 *   own agency account, found via their owner/admin memberships. There is
 *   deliberately no `agencyId` parameter anywhere in this service.
 */
@Injectable({ providedIn: 'root' })
export class AgencyService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  // --- Agency-management plane (bare /agency/* paths) -------------------

  /** `GET /agency/clients` — 404 NOT_FOUND if the caller has no active agency account. */
  listClients(): Observable<ListClientsResponse> {
    return this.http
      .get<ApiSuccess<ListClientsResponse>>(`${this.base}/agency/clients`)
      .pipe(map((res) => res.data));
  }

  /** `POST /agency/clients` — agency sends an invite to a client tenant (201, status `pending`). */
  inviteClient(payload: InviteClientRequest): Observable<AgencyClientLink> {
    return this.http
      .post<ApiSuccess<AgencyClientLink>>(`${this.base}/agency/clients`, payload)
      .pipe(map((res) => res.data));
  }

  /** `POST /agency/clients/{linkId}/revoke` — the agency ends its own side of the relationship. */
  revokeByAgency(linkId: string): Observable<AgencyClientLink> {
    return this.http
      .post<ApiSuccess<AgencyClientLink>>(`${this.base}/agency/clients/${encodeURIComponent(linkId)}/revoke`, {})
      .pipe(map((res) => res.data));
  }

  /** `POST /agency/clients/{linkId}/assign` — 409 LINK_NOT_ACTIVE unless the link is already `active`. */
  assignStaff(linkId: string, payload: AssignStaffRequest): Observable<AgencyStaffAssignment> {
    return this.http
      .post<ApiSuccess<AgencyStaffAssignment>>(`${this.base}/agency/clients/${encodeURIComponent(linkId)}/assign`, payload)
      .pipe(map((res) => res.data));
  }

  /** `GET /agency/clients/{linkId}/assignments`. */
  listAssignments(linkId: string): Observable<AgencyStaffAssignment[]> {
    return this.http
      .get<ApiSuccess<{ assignments: AgencyStaffAssignment[] }>>(
        `${this.base}/agency/clients/${encodeURIComponent(linkId)}/assignments`,
      )
      .pipe(map((res) => res.data.assignments));
  }

  /** `POST /agency/clients/{linkId}/assignments/{assignmentId}/revoke`. */
  revokeAssignment(linkId: string, assignmentId: string): Observable<AgencyStaffAssignment> {
    return this.http
      .post<ApiSuccess<AgencyStaffAssignment>>(
        `${this.base}/agency/clients/${encodeURIComponent(linkId)}/assignments/${encodeURIComponent(assignmentId)}/revoke`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /** `GET /agency/usage` — read-only pooled usage reporting. `pooled_billing_wired` is always `false` today (ADR 0047). */
  usage(): Observable<AgencyUsage> {
    return this.http.get<ApiSuccess<AgencyUsage>>(`${this.base}/agency/usage`).pipe(map((res) => res.data));
  }

  /** `GET /agency/calendar?start=&end=` — consolidated schedules across every active client link. Both params are required UTC ISO-8601 instants (backend 422s without them). */
  calendar(startUtcIso: string, endUtcIso: string): Observable<AgencyCalendarEntry[]> {
    return this.http
      .get<ApiSuccess<{ schedules: AgencyCalendarEntry[] }>>(`${this.base}/agency/calendar`, {
        params: { start: startUtcIso, end: endUtcIso },
      })
      .pipe(map((res) => res.data.schedules));
  }

  // --- Client-management plane (/tenants/{tenantId}/agency*) ------------

  /** `POST /tenants/{tenantId}/agency/enable` — owner/admin opts THEIR OWN tenant into also being an agency account. 409 ALREADY_AGENCY if called twice. */
  enable(tenantId: string, payload: EnableAgencyRequest = {}): Observable<AgencyAccount> {
    return this.http
      .post<ApiSuccess<AgencyAccount>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/agency/enable`, payload)
      .pipe(map((res) => res.data));
  }

  /** `GET /tenants/{tenantId}/agency-invites` — every invite (any status) addressed to this client tenant. Owner/admin only. */
  listInvitesForClient(tenantId: string): Observable<AgencyClientLink[]> {
    return this.http
      .get<ApiSuccess<{ invites: AgencyClientLink[] }>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/agency-invites`)
      .pipe(map((res) => res.data.invites));
  }

  /** `POST /tenants/{tenantId}/agency-invites/{inviteId}/accept` — the ONLY way a link becomes `active`. Client owner/admin only. */
  acceptInvite(tenantId: string, inviteId: string, payload: AcceptInviteRequest = {}): Observable<AgencyClientLink> {
    return this.http
      .post<ApiSuccess<AgencyClientLink>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/agency-invites/${encodeURIComponent(inviteId)}/accept`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  /** `PATCH /tenants/{tenantId}/agency-invites/{inviteId}/permissions` — granular client visibility/permission toggles. */
  updateClientPermissions(
    tenantId: string,
    inviteId: string,
    permissions: { content: boolean; reviews: boolean; analytics: boolean; leads: boolean; billing: boolean },
  ): Observable<AgencyClientLink> {
    return this.http
      .patch<ApiSuccess<AgencyClientLink>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/agency-invites/${encodeURIComponent(inviteId)}/permissions`,
        permissions,
      )
      .pipe(map((res) => res.data));
  }

  /** `POST /tenants/{tenantId}/agency-invites/{inviteId}/reject` — client declines a still-pending invite. */
  rejectInvite(tenantId: string, inviteId: string): Observable<AgencyClientLink> {
    return this.http
      .post<ApiSuccess<AgencyClientLink>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/agency-invites/${encodeURIComponent(inviteId)}/reject`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /** `POST /tenants/{tenantId}/agency-invites/{inviteId}/revoke` — client ends an active (or pending) relationship from its own side. */
  revokeByClient(tenantId: string, inviteId: string): Observable<AgencyClientLink> {
    return this.http
      .post<ApiSuccess<AgencyClientLink>>(
        `${this.base}/tenants/${encodeURIComponent(tenantId)}/agency-invites/${encodeURIComponent(inviteId)}/revoke`,
        {},
      )
      .pipe(map((res) => res.data));
  }
}
