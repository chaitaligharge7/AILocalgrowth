import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { KeywordSuggestion, KeywordSuggestions } from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

const KIND_LABEL: Record<string, string> = {
  category_city: 'Category + city',
  category_area: 'Category + area',
  service_area: 'Service + area',
  service_city: 'Service + city',
  near_me: '"Near me"',
};

/**
 * Local keyword ideas (BW-045 / M-045): phrases built ONLY from the
 * business's own categories, services, service areas and city. There is no
 * search-volume, ranking or competitor data anywhere in this product, so
 * none is shown — every row says it is generated and lists the profile
 * fields it came from.
 */
@Component({
  selector: 'app-audit-keywords',
  standalone: true,
  imports: [SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      @if (loading()) {
        <app-skeleton-loader [rows]="5" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (data()) {
        <p class="meta">{{ data()!.note }}</p>
        @if (data()!.needs_input.length > 0) {
          <ul class="needs">
            @for (n of data()!.needs_input; track n) {
              <li>{{ n }}</li>
            }
          </ul>
        }
        @if (data()!.keywords.length === 0) {
          <app-empty-state icon="analytics" title="No keyword ideas yet" message="Fill in your Business profile (category, services, service areas) to generate ideas." />
        } @else {
          <p class="meta"><strong>{{ data()!.count }}</strong> ideas · <span class="badge badge--neutral">Generated · no search volume</span></p>
          <table class="data-table" data-testid="keyword-table">
            <thead>
              <tr><th>Keyword idea</th><th>Pattern</th><th>Built from</th><th>Actions</th></tr>
            </thead>
            <tbody>
              @for (k of data()!.keywords; track k.keyword) {
                <tr>
                  <td>{{ k.keyword }}</td>
                  <td>{{ kind(k) }}</td>
                  <td class="meta">{{ basis(k) }}</td>
                  <td><button type="button" class="btn-secondary" (click)="copy(k.keyword)">{{ copied() === k.keyword ? 'Copied' : 'Copy' }}</button></td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .needs { color: #92400e; font-size: 0.9rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.5rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--color-border); }
    `,
  ],
})
export class AuditKeywordsComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';

  readonly data = signal<KeywordSuggestions | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal<string | null>(null);

  constructor(private readonly insights: AuditInsightsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!(changes['tenantId'] || changes['locationId']) || !this.tenantId || !this.locationId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.insights.keywords(this.tenantId, this.locationId).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  kind(k: KeywordSuggestion): string {
    return KIND_LABEL[k.kind] ?? k.kind;
  }

  basis(k: KeywordSuggestion): string {
    return k.basis.map((b) => `${b.type.replace('_', ' ')}: ${b.value}`).join(' · ');
  }

  copy(keyword: string): void {
    // Clipboard may be unavailable (insecure context / denied); the button simply does nothing then.
    void navigator.clipboard?.writeText(keyword).then(
      () => this.copied.set(keyword),
      () => undefined,
    );
  }
}
