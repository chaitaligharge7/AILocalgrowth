import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/http/error.util';
import { ContentTemplate, CreativeSpec, TemplateCategory } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const CATEGORY_LABEL: Record<TemplateCategory, string> = { festival: 'Festival', seasonal: 'Seasonal', promo: 'Promotion' };

/**
 * Festival / seasonal / promo template library (BW-055). Dates appear only for
 * fixed Gregorian festivals; lunar and regional ones show a "pick the day
 * yourself" note instead of an invented date. "Create draft" makes an ordinary
 * content DRAFT for the chosen location — nothing is published from here.
 */
@Component({
  selector: 'app-studio-templates',
  standalone: true,
  imports: [DatePipe, RouterLink, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      <div class="chips" role="group" aria-label="Template category">
        <button type="button" class="chip" [class.active]="category() === null" (click)="setCategory(null)">All</button>
        @for (c of categories; track c) {
          <button type="button" class="chip" [class.active]="category() === c" (click)="setCategory(c)">{{ label(c) }}</button>
        }
      </div>

      @if (notice()) {
        <p class="success" role="status">
          {{ notice() }}
          <a [routerLink]="['/app', tenantId, 'content']">Open Content</a>
        </p>
      }
      @if (actionError()) {
        <p class="form-error" role="alert">{{ actionError() }}</p>
      }

      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (templates().length === 0) {
        <app-empty-state icon="content" title="No templates in this category" message="Try another category." />
      } @else {
        <div class="grid" data-testid="template-grid">
          @for (t of templates(); track t.id) {
            <article class="card tpl">
              <header>
                <span class="badge badge--info">{{ label(t.category) }}</span>
                @if (t.next_date) {
                  <span class="when" [class.soon]="(t.days_until ?? 99) <= 14">
                    {{ t.next_date | date: 'd MMM' }} ·
                    {{ t.days_until === 0 ? 'today' : t.days_until === 1 ? 'tomorrow' : 'in ' + t.days_until + ' days' }}
                  </span>
                } @else if (t.category === 'festival') {
                  <span class="when">Date varies</span>
                }
              </header>
              <h3>{{ t.title }}</h3>
              <p class="caption">{{ fill(t.caption) }}</p>
              @if (t.date_note) {
                <p class="meta">{{ t.date_note }}</p>
              }
              @if (t.hashtags.length) {
                <p class="tags">{{ t.hashtags.join(' ') }}</p>
              }
              <div class="actions">
                @if (canDraft) {
                  <button type="button" [disabled]="busy() || !locationId" (click)="createDraft(t)">
                    {{ busyId() === t.id ? 'Creating…' : 'Create draft' }}
                  </button>
                }
                <button type="button" class="btn-secondary" (click)="design.emit(specFor(t))">Design poster</button>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
      .chip { border-radius: 999px; padding: 0.3rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
      .chip.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
      .tpl { display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; }
      .tpl header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
      .tpl h3 { margin: 0.25rem 0 0; font-size: 1rem; }
      .when { font-size: 0.8rem; color: var(--color-text-muted); }
      .when.soon { color: var(--color-accent-gold, #b07a1f); font-weight: 600; }
      .caption { font-size: 0.9rem; margin: 0; white-space: pre-line; flex: 1; }
      .meta, .tags { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
      .success { color: #1b6b3a; }
      .form-error { color: #b00020; }
    `,
  ],
})
export class StudioTemplatesComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input() locationId = '';
  /** Shown in previews and posters in place of the {business_name} placeholder. */
  @Input() locationName = '';
  @Input() canDraft = false;
  @Output() readonly design = new EventEmitter<Partial<CreativeSpec>>();

  readonly categories: TemplateCategory[] = ['festival', 'seasonal', 'promo'];
  readonly category = signal<TemplateCategory | null>(null);
  readonly templates = signal<ContentTemplate[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly busy = () => this.busyId() !== null;

  constructor(private readonly studio: StudioService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.load();
    }
  }

  label(c: TemplateCategory): string {
    return CATEGORY_LABEL[c];
  }

  fill(text: string): string {
    return text.split('{business_name}').join(this.locationName || 'your business');
  }

  setCategory(c: TemplateCategory | null): void {
    this.category.set(c);
    this.load();
  }

  specFor(t: ContentTemplate): Partial<CreativeSpec> {
    return { headline: this.fill(t.overlay.headline ?? t.title), subline: this.fill(t.overlay.subline ?? ''), cta_text: t.cta };
  }

  createDraft(t: ContentTemplate): void {
    this.busyId.set(t.id);
    this.actionError.set(null);
    this.notice.set(null);
    this.studio.draftFromTemplate(this.tenantId, t.id, this.locationId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set(`Draft created from "${t.title}". Review and edit it before submitting for approval.`);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.studio.templates(this.tenantId, this.category() ?? undefined).subscribe({
      next: (res) => {
        this.templates.set(res.templates);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
