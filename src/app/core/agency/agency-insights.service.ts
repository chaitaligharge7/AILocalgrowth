import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

export interface AgencyTeamMember {
  user_id: string;
  name: string;
  email: string;
  role_code: string;
  status: string;
  active_assignments: number;
  client_count: number;
}

export interface AgencyActivityEvent {
  id: string;
  tenant_name: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  created_at: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface AgencyClientOverview {
  link_id: string;
  client_tenant_id: string;
  client_display_name: string | null;
  locations: { id: string; name: string; category: string | null }[];
  google_status: 'connected' | 'not_connected';
  providers: { provider: string; status: string }[];
  brand_kit_set: boolean;
  counts: { content_items: number; leads: number; reviews: number; open_tickets: number };
  subscription_status: string | null;
  active_staff_assignments: number;
  checklist: ChecklistItem[];
  checklist_done: number;
  checklist_total: number;
}

/** `GET /agency/team`, `GET /agency/activity`, `GET /agency/clients/{linkId}/overview` (caller's own agency only). */
@Injectable({ providedIn: 'root' })
export class AgencyInsightsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  team(): Observable<AgencyTeamMember[]> {
    return this.http.get<ApiSuccess<{ members: AgencyTeamMember[] }>>(`${this.base}/agency/team`).pipe(map((r) => r.data.members));
  }

  activity(): Observable<AgencyActivityEvent[]> {
    return this.http.get<ApiSuccess<{ events: AgencyActivityEvent[] }>>(`${this.base}/agency/activity`).pipe(map((r) => r.data.events));
  }

  clientOverview(linkId: string): Observable<AgencyClientOverview> {
    return this.http
      .get<ApiSuccess<AgencyClientOverview>>(`${this.base}/agency/clients/${encodeURIComponent(linkId)}/overview`)
      .pipe(map((r) => r.data));
  }
}
