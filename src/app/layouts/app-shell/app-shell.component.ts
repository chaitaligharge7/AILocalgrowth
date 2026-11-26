import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { TenantService } from '../../core/tenancy/tenant.service';
import { AnnouncementBannerComponent } from '../../shared/announcement-banner/announcement-banner.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';
import { WorkspaceNavItem, WorkspaceShellComponent } from '../../shared/workspace-shell/workspace-shell.component';

/**
 * `/app/:tenantId/*` Business & Client workspace shell.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NotificationBellComponent, WorkspaceShellComponent, AnnouncementBannerComponent, IconComponent],
  template: `
    <app-workspace-shell
      [navItems]="navItems()"
      sectionLabel="Business"
      [avatarInitial]="avatarInitial()"
      [userName]="userName()"
      [avatarTitle]="userTooltip()"
      (logout)="logout()"
    >
      <div shellExtra class="tenant-switcher">
        <div class="switcher-pill">
          <ui-icon name="business" [size]="14" />
          <select
            id="tenant-select"
            title="Switch business"
            [value]="currentTenant.selectedTenantId()"
            (change)="onTenantChange($event)"
          >
            @for (tenant of tenants(); track tenant.id) {
              <option [value]="tenant.id">{{ tenant.display_name }}</option>
            }
          </select>
        </div>
        <a routerLink="/app/choose-tenant" class="all-workspaces-link" title="Switch or create business">
          All businesses
        </a>
        <app-notification-bell />
      </div>
      <app-announcement-banner />
      <router-outlet />
    </app-workspace-shell>
  `,
  styles: [
    `
      .tenant-switcher {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .switcher-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 6px 0 9px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        color: var(--color-primary);
      }
      .switcher-pill select {
        max-width: 175px;
        border: none;
        background: transparent;
        padding: 0.32rem 0.25rem;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text);
        box-shadow: none;
      }
      .switcher-pill select:focus {
        outline: none;
        box-shadow: none;
      }
      .all-workspaces-link {
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        color: var(--color-text-muted);
        text-decoration: none;
        padding: 0.32rem 0.6rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        white-space: nowrap;
      }
      .all-workspaces-link:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      @media (max-width: 720px) {
        .all-workspaces-link {
          display: none;
        }
      }
    `,
  ],
})
export class AppShellComponent implements OnInit {
  readonly tenants = signal<Tenant[]>([]);
  readonly tenantId = signal<string>('');

  readonly navItems = computed<WorkspaceNavItem[]>(() => {
    const id = this.tenantId();
    return [
      { group: 'Overview', label: 'Dashboard', icon: 'grid', link: ['/app', id, 'dashboard'] },
      { group: 'Overview', label: 'Analytics', icon: 'analytics', link: ['/app', id, 'analytics'] },
      { group: 'Overview', label: 'Business profile', icon: 'business', link: ['/app', id, 'business-profile'] },

      { group: 'Studio & Content', label: 'AI studio', icon: 'ai', link: ['/app', id, 'ai-studio'] },
      { group: 'Studio & Content', label: 'Creative studio', icon: 'palette', link: ['/app', id, 'studio'] },
      { group: 'Studio & Content', label: 'Content', icon: 'content', link: ['/app', id, 'content'] },
      { group: 'Studio & Content', label: 'Campaigns', icon: 'campaigns', link: ['/app', id, 'campaigns'] },
      { group: 'Studio & Content', label: 'Calendar', icon: 'calendar', link: ['/app', id, 'calendar'] },
      { group: 'Studio & Content', label: 'Brand kit', icon: 'target', link: ['/app', id, 'brand-kit'] },
      { group: 'Studio & Content', label: 'Assets', icon: 'image', link: ['/app', id, 'assets'] },

      { group: 'Growth & CRM', label: 'Google profile', icon: 'reviews', link: ['/app', id, 'google'] },
      { group: 'Growth & CRM', label: 'Review insights', icon: 'performance', link: ['/app', id, 'reviews', 'insights'] },
      { group: 'Growth & CRM', label: 'Leads', icon: 'leads', link: ['/app', id, 'leads'] },
      { group: 'Growth & CRM', label: 'Automations', icon: 'zap', link: ['/app', id, 'automations'] },
      { group: 'Growth & CRM', label: 'Integrations', icon: 'integrations', link: ['/app', id, 'integrations'] },

      { group: 'Administration', label: 'Members', icon: 'team', link: ['/app', id, 'members'] },
      { group: 'Administration', label: 'Billing', icon: 'subscription', link: ['/app', id, 'billing'] },
      { group: 'Administration', label: 'Agency invites', icon: 'link', link: ['/app', id, 'agency-invites'] },
      { group: 'Administration', label: 'Settings', icon: 'settings', link: ['/app', id, 'settings'] },
      { group: 'Administration', label: 'Help centre', icon: 'help', link: ['/app', id, 'help'] },
      { group: 'Administration', label: 'Support', icon: 'support', link: ['/app', id, 'support'] },
    ];
  });

  readonly avatarInitial = computed(() => {
    const user = this.auth.currentUser();
    const source = user?.name || user?.email || '?';
    return source.charAt(0).toUpperCase();
  });

  readonly userName = computed(() => this.auth.currentUser()?.name || this.auth.currentUser()?.email || '');

  readonly userTooltip = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return 'Signed in user';
    return user.name && user.email ? `${user.name} (${user.email})` : user.name || user.email;
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tenantService: TenantService,
    readonly currentTenant: CurrentTenantService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.tenantId.set(id);
    this.tenantService.list().subscribe({
      next: (tenants) => this.tenants.set(tenants),
      error: () => this.tenants.set([]),
    });
  }

  onTenantChange(event: Event): void {
    const nextId = (event.target as HTMLSelectElement).value;
    if (nextId && nextId !== this.tenantId()) {
      void this.router.navigate(['/app', nextId, 'dashboard']);
    }
  }

  logout(): void {
    this.currentTenant.clear();
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/auth/login']),
      error: () => {
        this.auth.clearSession();
        void this.router.navigate(['/auth/login']);
      },
    });
  }
}
