import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GbpHealth, GbpRunSummary } from '../../core/google/gbp.models';
import { GbpService } from '../../core/google/gbp.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const OVERALL: Record<GbpHealth['overall'], { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'badge--success' },
  attention: { label: 'Needs attention', cls: 'badge--warning' },
  not_connected: { label: 'Not connected', cls: 'badge--neutral' },
};

/**
 * Google connection health & permission status (BW-039): derived entirely
 * from stored rows — the connection, its granted scopes, each location's
 * link, the last profile/review sync runs and the failed/unknown push and
 * post counters. Never contains token material.
 */
@Component({
  selector: 'app-google-health',
  standalone: true,
  imports: [DatePipe, RouterLink, SkeletonLoaderComponent],
  template: `
    <section>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (health()) {
        <div class="top card">
          <div>
            <h2>Overall status</h2>
            <span class="badge badge--dot" [class]="overall().cls" data-testid="overall-badge">{{ overall().label }}</span>
            @if (health()!.mock_provider) {
              <span class="badge badge--mock">MOCK_PROVIDER</span>
            }
          </div>
          <p class="meta">
            @if (health()!.mock_provider) {
              Google runs in <strong>mock mode</strong>: nothing is sent to or read from a real Google profile.
            } @else {
              Google runs in <strong>live mode</strong>.
            }
            Checked {{ health()!.checked_at | date: 'medium' }}.
          </p>
        </div>

        @if (health()!.attention.length > 0) {
          <ul class="attention" data-testid="attention-list">
            @for (a of health()!.attention; track a) {
              <li>{{ a }}</li>
            }
          </ul>
        }

        @if (!health()!.connection || health()!.overall === 'not_connected') {
          <p class="meta">No active Google connection. <a [routerLink]="['/app', tenantId, 'integrations']">Connect Google on the Integrations screen</a>.</p>
        } @else {
          <div class="grid">
            <section class="card">
              <h3>Connection</h3>
              <dl>
                <dt>Status</dt><dd>{{ health()!.connection!.status }}</dd>
                <dt>Account</dt><dd><code>{{ health()!.connection!.external_account_id ?? '—' }}</code></dd>
                <dt>Last checked</dt><dd>{{ health()!.connection!.last_checked_at ? (health()!.connection!.last_checked_at | date: 'medium') : '—' }}</dd>
                <dt>Expires</dt><dd>{{ health()!.connection!.expires_at ? (health()!.connection!.expires_at | date: 'medium') : 'No expiry recorded' }}</dd>
              </dl>
            </section>
            <section class="card">
              <h3>Permissions</h3>
              <ul class="caps">
                @for (cap of capabilityRows(); track cap.name) {
                  <li>
                    <span class="badge badge--dot" [class]="cap.granted ? 'badge--success' : 'badge--danger'">{{ cap.granted ? 'Granted' : 'Missing' }}</span>
                    {{ cap.label }}
                  </li>
                }
              </ul>
            </section>
            <section class="card">
              <h3>Last syncs</h3>
              <p>Profile: {{ runText(health()!.last_runs.profile) }}</p>
              <p>Reviews: {{ runText(health()!.last_runs.review) }}</p>
            </section>
            <section class="card">
              <h3>Outstanding work</h3>
              <p>Failed pushes: <strong>{{ health()!.counters.failed_pushes }}</strong> · unknown: <strong>{{ health()!.counters.unknown_pushes }}</strong></p>
              <p>Failed posts: <strong>{{ health()!.counters.failed_posts }}</strong> · unknown: <strong>{{ health()!.counters.unknown_posts }}</strong></p>
              <p>Draft posts: <strong>{{ health()!.counters.draft_posts }}</strong></p>
            </section>
          </div>
        }

        <h3>Locations</h3>
        <table class="data-table">
          <thead><tr><th>Location</th><th>Google link</th></tr></thead>
          <tbody>
            @for (l of health()!.locations; track l.location_id) {
              <tr>
                <td>{{ l.name }}</td>
                <td>
                  <span class="badge badge--dot" [class]="l.linked ? 'badge--success' : 'badge--neutral'">{{ l.linked ? 'Linked' : 'Not linked' }}</span>
                  @if (l.external_location_id) {
                    <code class="meta">{{ l.external_location_id }}</code>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .top { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
      .top h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
      .attention { background: #fef3c7; color: #92400e; border-radius: var(--radius-md); padding: 0.75rem 1.5rem; margin: 0 0 1rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .grid h3 { margin-top: 0; font-size: 1rem; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0; }
      dt { color: var(--color-text-muted); }
      dd { margin: 0; }
      .caps { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    `,
  ],
})
export class GoogleHealthComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';

  readonly health = signal<GbpHealth | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly gbp: GbpService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.loading.set(true);
      this.error.set(null);
      this.gbp.health(this.tenantId).subscribe({
        next: (h) => {
          this.health.set(h);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(apiErrorMessage(err));
          this.loading.set(false);
        },
      });
    }
  }

  overall(): { label: string; cls: string } {
    return OVERALL[this.health()?.overall ?? 'not_connected'];
  }

  capabilityRows(): { name: string; label: string; granted: boolean }[] {
    const caps = this.health()?.connection?.capabilities;
    if (!caps) {
      return [];
    }
    return [
      { name: 'profile', label: 'Read and edit the business profile', granted: caps.profile },
      { name: 'posts', label: 'Publish posts', granted: caps.posts },
      { name: 'reviews', label: 'Read and reply to reviews', granted: caps.reviews },
    ];
  }

  runText(run: GbpRunSummary | null): string {
    if (!run) {
      return 'never run';
    }
    return `${run.status}${run.at ? ' at ' + run.at : ''}${run.error_code ? ' (' + run.error_code + ')' : ''}`;
  }
}
