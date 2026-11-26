import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ExportFormat } from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { AuditService } from '../../core/audit/audit.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { AuditAnalysisComponent } from './audit-analysis.component';
import { AuditHistoryComponent } from './audit-history.component';
import { AuditKeywordsComponent } from './audit-keywords.component';
import { AuditTasksComponent } from './audit-tasks.component';

type InsightsTab = 'tasks' | 'history' | 'analysis' | 'keywords';

const TABS: { id: InsightsTab; label: string }[] = [
  { id: 'tasks', label: 'Improvement tasks' },
  { id: 'history', label: 'Audit history' },
  { id: 'analysis', label: 'Profile analysis' },
  { id: 'keywords', label: 'Keyword ideas' },
];

const EDIT_ROLES = ['owner', 'admin', 'editor'];

/**
 * `/app/:tenantId/locations/:locationId/audit-insights` — everything that
 * builds on a readiness audit: the improvement task board, audit-over-audit
 * history, Business Profile vs Google analysis, generated keyword ideas, and
 * the downloadable report (HTML print view / CSV / JSON — there is no
 * server-side PDF; use the browser's Print → Save as PDF on the HTML report).
 */
@Component({
  selector: 'app-audit-insights',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, AuditTasksComponent, AuditHistoryComponent, AuditAnalysisComponent, AuditKeywordsComponent],
  template: `
    <section class="insights">
      <app-page-header
        eyebrow="SEO &amp; LOCAL SEARCH"
        eyebrowLabel="Audit insights"
        title="Audit insights"
        [subtitle]="locationName() ? 'Improvement tasks, history and keyword ideas for ' + locationName() + '.' : 'Improvement tasks, history and keyword ideas for this location.'"
      />
      <p class="meta">
        <a [routerLink]="['/app', tenantId(), 'locations', locationId(), 'audit']">← Back to readiness audit</a>
      </p>

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <section class="report card">
          <div>
            <h2>Audit report</h2>
            @if (latestAuditId()) {
              <p class="meta">Download the latest audit as a shareable report. For a PDF, open the HTML report and use Print → Save as PDF.</p>
            } @else {
              <p class="meta">Run a readiness audit first — there is nothing to export yet.</p>
            }
          </div>
          <div class="report-actions">
            @for (f of formats; track f.id) {
              <button type="button" class="btn-secondary" [disabled]="!latestAuditId() || downloading() !== null" (click)="download(f.id)">
                {{ downloading() === f.id ? 'Preparing…' : f.label }}
              </button>
            }
          </div>
        </section>
        @if (reportError()) {
          <p class="form-error" role="alert">{{ reportError() }}</p>
        }

        <nav class="tabs" role="tablist" aria-label="Audit insight sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">
              {{ t.label }}
            </button>
          }
        </nav>

        @switch (tab()) {
          @case ('tasks') {
            <app-audit-tasks [tenantId]="tenantId()" [locationId]="locationId()" [canEdit]="canEdit()" />
          }
          @case ('history') {
            <app-audit-history [tenantId]="tenantId()" [locationId]="locationId()" />
          }
          @case ('analysis') {
            <app-audit-analysis [tenantId]="tenantId()" [locationId]="locationId()" />
          }
          @case ('keywords') {
            <app-audit-keywords [tenantId]="tenantId()" [locationId]="locationId()" />
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .insights { width: 100%; font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .report { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; margin: 1rem 0; }
      .report h2 { margin: 0 0 0.25rem; font-size: 1.05rem; }
      .report-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; }
      .tabs button { border-radius: 999px; padding: 0.4rem 1rem; cursor: pointer; }
      .tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
    `,
  ],
})
export class AuditInsightsComponent implements OnInit {
  readonly tabs = TABS;
  readonly formats: { id: ExportFormat; label: string }[] = [
    { id: 'html', label: 'HTML report' },
    { id: 'csv', label: 'CSV' },
    { id: 'json', label: 'JSON' },
  ];

  readonly tab = signal<InsightsTab>('tasks');
  readonly locationId = signal('');
  readonly locationName = signal('');
  readonly latestAuditId = signal<string | null>(null);
  readonly downloading = signal<ExportFormat | null>(null);
  readonly reportError = signal<string | null>(null);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canEdit = computed(() => EDIT_ROLES.includes(this.currentTenant.tenant()?.caller_role ?? ''));

  constructor(
    private readonly route: ActivatedRoute,
    private readonly currentTenant: CurrentTenantService,
    private readonly audits: AuditService,
    private readonly insights: AuditInsightsService,
    private readonly locations: LocationApiService,
  ) {}

  ngOnInit(): void {
    this.locationId.set(this.route.snapshot.paramMap.get('locationId') ?? '');
    const tenantId = this.tenantId();
    const locationId = this.locationId();
    if (!tenantId || !locationId) {
      return;
    }
    // Both lookups are conveniences; failures leave the header generic / export disabled.
    this.locations.get(tenantId, locationId).subscribe({
      next: (loc) => this.locationName.set(loc.name),
      error: () => undefined,
    });
    this.audits.history(tenantId, locationId).subscribe({
      next: (audits) => this.latestAuditId.set(audits[0]?.id ?? null),
      error: () => this.latestAuditId.set(null),
    });
  }

  download(format: ExportFormat): void {
    const auditId = this.latestAuditId();
    if (!auditId) {
      return;
    }
    this.downloading.set(format);
    this.reportError.set(null);
    this.insights.exportReport(this.tenantId(), auditId, format).subscribe({
      next: ({ blob, filename }) => {
        this.downloading.set(null);
        const url = URL.createObjectURL(blob);
        try {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      error: (err: unknown) => {
        this.downloading.set(null);
        this.reportError.set(apiErrorMessage(err));
      },
    });
  }
}
