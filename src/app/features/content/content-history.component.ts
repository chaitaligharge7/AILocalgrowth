import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { apiErrorMessage } from '../../core/http/error.util';
import { ContentRevision, TimelineEvent } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Version history and approval/publish timeline for one content item
 * (BW-059/BW-066). History is append-only: "Restore" adds a NEW version that
 * copies the chosen one (and puts the item back to draft) — nothing is ever
 * rewritten. Restore is only offered while the content is editable (draft).
 */
@Component({
  selector: 'app-content-history',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent],
  template: `
    <section class="history" data-testid="content-history">
      <nav class="sub" role="tablist" aria-label="History views">
        <button type="button" role="tab" [class.active]="view() === 'versions'" (click)="view.set('versions')">Versions</button>
        <button type="button" role="tab" [class.active]="view() === 'timeline'" (click)="view.set('timeline')">Approval & publish timeline</button>
      </nav>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (view() === 'versions') {
        @if (!restorable() && canRestore) {
          <p class="meta">Restore is available while the content is a draft.</p>
        }
        <ol class="versions">
          @for (r of revisions(); track r.id) {
            <li [class.current]="r.is_current">
              <header>
                <strong>Version {{ r.version }}</strong>
                @if (r.is_current) { <span class="badge badge--success">Current</span> }
                <span class="meta">{{ r.created_at | date: 'medium' }} · {{ r.editor_name || 'Team member' }}</span>
                @if (r.length_delta !== null) {
                  <span class="meta">{{ r.length_delta >= 0 ? '+' : '' }}{{ r.length_delta }} characters</span>
                }
                @if (canRestore && restorable() && !r.is_current) {
                  <button type="button" class="btn-secondary" [disabled]="busy()" (click)="restore(r)">Restore this version</button>
                }
              </header>
              <p class="body">{{ r.body }}</p>
            </li>
          }
        </ol>
      } @else {
        <ol class="timeline" data-testid="content-timeline">
          @for (e of events(); track e.at + e.type) {
            <li>
              <span class="dot" [class]="dotClass(e)"></span>
              <div>
                <strong>{{ e.title }}</strong>
                <span class="meta">{{ e.at | date: 'medium' }}{{ e.actor_name ? ' · ' + e.actor_name : '' }}</span>
                @if (e.detail) { <p class="meta">{{ e.detail }}</p> }
              </div>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [
    `
      .history { margin-top: 1.25rem; border-top: 1px solid var(--color-border); padding-top: 1rem; }
      .sub { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
      .sub button { border-radius: 999px; padding: 0.3rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
      .sub button.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast); }
      .versions, .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
      .versions li { border: 1px solid var(--color-border); border-radius: 10px; padding: 0.6rem 0.75rem; }
      .versions li.current { border-color: var(--color-primary); }
      .versions header { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
      .body { white-space: pre-wrap; margin: 0.4rem 0 0; font-size: 0.9rem; }
      .timeline li { display: flex; gap: 0.75rem; align-items: flex-start; }
      .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-primary); margin-top: 0.4rem; flex: none; }
      .dot.bad { background: #b00020; }
      .dot.warn { background: #c98a00; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
      .timeline div { display: flex; flex-direction: column; }
      .form-error { color: #b00020; }
    `,
  ],
})
export class ContentHistoryComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) contentId = '';
  /** Changes whenever the parent's item changes, to refresh after an edit. */
  @Input() version = '';
  @Input() canRestore = false;
  @Output() readonly restored = new EventEmitter<void>();

  readonly view = signal<'versions' | 'timeline'>('versions');
  readonly revisions = signal<ContentRevision[]>([]);
  readonly events = signal<TimelineEvent[]>([]);
  readonly restorable = signal(false);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly studio: StudioService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['contentId'] || changes['version']) && this.contentId) {
      this.load();
    }
  }

  dotClass(e: TimelineEvent): string {
    if (e.status === 'rejected' || e.status === 'failed' || e.status === 'dead_letter') {
      return 'bad';
    }
    return e.status === 'pending' ? 'warn' : '';
  }

  restore(r: ContentRevision): void {
    this.busy.set(true);
    this.error.set(null);
    this.studio.restoreRevision(this.tenantId, this.contentId, r.id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.revisions.set(res.revisions);
        this.restorable.set(res.restorable);
        this.restored.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.studio.revisions(this.tenantId, this.contentId).subscribe({
      next: (res) => {
        this.revisions.set(res.revisions);
        this.restorable.set(res.restorable);
        this.studio.timeline(this.tenantId, this.contentId).subscribe({
          next: (t) => {
            this.events.set(t.events);
            this.loading.set(false);
          },
          error: (err: unknown) => {
            this.error.set(apiErrorMessage(err));
            this.loading.set(false);
          },
        });
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
