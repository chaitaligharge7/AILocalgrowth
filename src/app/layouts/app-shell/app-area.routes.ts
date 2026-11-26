import { Routes } from '@angular/router';
import { tenantAccessGuard } from '../../guards/tenant-access.guard';

/**
 * Lazy-loaded route table for the `/app/*` shell (blueprint §3.3). The
 * parent `app` route (see `app.routes.ts`) already applies `authGuard`;
 * `:tenantId` additionally applies `tenantAccessGuard`, which re-verifies
 * tenant membership against the live backend before rendering
 * `AppShellComponent` and its dashboard/members children (blueprint
 * §10.4 AC-02 "switch without leakage").
 */
export const APP_AREA_ROUTES: Routes = [
  {
    path: 'choose-tenant',
    loadComponent: () =>
      import('../../features/tenancy/choose-tenant/choose-tenant.component').then((m) => m.ChooseTenantComponent),
    title: 'Choose a business — Scriptlet LocalGrowth',
  },
  {
    path: ':tenantId',
    canActivate: [tenantAccessGuard],
    loadComponent: () => import('./app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('../../features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Dashboard — Scriptlet LocalGrowth',
      },
      {
        path: 'members',
        loadComponent: () => import('../../features/members/members.component').then((m) => m.MembersComponent),
        title: 'Members — Scriptlet LocalGrowth',
      },
      {
        path: 'settings',
        loadComponent: () => import('../../features/settings/settings.component').then((m) => m.SettingsComponent),
        title: 'Settings — Scriptlet LocalGrowth',
      },
      {
        path: 'business-profile',
        loadComponent: () =>
          import('../../features/business-profile/business-profile.component').then((m) => m.BusinessProfileComponent),
        title: 'Business profile — Scriptlet LocalGrowth',
      },
      {
        path: 'brand-kit',
        loadComponent: () => import('../../features/brand-kit/brand-kit.component').then((m) => m.BrandKitComponent),
        title: 'Brand kit — Scriptlet LocalGrowth',
      },
      {
        path: 'assets',
        loadComponent: () => import('../../features/assets/assets.component').then((m) => m.AssetsComponent),
        title: 'Assets — Scriptlet LocalGrowth',
      },
      {
        path: 'ai-studio',
        loadComponent: () => import('../../features/ai-studio/ai-studio.component').then((m) => m.AiStudioComponent),
        title: 'AI studio — Scriptlet LocalGrowth',
      },
      {
        path: 'content',
        loadComponent: () => import('../../features/content/content.component').then((m) => m.ContentComponent),
        title: 'Content — Scriptlet LocalGrowth',
      },
      {
        path: 'content/new',
        loadComponent: () => import('../../features/content/content-form.component').then((m) => m.ContentFormComponent),
        title: 'New draft — Scriptlet LocalGrowth',
      },
      {
        path: 'content/:contentId/edit',
        loadComponent: () => import('../../features/content/content-form.component').then((m) => m.ContentFormComponent),
        title: 'Edit content — Scriptlet LocalGrowth',
      },
      {
        path: 'integrations',
        loadComponent: () => import('../../features/integrations/integrations.component').then((m) => m.IntegrationsComponent),
        title: 'Integrations — Scriptlet LocalGrowth',
      },
      {
        path: 'calendar',
        loadComponent: () => import('../../features/calendar/calendar.component').then((m) => m.CalendarComponent),
        title: 'Calendar — Scriptlet LocalGrowth',
      },
      {
        path: 'billing',
        loadComponent: () => import('../../features/billing/billing.component').then((m) => m.BillingComponent),
        title: 'Billing — Scriptlet LocalGrowth',
      },
      {
        path: 'billing/addons',
        loadComponent: () => import('../../features/billing/billing-addons.component').then((m) => m.BillingAddonsComponent),
        title: 'Add-ons — Scriptlet LocalGrowth',
      },
      {
        path: 'analytics',
        loadComponent: () => import('../../features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
        title: 'Analytics — Scriptlet LocalGrowth',
      },
      {
        path: 'locations/:locationId/audit',
        loadComponent: () => import('../../features/audit/audit.component').then((m) => m.AuditComponent),
        title: 'Readiness audit — Scriptlet LocalGrowth',
      },
      {
        path: 'locations/:locationId/audit-insights',
        loadComponent: () =>
          import('../../features/audit/audit-insights.component').then((m) => m.AuditInsightsComponent),
        title: 'Audit insights — Scriptlet LocalGrowth',
      },
      {
        path: 'studio',
        loadComponent: () => import('../../features/studio/studio.component').then((m) => m.StudioComponent),
        title: 'Creative studio — Scriptlet LocalGrowth',
      },
      {
        path: 'campaigns',
        loadComponent: () => import('../../features/campaigns/campaigns.component').then((m) => m.CampaignsComponent),
        title: 'Campaigns — Scriptlet LocalGrowth',
      },
      {
        path: 'reviews/insights',
        loadComponent: () =>
          import('../../features/reviews/review-insights.component').then((m) => m.ReviewInsightsComponent),
        title: 'Review insights — Scriptlet LocalGrowth',
      },
      {
        path: 'google',
        loadComponent: () => import('../../features/google/google.component').then((m) => m.GoogleComponent),
        title: 'Google Business Profile — Scriptlet LocalGrowth',
      },
      {
        path: 'locations/:locationId/reviews',
        loadComponent: () => import('../../features/reviews/reviews.component').then((m) => m.ReviewsComponent),
        title: 'Reviews — Scriptlet LocalGrowth',
      },
      {
        path: 'leads',
        loadComponent: () => import('../../features/leads/leads.component').then((m) => m.LeadsComponent),
        title: 'Leads — Scriptlet LocalGrowth',
      },
      {
        path: 'leads/new',
        loadComponent: () => import('../../features/leads/lead-create.component').then((m) => m.LeadCreateComponent),
        title: 'Add lead — Scriptlet LocalGrowth',
      },
      {
        path: 'leads/:leadId',
        loadComponent: () => import('../../features/leads/lead-detail.component').then((m) => m.LeadDetailComponent),
        title: 'Lead — Scriptlet LocalGrowth',
      },
      {
        path: 'automations',
        loadComponent: () =>
          import('../../features/automations/automations.component').then((m) => m.AutomationsComponent),
        title: 'Automations — Scriptlet LocalGrowth',
      },
      {
        path: 'help',
        loadComponent: () => import('../../features/help/help.component').then((m) => m.HelpComponent),
        title: 'Help centre — Scriptlet LocalGrowth',
      },
      {
        path: 'verification',
        loadComponent: () => import('../../features/help/verification.component').then((m) => m.VerificationComponent),
        title: 'Business verification — Scriptlet LocalGrowth',
      },
      {
        path: 'support',
        loadComponent: () => import('../../features/support/support.component').then((m) => m.SupportComponent),
        title: 'Support — Scriptlet LocalGrowth',
      },
      {
        path: 'support/:ticketId',
        loadComponent: () => import('../../features/support/support-detail.component').then((m) => m.SupportDetailComponent),
        title: 'Support ticket — Scriptlet LocalGrowth',
      },
      {
        path: 'notifications',
        loadComponent: () => import('../../features/notifications/notifications.component').then((m) => m.NotificationsComponent),
        title: 'Notifications — Scriptlet LocalGrowth',
      },
      {
        path: 'agency-invites',
        loadComponent: () =>
          import('../../features/agency-invites/agency-invites.component').then((m) => m.AgencyInvitesComponent),
        title: 'Agency invites — Scriptlet LocalGrowth',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'choose-tenant' },
];
