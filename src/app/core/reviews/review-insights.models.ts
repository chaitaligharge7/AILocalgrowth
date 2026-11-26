/** Field names verified against `ReviewInsightsHandler` -> `ReviewInsightsService` (services/api_php). */

export interface ReviewThemeCount {
  word: string;
  count: number;
}

export interface ReviewAutomationSettings {
  auto_draft_enabled: boolean;
  max_rating: number;
  updated_at: string | null;
  behaviour: string;
}

export interface ReviewInsights {
  location_id: string | null;
  from: string | null;
  to: string | null;
  summary: {
    total: number;
    avg_rating: number | null;
    replied: number;
    unreplied: number;
    reply_rate_pct: number | null;
    avg_hours_to_reply: number | null;
  };
  distribution: { rating: number; count: number; pct: number }[];
  trend: { month: string; count: number; avg_rating: number }[];
  sentiment: {
    method: string;
    is_ai: boolean;
    note: string;
    positive: number;
    neutral: number;
    negative: number;
    themes: { positive: ReviewThemeCount[]; negative: ReviewThemeCount[] };
    themes_note: string;
  };
  automation: ReviewAutomationSettings;
  mock_provider: boolean;
}

export interface ReviewInsightsFilter {
  location_id?: string;
  from?: string;
  to?: string;
}
