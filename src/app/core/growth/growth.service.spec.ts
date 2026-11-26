import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GrowthService } from './growth.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('GrowthService', () => {
  let service: GrowthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GrowthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the score, recommendations and action items from the tenant-scoped endpoints', () => {
    let score: unknown;
    service.score('t 1').subscribe((s) => (score = s));
    http.expectOne('/api/v1/tenants/t%201/growth/score').flush(ok({ score: null, components: [] }));
    expect((score as { score: null }).score).toBeNull();

    service.recommendations('t1').subscribe();
    http.expectOne('/api/v1/tenants/t1/growth/recommendations').flush(ok({ recommendations: [] }));

    service.actionItems('t1').subscribe();
    http.expectOne('/api/v1/tenants/t1/growth/action-items').flush(ok({ items: [], total: 0 }));
  });

  it('saves and resets the per-user widget layout', () => {
    const layout = [{ code: 'kpis', visible: false }];
    service.widgets('t1').subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/tenants/t1/dashboard/widgets' }).flush(ok({ widgets: [], is_default: true }));

    service.saveWidgets('t1', layout).subscribe();
    const put = http.expectOne({ method: 'PUT', url: '/api/v1/tenants/t1/dashboard/widgets' });
    expect(put.request.body).toEqual({ widgets: layout });
    put.flush(ok({ widgets: [], is_default: false }));

    service.resetWidgets('t1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/v1/tenants/t1/dashboard/widgets' }).flush(ok({ widgets: [], is_default: true }));
  });

  it('reads, creates, updates and removes goals on the tenant-scoped endpoints', () => {
    service.goals('t1').subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/tenants/t1/growth/goals' }).flush(ok({ goals: [], metrics: [], can_edit: true }));

    const input = { metric: 'reviews_total' as const, target_value: '50', deadline_on: '2026-12-31' };
    service.createGoal('t1', input).subscribe();
    const post = http.expectOne({ method: 'POST', url: '/api/v1/tenants/t1/growth/goals' });
    expect(post.request.body).toEqual(input);
    post.flush(ok({ id: 'g1' }));

    service.updateGoal('t1', 'g 1', { target_value: '60' }).subscribe();
    const patch = http.expectOne({ method: 'PATCH', url: '/api/v1/tenants/t1/growth/goals/g%201' });
    expect(patch.request.body).toEqual({ target_value: '60' });
    patch.flush(ok({ id: 'g 1' }));

    service.deleteGoal('t1', 'g1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/v1/tenants/t1/growth/goals/g1' }).flush(ok({ removed: true }));
  });

  it('dismisses (optionally snoozed) and restores a recommendation, and can ask for the hidden ones', () => {
    service.dismissRecommendation('t1', 'contact_leads', 7).subscribe();
    const snooze = http.expectOne({ method: 'PUT', url: '/api/v1/tenants/t1/growth/recommendations/contact_leads/dismiss' });
    expect(snooze.request.body).toEqual({ snooze_days: 7 });
    snooze.flush(ok({}));

    service.dismissRecommendation('t1', 'contact_leads').subscribe();
    const forever = http.expectOne({ method: 'PUT', url: '/api/v1/tenants/t1/growth/recommendations/contact_leads/dismiss' });
    expect(forever.request.body).toEqual({});
    forever.flush(ok({}));

    service.restoreRecommendation('t1', 'contact_leads').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/v1/tenants/t1/growth/recommendations/contact_leads/dismiss' }).flush(ok({}));

    service.recommendations('t1', true).subscribe();
    http.expectOne('/api/v1/tenants/t1/growth/recommendations?include_dismissed=1').flush(ok({ recommendations: [] }));
  });
});
