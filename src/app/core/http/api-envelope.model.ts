/**
 * Shared success/error envelope shapes returned by every `services/api_php`
 * endpoint under `/api/v1` (blueprint §4.4, `App\Http\ApiResponse`).
 *
 * `ApiSuccess<T>.data` is the payload; `ApiError.error` carries a machine
 * code plus an optional per-field validation map (`fields`). Angular
 * services unwrap `data` and HTTP error handling reads `error.error`.
 */
export interface ApiSuccess<T> {
  data: T;
  meta: {
    request_id: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export interface ApiError {
  error: ApiErrorBody;
  request_id: string;
}

/** Narrows an HttpErrorResponse body to the backend's error envelope, if present. */
export function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'object'
  );
}
