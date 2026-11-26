import { Routes } from '@angular/router';
import { authGuard } from '../../guards/auth.guard';
import { adminAuthGuard } from '../../guards/admin-auth.guard';

/**
 * Top-level `/admin/*` route tree (blueprint §3.3) — a SEPARATE shell from
 * `/app/*`, not nested under any `:tenantId`. Registered directly in
 * `app.routes.ts`, not under the `app` route's children.
 *
 * - `/admin/login` is public (no guard) — reuses `AuthService.login()`.
 * - `/admin/mfa` requires a valid normal access token (`authGuard`) since
 *   `POST /admin/auth/mfa/verify` is bearer-authenticated, but NOT an
 *   admin session (that's what it issues).
 * - Everything else requires `adminAuthGuard` (valid access token AND a
 *   live admin session).
 */
export const ADMIN_AREA_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('../../features/admin/login/admin-login.component').then((m) => m.AdminLoginComponent),
    title: 'Platform admin login — Scriptlet LocalGrowth',
  },
  {
    path: 'mfa',
    canActivate: [authGuard],
    loadComponent: () => import('../../features/admin/mfa/admin-mfa.component').then((m) => m.AdminMfaComponent),
    title: 'Verify MFA — Scriptlet LocalGrowth',
  },
  {
    path: '',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('../../features/admin/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
        title: 'Platform admin — Scriptlet LocalGrowth',
      },
      {
        path: 'overview',
        loadComponent: () => import('../../features/admin/overview/admin-overview.component').then((m) => m.AdminOverviewComponent),
        title: 'Platform overview — Platform admin',
      },
      {
        path: 'tenants',
        loadComponent: () => import('../../features/admin/tenants/admin-tenants.component').then((m) => m.AdminTenantsComponent),
        title: 'Tenants — Platform admin',
      },
      {
        path: 'tenants/:tenantId',
        loadComponent: () =>
          import('../../features/admin/overview/admin-tenant-detail.component').then((m) => m.AdminTenantDetailComponent),
        title: 'Business details — Platform admin',
      },
      {
        path: 'users',
        loadComponent: () => import('../../features/admin/overview/admin-lists.component').then((m) => m.AdminUsersComponent),
        title: 'Users — Platform admin',
      },
      {
        path: 'agencies',
        loadComponent: () => import('../../features/admin/overview/admin-lists.component').then((m) => m.AdminAgenciesComponent),
        title: 'Agencies — Platform admin',
      },
      {
        path: 'support',
        loadComponent: () => import('../../features/admin/overview/admin-lists.component').then((m) => m.AdminSupportComponent),
        title: 'Support queue — Platform admin',
      },
      {
        path: 'addons',
        loadComponent: () => import('../../features/admin/overview/admin-addons.component').then((m) => m.AdminAddonsComponent),
        title: 'Add-ons — Platform admin',
      },
      {
        path: 'ops',
        loadComponent: () => import('../../features/admin/ops/admin-ops.component').then((m) => m.AdminOpsComponent),
        title: 'Operations — Platform admin',
      },
      {
        path: 'ai-usage',
        loadComponent: () => import('../../features/admin/ops/admin-console.components').then((m) => m.AdminAiUsageComponent),
        title: 'AI usage — Platform admin',
      },
      {
        path: 'support-report',
        loadComponent: () => import('../../features/admin/ops/admin-console.components').then((m) => m.AdminSupportReportComponent),
        title: 'Support report — Platform admin',
      },
      {
        path: 'announcements',
        loadComponent: () => import('../../features/admin/ops/admin-console.components').then((m) => m.AdminAnnouncementsComponent),
        title: 'Announcements — Platform admin',
      },
      {
        path: 'admins',
        loadComponent: () => import('../../features/admin/ops/admin-console.components').then((m) => m.AdminAdminsComponent),
        title: 'Administrators — Platform admin',
      },
      {
        path: 'help',
        loadComponent: () => import('../../features/admin/console/admin-platform.components').then((m) => m.AdminHelpArticlesComponent),
        title: 'Help centre — Platform admin',
      },
      {
        path: 'feedback',
        loadComponent: () => import('../../features/admin/console/admin-platform.components').then((m) => m.AdminFeedbackComponent),
        title: 'Feedback — Platform admin',
      },
      {
        path: 'verifications',
        loadComponent: () => import('../../features/admin/console/admin-platform.components').then((m) => m.AdminVerificationsComponent),
        title: 'Verification — Platform admin',
      },
      {
        path: 'billing-reconciliation',
        loadComponent: () => import('../../features/admin/console/admin-platform.components').then((m) => m.AdminBillingReconComponent),
        title: 'Billing reconciliation — Platform admin',
      },
      {
        path: 'privacy',
        loadComponent: () => import('../../features/admin/console/admin-platform.components').then((m) => m.AdminPrivacyComponent),
        title: 'Privacy requests — Platform admin',
      },
      {
        path: 'feature-flags',
        loadComponent: () =>
          import('../../features/admin/feature-flags/admin-feature-flags.component').then((m) => m.AdminFeatureFlagsComponent),
        title: 'Feature flags — Platform admin',
      },
      {
        path: 'plans',
        loadComponent: () => import('../../features/admin/plans/admin-plans.component').then((m) => m.AdminPlansComponent),
        title: 'Plans — Platform admin',
      },
      {
        path: 'jobs',
        loadComponent: () => import('../../features/admin/jobs/admin-jobs.component').then((m) => m.AdminJobsComponent),
        title: 'Jobs — Platform admin',
      },
      {
        path: 'audit-events',
        loadComponent: () =>
          import('../../features/admin/audit-events/admin-audit-events.component').then((m) => m.AdminAuditEventsComponent),
        title: 'Audit events — Platform admin',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
