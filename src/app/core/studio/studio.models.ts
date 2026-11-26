/**
 * Field names verified against `StudioHandler` -> `TemplateLibraryService`,
 * `CreativeService`, `ContentInsightsService` (services/api_php).
 */

export type TemplateCategory = 'festival' | 'seasonal' | 'promo';

export interface ContentTemplate {
  id: string;
  title: string;
  category: TemplateCategory;
  scope: 'platform' | 'tenant';
  channel: string;
  caption: string;
  hashtags: string[];
  overlay: { headline?: string; subline?: string };
  cta: string | null;
  /** Why there is (or is not) a date, e.g. "Fixed date: 26 January" or "Lunar festival - date changes every year". */
  date_note: string | null;
  month: number | null;
  day: number | null;
  /** Only set for fixed Gregorian dates; lunar/regional festivals stay null. */
  next_date: string | null;
  days_until: number | null;
}

export interface TemplateListResponse {
  templates: ContentTemplate[];
  categories: TemplateCategory[];
  today: string;
}

export interface CreativeSpec {
  headline: string;
  subline: string | null;
  cta_text: string | null;
  badge_text: string | null;
  background_type: 'solid' | 'gradient';
  color1: string;
  color2: string;
  text_color: string;
  accent_color: string;
  align: 'left' | 'center' | 'right';
  font_scale: number;
  logo_asset_id: string | null;
  image_asset_id: string | null;
}

export type CreativeLayout = 'offer_banner' | 'festival_greeting' | 'announcement' | 'quote';
export type CreativeSize = 'square' | 'portrait' | 'story' | 'landscape';

export interface Creative {
  id: string;
  name: string;
  layout: CreativeLayout;
  width: number;
  height: number;
  spec: CreativeSpec;
  source: 'designer' | 'promo' | 'template';
  location_id: string | null;
  content_id: string | null;
  asset_id: string | null;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreativeListResponse {
  creatives: Creative[];
  layouts: CreativeLayout[];
  sizes: Record<CreativeSize, { width: number; height: number }>;
  brand: { primary_hex: string; secondary_hex: string; logo_asset_id: string | null; from_brand_kit: boolean };
  capabilities: { ai_image_generation: { available: boolean; reason: string } };
}

export interface CreativeRequest {
  name: string;
  layout: CreativeLayout;
  size: CreativeSize;
  location_id?: string | null;
  content_id?: string | null;
  spec: Partial<CreativeSpec>;
}

export interface DraftContent {
  id: string;
  status: string;
  title: string | null;
  body: string;
  objective: string;
}

export interface TemplateDraftResponse {
  content: DraftContent;
  creative_spec: { headline: string; subline: string; cta_text: string | null };
}

export type DiscountType = 'percent' | 'flat' | 'bogo' | 'freebie';

export interface PromoRequest {
  location_id: string;
  offer_title: string;
  discount_type: DiscountType;
  discount_value?: string;
  detail?: string;
  valid_from?: string;
  valid_until?: string;
  promo_code?: string;
  terms?: string;
  create_creative?: boolean;
}

export interface PromoResponse {
  caption: string;
  content: DraftContent;
  creative: Creative | null;
}

export interface ContentRevision {
  id: string;
  version: number;
  body: string;
  assets: string[];
  editor_id: string;
  editor_name: string | null;
  created_at: string;
  is_current: boolean;
  length: number;
  length_delta: number | null;
}

export interface RevisionListResponse {
  content_id: string;
  status: string;
  restorable: boolean;
  revisions: ContentRevision[];
}

export interface TimelineEvent {
  type: string;
  at: string;
  actor_name: string | null;
  title: string;
  detail: string | null;
  status: string | null;
}

export interface TimelineResponse {
  content_id: string;
  status: string;
  events: TimelineEvent[];
}
