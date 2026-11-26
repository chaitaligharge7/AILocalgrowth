import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { AppNotification } from '../../core/notifications/notification.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { IconComponent } from '../icons/icon.component';

/**
 * Header notification bell popover wired into `AppShellComponent`'s top bar.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="bell-wrap">
      <button
        type="button"
        class="bell-button"
        (click)="toggleOpen()"
        [attr.aria-label]="unreadCount() + ' unread notifications'"
      >
        <ui-icon name="bell" [size]="16" />
        @if (unreadCount() > 0) {
          <span class="count-badge">{{ unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="dropdown">
          <div class="dropdown-head">
            <strong>Notifications</strong>
            <span class="badge badge--neutral">{{ unreadCount() }} unread</span>
          </div>
          @if (loading()) {
            <p class="meta">Loading…</p>
          } @else if (previewItems().length === 0) {
            <p class="meta">No unread notifications.</p>
          } @else {
            <ul>
              @for (notification of previewItems(); track notification.id) {
                <li>
                  <span class="type">{{ notification.type }}</span>
                  <button type="button" class="mark-btn" (click)="markRead(notification)">Mark read</button>
                </li>
              }
            </ul>
          }
          <div class="dropdown-foot">
            <a [routerLink]="['/app', tenantId(), 'notifications']" (click)="open.set(false)">See all notifications →</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .bell-wrap {
        position: relative;
      }
      .bell-button {
        position: relative;
        width: 30px;
        height: 30px;
        padding: 0;
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      .bell-button:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .count-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        min-width: 16px;
        height: 16px;
        background: var(--color-danger);
        color: #fff;
        font-size: 0.62rem;
        font-weight: var(--font-bold);
        border-radius: 999px;
        padding: 0 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--color-surface);
      }
      .dropdown {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        width: 290px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        padding: 10px 12px;
        z-index: 30;
      }
      .dropdown-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--color-border);
        font-size: var(--text-xs);
      }
      .dropdown ul {
        list-style: none;
        margin: 0 0 8px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dropdown li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        font-size: var(--text-xs);
      }
      .type {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mark-btn {
        padding: 0.2rem 0.45rem;
        font-size: 0.68rem;
        white-space: nowrap;
      }
      .meta {
        margin: 8px 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .dropdown-foot {
        padding-top: 8px;
        border-top: 1px solid var(--color-border);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
      }
      .dropdown-foot a {
        text-decoration: none;
      }
    `,
  ],
})
export class NotificationBellComponent implements OnInit {
  private static readonly PREVIEW_LIMIT = 5;

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly unread = signal<AppNotification[]>([]);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly unreadCount = computed(() => this.unread().length);
  readonly previewItems = computed(() => this.unread().slice(0, NotificationBellComponent.PREVIEW_LIMIT));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly notifications: NotificationService,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  toggleOpen(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.refresh();
    }
  }

  refresh(): void {
    const id = this.tenantId();
    if (!id) {
      this.unread.set([]);
      return;
    }
    this.loading.set(true);
    this.notifications.list(id, true).subscribe({
      next: (items) => {
        this.loading.set(false);
        this.unread.set(items);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  markRead(notification: AppNotification): void {
    const id = this.tenantId();
    if (!id) {
      return;
    }
    this.notifications.markRead(id, notification.id).subscribe({
      next: () => {
        this.unread.update((list) => list.filter((n) => n.id !== notification.id));
      },
    });
  }
}
