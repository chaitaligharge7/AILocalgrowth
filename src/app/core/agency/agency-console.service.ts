import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

export interface AgencyBilling {
  agency_tenant_id: string;
  subscription: { status: string; plan_code: string | null; plan_name: string | null; current_period_end: string | null; cancel_at: string | null } | null;
  usage_meters: { meter_code: string; limit_qty: number; used_qty: number; reserved_qty: number }[];
  invoices: { id: string; invoice_number: string; currency: string; total: string; status: string; issued_at: string | null }[];
  addon_purchases: {
    id: string;
    addon_name: string | null;
    quantity: number;
    amount: string;
    currency: string;
    status: string;
    mock_provider: boolean;
    created_at: string;
  }[];
  clients: {
    active: number;
    with_live_subscription: number;
    without_live_subscription: number;
    pooled_billing_opt_in: number;
    pooled_billing_wired: boolean;
  };
  agency_notes?: string[];
  notes: string[];
}

export interface AgencyBranding {
  brand_name: string;
  tagline: string;
  primary_color: string | null;
  accent_color: string | null;
  support_email: string;
  website_url: string;
  custom_domain: null;
  notes: string[];
}

export interface AgencyBrandingInput {
  brand_name: string;
  tagline: string;
  support_email: string;
  website_url: string;
  primary_color: string;
  accent_color: string;
}

export interface AgencyRole {
  code: string;
  name: string;
  scope: 'agency_management' | 'delegable_to_client';
  permissions: string[];
  active_assignments: number;
}

export interface AgencyNotice {
  kind: string;
  severity: 'info' | 'warning';
  client_tenant_id: string;
  client_name: string;
  link_id: string;
  message: string;
  at: string;
}

export interface AgencyClientMetrics {
  link_id: string;
  client_tenant_id: string;
  client_name: string | null;
  leads_new: number;
  content_created: number;
  posts_succeeded: number;
  posts_failed: number;
  reviews_new: number;
  avg_rating: number | null;
  open_tickets: number;
}

export interface AgencyAnalytics {
  days: number;
  client_count: number;
  totals: {
    leads_new: number;
    content_created: number;
    posts_succeeded: number;
    posts_failed: number;
    reviews_new: number;
    open_tickets: number;
    avg_rating: number | null;
  };
  clients: AgencyClientMetrics[];
  notes: string[];
}

/** Agency console pages (ADR 0057): billing, branding, roles, notifications, analytics. */
@Injectable({ providedIn: 'root' })
export class AgencyConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private readonly brandingSignal = signal<AgencyBranding | null>(null);
  /** Last branding read/saved this session; the agency shell renders it. */
  readonly currentBranding = this.brandingSignal.asReadonly();

  billing(): Observable<AgencyBilling> {
    return this.http.get<ApiSuccess<AgencyBilling>>(`${this.base}/agency/billing`).pipe(map((r) => r.data));
  }

  branding(): Observable<AgencyBranding> {
    return this.http.get<ApiSuccess<AgencyBranding>>(`${this.base}/agency/branding`).pipe(
      map((r) => r.data),
      tap((b) => this.brandingSignal.set(b)),
    );
  }

  saveBranding(input: AgencyBrandingInput): Observable<AgencyBranding> {
    return this.http.put<ApiSuccess<AgencyBranding>>(`${this.base}/agency/branding`, input).pipe(
      map((r) => r.data),
      tap((b) => this.brandingSignal.set(b)),
    );
  }

  roles(): Observable<{ roles: AgencyRole[]; notes: string[] }> {
    return this.http.get<ApiSuccess<{ roles: AgencyRole[]; notes: string[] }>>(`${this.base}/agency/roles`).pipe(map((r) => r.data));
  }

  notifications(): Observable<{ notifications: AgencyNotice[]; notes: string[] }> {
    return this.http
      .get<ApiSuccess<{ notifications: AgencyNotice[]; notes: string[] }>>(`${this.base}/agency/notifications`)
      .pipe(map((r) => r.data));
  }

  analytics(days: number): Observable<AgencyAnalytics> {
    return this.http
      .get<ApiSuccess<AgencyAnalytics>>(`${this.base}/agency/analytics`, { params: new HttpParams().set('days', days) })
      .pipe(map((r) => r.data));
  }
}
