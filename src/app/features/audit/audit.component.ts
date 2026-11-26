import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuditCheck, AuditRecommendation, CheckState, ProfileAudit } from '../../core/audit/audit.models';
import { AuditService } from '../../core/audit/audit.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';

/** Pure view-mapping for a check's tri-state — exported for direct unit testing (no TestBed needed). */
export interface CheckStateView {
  cssClass: string;
  icon: string;
  label: string;
}

/**
 * Maps a check's `pass`/`fail`/`unknown` state to a visibly distinct
 * treatment. Blueprint requirement (this task's brief): "unknown must look
 * visibly different from fail, not just red for both" — `unknown` gets a
 * neutral/amber "evidence missing" treatment, `fail` gets a red
 * "needs attention" treatment, and the CSS classes/icons are disjoint so a
 * snapshot or DOM test can tell them apart without reading color values.
 */
export function checkStateView(state: CheckState): CheckStateView {
  switch (state) {
    case 'pass':
      return { cssClass: 'state-pass', icon: '✓', label: 'Pass' };
    case 'fail':
      return { cssClass: 'state-fail', icon: '✕', label: 'Needs attention' };
    case 'unknown':
      return { cssClass: 'state-unknown', icon: '?', label: 'Evidence missing' };
  }
}

/** Finds the recommendation (remediation CTA) for a given check, if the backend returned one. */
export function recommendationForCheck(check: AuditCheck, recommendations: AuditRecommendation[]): AuditRecommendation | null {
  return recommendations.find((r) => r.rule_code === check.code) ?? null;
}

/**
 * `/app/:tenantId/locations/:locationId/audit` — blueprint §3.1 "Audit
 * detail" spec. Wraps `POST /tenants/{t}/locations/{id}/sync`
 * (`App\Application\Google\LocationSyncService`) and
 * `POST/GET /tenants/{t}/locations/{id}/audits`, `GET /tenants/{t}/audits/{id}`
 * (`App\Application\Google\AuditService`).
 *
 * `readiness_score` is always rendered as a "readiness indicator" per
 * `AuditService::represent()`'s own `readiness_score_note` — the word
 * "rank"/"ranking" is deliberately never used anywhere in this screen's
 * copy, matching blueprint §02 M05-R6 / §10.4 AC-19.
 *
 * Backend gap: there is no endpoint to dismiss/accept an `audit_actions`
 * row (blueprint §3.1 "dismissed/accepted state") — `AuditActionRepository`
 * only ever creates rows with `status = "open"` and nothing can change
 * that yet, so this screen only displays `status`, it never offers a
 * dismiss/accept control that would silently no-op.
 *
 * History-comparison simplification (documented here rather than a
 * separate ADR, since it is a small, clearly-labelled UI simplification
 * rather than an architectural judgment call): the spec requires "history
 * comparison requires same rule version or clear disclaimer." Detecting
 * version *changes* across entries and only showing the disclaimer when
 * they differ would need little extra logic, but doing it well (e.g.
 * highlighting exactly which entries are comparable) is more than this
 * sprint's scope — instead, every history entry always shows its own
 * `rule_set_version` next to its score, and one static disclaimer banner
 * is always shown above the list. This is strictly more conservative than
 * the spec's minimum (it over-discloses rather than under-discloses).
 */
@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [DatePipe, RouterLink, PageHeaderComponent],
  template: `
    <section class="audit">
      <app-page-header
        eyebrow="SEO &amp; LOCAL SEARCH"
        eyebrowLabel="Readiness audit"
        title="Readiness audit"
        subtitle="Profile completeness, evidence checklist and AI remediation for this location."
      />
      <p class="location-line">
        Location: <code>{{ locationId() }}</code> · <a [routerLink]="['/app', tenantId(), 'integrations']">Integrations</a> ·
        <a [routerLink]="['/app', tenantId(), 'google']">Google profile</a> ·
        <a [routerLink]="['/app', tenantId(), 'locations', locationId(), 'audit-insights']" data-testid="insights-link">Tasks, history &amp; keyword ideas →</a>
      </p>

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <section class="actions-bar">
          @if (canSync()) {
            <button type="button" (click)="syncFromGoogle()" [disabled]="syncing()">
              {{ syncing() ? 'Syncing…' : 'Sync from Google' }}
            </button>
          }
          @if (canRunAudit()) {
            <button type="button" (click)="runAudit()" [disabled]="running()">
              {{ running() ? 'Running audit…' : 'Run readiness audit' }}
            </button>
          }
          @if (!canSync() && !canRunAudit()) {
            <p class="owner-only-note">
              Only owner/admin may sync, and owner/admin/editor may run an audit (enforced server-side).
            </p>
          }
        </section>

        @if (syncNotice()) {
          <p class="success" role="status">{{ syncNotice() }}</p>
        }
        @if (actionError()) {
          <p class="form-error" role="alert">{{ actionError() }}</p>
        }

        @if (loadingLatest()) {
          <p>Loading…</p>
        } @else if (!latest()) {
          <p class="placeholder">No audit has been run yet for this location.</p>
        } @else {
          <section class="score-card">
            <h2>Readiness indicator</h2>
            <p class="score-value">{{ latest()!.readiness_score }}<span class="score-max">/100</span></p>
            <p class="score-note">{{ latest()!.readiness_score_note }}</p>
            <p class="coverage">
              Evidence coverage: <strong>{{ latest()!.coverage_pct }}%</strong>
              <span class="coverage-hint">— the share of checks with any evidence at all (missing evidence is never scored as a fail).</span>
            </p>
            <p class="rule-version">Scoring rule set version: <code>{{ latest()!.evidence.rule_set_version }}</code></p>
          </section>

          <section class="checklist">
            <h2>Checklist</h2>
            <ul>
              @for (check of latest()!.evidence.checks; track check.code) {
                <li class="check-row" [class]="stateView(check.state).cssClass">
                  <span class="check-icon" [attr.aria-label]="stateView(check.state).label">{{ stateView(check.state).icon }}</span>
                  <div class="check-body">
                    <p class="check-label">
                      {{ check.label }} <span class="check-weight">(weight {{ check.weight }})</span>
                      <span class="check-state-text">— {{ stateView(check.state).label }}</span>
                    </p>
                    <p class="check-meta">
                      Evidence source: <strong>{{ check.provenance ?? 'none' }}</strong>
                      @if (check.value !== null && check.value !== undefined) {
                        · Value: <code>{{ formatValue(check.value) }}</code>
                      }
                    </p>
                    @if (recommendationFor(check)) {
                      <p class="remediation">
                        <span class="severity-tag" [class.needs-evidence]="recommendationFor(check)!.severity === 'needs_evidence'">
                          {{ recommendationFor(check)!.severity === 'needs_evidence' ? 'Needs evidence' : 'Action needed' }}
                        </span>
                        {{ recommendationFor(check)!.remediation }}
                      </p>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>

          <section class="recommendations">
            <h2>Recommendations</h2>
            @if (latest()!.recommendations.length === 0) {
              <p class="placeholder">No open recommendations — every scored check passed.</p>
            } @else {
              <ul>
                @for (rec of latest()!.recommendations; track rec.rule_code) {
                  <li>
                    <span class="severity-tag" [class.needs-evidence]="rec.severity === 'needs_evidence'">
                      {{ rec.severity === 'needs_evidence' ? 'Needs evidence' : 'Action needed' }}
                    </span>
                    <strong>{{ rec.label }}</strong> — {{ rec.remediation }}
                  </li>
                }
              </ul>
            }

            @if (latest()!.actions.length > 0) {
              <p class="actions-gap-note">
                Tracked actions: {{ latest()!.actions.length }} open (status: {{ latest()!.actions[0].status }}, etc.). There is no
                dismiss/accept endpoint yet (backend gap) — status is shown read-only.
              </p>
            }
          </section>
        }

        <section class="history">
          <h2>Audit history</h2>
          <p class="disclaimer">
            Scores across entries below are only directly comparable when they share the same scoring rule set
            version — each entry shows its own version for this reason.
          </p>
          @if (loadingHistory()) {
            <p>Loading…</p>
          } @else if (history().length === 0) {
            <p class="placeholder">No history yet.</p>
          } @else {
            <table>
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Readiness indicator</th>
                  <th>Coverage</th>
                  <th>Rule set version</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of history(); track entry.id) {
                  <tr>
                    <td>{{ entry.completed_at | date: 'short' }}</td>
                    <td>{{ entry.readiness_score }}/100</td>
                    <td>{{ entry.coverage_pct }}%</td>
                    <td><code>{{ entry.evidence.rule_set_version }}</code></td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (historyError()) {
            <p class="form-error" role="alert">{{ historyError() }}</p>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .audit {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .location-line {
        color: #555;
        font-size: 0.9rem;
      }
      .actions-bar {
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }
      button {
        padding: 0.55rem 1rem;
        cursor: pointer;
      }
      .score-card {
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 1.25rem;
      }
      .score-value {
        font-size: 2.5rem;
        font-weight: 700;
        margin: 0.25rem 0;
      }
      .score-max {
        font-size: 1.25rem;
        color: #888;
        font-weight: 400;
      }
      .score-note {
        color: #666;
        font-size: 0.85rem;
      }
      .coverage {
        font-size: 0.95rem;
      }
      .coverage-hint {
        color: #777;
        font-size: 0.8rem;
      }
      .rule-version {
        color: #555;
        font-size: 0.85rem;
      }
      .checklist ul,
      .recommendations ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .check-row {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        border: 1px solid #e3e3e3;
        border-radius: 8px;
        padding: 0.65rem 0.85rem;
      }
      .check-icon {
        font-size: 1.1rem;
        font-weight: 700;
        width: 1.5rem;
        text-align: center;
        flex-shrink: 0;
      }
      .check-row.state-pass {
        background: #f3fbf5;
        border-color: #bfe6cb;
      }
      .check-row.state-pass .check-icon {
        color: #146c2e;
      }
      .check-row.state-fail {
        background: #fdf2f1;
        border-color: #f1c3bf;
      }
      .check-row.state-fail .check-icon {
        color: #b00020;
      }
      .check-row.state-unknown {
        background: #fbf8ee;
        border-color: #e8dca3;
      }
      .check-row.state-unknown .check-icon {
        color: #8a6500;
      }
      .check-label {
        margin: 0;
        font-weight: 600;
      }
      .check-weight,
      .check-state-text {
        font-weight: 400;
        color: #777;
        font-size: 0.85rem;
      }
      .check-meta {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: #555;
      }
      .remediation {
        margin: 0.35rem 0 0;
        font-size: 0.85rem;
      }
      .severity-tag {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        background: #fdecea;
        color: #b00020;
        font-size: 0.72rem;
        font-weight: 700;
        margin-right: 0.4rem;
      }
      .severity-tag.needs-evidence {
        background: #fbf0d6;
        color: #8a6500;
      }
      .actions-gap-note {
        color: #875c00;
        background: #fff6e5;
        border: 1px solid #f0d58c;
        border-radius: 6px;
        padding: 0.6rem;
        font-size: 0.82rem;
      }
      .disclaimer {
        color: #875c00;
        background: #fff6e5;
        border: 1px solid #f0d58c;
        border-radius: 6px;
        padding: 0.6rem;
        font-size: 0.85rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      th,
      td {
        text-align: center;
        padding: 0.45rem;
        border-bottom: 1px solid #eee;
      }
      .placeholder {
        color: #888;
      }
      .field-error,
      .form-error {
        color: #b00020;
        margin: 0;
        font-size: 0.875rem;
      }
      .success {
        color: #146c2e;
        margin: 0;
      }
      .owner-only-note {
        color: #666;
        font-size: 0.875rem;
        background: #f6f6f6;
        padding: 0.6rem;
        border-radius: 6px;
      }
    `,
  ],
})
export class AuditComponent {
  // Read via `inject()` as a field (not a constructor param) so it is
  // already initialized when `locationId`'s own field initializer below
  // runs — a constructor param is only assigned in constructor body order,
  // which is too late for another field initializer to read from `this`.
  private readonly route = inject(ActivatedRoute);

  readonly tenantId = computed(() => this.currentTenant.tenant()?.id ?? null);
  readonly locationId = signal<string>(this.route.snapshot.paramMap.get('locationId') ?? '');

  readonly canSync = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });
  readonly canRunAudit = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly syncing = signal(false);
  readonly syncNotice = signal<string | null>(null);
  readonly running = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly latest = signal<ProfileAudit | null>(null);
  readonly loadingLatest = signal(true);

  readonly history = signal<ProfileAudit[]>([]);
  readonly loadingHistory = signal(true);
  readonly historyError = signal<string | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly auditService: AuditService,
  ) {
    this.refreshHistory();
  }

  stateView(state: CheckState): CheckStateView {
    return checkStateView(state);
  }

  recommendationFor(check: AuditCheck): AuditRecommendation | null {
    return recommendationForCheck(check, this.latest()?.recommendations ?? []);
  }

  formatValue(value: unknown): string {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private refreshHistory(): void {
    const tenantId = this.tenantId();
    const locationId = this.locationId();
    if (!tenantId || !locationId) {
      this.loadingLatest.set(false);
      this.loadingHistory.set(false);
      return;
    }
    this.loadingHistory.set(true);
    this.auditService.history(tenantId, locationId).subscribe({
      next: (audits) => {
        this.loadingHistory.set(false);
        this.history.set(audits);
        this.loadingLatest.set(false);
        if (audits.length > 0) {
          // History is returned oldest-first (created_at ASC server-side);
          // the most recently completed entry is the current snapshot.
          this.latest.set(audits[audits.length - 1]);
        }
      },
      error: (err: unknown) => {
        this.loadingHistory.set(false);
        this.loadingLatest.set(false);
        this.historyError.set(apiErrorMessage(err));
      },
    });
  }

  syncFromGoogle(): void {
    const tenantId = this.tenantId();
    const locationId = this.locationId();
    if (!tenantId || !locationId || this.syncing()) {
      return;
    }
    this.syncing.set(true);
    this.syncNotice.set(null);
    this.actionError.set(null);
    this.auditService.sync(tenantId, locationId).subscribe({
      next: (result) => {
        this.syncing.set(false);
        this.syncNotice.set(`Synced ${result.reviews_fetched} review(s) from Google (mock).`);
      },
      error: (err: unknown) => {
        this.syncing.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  runAudit(): void {
    const tenantId = this.tenantId();
    const locationId = this.locationId();
    if (!tenantId || !locationId || this.running()) {
      return;
    }
    this.running.set(true);
    this.actionError.set(null);
    this.auditService.create(tenantId, locationId).subscribe({
      next: (audit) => {
        this.running.set(false);
        this.latest.set(audit);
        this.refreshHistory();
      },
      error: (err: unknown) => {
        this.running.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }
}
