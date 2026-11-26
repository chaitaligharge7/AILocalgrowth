/**
 * Field names verified against
 * `services/api_php/src/Application/Content/AiGenerationService::generate()`
 * and `tests/Http/Handlers/AiGenerationHandlerTest.php`.
 *
 * Every response is explicitly `mock_provider: true` — blueprint §02 M06
 * "All AI output labelled draft until approved" and CLAUDE.md's
 * `MOCK_PROVIDER` badge rule. `AiStudioComponent` renders that badge on
 * every variant; never hide or omit it.
 *
 * S4 bug fix: `quota` used to be `{daily_limit, used_today,
 * remaining_today}` under the old `docs/ADR/0011-temporary-ai-quota-guard.md`
 * per-tenant mutex. That guard has been replaced by the real
 * `usage_wallets`/`UsageWalletService` ledger (`docs/ADR/0025`) — the
 * success shape is now `{meter_code, limit, used, reserved, remaining,
 * period_start, period_end}`, and a 429 `QUOTA_EXCEEDED`'s `fields` are
 * now `{meter_code, limit_qty, used_qty, reserved_qty}` (see
 * `UsageWalletService::reserve()`), not `{quota, used_today}`. Verified
 * directly against `AiGenerationService::generate()`'s return array —
 * this frontend was still reading the old field names until this fix.
 */

export interface AiGenerationRequest {
  objective: string;
  cta: string;
  use_case?: string;
  tone?: string;
  language?: string;
  offer?: string;
  segment?: string;
  channel?: string;
  include_visual_brief?: boolean;
}

export interface AiVariant {
  text: string;
  draft: true;
  warnings?: string[];
}

export interface AiVisualBrief {
  headline: string;
  scene_description: string;
  aspect_ratio: string;
  color_palette: string[];
  image_prompt: string;
  alt_text: string;
  mock_provider?: boolean;
}

export interface AiSafetyReport {
  checks_run: string[];
  regulated_industry: string | null;
  blocked_reasons: string[];
}

export interface AiGenerationQuota {
  meter_code: string;
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  period_start: string;
  period_end: string;
}

export interface AiGenerationResponse {
  id: string;
  status: 'completed' | 'blocked';
  provider: string;
  model: string;
  prompt_version: string;
  mock_provider: boolean;
  variants: AiVariant[];
  visual_brief?: AiVisualBrief | null;
  blocked_variant_count: number;
  safety_report?: AiSafetyReport;
  quota: AiGenerationQuota;
  created_at: string;
}
