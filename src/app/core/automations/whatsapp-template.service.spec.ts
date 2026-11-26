import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppTemplate } from './whatsapp-template.models';

const template: WhatsAppTemplate = {
  id: 'tpl1',
  provider: 'whatsapp',
  external_template_id: 'lead_welcome',
  category: 'marketing',
  language: 'en',
  status: 'approved',
  variables: ['name'],
  mock_provider: true,
};

describe('WhatsAppTemplateService', () => {
  let service: WhatsAppTemplateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(WhatsAppTemplateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the mock-approved templates for a tenant', () => {
    let result: WhatsAppTemplate[] | undefined;
    service.list('t1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/templates');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { templates: [template] }, meta: { request_id: 'r1' } });
    expect(result?.length).toBe(1);
    expect(result?.[0].mock_provider).toBe(true);
  });
});
