import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  Asset,
  AssetListResponse,
  AssetSearchParams,
  CompleteUploadRequest,
  DeleteAssetResponse,
  UpdateAssetRequest,
  UploadIntentRequest,
  UploadIntentResponse,
} from './asset.models';

/**
 * Wraps the M03 asset-library endpoints:
 *  - `GET /tenants/{t}/assets?q=&album=&tag=&limit=`
 *  - `POST /tenants/{t}/assets/upload` (native multipart/form-data)
 *  - `POST /tenants/{t}/assets/upload-intent` + `POST /tenants/{t}/assets/complete`
 *  - `GET/PATCH/DELETE /tenants/{t}/assets/{id}`
 */
@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  uploadIntent(tenantId: string, payload: UploadIntentRequest): Observable<UploadIntentResponse> {
    return this.http
      .post<ApiSuccess<UploadIntentResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/upload-intent`, payload)
      .pipe(map((res) => res.data));
  }

  complete(tenantId: string, payload: CompleteUploadRequest): Observable<Asset> {
    return this.http
      .post<ApiSuccess<Asset>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/complete`, payload)
      .pipe(map((res) => res.data));
  }

  /** Native `multipart/form-data` single-step upload (`POST .../assets/upload`). */
  uploadMultipart(
    tenantId: string,
    file: File,
    options?: { album?: string; tags?: string[] },
  ): Observable<Asset> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (options?.album?.trim()) {
      formData.append('album', options.album.trim());
    }
    if (options?.tags && options.tags.length > 0) {
      formData.append('tags', JSON.stringify(options.tags));
    }
    return this.http
      .post<ApiSuccess<Asset>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/upload`, formData)
      .pipe(map((res) => res.data));
  }

  /** `GET .../assets` — the tenant's active assets, newest first (any member may read). */
  list(tenantId: string): Observable<Asset[]> {
    return this.listWithMeta(tenantId).pipe(map((res) => res.assets));
  }

  /** `GET .../assets?q=&album=&tag=&limit=` returning assets, albums, and distinct tags. */
  listWithMeta(tenantId: string, params?: AssetSearchParams): Observable<AssetListResponse> {
    let httpParams = new HttpParams();
    if (params?.q?.trim()) {
      httpParams = httpParams.set('q', params.q.trim());
    }
    if (params?.album?.trim()) {
      httpParams = httpParams.set('album', params.album.trim());
    }
    if (params?.tag?.trim()) {
      httpParams = httpParams.set('tag', params.tag.trim());
    }
    if (params?.limit) {
      httpParams = httpParams.set('limit', String(params.limit));
    }
    return this.http
      .get<ApiSuccess<AssetListResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets`, { params: httpParams })
      .pipe(map((res) => ({ assets: res.data.assets ?? [], albums: res.data.albums ?? [], tags: res.data.tags ?? [] })));
  }

  get(tenantId: string, assetId: string): Observable<Asset> {
    return this.http
      .get<ApiSuccess<Asset>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/${encodeURIComponent(assetId)}`)
      .pipe(map((res) => res.data));
  }

  update(tenantId: string, assetId: string, payload: UpdateAssetRequest): Observable<Asset> {
    return this.http
      .patch<ApiSuccess<Asset>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/${encodeURIComponent(assetId)}`, payload)
      .pipe(map((res) => res.data));
  }

  delete(tenantId: string, assetId: string): Observable<DeleteAssetResponse> {
    return this.http
      .delete<ApiSuccess<DeleteAssetResponse>>(`${this.base}/tenants/${encodeURIComponent(tenantId)}/assets/${encodeURIComponent(assetId)}`)
      .pipe(map((res) => res.data));
  }

  /**
   * Two-step signed base64 upload helper (kept for backwards compatibility with
   * existing callers and tests).
   */
  uploadFile(tenantId: string, file: File, tags?: string[]): Observable<Asset> {
    return this.readFileAsBase64(file).pipe(
      switchMap((base64) =>
        this.uploadIntent(tenantId, {
          filename: file.name,
          declared_mime: file.type,
          declared_bytes: file.size,
        }).pipe(
          switchMap((intent) =>
            this.complete(tenantId, {
              upload_intent_token: intent.upload_intent_token,
              file_base64: base64,
              tags,
            }),
          ),
        ),
      ),
    );
  }

  private readFileAsBase64(file: File): Observable<string> {
    return new Observable<string>((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = result.indexOf(',');
        subscriber.next(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        subscriber.complete();
      };
      reader.onerror = () => subscriber.error(reader.error ?? new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }
}
