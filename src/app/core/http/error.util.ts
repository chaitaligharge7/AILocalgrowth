import { HttpErrorResponse } from '@angular/common/http';
import { isApiError } from './api-envelope.model';

/** Extracts a human-readable message from a backend error envelope, falling back sensibly. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (isApiError(err.error)) {
      return err.error.error.message;
    }
    if (err.status === 0) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return `Unexpected error (HTTP ${err.status}).`;
  }
  return 'Unexpected error.';
}

/** Extracts the per-field validation map, if the backend sent one (422 VALIDATION_ERROR). */
export function apiErrorFields(err: unknown): Record<string, string> | null {
  if (err instanceof HttpErrorResponse && isApiError(err.error)) {
    return err.error.error.fields ?? null;
  }
  return null;
}

/** Extracts the machine-readable error code, e.g. `EMAIL_NOT_VERIFIED`. */
export function apiErrorCode(err: unknown): string | null {
  if (err instanceof HttpErrorResponse && isApiError(err.error)) {
    return err.error.error.code;
  }
  return null;
}
