import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { GoogleHealthComponent } from './google-health.component';
import { GoogleHistoryComponent } from './google-history.component';
import { GooglePostsComponent } from './google-posts.component';
import { GoogleProfilePushComponent } from './google-profile-push.component';

type GoogleTab = 'health' | 'posts' | 'profile' | 'history';

const TABS: { id: GoogleTab; label: string; needsLocation: boolean }[] = [
  { id: 'health', label: 'Connection health', needsLocation: false },
  { id: 'posts', label: 'Posts', needsLocation: true },
  { id: 'profile', label: 'Profile & photos', needsLocation: true },
  { id: 'history', label: 'Sync history', needsLocation: false },
];

const DRAFT_ROLES = ['owner', 'admin', 'editor'];
const PUSH_ROLES = ['owner', 'admin'];

/**
 * `/app/:tenantId/google` — Google Business Profile manager: connection
 * health, posts, profile/photo pushes and sync history. While
 * `GOOGLE_INTEGRATION_MODE=mock` (the only mode usable without real Google
 * credentials) every send is accepted by a simulator and labelled
 * MOCK_PROVIDER; live mode fails closed until credentials exist.
 */
@Component({
  selector: 'app-google',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    GoogleHealthComponent,
    GooglePostsComponent,
    GoogleProfilePushComponent,
    GoogleHistoryComponent,
  ],
  template: `
    <section class="google">
      <app-page-header
        eyebrow="Google"
        eyebrowLabel="Business Profile"
        title="Google Business Profile"
        subtitle="Connection health, posts, profile and photo updates, and sync history."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <nav class="tabs" role="tablist" aria-label="Google sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">
              {{ t.label }}
            </button>
          }
        </nav>

        @if (needsLocation()) {
          @if (locationError()) {
            <p class="form-error" role="alert">{{ locationError() }}</p>
          } @else if (locations().length === 0) {
            <p class="meta">No locations yet. Add one on the <a [routerLink]="['/app', tenantId(), 'business-profile']">Business profile</a> screen.</p>
          } @else {
            <label class="picker">
              Location
              <select (change)="locationId.set($any($event.target).value)">
                @for (l of locations(); track l.id) {
                  <option [value]="l.id" [selected]="l.id === locationId()">{{ l.name }}</option>
                }
              </select>
            </label>
          }
        }

        @switch (tab()) {
          @case ('health') {
            <app-google-health [tenantId]="tenantId()" />
          }
          @case ('posts') {
            @if (locationId()) {
              <app-google-posts [tenantId]="tenantId()" [locationId]="locationId()" [canDraft]="canDraft()" [canPublish]="canDraft()" />
            }
          }
          @case ('profile') {
            @if (locationId()) {
              <app-google-profile-push [tenantId]="tenantId()" [locationId]="locationId()" [canPush]="canPush()" />
            }
          }
          @case ('history') {
            <app-google-history [tenantId]="tenantId()" [canManage]="canDraft()" />
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .google { width: 100%; font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .tabs { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px; }
      .tabs button { border-radius: 999px; padding: 0.4rem 0.95rem; font-size: var(--text-xs); font-weight: var(--font-semibold); cursor: pointer; }
      .tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
      .picker { display: flex; flex-direction: column; gap: 4px; font-weight: var(--font-semibold); font-size: var(--text-xs); color: var(--color-text-muted); max-width: 20rem; }
      .picker select { height: 36px; padding: 0 10px; font: inherit; font-weight: 400; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); }
    `,
  ],
})
export class GoogleComponent implements OnInit {
  readonly tabs = TABS;
  readonly tab = signal<GoogleTab>('health');
  readonly locations = signal<LocationSummary[]>([]);
  readonly locationId = signal('');
  readonly locationError = signal<string | null>(null);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly needsLocation = computed(() => TABS.find((t) => t.id === this.tab())?.needsLocation ?? false);
  readonly canDraft = computed(() => DRAFT_ROLES.includes(this.currentTenant.tenant()?.caller_role ?? ''));
  readonly canPush = computed(() => PUSH_ROLES.includes(this.currentTenant.tenant()?.caller_role ?? ''));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly locationApi: LocationApiService,
  ) {}

  ngOnInit(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.locationApi.list(tenantId).subscribe({
      next: (list) => {
        const active = list.filter((l) => l.status === 'active');
        this.locations.set(active);
        this.locationId.set(active[0]?.id ?? '');
      },
      error: () => this.locationError.set('Could not load locations.'),
    });
  }
}
