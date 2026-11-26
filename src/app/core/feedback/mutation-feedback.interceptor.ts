import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { apiErrorFields, apiErrorMessage } from '../http/error.util';
import { ToastService } from './toast.service';

/** Opt out of the automatic global mutation toast on a specific request. */
export const SKIP_MUTATION_TOAST = new HttpContextToken<boolean>(() => false);

/** Override the automatic success toast message for a specific request. */
export const MUTATION_SUCCESS_MESSAGE = new HttpContextToken<string | null>(() => null);

/** Override the automatic error toast message for a specific request. */
export const MUTATION_ERROR_MESSAGE = new HttpContextToken<string | null>(() => null);

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Endpoints that are session/telemetry plumbing rather than user CRUD actions. */
const IGNORED_PATH_PATTERNS: RegExp[] = [
  /\/auth\/(login|register|refresh|logout|otp\/|password\/)/i,
  /\/admin\/auth\//i,
  /\/notifications\/(read-all|[^/]+\/read)\b/i,
  /\/announcements\/[^/]+\/dismiss\b/i,
];

/** Maps URL resource segments to user-friendly labels. */
const RESOURCE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /\/locations\/[^/]+\/services\b/i, label: 'Service' },
  { pattern: /\/locations\/[^/]+\/hours\b/i, label: 'Business hours' },
  { pattern: /\/locations\/[^/]+\/holidays\b/i, label: 'Holiday schedule' },
  { pattern: /\/locations\/[^/]+\/categories\b/i, label: 'Categories' },
  { pattern: /\/locations\/[^/]+\/service-areas\b/i, label: 'Service areas' },
  { pattern: /\/locations\b/i, label: 'Location' },
  { pattern: /\/contents\b/i, label: 'Content' },
  { pattern: /\/schedules\b/i, label: 'Schedule' },
  { pattern: /\/reviews\/[^/]+\/draft-reply\b/i, label: 'Draft reply' },
  { pattern: /\/reviews\/[^/]+\/triage\b/i, label: 'Review triage' },
  { pattern: /\/reviews\b/i, label: 'Review' },
  { pattern: /\/review-settings\b/i, label: 'Review settings' },
  { pattern: /\/content-policy\b/i, label: 'Content policy' },
  { pattern: /\/lead-assignment\b/i, label: 'Lead assignment' },
  { pattern: /\/leads\b/i, label: 'Lead' },
  { pattern: /\/campaigns\b/i, label: 'Campaign' },
  { pattern: /\/automations\b/i, label: 'Automation' },
  { pattern: /\/whatsapp-templates\b/i, label: 'WhatsApp template' },
  { pattern: /\/templates\b/i, label: 'Template' },
  { pattern: /\/assets\b/i, label: 'Asset' },
  { pattern: /\/brand-kit\b/i, label: 'Brand kit' },
  { pattern: /\/members\b/i, label: 'Team member' },
  { pattern: /\/invites\b/i, label: 'Invitation' },
  { pattern: /\/integrations\b/i, label: 'Integration' },
  { pattern: /\/support\/tickets\/[^/]+\/attachments\b/i, label: 'Attachment' },
  { pattern: /\/support\/tickets\/[^/]+\/messages\b/i, label: 'Reply' },
  { pattern: /\/support\/tickets\b/i, label: 'Support ticket' },
  { pattern: /\/notifications\/preferences\b/i, label: 'Notification preferences' },
  { pattern: /\/billing|\/subscriptions|\/addons/i, label: 'Billing' },
  { pattern: /\/account\/profile\b/i, label: 'Profile' },
  { pattern: /\/sessions\b/i, label: 'Session' },
  { pattern: /\/tenants\b/i, label: 'Business' },
  { pattern: /\/agencies\b/i, label: 'Agency' },
  { pattern: /\/users\b/i, label: 'User' },
];

/**
 * Global HTTP interceptor that automatically shows common success and error
 * toast messages for all create (`POST`), edit (`PUT`/`PATCH`), and delete
 * (`DELETE`) actions across every module in the application.
 */
export const mutationFeedbackInterceptor: HttpInterceptorFn = (req, next) => {
  const method = req.method.toUpperCase();
  if (!MUTATION_METHODS.has(method) || req.context.get(SKIP_MUTATION_TOAST) || shouldIgnoreUrl(req.url)) {
    return next(req);
  }

  const toast = inject(ToastService);
  const customSuccess = req.context.get(MUTATION_SUCCESS_MESSAGE);
  const customError = req.context.get(MUTATION_ERROR_MESSAGE);

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
        const message = customSuccess ?? buildSuccessMessage(method, req.url, event.body);
        const title = buildSuccessTitle(method, req.url);
        toast.success(message, title);
      }
    }),
    catchError((err: unknown) => {
      // Skip 401 here because authInterceptor handles session expiry redirect.
      if (err instanceof HttpErrorResponse && err.status === 401) {
        return throwError(() => err);
      }

      const message = customError ?? buildErrorMessage(err);
      const title = buildErrorTitle(method);
      toast.error(message, title);
      return throwError(() => err);
    }),
  );
};

function shouldIgnoreUrl(url: string): boolean {
  const path = stripQuery(url);
  return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

function extractResourceLabel(url: string): string | null {
  const path = stripQuery(url);
  for (const entry of RESOURCE_LABELS) {
    if (entry.pattern.test(path)) {
      return entry.label;
    }
  }
  return null;
}

function extractResponseMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const data = (body as { data?: unknown }).data;
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      return msg.trim();
    }
  }
  return null;
}

export function buildSuccessTitle(method: string, url: string): string {
  const path = stripQuery(url).toLowerCase();
  if (method === 'DELETE' || path.endsWith('/archive')) {
    return 'Deleted';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'Saved';
  }
  if (path.endsWith('/sync')) {
    return 'Synced';
  }
  if (path.endsWith('/approve')) {
    return 'Approved';
  }
  if (path.endsWith('/publish')) {
    return 'Published';
  }
  return 'Success';
}

export function buildSuccessMessage(method: string, url: string, body?: unknown): string {
  const serverMessage = extractResponseMessage(body);
  if (serverMessage) {
    return serverMessage;
  }

  const path = stripQuery(url).toLowerCase();
  const resource = extractResourceLabel(path);

  if (method === 'DELETE') {
    return resource ? `${resource} deleted successfully.` : 'Deleted successfully.';
  }

  if (method === 'PUT' || method === 'PATCH') {
    return resource ? `${resource} updated successfully.` : 'Changes saved successfully.';
  }

  // POST — detect common action endpoints before defaulting to "created"
  if (path.endsWith('/archive')) {
    return resource ? `${resource} archived successfully.` : 'Archived successfully.';
  }
  if (path.endsWith('/restore')) {
    return resource ? `${resource} restored successfully.` : 'Restored successfully.';
  }
  if (path.endsWith('/approve')) {
    return resource ? `${resource} approved successfully.` : 'Approved successfully.';
  }
  if (path.endsWith('/reject')) {
    return resource ? `${resource} rejected.` : 'Rejected.';
  }
  if (path.endsWith('/publish')) {
    return resource ? `${resource} published successfully.` : 'Published successfully.';
  }
  if (path.endsWith('/schedule') || path.endsWith('/bulk-schedule')) {
    return 'Scheduled successfully.';
  }
  if (path.endsWith('/sync')) {
    return 'Sync completed successfully.';
  }
  if (path.endsWith('/generate') || path.endsWith('/generate-reply')) {
    return 'Generated successfully.';
  }
  if (path.endsWith('/upload') || path.endsWith('/attachments')) {
    return 'Uploaded successfully.';
  }
  if (path.endsWith('/accept')) {
    return 'Invitation accepted successfully.';
  }
  if (path.endsWith('/duplicate')) {
    return resource ? `${resource} duplicated successfully.` : 'Duplicated successfully.';
  }
  if (path.endsWith('/cancel')) {
    return resource ? `${resource} cancelled.` : 'Cancelled successfully.';
  }

  return resource ? `${resource} created successfully.` : 'Created successfully.';
}

function buildErrorTitle(method: string): string {
  if (method === 'DELETE') {
    return 'Delete failed';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'Update failed';
  }
  if (method === 'POST') {
    return 'Action failed';
  }
  return 'Error';
}

function buildErrorMessage(err: unknown): string {
  const base = apiErrorMessage(err);
  const fields = apiErrorFields(err);
  if (fields) {
    const firstFieldMsg = Object.values(fields).find((v) => typeof v === 'string' && v.trim().length > 0);
    if (firstFieldMsg && !base.includes(firstFieldMsg)) {
      return `${base} ${firstFieldMsg}`;
    }
  }
  return base;
}
