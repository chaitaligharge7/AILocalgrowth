import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlatformTenantDetail } from '../../../core/admin/platform.models';
import { PlatformService } from '../../../core/admin/platform.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { PageHeaderComponent } from '../../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../../shared/premium/skeleton-loader.component';

/**
 * `/admin/tenants/:tenantId` — one business at a glance (SA-012/013): owner,
 * subscription, footprint counts and members. Read-only; suspend/reactivate
 * stays on the Tenants list where the mandatory reason is captured.
 */
@Component({
  selector: 'app-admin-tenant-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="detail">
      <app-page-header eyebrow="PLATFORM ADMIN" eyebrowLabel="SA-012" [title]="tenant()?.display_name ?? 'Business'" subtitle="Account details for this business." />
      <p class="meta"><a routerLink="/admin/tenants">← Back to tenants</a></p>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
        @if (tenant(); as t) {
        <div class="grid">
          <section class="card">
            <h2>Account</h2>
            <p>Status: <span class="badge badge--dot" [class]="t.status === 'active' ? 'badge--success' : 'badge--danger'">{{ t.status }}</span></p>
            <p>Legal name: {{ t.legal_name ?? '—' }}</p>
            <p>Type: {{ t.business_type ?? '—' }} · {{ t.country }} · {{ t.currency }}</p>
            <p>Created: {{ t.created_at | date: 'medium' }}</p>
            <p>Owner: {{ t.owner.name ?? '—' }} ({{ t.owner.email ?? 'unknown' }})</p>
          </section>
          <section class="card">
            <h2>Subscription</h2>
            @if (t.subscription; as s) {
              <p>{{ s.plan_name }} · <span class="badge badge--dot badge--neutral">{{ s.status }}</span></p>
              <p>Period ends: {{ s.current_period_end ? (s.current_period_end | date: 'mediumDate') : '—' }}</p>
              @if (s.cancel_at) { <p>Cancels: {{ s.cancel_at | date: 'mediumDate' }}</p> }
            } @else {
              <p class="meta">No subscription yet.</p>
            }
          </section>
          <section class="card" data-testid="footprint">
            <h2>Footprint</h2>
            <p>Members: {{ t.footprint.members }}</p>
            <p>Locations: {{ t.footprint.locations }}</p>
            <p>Content items: {{ t.footprint.content_items }}</p>
            <p>Leads: {{ t.footprint.leads }}</p>
            <p>Connected providers: {{ t.footprint.connected_providers }}</p>
            <p>Open tickets: {{ t.footprint.open_tickets }}</p>
          </section>
        </div>
        <section class="card">
          <h2>Members</h2>
          <table data-testid="members-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              @for (m of t.members; track m.user_id) {
                <tr><td>{{ m.name }}</td><td>{{ m.email }}</td><td>{{ m.role_code }}</td><td>{{ m.status }}</td></tr>
              }
            </tbody>
          </table>
        </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .detail { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); overflow-x: auto; }
      .card h2 { font-size: 1rem; margin: 0 0 0.5rem; }
      .card p { margin: 0.25rem 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: center; padding: 0.4rem; border-bottom: 1px solid var(--color-border); }
      .meta { color: var(--color-text-muted); font-size: 0.85rem; }
      .form-error { color: #b00020; }
    `,
  ],
})
export class AdminTenantDetailComponent implements OnInit {
  readonly tenant = signal<PlatformTenantDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly platform: PlatformService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.platform.tenantDetail(id).subscribe({
      next: (t) => {
        this.tenant.set(t);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
