import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StudioService } from './studio.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('StudioService', () => {
  let service: StudioService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(StudioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists templates, sending the category only when chosen', () => {
    service.templates('t1').subscribe();
    const bare = http.expectOne('/api/v1/tenants/t1/content-templates');
    expect(bare.request.params.keys()).toEqual([]);
    bare.flush(ok({ templates: [], categories: [], today: '2026-11-21' }));

    service.templates('t1', 'festival').subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/tenants/t1/content-templates');
    expect(req.request.params.get('category')).toBe('festival');
    req.flush(ok({ templates: [], categories: [], today: '2026-11-21' }));
  });

  it('creates a draft from a template for a location', () => {
    service.draftFromTemplate('t1', 'tpl 1', 'loc1').subscribe((r) => expect(r.content.id).toBe('c1'));
    const req = http.expectOne('/api/v1/tenants/t1/content-templates/tpl%201/draft');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ location_id: 'loc1' });
    req.flush(ok({ content: { id: 'c1' }, creative_spec: { headline: 'H', subline: '', cta_text: null } }));
  });

  it('posts the promo designer payload with decimal strings untouched', () => {
    service.promo('t1', { location_id: 'l1', offer_title: 'Spa', discount_type: 'flat', discount_value: '499.50' }).subscribe();
    const req = http.expectOne('/api/v1/tenants/t1/promo-designer');
    expect(req.request.body.discount_value).toBe('499.50');
    req.flush(ok({ caption: 'x', content: { id: 'c1' }, creative: null }));
  });

  it('covers creative create, update, attach and delete', () => {
    service.createCreative('t1', { name: 'N', layout: 'offer_banner', size: 'square', spec: { headline: 'H' } }).subscribe();
    const create = http.expectOne('/api/v1/tenants/t1/creatives');
    expect(create.request.method).toBe('POST');
    create.flush(ok({ id: 'cr1' }));

    service.updateCreative('t1', 'cr1', { name: 'M' }).subscribe();
    const upd = http.expectOne('/api/v1/tenants/t1/creatives/cr1');
    expect(upd.request.method).toBe('PATCH');
    upd.flush(ok({ id: 'cr1' }));

    service.attachAsset('t1', 'cr1', 'a1').subscribe();
    const attach = http.expectOne('/api/v1/tenants/t1/creatives/cr1/attach-asset');
    expect(attach.request.body).toEqual({ asset_id: 'a1' });
    attach.flush(ok({ id: 'cr1' }));

    let done = false;
    service.deleteCreative('t1', 'cr1').subscribe(() => (done = true));
    const del = http.expectOne('/api/v1/tenants/t1/creatives/cr1');
    expect(del.request.method).toBe('DELETE');
    del.flush(ok({ deleted: true }));
    expect(done).toBeTrue();
  });

  it('loads revisions, restores one and loads the timeline', () => {
    service.revisions('t1', 'c1').subscribe();
    http.expectOne('/api/v1/tenants/t1/contents/c1/revisions').flush(ok({ content_id: 'c1', status: 'draft', restorable: true, revisions: [] }));

    service.restoreRevision('t1', 'c1', 'r1').subscribe();
    const restore = http.expectOne('/api/v1/tenants/t1/contents/c1/revisions/r1/restore');
    expect(restore.request.method).toBe('POST');
    restore.flush(ok({ content_id: 'c1', status: 'draft', restorable: true, revisions: [] }));

    service.timeline('t1', 'c1').subscribe();
    http.expectOne('/api/v1/tenants/t1/contents/c1/timeline').flush(ok({ content_id: 'c1', status: 'draft', events: [] }));
  });
});
