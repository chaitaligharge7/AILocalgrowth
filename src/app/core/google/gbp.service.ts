import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  GbpHealth,
  GbpPost,
  GbpPostList,
  GbpPostRequest,
  GbpPushJob,
  GbpPushJobList,
  PhotoPushRequest,
  ProfilePushRequest,
  SyncHistory,
} from './gbp.models';

/**
 * Wraps the Google Business Profile management endpoints
 * (`App\Http\Handlers\GbpHandler` → `App\Application\Google\GbpManagementService`).
 * Reads need membership; drafting posts needs `content.create`, publishing
 * `content.publish`, profile/photo pushes `integration.manage` — all
 * enforced server-side (the UI only hides controls as polish).
 */
@Injectable({ providedIn: 'root' })
export class GbpService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private tenant(tenantId: string, suffix: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}${suffix}`;
  }

  private loc(tenantId: string, locationId: string, suffix: string): string {
    return this.tenant(tenantId, `/locations/${encodeURIComponent(locationId)}${suffix}`);
  }

  health(tenantId: string): Observable<GbpHealth> {
    return this.http.get<ApiSuccess<GbpHealth>>(this.tenant(tenantId, '/google/health')).pipe(map((r) => r.data));
  }

  history(tenantId: string, status?: string): Observable<SyncHistory> {
    let params = new HttpParams().set('limit', '100');
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ApiSuccess<SyncHistory>>(this.tenant(tenantId, '/google/sync-history'), { params }).pipe(map((r) => r.data));
  }

  listPosts(tenantId: string, locationId: string): Observable<GbpPostList> {
    return this.http.get<ApiSuccess<GbpPostList>>(this.loc(tenantId, locationId, '/gbp/posts')).pipe(map((r) => r.data));
  }

  createPost(tenantId: string, locationId: string, payload: GbpPostRequest): Observable<GbpPost> {
    return this.http.post<ApiSuccess<GbpPost>>(this.loc(tenantId, locationId, '/gbp/posts'), payload).pipe(map((r) => r.data));
  }

  updatePost(tenantId: string, postId: string, payload: GbpPostRequest): Observable<GbpPost> {
    return this.http.patch<ApiSuccess<GbpPost>>(this.tenant(tenantId, `/gbp/posts/${encodeURIComponent(postId)}`), payload).pipe(map((r) => r.data));
  }

  deletePost(tenantId: string, postId: string): Observable<void> {
    return this.http.delete<ApiSuccess<unknown>>(this.tenant(tenantId, `/gbp/posts/${encodeURIComponent(postId)}`)).pipe(map(() => undefined));
  }

  publishPost(tenantId: string, postId: string): Observable<GbpPost> {
    return this.http.post<ApiSuccess<GbpPost>>(this.tenant(tenantId, `/gbp/posts/${encodeURIComponent(postId)}/publish`), {}).pipe(map((r) => r.data));
  }

  listPushJobs(tenantId: string, locationId: string): Observable<GbpPushJobList> {
    return this.http.get<ApiSuccess<GbpPushJobList>>(this.loc(tenantId, locationId, '/gbp/push-jobs')).pipe(map((r) => r.data));
  }

  pushProfile(tenantId: string, locationId: string, payload: ProfilePushRequest): Observable<GbpPushJob> {
    return this.http.post<ApiSuccess<GbpPushJob>>(this.loc(tenantId, locationId, '/gbp/profile-push'), payload).pipe(map((r) => r.data));
  }

  pushPhoto(tenantId: string, locationId: string, payload: PhotoPushRequest): Observable<GbpPushJob> {
    return this.http.post<ApiSuccess<GbpPushJob>>(this.loc(tenantId, locationId, '/gbp/photo-push'), payload).pipe(map((r) => r.data));
  }

  retryPushJob(tenantId: string, jobId: string): Observable<GbpPushJob> {
    return this.http.post<ApiSuccess<GbpPushJob>>(this.tenant(tenantId, `/gbp/push-jobs/${encodeURIComponent(jobId)}/retry`), {}).pipe(map((r) => r.data));
  }
}
