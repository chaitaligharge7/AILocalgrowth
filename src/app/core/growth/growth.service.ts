import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import { ActionItems, DashboardWidgets, Goal, GoalInput, GoalsResponse, GrowthScore, RecommendationsResponse } from './growth.models';

/**
 * Growth score, rule-based recommendations, action items and the per-user
 * dashboard widget layout (`App\Http\Handlers\GrowthHandler`). All reads are
 * open to any member of the tenant; nothing here is AI and nothing is
 * estimated: the server shows each input and marks missing data explicitly.
 */
@Injectable({ providedIn: 'root' })
export class GrowthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private url(tenantId: string, suffix: string): string {
    return `${this.base}/tenants/${encodeURIComponent(tenantId)}${suffix}`;
  }

  score(tenantId: string, filters?: { locationId?: string | null; days?: number | null }): Observable<GrowthScore> {
    const params = new URLSearchParams();
    if (filters?.locationId) {
      params.set('location_id', filters.locationId);
    }
    if (filters?.days) {
      params.set('days', String(filters.days));
    }
    const qs = params.toString();
    return this.http
      .get<ApiSuccess<GrowthScore>>(this.url(tenantId, `/growth/score${qs ? `?${qs}` : ''}`))
      .pipe(map((r) => r.data));
  }

  recommendations(tenantId: string, includeDismissed = false): Observable<RecommendationsResponse> {
    const suffix = includeDismissed ? '/growth/recommendations?include_dismissed=1' : '/growth/recommendations';
    return this.http.get<ApiSuccess<RecommendationsResponse>>(this.url(tenantId, suffix)).pipe(map((r) => r.data));
  }

  /** Hide one recommendation for the signed-in user only; omit `snoozeDays` to hide it until restored. */
  dismissRecommendation(tenantId: string, code: string, snoozeDays?: number): Observable<void> {
    const body = snoozeDays === undefined ? {} : { snooze_days: snoozeDays };
    return this.http
      .put<ApiSuccess<unknown>>(this.url(tenantId, `/growth/recommendations/${encodeURIComponent(code)}/dismiss`), body)
      .pipe(map(() => undefined));
  }

  restoreRecommendation(tenantId: string, code: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<unknown>>(this.url(tenantId, `/growth/recommendations/${encodeURIComponent(code)}/dismiss`))
      .pipe(map(() => undefined));
  }

  goals(tenantId: string): Observable<GoalsResponse> {
    return this.http.get<ApiSuccess<GoalsResponse>>(this.url(tenantId, '/growth/goals')).pipe(map((r) => r.data));
  }

  createGoal(tenantId: string, input: GoalInput): Observable<Goal> {
    return this.http.post<ApiSuccess<Goal>>(this.url(tenantId, '/growth/goals'), input).pipe(map((r) => r.data));
  }

  updateGoal(tenantId: string, goalId: string, input: { target_value?: string; deadline_on?: string }): Observable<Goal> {
    return this.http
      .patch<ApiSuccess<Goal>>(this.url(tenantId, `/growth/goals/${encodeURIComponent(goalId)}`), input)
      .pipe(map((r) => r.data));
  }

  deleteGoal(tenantId: string, goalId: string): Observable<void> {
    return this.http.delete<ApiSuccess<unknown>>(this.url(tenantId, `/growth/goals/${encodeURIComponent(goalId)}`)).pipe(map(() => undefined));
  }

  actionItems(tenantId: string): Observable<ActionItems> {
    return this.http.get<ApiSuccess<ActionItems>>(this.url(tenantId, '/growth/action-items')).pipe(map((r) => r.data));
  }

  widgets(tenantId: string): Observable<DashboardWidgets> {
    return this.http.get<ApiSuccess<DashboardWidgets>>(this.url(tenantId, '/dashboard/widgets')).pipe(map((r) => r.data));
  }

  saveWidgets(tenantId: string, widgets: { code: string; visible: boolean }[]): Observable<DashboardWidgets> {
    return this.http.put<ApiSuccess<DashboardWidgets>>(this.url(tenantId, '/dashboard/widgets'), { widgets }).pipe(map((r) => r.data));
  }

  resetWidgets(tenantId: string): Observable<DashboardWidgets> {
    return this.http.delete<ApiSuccess<DashboardWidgets>>(this.url(tenantId, '/dashboard/widgets')).pipe(map((r) => r.data));
  }
}
