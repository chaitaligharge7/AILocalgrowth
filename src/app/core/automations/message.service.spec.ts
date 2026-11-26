import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from './message.service';
import { MessageDelivery } from './message.models';

const message: MessageDelivery = {
  id: 'm1',
  tenant_id: 't1',
  lead_id: 'l1',
  provider: 'whatsapp',
  template_id: 'tpl1',
  external_message_id: 'mock-1',
  status: 'sent',
  cost: '0.0000',
  sent_at: '2026-11-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('MessageService', () => {
  let service: MessageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MessageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists message deliveries with optional status/lead_id filters', () => {
    let result: MessageDelivery[] | undefined;
    service.list('t1', { status: 'sent', lead_id: 'l1' }).subscribe((r) => (result = r));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/messages');
    expect(req.request.params.get('status')).toBe('sent');
    expect(req.request.params.get('lead_id')).toBe('l1');
    req.flush({ data: { messages: [message] }, meta: { request_id: 'r1' } });
    expect(result?.length).toBe(1);
  });

  it('lists message deliveries with no filters', () => {
    service.list('t1').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/messages');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ data: { messages: [] }, meta: { request_id: 'r1' } });
  });
});
