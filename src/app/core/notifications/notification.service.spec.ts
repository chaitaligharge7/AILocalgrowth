import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { AppNotification } from './notification.models';

const unread: AppNotification = {
  id: 'n1',
  tenant_id: 't1',
  user_id: 'u1',
  type: 'support.ticket_created',
  payload: { ticket_id: 'tk1' },
  read_at: null,
  sent_at: '2026-11-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
};

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists all notifications', () => {
    let result: AppNotification[] | undefined;
    service.list('t1').subscribe((r) => (result = r));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/notifications');
    expect(req.request.params.has('unread')).toBe(false);
    req.flush({ data: { notifications: [unread] }, meta: { request_id: 'r1' } });
    expect(result?.length).toBe(1);
  });

  it('lists only unread notifications when requested', () => {
    service.list('t1', true).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/notifications');
    expect(req.request.params.get('unread')).toBe('1');
    req.flush({ data: { notifications: [unread] }, meta: { request_id: 'r1' } });
  });

  it('marks a notification read', () => {
    let result: AppNotification | undefined;
    service.markRead('t1', 'n1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/notifications/n1/read');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...unread, read_at: '2026-11-02T00:00:00.000Z' }, meta: { request_id: 'r1' } });
    expect(result?.read_at).toBe('2026-11-02T00:00:00.000Z');
  });

  it('surfaces 404 NOT_FOUND for a notification outside the caller tenant/user unchanged', () => {
    let error: unknown;
    service.markRead('t1', 'n404').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/notifications/n404/read');
    req.flush({ error: { code: 'NOT_FOUND', message: 'Notification not found.' }, request_id: 'r1' }, { status: 404, statusText: 'Not Found' });
    expect((error as { status: number }).status).toBe(404);
  });
});
