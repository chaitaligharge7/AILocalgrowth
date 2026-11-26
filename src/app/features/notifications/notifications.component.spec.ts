import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AppNotification } from '../../core/notifications/notification.models';

const unread: AppNotification = {
  id: 'n1',
  tenant_id: 't1',
  user_id: 'u1',
  type: 'support.ticket_created',
  payload: null,
  read_at: null,
  sent_at: '2026-11-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
};

describe('NotificationsComponent', () => {
  function setup(notifications: AppNotification[]) {
    const notificationServiceStub = {
      list: jasmine.createSpy('list').and.returnValue(of(notifications)),
      markRead: jasmine
        .createSpy('markRead')
        .and.callFake((_tenantId: string, id: string) => of({ ...unread, id, read_at: '2026-11-02T00:00:00.000Z' })),
    };
    TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1' } },
        { provide: NotificationService, useValue: notificationServiceStub },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, notificationServiceStub };
  }

  it('loads notifications on init', () => {
    const { component } = setup([unread]);
    expect(component.notifications().length).toBe(1);
  });

  it('refreshes with unread=true when "unread only" is toggled on', () => {
    const { component, notificationServiceStub } = setup([unread]);
    component.unreadOnly.set(true);
    component.refresh();
    expect(notificationServiceStub.list).toHaveBeenCalledWith('t1', true);
  });

  it('marking a notification read updates it in place without refetching the list', () => {
    const { component, notificationServiceStub } = setup([unread]);
    component.markRead(unread);
    expect(notificationServiceStub.markRead).toHaveBeenCalledWith('t1', 'n1');
    expect(component.notifications()[0].read_at).toBe('2026-11-02T00:00:00.000Z');
  });
});
