import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SupportService } from './support.service';
import { SupportTicket, SupportTicketDetail } from './support.models';

const ticket: SupportTicket = {
  id: 'tk1',
  tenant_id: 't1',
  requester_id: 'u1',
  assignee_id: null,
  category: 'billing',
  priority: 'normal',
  status: 'open',
  subject: 'Invoice looks wrong',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  closed_at: null,
  age_seconds: 10,
  time_since_last_response_seconds: null,
};

const detail: SupportTicketDetail = { ...ticket, messages: [] };

describe('SupportService', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates a ticket', () => {
    let result: SupportTicketDetail | undefined;
    service
      .create('t1', { category: 'billing', subject: 'Invoice looks wrong', body: 'Please check line 2.' })
      .subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/support/tickets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ category: 'billing', subject: 'Invoice looks wrong', body: 'Please check line 2.' });
    req.flush({ data: detail, meta: { request_id: 'r1' } });
    expect(result?.id).toBe('tk1');
  });

  it('lists tickets with an optional status filter', () => {
    service.list('t1', 'open').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/support/tickets');
    expect(req.request.params.get('status')).toBe('open');
    req.flush({ data: { tickets: [ticket] }, meta: { request_id: 'r1' } });
  });

  it('gets a ticket with its message thread', () => {
    let result: SupportTicketDetail | undefined;
    service.get('t1', 'tk1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/support/tickets/tk1');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: { ...detail, messages: [{ id: 'm1', ticket_id: 'tk1', sender_id: 'u1', body: 'hi', internal_only: false, created_at: '2026-11-01T00:00:00.000Z' }] },
      meta: { request_id: 'r1' },
    });
    expect(result?.messages.length).toBe(1);
  });

  it('posts a reply message', () => {
    service.addMessage('t1', 'tk1', { body: 'Following up' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/support/tickets/tk1/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Following up' });
    req.flush({ data: detail, meta: { request_id: 'r1' } });
  });

  it('changes ticket status', () => {
    service.changeStatus('t1', 'tk1', { status: 'resolved' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/support/tickets/tk1/status');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ status: 'resolved' });
    req.flush({ data: { ...detail, status: 'resolved' }, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 INVALID_STATE_TRANSITION unchanged', () => {
    let error: unknown;
    service.changeStatus('t1', 'tk1', { status: 'open' }).subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/support/tickets/tk1/status');
    req.flush(
      { error: { code: 'INVALID_STATE_TRANSITION', message: 'Ticket in status "open" cannot transition to "open".' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((error as { status: number }).status).toBe(409);
  });
});
