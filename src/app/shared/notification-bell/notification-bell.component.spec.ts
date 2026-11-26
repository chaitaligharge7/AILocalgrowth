import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AppNotification } from '../../core/notifications/notification.models';

function unreadNotification(id: string): AppNotification {
  return {
    id,
    tenant_id: 't1',
    user_id: 'u1',
    type: 'support.ticket_created',
    payload: null,
    read_at: null,
    sent_at: '2026-11-01T00:00:00.000Z',
    created_at: '2026-11-01T00:00:00.000Z',
  };
}

describe('NotificationBellComponent', () => {
  function setup(unread: AppNotification[]) {
    const notificationServiceStub = {
      list: jasmine.createSpy('list').and.returnValue(of(unread)),
      markRead: jasmine
        .createSpy('markRead')
        .and.callFake((_tenantId: string, id: string) => of({ ...unreadNotification(id), read_at: '2026-11-02T00:00:00.000Z' })),
    };
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1' } },
        { provide: NotificationService, useValue: notificationServiceStub },
      ],
    });
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, notificationServiceStub };
  }

  it('shows the unread count from GET ?unread=1', () => {
    const { component, notificationServiceStub } = setup([unreadNotification('n1'), unreadNotification('n2')]);
    expect(notificationServiceStub.list).toHaveBeenCalledWith('t1', true);
    expect(component.unreadCount()).toBe(2);
  });

  it('shows zero when there are no unread notifications', () => {
    const { component } = setup([]);
    expect(component.unreadCount()).toBe(0);
  });

  it('removes a notification from the unread preview once marked read', () => {
    const { component, notificationServiceStub } = setup([unreadNotification('n1'), unreadNotification('n2')]);
    component.markRead(unreadNotification('n1'));
    expect(notificationServiceStub.markRead).toHaveBeenCalledWith('t1', 'n1');
    expect(component.unreadCount()).toBe(1);
    expect(component.unread().some((n) => n.id === 'n1')).toBe(false);
  });

  it('caps the dropdown preview at 5 items even with more unread', () => {
    const many = Array.from({ length: 8 }, (_, i) => unreadNotification(`n${i}`));
    const { component } = setup(many);
    expect(component.unreadCount()).toBe(8);
    expect(component.previewItems().length).toBe(5);
  });
});
