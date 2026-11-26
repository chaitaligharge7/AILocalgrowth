/** Platform console read models — mirrors `PlatformInsightsService` (PHP). Every figure is a COUNT/SUM over real rows. */

export interface PlatformOverview {
  generated_at: string;
  businesses: { total: number; by_status: Record<string, number>; new_last_30_days: number };
  users: { total: number; verified: number };
  agencies: { active: number };
  subscriptions: {
    by_status: Record<string, number>;
    plan_mix: { plan_code: string; plan_name: string; subscriptions: number }[];
  };
  invoicing: {
    all_time: InvoicedTotal[];
    last_30_days: InvoicedTotal[];
    note: string;
  };
  addons: { by_status: Record<string, number>; paid_amount: string };
  publishing_jobs: Record<string, number>;
  integrations: Record<string, number>;
  support: { by_status: Record<string, number> };
}

export interface InvoicedTotal {
  currency: string;
  invoices: number;
  /** Decimal string. */
  total: string;
  gst: string;
}

export interface PlatformTenantDetail {
  id: string;
  display_name: string;
  legal_name: string | null;
  business_type: string | null;
  status: string;
  currency: string;
  country: string;
  created_at: string;
  owner: { user_id: string; name: string | null; email: string | null };
  subscription: {
    status: string;
    plan_code: string;
    plan_name: string;
    current_period_end: string | null;
    cancel_at: string | null;
  } | null;
  footprint: {
    members: number;
    locations: number;
    content_items: number;
    leads: number;
    open_tickets: number;
    connected_providers: number;
  };
  members: { user_id: string; name: string; email: string; role_code: string; status: string }[];
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  status: string;
  email_verified: boolean;
  tenant_count: number;
  last_login_at: string | null;
  created_at: string;
}

export interface PlatformAgency {
  id: string;
  brand_name: string;
  status: string;
  owner_tenant_id: string;
  owner_tenant_name: string;
  active_clients: number;
  pending_invites: number;
  active_assignments: number;
  created_at: string;
}

export interface PlatformTicket {
  id: string;
  tenant_id: string;
  tenant_name: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  created_at: string;
}

export interface PlatformTicketList {
  by_status: Record<string, number>;
  tickets: PlatformTicket[];
}

export interface AdminAddon {
  id: string;
  code: string;
  name: string;
  description: string;
  meter_code: string;
  quantity: number;
  price: string;
  currency: string;
  status: string;
}

export interface CreateAddonRequest {
  code: string;
  name: string;
  description?: string;
  meter_code: string;
  quantity: number;
  price: string;
  reason: string;
}
