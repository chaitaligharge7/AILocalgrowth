import { Component, OnInit, computed } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AgencyConsoleService } from '../../core/agency/agency-console.service';
import { CurrentAgencyService } from '../../core/agency/current-agency.service';
import { AnnouncementBannerComponent } from '../../shared/announcement-banner/announcement-banner.component';
import { WorkspaceNavItem, WorkspaceShellComponent } from '../../shared/workspace-shell/workspace-shell.component';

/**
 * `/agency/*` Agency Owner & Staff workspace shell.
 */
@Component({
  selector: 'app-agency-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, WorkspaceShellComponent, AnnouncementBannerComponent],
  template: `
    <app-workspace-shell
      [navItems]="navItems"
      sectionLabel="Agency"
      [avatarInitial]="avatarInitial()"
      [userName]="userName()"
      [avatarTitle]="userTooltip()"
      (logout)="logout()"
    >
      @if (branding.currentBranding(); as b) {
        <div shellExtra class="brand-pill" [style.borderColor]="b.primary_color || ''" [title]="b.tagline || 'Agency brand: ' + b.brand_name">
          <span class="brand-dot" [style.background]="b.primary_color || 'var(--color-primary)'"></span>
          <span class="brand-name" [style.color]="b.primary_color">{{ b.brand_name }}</span>
        </div>
      } @else if (currentAgency.agency()) {
        <div shellExtra class="brand-pill" [title]="'Agency brand: ' + currentAgency.agency()!.brand_name">
          <span class="brand-dot"></span>
          <span class="brand-name">{{ currentAgency.agency()!.brand_name }}</span>
        </div>
      }
      <a shellExtra class="switch-link" routerLink="/app/choose-tenant">My businesses →</a>
      <app-announcement-banner />
      <router-outlet />
    </app-workspace-shell>
  `,
  styles: [
    `
      .brand-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0.28rem 0.65rem;
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        white-space: nowrap;
      }
      .brand-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-primary);
      }
      .brand-name {
        font-weight: var(--font-semibold);
        color: var(--color-primary);
        font-size: var(--text-xs);
      }
      .switch-link {
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 0.32rem 0.65rem;
        text-decoration: none;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        white-space: nowrap;
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .switch-link:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
    `,
  ],
})
export class AgencyShellComponent implements OnInit {
  readonly navItems: WorkspaceNavItem[] = [
    { group: 'Command Center', label: 'Overview', icon: 'overview', link: '/agency/overview' },
    { group: 'Command Center', label: 'Notifications', icon: 'bell', link: '/agency/notifications' },

    { group: 'Client Operations', label: 'Clients', icon: 'clients', link: '/agency/clients' },
    { group: 'Client Operations', label: 'Team', icon: 'team', link: '/agency/team' },
    { group: 'Client Operations', label: 'Cross-client calendar', icon: 'calendar', link: '/agency/calendar' },

    { group: 'Insights & Usage', label: 'Analytics', icon: 'analytics', link: '/agency/analytics' },
    { group: 'Insights & Usage', label: 'Client report', icon: 'reports', link: '/agency/reports' },
    { group: 'Insights & Usage', label: 'Pooled usage', icon: 'performance', link: '/agency/usage' },

    { group: 'Governance', label: 'Billing', icon: 'subscription', link: '/agency/billing' },
    { group: 'Governance', label: 'Branding', icon: 'palette', link: '/agency/branding' },
    { group: 'Governance', label: 'Roles', icon: 'security', link: '/agency/roles' },
    { group: 'Governance', label: 'Activity log', icon: 'audit', link: '/agency/activity' },
  ];

  readonly avatarInitial = computed(() => {
    const user = this.auth.currentUser();
    const source = user?.name || user?.email || 'A';
    return source.charAt(0).toUpperCase();
  });

  readonly userName = computed(() => this.auth.currentUser()?.name || this.auth.currentUser()?.email || '');

  readonly userTooltip = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return 'Signed in user';
    return user.name && user.email ? `${user.name} (${user.email})` : user.name || user.email;
  });

  constructor(
    readonly currentAgency: CurrentAgencyService,
    readonly branding: AgencyConsoleService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.branding.branding().subscribe({ error: () => undefined });
  }

  logout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/auth/login']),
      error: () => void this.router.navigate(['/auth/login']),
    });
  }
}
