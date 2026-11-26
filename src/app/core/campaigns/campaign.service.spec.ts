import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CampaignService } from './campaign.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('CampaignService', () => {
  let service: CampaignService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CampaignService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists campaigns with an optional date window', () => {
    service.list('t1').subscribe((c) => expect(c).toEqual([]));
    http.expectOne('/api/v1/tenants/t1/campaigns').flush(ok({ campaigns: [] }));

    service.list('t1', '2026-11-01', '2026-11-30').subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/campaigns');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('to')).toBe('2026-11-30');
    req.flush(ok({ campaigns: [] }));
  });

  it('creates, updates, archives and composes', () => {
    service.create('t1', { name: 'Diwali push' }).subscribe();
    const create = http.expectOne('/api/v1/tenants/t1/campaigns');
    expect(create.request.method).toBe('POST');
    create.flush(ok({ id: 'c1' }));

    service.update('t1', 'c1', { ends_on: null }).subscribe();
    const upd = http.expectOne('/api/v1/tenants/t1/campaigns/c1');
    expect(upd.request.method).toBe('PATCH');
    expect(upd.request.body).toEqual({ ends_on: null });
    upd.flush(ok({ id: 'c1' }));

    service.compose('t1', 'c1', { location_id: 'l1', body: 'Hi', channels: ['google', 'meta_instagram'], variants: { meta_instagram: 'Hi #x' } }).subscribe();
    const compose = http.expectOne('/api/v1/tenants/t1/campaigns/c1/compose');
    expect(compose.request.body.channels).toEqual(['google', 'meta_instagram']);
    compose.flush(ok({ id: 'c1', items: [] }));

    let archived = false;
    service.archive('t1', 'c1').subscribe(() => (archived = true));
    const del = http.expectOne('/api/v1/tenants/t1/campaigns/c1');
    expect(del.request.method).toBe('DELETE');
    del.flush(ok({ archived: true }));
    expect(archived).toBeTrue();
  });

  it('reads the report, monitor, performance and audit log', () => {
    service.report('t1', 'c1').subscribe();
    http.expectOne('/api/v1/tenants/t1/campaigns/c1/report').flush(ok({ items_total: 0 }));

    service.monitor('t1', 'dead_letter', 20).subscribe();
    const mon = http.expectOne((r) => r.url === '/api/v1/tenants/t1/publishing/monitor');
    expect(mon.request.params.get('status')).toBe('dead_letter');
    expect(mon.request.params.get('limit')).toBe('20');
    mon.flush(ok({ jobs: [], status_counts: {}, viewer_can_retry: false }));

    service.performance('t1', '2026-11-01', '2026-11-20').subscribe();
    const perf = http.expectOne((r) => r.url === '/api/v1/tenants/t1/publishing/performance');
    expect(perf.request.params.get('from')).toBe('2026-11-01');
    perf.flush(ok({ totals: {}, by_channel: [], by_day: [] }));

    service.auditLog('t1').subscribe((events) => expect(events.length).toBe(1));
    http.expectOne((r) => r.url === '/api/v1/tenants/t1/publishing/audit-log').flush(ok({ events: [{ id: 'e1' }] }));
  });
});
