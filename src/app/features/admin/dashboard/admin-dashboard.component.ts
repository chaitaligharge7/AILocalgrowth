import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InsightRow, InsightsCardComponent } from '../../../shared/dashboard-pattern/insights-card.component';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { RecommendedActionsComponent } from '../../../shared/dashboard-pattern/recommended-actions.component';

/**
 * `/admin/dashboard` — Compact Executive Platform Admin Dashboard.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, InsightsCardComponent, RecommendedActionsComponent],
  template: `
    <section class="admin-dashboard">
      <div class="topbar-row">
        <app-page-header
          eyebrow="Platform admin"
          eyebrowLabel="Executive"
          title="Platform executive dashboard"
          subtitle="Cross-tenant administration — tenants, plans, flags, jobs and the audit trail."
        />
        <div class="top-actions">
          <a routerLink="/admin/overview" class="btn-primary btn-sm">Live platform metrics →</a>
          <a routerLink="/admin/tenants" class="btn-secondary btn-sm">Tenants directory</a>
        </div>
      </div>

      <div class="admin-grid">
        <app-insights-card title="Admin modules" [rows]="moduleRows" />

        <div class="side-col">
          <app-recommended-actions
            title="Session status"
            message="You are in an MFA-elevated admin session (10-minute TTL). It will auto-expire; re-verify at /admin/mfa if a call starts failing with ADMIN_SESSION_EXPIRED."
            linkLabel="Open live overview"
            link="/admin/overview"
          />
          <app-insights-card title="Operations & support" [rows]="opsRows" />
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .admin-dashboard {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .topbar-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        width: 100%;
      }
      .topbar-row ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .top-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .admin-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
        gap: 12px;
        align-items: start;
      }
      .side-col {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      @media (max-width: 960px) {
        .admin-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminDashboardComponent {
  readonly moduleRows: InsightRow[] = [
    {
      icon: 'business',
      title: 'Tenants',
      subtitle: 'List, suspend/reactivate (reason required)',
      link: '/admin/tenants',
    },
    {
      icon: 'flag',
      title: 'Feature flags',
      subtitle: 'Global/tenant kill-switches (reason required)',
      tile: 'amber',
      link: '/admin/feature-flags',
    },
    {
      icon: 'subscription',
      title: 'Plans',
      subtitle: 'List existing, create a new version (reason required)',
      tile: 'mint',
      link: '/admin/plans',
    },
    {
      icon: 'jobs',
      title: 'Jobs',
      subtitle: 'Publish + notification dead-letter queues, retry (reason required)',
      link: '/admin/jobs',
    },
    {
      icon: 'audit',
      title: 'Audit events',
      subtitle: 'Filterable log of every privileged admin action',
      tile: 'peach',
      link: '/admin/audit-events',
    },
  ];

  readonly opsRows: InsightRow[] = [
    { icon: 'support', title: 'Support queue', subtitle: 'Cross-tenant customer tickets & triage', link: '/admin/support' },
    { icon: 'clients', title: 'Agencies directory', subtitle: 'Active agency accounts & client links', tile: 'mint', link: '/admin/agencies' },
    { icon: 'ai', title: 'AI usage monitor', subtitle: 'Platform-wide AI generation consumption', tile: 'amber', link: '/admin/ai-usage' },
  ];
}
