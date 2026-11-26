import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { NotificationService } from '../../core/notifications/notification.service';
import { AppNotification } from '../../core/notifications/notification.models';

/**
 * `/app/:tenantId/notifications` — the full-page list, complementing the
 * header bell dropdown (`NotificationBellComponent`) which only shows a
 * short preview. Backend: `GET /tenants/{t}/notifications`,
 * `POST /tenants/{t}/notifications/{id}/read`.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [],
  template: `
    <section class="notifications-page">
      <h1>Notifications</h1>

      <div class="filter-row">
        <label>
          <input type="checkbox" [checked]="unreadOnly()" (change)="toggleUnreadOnly($event)" />
          Unread only
        </label>
        <button type="button" (click)="refresh()" [disabled]="loading()">Refresh</button>
      </div>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (notifications().length === 0) {
        <p class="empty">No notifications.</p>
      } @else {
        <ul class="notification-list">
          @for (notification of notifications(); track notification.id) {
            <li [class.unread]="!notification.read_at">
              <div>
                <p class="type">{{ notification.type }}</p>
                <p class="meta">{{ notification.created_at }}</p>
              </div>
              @if (!notification.read_at) {
                <button type="button" (click)="markRead(notification)">Mark read</button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .notifications-page {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .filter-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .filter-row label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.875rem;
      }
      .notification-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .notification-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border: 1px solid #eee;
        border-radius: 6px;
      }
      .notification-list li.unread {
        background: #f3f7ff;
        border-color: #cdd9f5;
      }
      .type {
        margin: 0;
        font-weight: 600;
      }
      .meta {
        margin: 0;
        color: #666;
        font-size: 0.8rem;
      }
      .empty {
        color: #666;
      }
      .form-error {
        color: #b00020;
      }
      button {
        padding: 0.4rem 0.8rem;
        cursor: pointer;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit {
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly unreadOnly = signal(false);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  toggleUnreadOnly(event: Event): void {
    this.unreadOnly.set((event.target as HTMLInputElement).checked);
    this.refresh();
  }

  refresh(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.notificationService.list(tenantId, this.unreadOnly()).subscribe({
      next: (notifications) => {
        this.loading.set(false);
        this.notifications.set(notifications);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  markRead(notification: AppNotification): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.notificationService.markRead(tenantId, notification.id).subscribe({
      next: (updated) => {
        this.notifications.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
      },
    });
  }
}
