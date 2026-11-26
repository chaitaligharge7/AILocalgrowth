import { Component, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SettingsAccountComponent } from './settings-account.component';
import { SettingsActivityComponent } from './settings-activity.component';
import { SettingsDataComponent } from './settings-data.component';
import { SettingsNotificationsComponent } from './settings-notifications.component';
import { SettingsSessionsComponent } from './settings-sessions.component';

type SettingsTab = 'notifications' | 'account' | 'security' | 'activity' | 'data';

interface TabDef {
  id: SettingsTab;
  label: string;
  /** Roles that see the tab at all; the server enforces the same rule on the data. */
  roles?: string[];
}

const TABS: TabDef[] = [
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
  { id: 'security', label: 'Security' },
  { id: 'activity', label: 'Activity log', roles: ['owner', 'admin'] },
  { id: 'data', label: 'Data & privacy', roles: ['owner'] },
];

/**
 * `/app/:tenantId/settings` — Settings hub for the signed-in user and the
 * business: notification preferences, own profile + password, active
 * sessions, the business activity log (owner/admin) and data requests
 * (owner). Team management lives on the Members screen.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SettingsNotificationsComponent,
    SettingsAccountComponent,
    SettingsSessionsComponent,
    SettingsActivityComponent,
    SettingsDataComponent,
  ],
  template: `
    <section class="settings">
      <app-page-header
        eyebrow="Settings"
        eyebrowLabel="Workspace"
        title="Settings"
        subtitle="Notifications, your account and security, and this business's activity."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <nav class="tabs" role="tablist" aria-label="Settings sections">
          @for (t of visibleTabs(); track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">
              {{ t.label }}
            </button>
          }
        </nav>

        @switch (tab()) {
          @case ('notifications') {
            <app-settings-notifications />
          }
          @case ('account') {
            <app-settings-account />
          }
          @case ('security') {
            <app-settings-sessions />
          }
          @case ('activity') {
            <app-settings-activity />
          }
          @case ('data') {
            <app-settings-data />
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .settings {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 0.75rem;
      }
      .tabs button {
        border-radius: 999px;
        padding: 0.4rem 1rem;
        cursor: pointer;
      }
      .tabs button.active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .form-error {
        color: #b00020;
      }
    `,
  ],
})
export class SettingsComponent {
  readonly tab = signal<SettingsTab>('notifications');
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly visibleTabs = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role ?? '';
    return TABS.filter((t) => !t.roles || t.roles.includes(role));
  });

  constructor(private readonly currentTenant: CurrentTenantService) {}
}
