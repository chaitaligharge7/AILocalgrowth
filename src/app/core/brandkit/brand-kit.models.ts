/**
 * M03 Brand Kit & Industry Look-and-Feel Template models.
 */

export interface BrandKitRestrictions {
  prohibited_phrases?: string[];
  [key: string]: unknown;
}

export interface BrandKitVoice {
  tone?: string;
  font_style?: string;
  guidelines?: string;
  template_id?: string;
  [key: string]: unknown;
}

export interface BrandKit {
  id: string;
  tenant_id: string;
  logo_asset_id: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
  voice_json: BrandKitVoice | null;
  restrictions_json: BrandKitRestrictions | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateBrandKitRequest {
  logo_asset_id?: string | null;
  primary_hex?: string | null;
  secondary_hex?: string | null;
  voice_json?: BrandKitVoice | null;
  restrictions_json?: BrandKitRestrictions | null;
  locale?: string;
}

export interface BrandKitTemplate {
  id: string;
  industry: string;
  title: string;
  primary_hex: string;
  secondary_hex: string;
  font_style: string;
  tone: string;
  voice_guidelines: string;
  prohibited_phrases: string[];
  sample_headline: string;
  tagline: string;
  description: string;
}

export interface BrandKitTemplateListResponse {
  templates: BrandKitTemplate[];
  industries: string[];
}
