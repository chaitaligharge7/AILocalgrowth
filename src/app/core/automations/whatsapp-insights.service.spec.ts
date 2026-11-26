import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WhatsAppInsightsService } from './whatsapp-insights.service';
import { Campaign } from './whatsapp-insights.models';

const campaign: Campaign = {
  id: 'c1',
  name: 'VIP offer',
  template_id: 'tpl1',
  segment_status: null,
  segment_tag: 'vip',
  status: 'draft',
  recipients_total: 0,
  outcomes: {},
  skip_reasons: {},
  mock_provider: true,
  launched_at: null,
  created_at: '2026-11-20T04:30:00.000Z',
};

describe('WhatsAppInsightsService', () => {
  let service: WhatsAppInsightsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(WhatsAppInsightsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads webhook logs', () => {
    let logs: number | undefined;
    service.webhookLogs('t1').subscribe((r) => (logs = r.logs.length));
    const req = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/webhook-logs');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { mock_provider: true, logs: [] }, meta: { request_id: 'r1' } });
    expect(logs).toBe(0);
  });

  it('reads the consent summary', () => {
    let messageable: number | undefined;
    service.consentSummary('t1').subscribe((r) => (messageable = r.messageable_leads));
    const req = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/consent-summary');
    req.flush({
      data: {
        leads_by_consent_status: { granted: 2, declined: 1, unknown: 0 },
        whatsapp_consent_records: { active: 2, revoked: 0 },
        messageable_leads: 2,
      },
      meta: { request_id: 'r1' },
    });
    expect(messageable).toBe(2);
  });

  it('requests the usage report with the days window', () => {
    service.usageReport('t1', 7).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/whatsapp/usage-report');
    expect(req.request.params.get('days')).toBe('7');
    req.flush({
      data: {
        days: 7,
        total_messages: 0,
        by_status: {},
        by_template: [],
        by_day: [],
        total_cost: '0.0000',
        cost_basis: 'mock_provider_estimate',
        mock_provider: true,
      },
      meta: { request_id: 'r1' },
    });
  });

  it('reads config', () => {
    service.config('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/config');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { mode: 'mock' }, meta: { request_id: 'r1' } });
  });

  it('lists, creates and launches campaigns', () => {
    let listed: Campaign[] | undefined;
    service.listCampaigns('t1').subscribe((r) => (listed = r));
    httpMock
      .expectOne('/api/v1/tenants/t1/whatsapp/campaigns')
      .flush({ data: { campaigns: [campaign] }, meta: { request_id: 'r1' } });
    expect(listed?.length).toBe(1);

    service.createCampaign('t1', { name: 'VIP offer', template_id: 'tpl1', segment_tag: 'vip' }).subscribe();
    const create = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/campaigns');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.segment_tag).toBe('vip');
    create.flush({ data: campaign, meta: { request_id: 'r2' } });

    service.launchCampaign('t1', 'c1').subscribe();
    const launch = httpMock.expectOne('/api/v1/tenants/t1/whatsapp/campaigns/c1/launch');
    expect(launch.request.method).toBe('POST');
    launch.flush({ data: { ...campaign, status: 'launched' }, meta: { request_id: 'r3' } });
  });
});
