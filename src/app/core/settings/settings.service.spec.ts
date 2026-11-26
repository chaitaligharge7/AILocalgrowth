import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads and saves notification preferences', () => {
    let prefs: unknown;
    service.notificationPreferences('t1').subscribe((p) => (prefs = p));
    const get = httpMock.expectOne('/api/v1/tenants/t1/notification-preferences');
    expect(get.request.method).toBe('GET');
    get.flush({ data: { preferences: [{ event_type: 'usage.threshold_reached', label: 'x', enabled: true }] }, meta: { request_id: 'r' } });
    expect(prefs).toEqual([{ event_type: 'usage.threshold_reached', label: 'x', enabled: true }]);

    service.saveNotificationPreferences('t1', [{ event_type: 'usage.threshold_reached', enabled: false }]).subscribe();
    const put = httpMock.expectOne('/api/v1/tenants/t1/notification-preferences');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ preferences: [{ event_type: 'usage.threshold_reached', enabled: false }] });
    put.flush({ data: { preferences: [] }, meta: { request_id: 'r' } });
  });

  it('marks all notifications read with POST .../notifications/read-all', () => {
    service.markAllNotificationsRead('t1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/notifications/read-all');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { marked_read: 3 }, meta: { request_id: 'r' } });
  });

  it('sends only the filters that are set on the activity log request', () => {
    service.activityLog('t1', { action: 'tenant.created', from: '2026-11-01', to: '', limit: 25 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/activity-log');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('action')).toBe('tenant.created');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.has('to')).toBeFalse();
    expect(req.request.params.get('limit')).toBe('25');
    req.flush({ data: { events: [], actions: [], filters: { action: null, from: null, to: null, limit: 25 } }, meta: { request_id: 'r' } });
  });

  it('lists and creates data requests', () => {
    service.dataRequests('t1').subscribe();
    const list = httpMock.expectOne('/api/v1/tenants/t1/data-requests');
    expect(list.request.method).toBe('GET');
    list.flush({ data: { requests: [], note: 'manual' }, meta: { request_id: 'r' } });

    service.createDataRequest('t1', 'export').subscribe();
    const create = httpMock.expectOne('/api/v1/tenants/t1/data-requests');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ type: 'export' });
    create.flush({ data: { id: 'd1', type: 'export', status: 'pending' }, meta: { request_id: 'r' } });
  });
});
