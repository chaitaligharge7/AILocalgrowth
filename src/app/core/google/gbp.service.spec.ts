import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GbpService } from './gbp.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('GbpService', () => {
  let service: GbpService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GbpService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads health and history (with optional status filter)', () => {
    service.health('t1').subscribe();
    http.expectOne('/api/v1/tenants/t1/google/health').flush(ok({ overall: 'healthy' }));

    service.history('t1', 'failed').subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/google/sync-history');
    expect(req.request.params.get('status')).toBe('failed');
    expect(req.request.params.get('limit')).toBe('100');
    req.flush(ok({ items: [] }));
  });

  it('drives the post lifecycle on the documented routes', () => {
    service.listPosts('t1', 'l1').subscribe();
    http.expectOne('/api/v1/tenants/t1/locations/l1/gbp/posts').flush(ok({ posts: [] }));

    service.createPost('t1', 'l1', { body: 'Hi' }).subscribe();
    const create = http.expectOne('/api/v1/tenants/t1/locations/l1/gbp/posts');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ body: 'Hi' });
    create.flush(ok({ id: 'p1' }));

    service.updatePost('t1', 'p1', { body: 'Hey' }).subscribe();
    const update = http.expectOne('/api/v1/tenants/t1/gbp/posts/p1');
    expect(update.request.method).toBe('PATCH');
    update.flush(ok({ id: 'p1' }));

    service.publishPost('t1', 'p1').subscribe();
    const publish = http.expectOne('/api/v1/tenants/t1/gbp/posts/p1/publish');
    expect(publish.request.method).toBe('POST');
    publish.flush(ok({ id: 'p1', status: 'published' }));

    service.deletePost('t1', 'p1').subscribe();
    const del = http.expectOne('/api/v1/tenants/t1/gbp/posts/p1');
    expect(del.request.method).toBe('DELETE');
    del.flush(ok({ deleted: true }));
  });

  it('pushes profile data and photos and retries failed jobs', () => {
    service.listPushJobs('t1', 'l1').subscribe();
    http.expectOne('/api/v1/tenants/t1/locations/l1/gbp/push-jobs').flush(ok({ jobs: [] }));

    service.pushProfile('t1', 'l1', { fields: ['category'] }).subscribe();
    const profile = http.expectOne('/api/v1/tenants/t1/locations/l1/gbp/profile-push');
    expect(profile.request.body).toEqual({ fields: ['category'] });
    profile.flush(ok({ id: 'j1' }));

    service.pushPhoto('t1', 'l1', { asset_id: 'a1', photo_category: 'interior' }).subscribe();
    const photo = http.expectOne('/api/v1/tenants/t1/locations/l1/gbp/photo-push');
    expect(photo.request.body).toEqual({ asset_id: 'a1', photo_category: 'interior' });
    photo.flush(ok({ id: 'j2' }));

    service.retryPushJob('t1', 'j1').subscribe();
    const retry = http.expectOne('/api/v1/tenants/t1/gbp/push-jobs/j1/retry');
    expect(retry.request.method).toBe('POST');
    retry.flush(ok({ id: 'j1' }));
  });
});
