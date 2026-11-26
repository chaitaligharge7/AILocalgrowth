/**
 * Shapes for `/tenants/{t}/locations*` — field names verified against
 * `services/api_php/src/Application/Locations/LocationService.php`
 * (Business Profile & Locations, redesign backlog BW-021..030).
 */

export interface LocationAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface LocationSummary {
  id: string;
  name: string;
  category: string | null;
  status: string;
  timezone: string;
  phone: string | null;
  website: string | null;
  address: LocationAddress | null;
  created_at: string;
  updated_at: string;
}

/** One weekday of the weekly schedule. `configured:false` means "never set", NOT "closed". */
export interface LocationHoursDay {
  weekday: number; // 0 = Monday ... 6 = Sunday
  configured: boolean;
  is_closed: boolean;
  opens_at: string | null; // HH:MM, local to the location timezone
  closes_at: string | null;
}

export interface LocationHoliday {
  date: string; // YYYY-MM-DD
  label: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

export interface LocationServiceArea {
  area_type: 'pincode' | 'locality' | 'city';
  area_name: string;
}

export interface LocationProfile extends LocationSummary {
  lat: string | null;
  lng: string | null;
  logo_asset_id?: string | null;
  logo_url?: string | null;
  cover_asset_id?: string | null;
  cover_url?: string | null;
  hours: LocationHoursDay[];
  holidays: LocationHoliday[];
  secondary_categories: string[];
  attributes: Record<string, string>;
  service_areas: LocationServiceArea[];
  service_count: number;
}

/** A catalogue entry; `price` is a decimal STRING with two decimals (never a float). */
export interface LocationService {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string;
  duration_minutes: number | null;
  is_active: boolean;
}

export interface LocationHistoryEvent {
  id: string;
  action: string;
  actor_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface LocationDetailsRequest {
  name?: string;
  category?: string | null;
  timezone?: string;
  phone?: string | null;
  website?: string | null;
  lat?: string | null;
  lng?: string | null;
  address?: LocationAddress | null;
}

export interface LocationHoursRequestDay {
  weekday: number;
  is_closed: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
}

export interface LocationCategoriesRequest {
  primary_category?: string;
  categories: string[];
  attributes: Record<string, string>;
}

export interface LocationServiceRequest {
  name?: string;
  description?: string | null;
  price?: string | null;
  currency?: string;
  duration_minutes?: number | null;
  is_active?: boolean;
}

export interface BulkImportFailure {
  row: number;
  name: string;
  error: string;
}

export interface BulkImportLocationsResult {
  created: LocationProfile[];
  created_count: number;
  failed: BulkImportFailure[];
  failed_count: number;
}

export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
