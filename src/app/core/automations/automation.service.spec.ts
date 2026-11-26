import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AutomationService } from './automation.service';
import { Automation } from './automation.models';

const automation: Automation = {
  id: 'a1',
  tenant_id: 't1',
  trigger_code: 'lead.created',
  template_id: 'tpl1',
  rules_json: null,
  enabled: true,
  created_by: 'u1',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('AutomationService', () => {
  let service: AutomationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AutomationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists automations', () => {
    let result: Automation[] | undefined;
    service.list('t1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/automations');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { automations: [automation] }, meta: { request_id: 'r1' } });
    expect(result?.length).toBe(1);
  });

  it('creates an automation', () => {
    service.create('t1', { trigger_code: 'lead.created', template_id: 'tpl1', enabled: true }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/automations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ trigger_code: 'lead.created', template_id: 'tpl1', enabled: true });
    req.flush({ data: automation, meta: { request_id: 'r1' } });
  });

  it('patches an automation (enable toggle and rules)', () => {
    service.update('t1', 'a1', { enabled: false, rules_json: { delay_hours: 5 } }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/automations/a1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ enabled: false, rules_json: { delay_hours: 5 } });
    req.flush({ data: { ...automation, enabled: false }, meta: { request_id: 'r1' } });
  });

  it('deletes an automation', () => {
    let done = false;
    service.delete('t1', 'a1').subscribe(() => (done = true));
    const req = httpMock.expectOne('/api/v1/tenants/t1/automations/a1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { deleted: true, id: 'a1' }, meta: { request_id: 'r1' } });
    expect(done).toBeTrue();
  });

  it('surfaces 422 VALIDATION_ERROR when template_id is missing for lead.created', () => {
    let error: unknown;
    service.create('t1', { trigger_code: 'lead.created' }).subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/automations');
    req.flush(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Automation creation failed validation.',
          fields: { template_id: 'template_id is required for the lead.created trigger.' },
        },
        request_id: 'r1',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect((error as { status: number }).status).toBe(422);
  });
});
