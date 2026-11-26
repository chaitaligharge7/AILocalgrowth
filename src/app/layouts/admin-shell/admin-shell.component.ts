import { Component, computed } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../../core/admin/admin-auth.service';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceNavItem, WorkspaceShellComponent } from '../../shared/workspace-shell/workspace-shell.component';

/**
 * `/admin/*` Platform Admin workspace shell.
 */
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, WorkspaceShellComponent],
  template: `
    <app-workspace-shell
      [navItems]="navItems"
      sectionLabel="Platform Admin"
      [avatarInitial]="avatarInitial()"
      [userName]="userName()"
      [avatarTitle]="userTooltip()"
      (logout)="logout()"
    >
      <span shellExtra class="badge badge--warning badge--dot">MFA Elevated</span>
      <router-outlet />
    </app-workspace-shell>
  `,
  styles: [],
})
export class AdminShellComponent {
  readonly navItems: WorkspaceNavItem[] = [
    { group: 'Executive', label: 'Dashboard', icon: 'grid', link: '/admin/dashboard' },
    { group: 'Executive', label: 'Overview', icon: 'analytics', link: '/admin/overview' },
    { group: 'Executive', label: 'AI usage', icon: 'ai', link: '/admin/ai-usage' },

    { group: 'Directory', label: 'Tenants', icon: 'business', link: '/admin/tenants' },
    { group: 'Directory', label: 'Agencies', icon: 'clients', link: '/admin/agencies' },
    { group: 'Directory', label: 'Users', icon: 'users', link: '/admin/users' },
    { group: 'Directory', label: 'Verification', icon: 'audit', link: '/admin/verifications' },

    { group: 'Operations & Support', label: 'Support queue', icon: 'support', link: '/admin/support' },
    { group: 'Operations & Support', label: 'Support report', icon: 'reports', link: '/admin/support-report' },
    { group: 'Operations & Support', label: 'Feedback', icon: 'reviews', link: '/admin/feedback' },
    { group: 'Operations & Support', label: 'Announcements', icon: 'bell', link: '/admin/announcements' },
    { group: 'Operations & Support', label: 'Help centre', icon: 'help', link: '/admin/help' },
    { group: 'Operations & Support', label: 'Operations', icon: 'integrations', link: '/admin/ops' },
    { group: 'Operations & Support', label: 'Jobs', icon: 'jobs', link: '/admin/jobs' },

    { group: 'Commerce & Security', label: 'Plans', icon: 'subscription', link: '/admin/plans' },
    { group: 'Commerce & Security', label: 'Add-ons', icon: 'plus', link: '/admin/addons' },
    { group: 'Commerce & Security', label: 'Billing reconciliation', icon: 'performance', link: '/admin/billing-reconciliation' },
    { group: 'Commerce & Security', label: 'Feature flags', icon: 'flag', link: '/admin/feature-flags' },
    { group: 'Commerce & Security', label: 'Administrators', icon: 'security', link: '/admin/admins' },
    { group: 'Commerce & Security', label: 'Privacy requests', icon: 'security', link: '/admin/privacy' },
    { group: 'Commerce & Security', label: 'Audit events', icon: 'audit', link: '/admin/audit-events' },
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
    private readonly adminAuth: AdminAuthService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  logout(): void {
    this.adminAuth.endAdminSession();
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/admin/login']),
      error: () => void this.router.navigate(['/admin/login']),
    });
  }
}
