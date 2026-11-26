import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LeadService } from './lead.service';
import { Lead, LeadDetail } from './lead.models';

const lead: Lead = {
  id: 'l1',
  tenant_id: 't1',
  location_id: null,
  source: 'manual',
  external_lead_id: null,
  name: 'Jane Doe',
  phone: '+919999999999',
  email: null,
  status: 'new',
  owner_id: null,
  consent_status: 'granted',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const detail: LeadDetail = { ...lead, activities: [] };

describe('LeadService', () => {
  let service: LeadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LeadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates a lead', () => {
    let result: Lead | undefined;
    service
      .create('t1', { name: 'Jane Doe', phone: '+919999999999', source: 'manual', consent_status: 'granted' })
      .subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Jane Doe',
      phone: '+919999999999',
      source: 'manual',
      consent_status: 'granted',
    });
    req.flush({ data: lead, meta: { request_id: 'r1' } });
    expect(result?.id).toBe('l1');
  });

  it('lists leads with optional status/owner_id filters', () => {
    service.list('t1', { status: 'new', owner_id: 'u1' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/leads');
    expect(req.request.params.get('status')).toBe('new');
    expect(req.request.params.get('owner_id')).toBe('u1');
    req.flush({ data: { leads: [lead] }, meta: { request_id: 'r1' } });
  });

  it('lists leads with no filters', () => {
    service.list('t1').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/leads');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ data: { leads: [] }, meta: { request_id: 'r1' } });
  });

  it('gets a lead with its activity timeline', () => {
    let result: LeadDetail | undefined;
    service.get('t1', 'l1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: detail, meta: { request_id: 'r1' } });
    expect(result?.activities).toEqual([]);
  });

  it('patches lead status', () => {
    service.update('t1', 'l1', { status: 'contacted' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'contacted' });
    req.flush({ data: { ...detail, status: 'contacted' }, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 INVALID_STATE_TRANSITION unchanged', () => {
    let error: unknown;
    service.update('t1', 'l1', { status: 'new' }).subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1');
    req.flush(
      { error: { code: 'INVALID_STATE_TRANSITION', message: 'Lead is already in status "new".' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((error as { status: number }).status).toBe(409);
  });

  it('adds an activity', () => {
    service.addActivity('t1', 'l1', { type: 'note', note: 'Called, left voicemail' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1/activities');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'note', note: 'Called, left voicemail' });
    req.flush({ data: detail, meta: { request_id: 'r1' } });
  });

  it('fetches the real sources summary (BW-098)', () => {
    let result: Record<string, number> | undefined;
    service.sourcesSummary('t1').subscribe((r) => (result = r.by_source));
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/sources-summary');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { by_source: { manual: 2, google: 1 } }, meta: { request_id: 'r1' } });
    expect(result).toEqual({ manual: 2, google: 1 });
  });

  it('fetches the real status summary (BW-100)', () => {
    let newCount: number | undefined;
    service.statusSummary('t1').subscribe((r) => (newCount = r.by_status.new));
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/status-summary');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: { by_status: { new: 3, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0, archived: 0 } },
      meta: { request_id: 'r1' },
    });
    expect(newCount).toBe(3);
  });

  it('adds a tag with POST /tags (BW-099)', () => {
    service.addTag('t1', 'l1', 'vip').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1/tags');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tag: 'vip' });
    req.flush({ data: { ...detail, tags: ['vip'] }, meta: { request_id: 'r1' } });
  });

  it('removes a tag with DELETE /tags/{tag} and URL-encodes it (BW-099)', () => {
    service.removeTag('t1', 'l1', 'hot lead').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1/tags/hot%20lead');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { ...detail, tags: [] }, meta: { request_id: 'r1' } });
  });

  it('sends tag, from and to as query params on the list call', () => {
    service.list('t1', { status: 'new', tag: 'vip', from: '2026-11-01', to: '2026-11-15' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/leads');
    expect(req.request.params.get('status')).toBe('new');
    expect(req.request.params.get('tag')).toBe('vip');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('to')).toBe('2026-11-15');
    req.flush({ data: { leads: [] }, meta: { request_id: 'r1' } });
  });

  it('sends the date range to BOTH summary endpoints and omits empty bounds', () => {
    service.statusSummary('t1', { from: '2026-11-01' }).subscribe();
    const status = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/leads/status-summary');
    expect(status.request.params.get('from')).toBe('2026-11-01');
    expect(status.request.params.has('to')).toBeFalse();
    status.flush({ data: { by_status: {} }, meta: { request_id: 'r1' } });

    service.sourcesSummary('t1', { to: '2026-11-15' }).subscribe();
    const sources = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/leads/sources-summary');
    expect(sources.request.params.get('to')).toBe('2026-11-15');
    expect(sources.request.params.has('from')).toBeFalse();
    sources.flush({ data: { by_source: {} }, meta: { request_id: 'r1' } });
  });

  it('manages custom field definitions (BW-099)', () => {
    service.listFields('t1').subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/lead-fields').flush({ data: { fields: [] }, meta: { request_id: 'r1' } });

    service.createField('t1', { label: 'Budget', field_type: 'number' }).subscribe();
    const create = httpMock.expectOne('/api/v1/tenants/t1/lead-fields');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ label: 'Budget', field_type: 'number' });
    create.flush({ data: { id: 'd1' }, meta: { request_id: 'r1' } });

    service.deleteField('t1', 'd1').subscribe();
    const del = httpMock.expectOne('/api/v1/tenants/t1/lead-fields/d1');
    expect(del.request.method).toBe('DELETE');
    del.flush({ data: { deleted: true }, meta: { request_id: 'r1' } });
  });

  it('writes custom field values with PUT /leads/{id}/fields', () => {
    service.setFieldValues('t1', 'l1', { budget: '2500' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/leads/l1/fields');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ fields: { budget: '2500' } });
    req.flush({ data: { ...detail, custom_fields: { budget: '2500' } }, meta: { request_id: 'r1' } });
  });
});
