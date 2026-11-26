import { Routes } from '@angular/router';

/**
 * Top-level `/agency/*` route tree (blueprint §3.3) — a SEPARATE shell
 * from `/app/*` and `/admin/*`, not nested under any `:tenantId`.
 * Registered directly in `app.routes.ts` behind the ordinary `authGuard`
 * (an agency user logs in exactly like any other user — no separate
 * MFA/session concept like `/admin/*` has).
 *
 * No route here carries an `:agencyId`/`:tenantId` segment for the
 * agency's own identity — every bare `/agency/*` backend endpoint resolves
 * the caller's own agency account server-side (see
 * `docs/ADR/0048-angular-agency-tenant-resolution.md`). `:linkId` on the
 * staff route identifies which CLIENT relationship, not the agency.
 */
export const AGENCY_AREA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agency-shell.component').then((m) => m.AgencyShellComponent),
    children: [
      {
        path: 'overview',
        loadComponent: () =>
          import('../../features/agency/overview/agency-overview.component').then((m) => m.AgencyOverviewComponent),
        title: 'Agency overview — Scriptlet LocalGrowth',
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('../../features/agency/clients/agency-clients.component').then((m) => m.AgencyClientsComponent),
        title: 'Agency clients — Scriptlet LocalGrowth',
      },
      {
        path: 'clients/:linkId/overview',
        loadComponent: () =>
          import('../../features/agency/insights/agency-insights.components').then((m) => m.AgencyClientOverviewComponent),
        title: 'Client overview — Scriptlet LocalGrowth',
      },
      {
        path: 'team',
        loadComponent: () => import('../../features/agency/insights/agency-insights.components').then((m) => m.AgencyTeamComponent),
        title: 'Team — Scriptlet LocalGrowth',
      },
      {
        path: 'activity',
        loadComponent: () => import('../../features/agency/insights/agency-insights.components').then((m) => m.AgencyActivityComponent),
        title: 'Activity log — Scriptlet LocalGrowth',
      },
      {
        path: 'clients/:linkId/staff',
        loadComponent: () =>
          import('../../features/agency/staff/agency-staff.component').then((m) => m.AgencyStaffComponent),
        title: 'Staff assignments — Scriptlet LocalGrowth',
      },
      {
        path: 'usage',
        loadComponent: () =>
          import('../../features/agency/usage/agency-usage.component').then((m) => m.AgencyUsageComponent),
        title: 'Pooled usage — Scriptlet LocalGrowth',
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('../../features/agency/calendar/agency-calendar.component').then((m) => m.AgencyCalendarComponent),
        title: 'Cross-client calendar — Scriptlet LocalGrowth',
      },
      {
        path: 'analytics',
        loadComponent: () => import('../../features/agency/console/agency-console.components').then((m) => m.AgencyAnalyticsComponent),
        title: 'Client analytics — Scriptlet LocalGrowth',
      },
      {
        path: 'reports',
        loadComponent: () => import('../../features/agency/console/agency-report.component').then((m) => m.AgencyReportComponent),
        title: 'Client report — Scriptlet LocalGrowth',
      },
      {
        path: 'notifications',
        loadComponent: () => import('../../features/agency/console/agency-console.components').then((m) => m.AgencyNotificationsComponent),
        title: 'Notifications — Scriptlet LocalGrowth',
      },
      {
        path: 'billing',
        loadComponent: () => import('../../features/agency/console/agency-console.components').then((m) => m.AgencyBillingComponent),
        title: 'Agency billing — Scriptlet LocalGrowth',
      },
      {
        path: 'branding',
        loadComponent: () => import('../../features/agency/console/agency-console.components').then((m) => m.AgencyBrandingComponent),
        title: 'Branding — Scriptlet LocalGrowth',
      },
      {
        path: 'roles',
        loadComponent: () => import('../../features/agency/console/agency-console.components').then((m) => m.AgencyRolesComponent),
        title: 'Roles and permissions — Scriptlet LocalGrowth',
      },
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
    ],
  },
];
