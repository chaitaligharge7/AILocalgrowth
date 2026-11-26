import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { NotificationPreference } from '../../core/settings/settings.models';
import { SettingsService } from '../../core/settings/settings.service';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Settings → Notifications: the caller's own per-event opt-outs
 * (`GET|PUT .../notification-preferences`). Everything is on until the user
 * turns it off; the outbox worker checks the saved choice before creating
 * each in-app notification. Also offers "mark all as read".
 */
@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [SkeletonLoaderComponent],
  template: `
    <section class="block">
      <h2>Notifications</h2>
      <p class="meta">Choose which in-app, email, and web-push notifications you receive for this business. These settings are yours alone.</p>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else {
        <div class="pref-header">
          <span>Notification event</span>
          <span>In-App</span>
          <span>Email</span>
          <span>Web Push</span>
        </div>
        <ul class="pref-list" data-testid="notification-prefs">
          @for (pref of prefs(); track pref.event_type) {
            <li class="pref-row">
              <div class="pref-info">
                <span class="pref-label">{{ pref.label }}</span>
                <span class="pref-code">{{ pref.event_type }}</span>
              </div>
              <label class="ch-toggle" title="In-App">
                <input
                  type="checkbox"
                  [checked]="pref.enabled"
                  [disabled]="saving() === pref.event_type"
                  (change)="toggle(pref, $event)"
                />
              </label>
              <label class="ch-toggle" title="Email">
                <input
                  type="checkbox"
                  [checked]="pref.email_enabled !== false"
                  [disabled]="saving() === pref.event_type"
                  (change)="toggleChannel(pref, 'email', $event)"
                />
              </label>
              <label class="ch-toggle" title="Web Push">
                <input
                  type="checkbox"
                  [checked]="pref.push_enabled === true"
                  [disabled]="saving() === pref.event_type"
                  (change)="toggleChannel(pref, 'push', $event)"
                />
              </label>
            </li>
          }
        </ul>
        @if (saveError()) {
          <p class="form-error" role="alert">{{ saveError() }}</p>
        }
        <div class="actions">
          <button type="button" (click)="markAllRead()" [disabled]="markingRead()">
            {{ markingRead() ? 'Marking…' : 'Mark all notifications as read' }}
          </button>
          @if (notice()) {
            <span class="success" role="status">{{ notice() }}</span>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .pref-header {
        display: grid;
        grid-template-columns: 1fr 72px 72px 80px;
        gap: 0.75rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .pref-header span:not(:first-child) { text-align: center; }
      .pref-list { list-style: none; margin: 0 0 1rem; padding: 0; }
      .pref-row {
        display: grid;
        grid-template-columns: 1fr 72px 72px 80px;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0;
        border-bottom: 1px solid var(--color-border);
      }
      .pref-info { display: flex; flex-direction: column; gap: 2px; }
      .ch-toggle { display: flex; justify-content: center; cursor: pointer; }
      .pref-label { font-weight: 600; font-size: 0.875rem; }
      .pref-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; color: var(--color-text-muted); }
      .actions { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
      .form-error { color: #b00020; font-size: 0.875rem; }
      .success { color: #146c2e; font-size: 0.875rem; }
      button { padding: 0.5rem 1rem; cursor: pointer; }
      @media (max-width: 640px) {
        .pref-row { grid-template-columns: auto 1fr; }
        .pref-code { grid-column: 2; }
      }
    `,
  ],
})
export class SettingsNotificationsComponent implements OnInit {
  readonly prefs = signal<NotificationPreference[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly markingRead = signal(false);
  readonly notice = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly settings: SettingsService,
  ) {}

  ngOnInit(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.settings.notificationPreferences(tenantId).subscribe({
      next: (prefs) => {
        this.loading.set(false);
        this.prefs.set(prefs);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  toggle(pref: NotificationPreference, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const enabled = checkbox.checked;
    this.saving.set(pref.event_type);
    this.saveError.set(null);
    this.settings.saveNotificationPreferences(this.tenantId(), [{ event_type: pref.event_type, enabled }]).subscribe({
      next: (prefs) => {
        this.saving.set(null);
        this.prefs.set(prefs);
      },
      error: (err: unknown) => {
        this.saving.set(null);
        checkbox.checked = !enabled;
        this.saveError.set(apiErrorMessage(err));
      },
    });
  }

  toggleChannel(pref: NotificationPreference, channel: 'email' | 'push', event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const checked = checkbox.checked;
    this.saving.set(pref.event_type);
    this.saveError.set(null);
    const payload = {
      event_type: pref.event_type,
      enabled: pref.enabled,
      email_enabled: channel === 'email' ? checked : pref.email_enabled !== false,
      push_enabled: channel === 'push' ? checked : pref.push_enabled === true,
    };
    this.settings.saveNotificationPreferences(this.tenantId(), [payload]).subscribe({
      next: (prefs) => {
        this.saving.set(null);
        this.prefs.set(prefs);
      },
      error: (err: unknown) => {
        this.saving.set(null);
        checkbox.checked = !checked;
        this.saveError.set(apiErrorMessage(err));
      },
    });
  }

  markAllRead(): void {
    this.markingRead.set(true);
    this.notice.set(null);
    this.saveError.set(null);
    this.settings.markAllNotificationsRead(this.tenantId()).subscribe({
      next: (res) => {
        this.markingRead.set(false);
        this.notice.set(res.marked_read === 0 ? 'Nothing to mark — you are all caught up.' : `${res.marked_read} marked as read.`);
      },
      error: (err: unknown) => {
        this.markingRead.set(false);
        this.saveError.set(apiErrorMessage(err));
      },
    });
  }
}
