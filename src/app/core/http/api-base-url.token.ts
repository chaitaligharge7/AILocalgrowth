import { InjectionToken } from '@angular/core';

/**
 * Base path for every `services/api_php` call, e.g. `/api/v1`. Left as a
 * relative path (not an absolute origin) so the same build works whether
 * the API is reverse-proxied under the same origin in production or
 * forwarded by the Angular dev-server proxy (`apps/web_angular/proxy.conf.json`)
 * in local development. Override via a DI provider in tests.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  factory: () => '/api/v1',
});
