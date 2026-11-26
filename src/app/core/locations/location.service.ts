import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  BulkImportLocationsResult,
  LocationCategoriesRequest,
  LocationDetailsRequest,
  LocationHistoryEvent,
  LocationHoliday,
  LocationHoursRequestDay,
  LocationProfile,
  LocationService as LocationServiceItem,
  LocationServiceArea,
  LocationServiceRequest,
  LocationSummary,
} from './location.models';

/**
 * Wraps `/tenants/{t}/locations*` (`App\Http\Handlers\LocationHandler` →
 * `App\Application\Locations\LocationService`). Reads are open to any active
 * member; every write needs `location.manage` (owner/admin) — enforced by the
 * backend, the UI only hides controls as polish.
 */
@Injectable({ providedIn: 'root' })
export class LocationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, locationId?: string, suffix = ''): string {
    const root = `${this.base}/tenants/${encodeURIComponent(tenantId)}/locations`;
    return locationId ? `${root}/${encodeURIComponent(locationId)}${suffix}` : root;
  }

  list(tenantId: string): Observable<LocationSummary[]> {
    return this.http.get<ApiSuccess<{ locations: LocationSummary[] }>>(this.url(tenantId)).pipe(map((r) => r.data.locations));
  }

  create(tenantId: string, payload: LocationDetailsRequest & { name: string }): Observable<LocationProfile> {
    return this.http.post<ApiSuccess<LocationProfile>>(this.url(tenantId), payload).pipe(map((r) => r.data));
  }

  bulkImport(tenantId: string, csv: string): Observable<BulkImportLocationsResult> {
    return this.http
      .post<ApiSuccess<BulkImportLocationsResult>>(`${this.url(tenantId)}/bulk-import`, { csv })
      .pipe(map((r) => r.data));
  }

  get(tenantId: string, locationId: string): Observable<LocationProfile> {
    return this.http.get<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId)).pipe(map((r) => r.data));
  }

  update(tenantId: string, locationId: string, payload: LocationDetailsRequest): Observable<LocationProfile> {
    return this.http.patch<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId), payload).pipe(map((r) => r.data));
  }

  archive(tenantId: string, locationId: string): Observable<void> {
    return this.http.delete<ApiSuccess<unknown>>(this.url(tenantId, locationId)).pipe(map(() => undefined));
  }

  setHours(tenantId: string, locationId: string, hours: LocationHoursRequestDay[]): Observable<LocationProfile> {
    return this.http.put<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId, '/hours'), { hours }).pipe(map((r) => r.data));
  }

  setHolidays(tenantId: string, locationId: string, holidays: LocationHoliday[]): Observable<LocationProfile> {
    return this.http
      .put<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId, '/holidays'), { holidays })
      .pipe(map((r) => r.data));
  }

  setCategories(tenantId: string, locationId: string, payload: LocationCategoriesRequest): Observable<LocationProfile> {
    return this.http
      .put<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId, '/categories'), payload)
      .pipe(map((r) => r.data));
  }

  setServiceAreas(tenantId: string, locationId: string, areas: LocationServiceArea[]): Observable<LocationProfile> {
    return this.http
      .put<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId, '/service-areas'), { areas })
      .pipe(map((r) => r.data));
  }

  setMedia(
    tenantId: string,
    locationId: string,
    payload: { logo_asset_id: string | null; cover_asset_id: string | null },
  ): Observable<LocationProfile> {
    return this.http
      .put<ApiSuccess<LocationProfile>>(this.url(tenantId, locationId, '/media'), payload)
      .pipe(map((r) => r.data));
  }

  listServices(tenantId: string, locationId: string): Observable<LocationServiceItem[]> {
    return this.http
      .get<ApiSuccess<{ services: LocationServiceItem[] }>>(this.url(tenantId, locationId, '/services'))
      .pipe(map((r) => r.data.services));
  }

  createService(tenantId: string, locationId: string, payload: LocationServiceRequest & { name: string }): Observable<LocationServiceItem> {
    return this.http
      .post<ApiSuccess<LocationServiceItem>>(this.url(tenantId, locationId, '/services'), payload)
      .pipe(map((r) => r.data));
  }

  updateService(tenantId: string, locationId: string, serviceId: string, payload: LocationServiceRequest): Observable<LocationServiceItem> {
    return this.http
      .patch<ApiSuccess<LocationServiceItem>>(this.url(tenantId, locationId, `/services/${encodeURIComponent(serviceId)}`), payload)
      .pipe(map((r) => r.data));
  }

  deleteService(tenantId: string, locationId: string, serviceId: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<unknown>>(this.url(tenantId, locationId, `/services/${encodeURIComponent(serviceId)}`))
      .pipe(map(() => undefined));
  }

  history(tenantId: string, locationId: string): Observable<LocationHistoryEvent[]> {
    return this.http
      .get<ApiSuccess<{ events: LocationHistoryEvent[] }>>(this.url(tenantId, locationId, '/history'))
      .pipe(map((r) => r.data.events));
  }
}
