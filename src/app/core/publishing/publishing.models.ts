/**
 * Field names verified against
 * `services/api_php/src/Application/Publishing/PublishingService.php`
 * (`representSchedule()`/`representJob()`/`calendar()`) and
 * `services/api_php/src/Jobs/PublishDueWorker.php` (the three
 * `last_error_code` values it ever sets: `REAUTH_REQUIRED`,
 * `PROVIDER_ERROR`, `PROVIDER_RESULT_UNKNOWN`), plus
 * `PublishingException`'s `PROVIDER_REAUTH_REQUIRED` (409 at schedule
 * time — distinct from the worker's `REAUTH_REQUIRED` dead-letter code).
 *
 * `schedule()` persists the wall-clock `scheduled_at`+`timezone` as a UTC
 * instant and echoes both `scheduled_utc` and `scheduled_local` back
 * (blueprint §10.4 AC-07) — `CalendarComponent`/`ScheduleDialogComponent`
 * must always display `scheduled_local`/`timezone`, never recompute the
 * conversion client-side.
 */

export type PublishJobStatus =
  | 'queued'
  | 'leased'
  | 'attempting'
  | 'reconciling'
  | 'succeeded'
  | 'retry_wait'
  | 'dead_letter'
  | 'cancelled';

export interface PublishJob {
  id: string;
  tenant_id: string;
  schedule_id: string;
  provider: string;
  status: PublishJobStatus;
  attempts: number;
  lease_until: string | null;
  next_run_at: string | null;
  idempotency_key: string;
  external_post_id: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  tenant_id: string;
  content_id: string;
  revision_id: string;
  channel_id: string;
  status: string;
  scheduled_utc: string;
  scheduled_local: string;
  timezone: string;
  created_by: string;
  created_at: string;
  publish_job: PublishJob | null;
}

export interface ScheduleContentRequest {
  provider_connection_id: string;
  scheduled_at: string;
  timezone?: string;
  channel?: string;
}

export interface CancelScheduleResponse {
  content_id: string;
  status: string;
}

export interface PublishJobListResponse {
  publish_jobs: PublishJob[];
}

export interface CalendarEntry {
  id: string;
  content_id: string;
  content_title: string | null;
  content_objective: string;
  content_status: string;
  channel: string;
  status: string;
  scheduled_utc: string;
  publish_job_id: string | null;
  publish_job_status: PublishJobStatus | null;
  external_post_id: string | null;
  last_error_code: string | null;
  created_at: string;
}

export interface CalendarResponse {
  schedules: CalendarEntry[];
}

/**
 * Plain-English remediation copy for every `last_error_code` this backend
 * ever sets (blueprint §3.1 Calendar spec "clear failed-post
 * remediation"). Keep in sync with `PublishDueWorker`'s three worker-set
 * codes and `PublishingService`'s schedule-time `PROVIDER_REAUTH_REQUIRED`.
 */
export const PUBLISH_ERROR_REMEDIATION: Record<string, string> = {
  REAUTH_REQUIRED:
    'The connected Google account lost authorization before this post could be published. Reconnect it on the Integrations screen, then retry this job.',
  PROVIDER_REAUTH_REQUIRED:
    'The Google connection for this tenant is not currently "connected". Reconnect it on the Integrations screen before scheduling.',
  PROVIDER_ERROR:
    'Google rejected or failed this publish attempt after retries. Check the content and the connection, then retry.',
  PROVIDER_RESULT_UNKNOWN:
    'The last attempt timed out or the result could not be confirmed. The worker reconciles this automatically; if it is still stuck, retry manually.',
};

export function describePublishError(code: string | null): string | null {
  if (!code) {
    return null;
  }
  return PUBLISH_ERROR_REMEDIATION[code] ?? `Publish failed with error code "${code}". See the job's attempts for detail.`;
}

/**
 * `POST .../contents/{id}/schedule` channel values — Sprint S6 adds the two
 * Meta channels alongside Google's. Verified against
 * `App\Integrations\ProviderRegistry::channels()` /
 * `PublishingService::REQUIRED_SCOPE_BY_CHANNEL`.
 */
export type ScheduleChannel = 'google' | 'meta_page' | 'meta_instagram';

/** Which provider (`ProviderConnection.provider`) each schedule channel needs — same mapping as `ProviderRegistry::providerCodeForChannel()`. */
export const CHANNEL_PROVIDER: Record<ScheduleChannel, 'google' | 'meta'> = {
  google: 'google',
  meta_page: 'meta',
  meta_instagram: 'meta',
};

export const SCHEDULE_CHANNEL_LABELS: Record<ScheduleChannel, string> = {
  google: 'Google Business Profile',
  meta_page: 'Meta — Facebook Page',
  meta_instagram: 'Meta — Instagram',
};

/**
 * Remediation copy for every error code `PublishingService::schedule()` can
 * throw at *schedule time* (distinct from {@link PUBLISH_ERROR_REMEDIATION},
 * which covers the worker's later `last_error_code` on an existing job).
 * Sprint S6 adds `META_PERMISSIONS_INSUFFICIENT` and `LOCATION_NOT_LINKED` —
 * same "mirror S3/S4's mapping" convention as `PROVIDER_REAUTH_REQUIRED`.
 */
export const SCHEDULE_ERROR_REMEDIATION: Record<string, string> = {
  CONTENT_NOT_APPROVED: 'This content must be approved before it can be scheduled.',
  PROVIDER_REAUTH_REQUIRED:
    'The selected connection is not currently "connected". Reconnect it on the Integrations screen before scheduling.',
  META_PERMISSIONS_INSUFFICIENT:
    'This Meta connection does not have the permission this channel needs (Page/Instagram publish permissions). ' +
    'Reconnect Meta on the Integrations screen and grant full publishing permissions, then try again.',
  LOCATION_NOT_LINKED:
    'This content\'s business location is not linked to the selected Meta connection\'s Page/Instagram account yet. ' +
    'Go to the Integrations screen and map this location to a Page/Instagram account first.',
  QUOTA_EXCEEDED: 'This plan\'s monthly post quota is exhausted. Upgrade the plan or wait for the next billing period.',
};

export function describeScheduleError(code: string | null, fallbackMessage: string): string {
  if (!code) {
    return fallbackMessage;
  }
  return SCHEDULE_ERROR_REMEDIATION[code] ?? fallbackMessage;
}
