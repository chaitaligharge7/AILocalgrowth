import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { Creative, CreativeSpec } from '../../core/studio/studio.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { StudioDesignerComponent } from './studio-designer.component';
import { StudioPromoComponent } from './studio-promo.component';
import { StudioTemplatesComponent } from './studio-templates.component';

type StudioTab = 'templates' | 'promo' | 'designer';

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'templates', label: 'Festival & seasonal templates' },
  { id: 'promo', label: 'Promo designer' },
  { id: 'designer', label: 'Poster designer' },
];
const EDIT_ROLES = ['owner', 'admin', 'editor'];

/**
 * `/app/:tenantId/studio` — creative studio: festival/seasonal/promo
 * templates, the promo-offer designer and the poster designer. Everything is
 * deterministic (templates + your own text/colours/images); there is no AI
 * image generation. Drafts are created through the normal content pipeline
 * and nothing is published from this screen.
 */
@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, StudioTemplatesComponent, StudioPromoComponent, StudioDesignerComponent],
  template: `
    <section class="studio">
      <app-page-header
        eyebrow="Content studio"
        eyebrowLabel="Creative"
        title="Creative studio"
        subtitle="Festival templates, offer captions and poster designs for your business."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <nav class="tabs" role="tablist" aria-label="Studio sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
          }
        </nav>

        @if (locationError()) {
          <p class="form-error" role="alert">{{ locationError() }}</p>
        } @else if (locations().length === 0) {
          <p class="meta">No locations yet. Add one on the <a [routerLink]="['/app', tenantId(), 'business-profile']">Business profile</a> screen to create drafts.</p>
        } @else {
          <label class="picker">
            Location for drafts
            <select (change)="locationId.set($any($event.target).value)">
              @for (l of locations(); track l.id) {
                <option [value]="l.id" [selected]="l.id === locationId()">{{ l.name }}</option>
              }
            </select>
          </label>
        }

        @switch (tab()) {
          @case ('templates') {
            <app-studio-templates [tenantId]="tenantId()" [locationId]="locationId()" [locationName]="locationName()" [canDraft]="canEdit()" (design)="openDesigner($event)" />
          }
          @case ('promo') {
            <app-studio-promo [tenantId]="tenantId()" [locationId]="locationId()" [canDraft]="canEdit()" (openDesigner)="openCreative($event)" />
          }
          @case ('designer') {
            <app-studio-designer [tenantId]="tenantId()" [locationId]="locationId()" [canEdit]="canEdit()" [prefill]="prefill()" [open]="openedCreative()" />
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .studio { width: 100%; font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; }
      .tabs button { border-radius: 999px; padding: 0.4rem 1rem; cursor: pointer; }
      .tabs button.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
      .picker { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; max-width: 22rem; margin-bottom: 1rem; }
      .picker select { padding: 0.5rem; font: inherit; font-weight: 400; }
    `,
  ],
})
export class StudioComponent implements OnInit {
  readonly tabs = TABS;
  readonly tab = signal<StudioTab>('templates');
  readonly locations = signal<LocationSummary[]>([]);
  readonly locationId = signal('');
  readonly locationError = signal<string | null>(null);
  readonly prefill = signal<Partial<CreativeSpec> | null>(null);
  readonly openedCreative = signal<Creative | null>(null);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly locationName = computed(() => this.locations().find((l) => l.id === this.locationId())?.name ?? '');
  readonly canEdit = computed(() => EDIT_ROLES.includes(this.currentTenant.tenant()?.caller_role ?? ''));

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly locationApi: LocationApiService,
  ) {}

  ngOnInit(): void {
    if (!this.tenantId()) {
      return;
    }
    this.locationApi.list(this.tenantId()).subscribe({
      next: (list) => {
        this.locations.set(list);
        this.locationId.set(list[0]?.id ?? '');
      },
      error: () => this.locationError.set('Could not load your locations.'),
    });
  }

  openDesigner(spec: Partial<CreativeSpec>): void {
    this.prefill.set({ ...spec });
    this.tab.set('designer');
  }

  openCreative(c: Creative): void {
    this.openedCreative.set(c);
    this.tab.set('designer');
  }
}
