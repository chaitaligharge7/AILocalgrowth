import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  GoogleReview,
  ReviewApprovalSettings,
  ReviewReplyDraft,
  ReviewReplyEvent,
} from '../../core/reviews/review.models';
import { ReviewService } from '../../core/reviews/review.service';
import { apiErrorCode, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';

export type SortOrder = 'unreplied_first' | 'rating_asc' | 'newest';

export interface SendGate {
  allowed: boolean;
  reason: string | null;
}

export function canSendReply(review: GoogleReview, draft: ReviewReplyDraft | null): SendGate {
  if (!draft) {
    return { allowed: false, reason: 'Draft a reply first.' };
  }
  if (draft.status === 'sent') {
    return { allowed: false, reason: 'This reply has already been sent.' };
  }
  if (review.requires_approval && draft.status !== 'approved') {
    return { allowed: false, reason: 'Needs approval before sending — this review is rating ≤ 2 or flagged sensitive.' };
  }
  return { allowed: true, reason: null };
}

export function canApproveDraft(draft: ReviewReplyDraft | null): boolean {
  return draft !== null && draft.status === 'draft';
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, NgTemplateOutlet, PageHeaderComponent, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section class="reviews">
      <app-page-header
        eyebrow="REPUTATION"
        eyebrowLabel="Google reviews"
        title="Review inbox"
        subtitle="Location {{ locationId() }} · draft, edit, triage, approve, and send replies."
      />
      <div class="top-bar">
        <a [routerLink]="['/app', tenantId(), 'integrations']">Integrations</a>
        @if (canConfigureSettings()) {
          <button type="button" class="btn-secondary" (click)="toggleSettingsPanel()">
            {{ showSettings() ? 'Close approval rules' : 'Approval rules' }}
          </button>
        }
      </div>

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        @if (showSettings()) {
          <section class="settings-card">
            <h3>Per-tenant review approval threshold</h3>
            @if (loadingSettings()) {
              <p>Loading settings…</p>
            } @else {
              <div class="settings-grid">
                <label>
                  Require approval when rating ≤
                  <select [ngModel]="settingsMaxRating()" (ngModelChange)="settingsMaxRating.set(+$event)">
                    <option [value]="0">Disabled (keywords only)</option>
                    <option [value]="1">1 star</option>
                    <option [value]="2">2 stars (default)</option>
                    <option [value]="3">3 stars</option>
                    <option [value]="4">4 stars</option>
                    <option [value]="5">5 stars (all)</option>
                  </select>
                </label>
                <label class="checkbox-row">
                  <input
                    type="checkbox"
                    [ngModel]="settingsRequireAll()"
                    (ngModelChange)="settingsRequireAll.set($event)"
                  />
                  <span>Require approval for all reviews</span>
                </label>
              </div>
              <label class="full-field">
                Sensitive keywords (comma-separated)
                <input
                  type="text"
                  [ngModel]="settingsKeywordsText()"
                  (ngModelChange)="settingsKeywordsText.set($event)"
                  placeholder="injury, unsafe, lawsuit, fraud"
                />
              </label>
              <div class="actions">
                <button type="button" class="btn-primary" (click)="saveSettings()" [disabled]="savingSettings()">
                  {{ savingSettings() ? 'Saving…' : 'Save approval rules' }}
                </button>
              </div>
              @if (settingsError()) {
                <p class="form-error" role="alert">{{ settingsError() }}</p>
              }
              @if (settingsNotice()) {
                <p class="success" role="status">{{ settingsNotice() }}</p>
              }
            }
          </section>
        }

        <section class="filters">
          <label>
            Status
            <select [value]="statusFilter()" (change)="onStatusFilterChange($event)">
              <option value="">All</option>
              <option value="unreplied">Unreplied</option>
              <option value="replied">Replied</option>
            </select>
          </label>
          <label>
            Rating
            <select [value]="ratingFilter()" (change)="onRatingFilterChange($event)">
              <option value="">Any</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <label>
            Sort by
            <select [value]="sortOrder()" (change)="onSortChange($event)">
              <option value="unreplied_first">Unreplied &amp; needs-attention first</option>
              <option value="rating_asc">Lowest rating first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
          @if (!canReply()) {
            <span class="owner-only-note">Viewing only — owner/admin/editor may draft/approve/send replies (enforced server-side).</span>
          } @else if (reviews().length > 0) {
            <button type="button" class="btn-secondary btn-sm" (click)="selectAllUnreplied()" data-testid="select-unreplied">
              Select all unreplied
            </button>
          }
        </section>

        @if (canReply() && selectedReviewIds().length > 0) {
          <section class="bulk-review-bar" data-testid="review-bulk-bar">
            <span class="bulk-review-bar__count">{{ selectedReviewIds().length }} review(s) selected</span>
            <div class="bulk-review-bar__actions">
              <button type="button" class="btn-secondary btn-sm" [disabled]="bulkBusy()" (click)="runBulkAction('draft')">
                {{ bulkBusy() ? 'Working…' : 'Generate drafts (AI)' }}
              </button>
              <button type="button" class="btn-secondary btn-sm" [disabled]="bulkBusy()" (click)="runBulkAction('approve')">
                Approve drafts
              </button>
              <button type="button" class="btn-primary btn-sm" [disabled]="bulkBusy()" (click)="runBulkAction('approve_and_send')">
                Approve &amp; send
              </button>
              <button type="button" class="btn-ghost btn-sm" (click)="clearBulkSelection()">Clear</button>
            </div>
          </section>
        }
        @if (bulkNotice()) {
          <p class="success" role="status">{{ bulkNotice() }}</p>
        }
        @if (bulkError()) {
          <p class="form-error" role="alert">{{ bulkError() }}</p>
        }

        @if (loadingList()) {
          <app-skeleton-loader [rows]="4" />
        } @else if (listError()) {
          <p class="form-error" role="alert">{{ listError() }}</p>
        } @else if (reviews().length === 0) {
          <app-empty-state icon="leads" title="No reviews yet" message="Synced Google reviews for this location will show up here." />
        } @else {
          @if (needsAttention().length > 0) {
            <section class="group needs-attention">
              <h2>Needs attention ({{ needsAttention().length }})</h2>
              <ul>
                @for (review of needsAttention(); track review.id) {
                  <li>
                    <ng-container *ngTemplateOutlet="reviewRow; context: { review: review }"></ng-container>
                  </li>
                }
              </ul>
            </section>
          }

          <section class="group other">
            <h2>Other reviews ({{ otherReviews().length }})</h2>
            @if (otherReviews().length === 0) {
              <p class="placeholder">None.</p>
            } @else {
              <ul>
                @for (review of otherReviews(); track review.id) {
                  <li>
                    <ng-container *ngTemplateOutlet="reviewRow; context: { review: review }"></ng-container>
                  </li>
                }
              </ul>
            }
          </section>
        }

        <ng-template #reviewRow let-review="review">
          <article class="review-card" [class.selected]="selected()?.id === review.id" [class.prominent]="isNegative(review)">
            <header>
              @if (canReply()) {
                <input
                  type="checkbox"
                  class="review-select-box"
                  [attr.aria-label]="'Select review by ' + review.author_display"
                  [checked]="isBulkSelected(review.id)"
                  (change)="toggleBulkSelect(review.id, $any($event.target).checked)"
                />
              }
              <span class="avatar-initial" [class]="avatarTintClass(review.author_display || review.id)">
                {{ initialFor(review.author_display) }}
              </span>
              <span class="author">{{ review.author_display }}</span>
              <span class="rating" [attr.aria-label]="review.rating + ' out of 5 stars'">{{ starString(review.rating) }}</span>
              @if (review.mock_provider) {
                <span class="mock-badge" title="Simulated via the mock Google provider.">MOCK_PROVIDER</span>
              }
              @if (review.escalated) {
                <span class="escalated-tag">Escalated</span>
              }
              @if (review.requires_approval) {
                <span class="severity-tag">Requires approval</span>
              }
              <span class="badge badge--dot" [class]="review.has_reply ? 'badge--success' : 'badge--warning'">
                {{ review.has_reply ? 'Replied' : 'Unreplied' }}
              </span>
            </header>
            <p class="comment">{{ review.comment || '(no written comment)' }}</p>
            @if ((review.tags?.length ?? 0) > 0) {
              <div class="tag-row">
                @for (tag of review.tags ?? []; track tag) {
                  <span class="tag-chip">#{{ tag }}</span>
                }
              </div>
            }
            <p class="meta">Reviewed {{ review.reviewed_at | date: 'short' }} · last synced {{ review.last_synced_at | date: 'short' }}</p>
            <div class="row-actions">
              <button type="button" (click)="select(review)">
                {{ selected()?.id === review.id ? 'Selected' : 'Open' }}
              </button>
            </div>
          </article>
        </ng-template>

        @if (selected()) {
          <section class="detail">
            <h2>Reply workflow &amp; triage</h2>
            <p class="detail-sub">
              Review by <strong>{{ selected()!.author_display }}</strong> — {{ starString(selected()!.rating) }}
            </p>

            @if (canReply()) {
              <div class="actions">
                <button type="button" (click)="draftReply()" [disabled]="drafting()">
                  {{ drafting() ? 'Drafting…' : 'Draft reply (AI)' }}
                </button>
                <button type="button" (click)="approveReply()" [disabled]="!canApprove() || approving()">
                  {{ approving() ? 'Approving…' : 'Approve reply' }}
                </button>
                <button type="button" (click)="sendReply()" [disabled]="!sendGate().allowed || sending()">
                  {{ sending() ? 'Sending…' : 'Send reply' }}
                </button>
                <button type="button" (click)="loadHistory()">View history</button>
              </div>
              @if (!sendGate().allowed && sendGate().reason) {
                <p class="gap-note">{{ sendGate().reason }}</p>
              }
            }

            @if (actionError()) {
              <p class="form-error" role="alert">{{ actionError() }}</p>
            }
            @if (actionNotice()) {
              <p class="success" role="status">{{ actionNotice() }}</p>
            }

            @if (currentDraft()) {
              <article class="draft-card">
                <h3>Current draft <span class="status-pill">{{ currentDraft()!.status }}</span></h3>
                @if (canReply() && currentDraft()!.status !== 'sent') {
                  <textarea
                    class="draft-editor"
                    rows="4"
                    [ngModel]="draftEditBody()"
                    (ngModelChange)="draftEditBody.set($event)"
                    aria-label="Edit draft reply"
                  ></textarea>
                  <div class="actions">
                    <button
                      type="button"
                      class="btn-secondary"
                      (click)="saveDraftEdit()"
                      [disabled]="savingDraft() || !draftEditBody().trim()"
                    >
                      {{ savingDraft() ? 'Saving…' : 'Save draft edit' }}
                    </button>
                  </div>
                } @else {
                  <p class="draft-body">{{ currentDraft()!.body }}</p>
                }
                <p class="draft-meta">Generated by {{ currentDraft()!.generated_by }}</p>
              </article>
            } @else {
              <p class="placeholder">No draft yet for this review in this session — click "Draft reply (AI)".</p>
            }

            @if (canReply()) {
              <article class="triage-card">
                <h3>Internal triage (notes, tags, assignee &amp; escalation)</h3>
                <div class="triage-grid">
                  <label>
                    Tags (comma-separated)
                    <input
                      type="text"
                      [ngModel]="triageTagsText()"
                      (ngModelChange)="triageTagsText.set($event)"
                      placeholder="billing, wait-time, vip"
                    />
                  </label>
                  <label>
                    Assignee User ID
                    <input
                      type="text"
                      [ngModel]="triageAssigneeId()"
                      (ngModelChange)="triageAssigneeId.set($event)"
                      placeholder="Optional tenant member user ID"
                    />
                  </label>
                </div>
                <label class="full-field">
                  Internal notes (team-only, never sent to Google)
                  <textarea
                    rows="2"
                    [ngModel]="triageNotes()"
                    (ngModelChange)="triageNotes.set($event)"
                    placeholder="Add follow-up context for your team…"
                  ></textarea>
                </label>
                <div class="escalation-row">
                  <label class="checkbox-row">
                    <input
                      type="checkbox"
                      [ngModel]="triageEscalated()"
                      (ngModelChange)="triageEscalated.set($event)"
                    />
                    <span>Escalate to owner/admin</span>
                  </label>
                  @if (triageEscalated()) {
                    <input
                      type="text"
                      class="escalation-input"
                      [ngModel]="triageEscalationReason()"
                      (ngModelChange)="triageEscalationReason.set($event)"
                      placeholder="Reason for escalation"
                    />
                  }
                </div>
                <div class="actions">
                  <button type="button" class="btn-secondary" (click)="saveTriage()" [disabled]="savingTriage()">
                    {{ savingTriage() ? 'Saving triage…' : 'Save triage' }}
                  </button>
                </div>
              </article>
            }

            @if (showHistory()) {
              <article class="history-card">
                <h3>Reply history</h3>
                @if (historyEvents().length === 0) {
                  <p class="placeholder">No events yet.</p>
                } @else {
                  <ul>
                    @for (event of historyEvents(); track event.id) {
                      <li>
                        <strong>{{ event.event_type }}</strong> — {{ event.event_at | date: 'short' }}
                        @if (event.external_reply_id) {
                          (external id: <code>{{ event.external_reply_id }}</code>)
                        }
                      </li>
                    }
                  </ul>
                }
              </article>
            }
          </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .reviews {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.875rem;
      }
      .settings-card,
      .triage-card,
      .draft-card,
      .history-card {
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        padding: 0.9rem;
        background: var(--color-surface, #fff);
        margin-top: 0.75rem;
      }
      .settings-card h3,
      .triage-card h3,
      .draft-card h3,
      .history-card h3 {
        margin: 0 0 0.65rem;
        font-size: 0.95rem;
      }
      .settings-grid,
      .triage-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem;
        margin-bottom: 0.65rem;
      }
      .full-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.82rem;
        font-weight: 600;
        margin-bottom: 0.65rem;
      }
      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .escalation-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.65rem;
      }
      .escalation-input {
        flex: 1;
        min-width: 220px;
      }
      .draft-editor {
        width: 100%;
        box-sizing: border-box;
        padding: 0.5rem;
        font: inherit;
        border: 1px solid var(--color-border, #ccc);
        border-radius: 6px;
        margin-bottom: 0.5rem;
      }
      input[type='text'],
      textarea,
      select {
        padding: 0.4rem 0.55rem;
        font: inherit;
        border: 1px solid var(--color-border, #ccc);
        border-radius: 6px;
      }
      .btn-primary {
        background: var(--color-primary, #4f46e5);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 0.45rem 0.9rem;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-secondary {
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ccc);
        border-radius: 6px;
        padding: 0.45rem 0.85rem;
        cursor: pointer;
      }
      .filters {
        display: flex;
        gap: 1.25rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .filters label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .group ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .needs-attention h2 {
        color: #b00020;
      }
      .review-card {
        border: 1px solid #e3e3e3;
        border-radius: 8px;
        padding: 0.75rem 0.9rem;
      }
      .review-card.prominent {
        border-color: #f1c3bf;
        background: #fdf6f5;
      }
      .review-card.selected {
        box-shadow: 0 0 0 2px #1a56db inset;
      }
      .review-card header {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        flex-wrap: wrap;
        font-size: 0.85rem;
      }
      .author {
        font-weight: 700;
      }
      .rating {
        color: #c98a00;
      }
      .mock-badge {
        display: inline-block;
        padding: 0.1rem 0.45rem;
        border-radius: 4px;
        background: #fff3cd;
        color: #8a6500;
        font-size: 0.68rem;
        font-weight: 700;
        border: 1px solid #f0d58c;
      }
      .escalated-tag {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        background: #991b1b;
        color: #fff;
        font-size: 0.68rem;
        font-weight: 700;
      }
      .severity-tag {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        background: #fdecea;
        color: #b00020;
        font-size: 0.68rem;
        font-weight: 700;
      }
      .tag-row {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
        margin-bottom: 0.35rem;
      }
      .tag-chip {
        font-size: 0.72rem;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
      }
      .badge--dot {
        margin-left: auto;
      }
      .comment {
        margin: 0.4rem 0;
        white-space: pre-wrap;
      }
      .meta {
        margin: 0;
        color: #888;
        font-size: 0.78rem;
      }
      .row-actions {
        margin-top: 0.4rem;
      }
      button {
        padding: 0.45rem 0.85rem;
        cursor: pointer;
      }
      .detail {
        border-top: 1px solid #ddd;
        padding-top: 1rem;
      }
      .detail-sub {
        color: #555;
      }
      .actions {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .draft-body {
        white-space: pre-wrap;
      }
      .status-pill {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        background: #eef;
        font-size: 0.72rem;
        margin-left: 0.4rem;
      }
      .draft-meta {
        color: #777;
        font-size: 0.78rem;
      }
      .placeholder {
        color: #888;
      }
      .gap-note {
        color: #875c00;
        background: #fff6e5;
        border: 1px solid #f0d58c;
        border-radius: 6px;
        padding: 0.5rem 0.65rem;
        font-size: 0.82rem;
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
        font-size: 0.8rem;
      }
      .review-select-box {
        width: 16px;
        height: 16px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .bulk-review-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        padding: 0.6rem 0.9rem;
        margin: 0.5rem 0;
        border-radius: 10px;
        background: #f0fdfa;
        border: 1px solid #99f6e4;
      }
      .bulk-review-bar__count {
        font-size: 0.85rem;
        font-weight: 600;
        color: #0f766e;
      }
      .bulk-review-bar__actions {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class ReviewsComponent {
  private readonly route = inject(ActivatedRoute);

  readonly tenantId = computed(() => this.currentTenant.tenant()?.id ?? null);
  readonly locationId = signal<string>(this.route.snapshot.paramMap.get('locationId') ?? '');

  readonly canReply = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });
  readonly canConfigureSettings = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly reviews = signal<GoogleReview[]>([]);
  readonly loadingList = signal(true);
  readonly listError = signal<string | null>(null);

  readonly statusFilter = signal<'' | 'replied' | 'unreplied'>('');
  readonly ratingFilter = signal<'' | '1' | '2' | '3' | '4' | '5'>('');
  readonly sortOrder = signal<SortOrder>('unreplied_first');

  readonly sortedReviews = computed(() => {
    const order = this.sortOrder();
    const items = [...this.reviews()];
    switch (order) {
      case 'rating_asc':
        return items.sort((a, b) => a.rating - b.rating);
      case 'newest':
        return items.sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1));
      case 'unreplied_first':
      default:
        return items.sort((a, b) => {
          const aAttention = this.isNegative(a) ? 0 : 1;
          const bAttention = this.isNegative(b) ? 0 : 1;
          if (aAttention !== bAttention) {
            return aAttention - bAttention;
          }
          const aUnreplied = a.has_reply ? 1 : 0;
          const bUnreplied = b.has_reply ? 1 : 0;
          return aUnreplied - bUnreplied;
        });
    }
  });

  readonly needsAttention = computed(() => this.sortedReviews().filter((r) => this.isNegative(r)));
  readonly otherReviews = computed(() => this.sortedReviews().filter((r) => !this.isNegative(r)));

  readonly selected = signal<GoogleReview | null>(null);
  private readonly draftsByReviewId = signal<Record<string, ReviewReplyDraft>>({});
  readonly currentDraft = computed(() => {
    const review = this.selected();
    return review ? this.draftsByReviewId()[review.id] ?? null : null;
  });

  readonly draftEditBody = signal('');
  readonly savingDraft = signal(false);

  // Triage fields for selected review
  readonly triageNotes = signal('');
  readonly triageTagsText = signal('');
  readonly triageAssigneeId = signal('');
  readonly triageEscalated = signal(false);
  readonly triageEscalationReason = signal('');
  readonly savingTriage = signal(false);

  // Per-tenant approval settings
  readonly showSettings = signal(false);
  readonly loadingSettings = signal(false);
  readonly savingSettings = signal(false);
  readonly settingsMaxRating = signal(2);
  readonly settingsRequireAll = signal(false);
  readonly settingsKeywordsText = signal('');
  readonly settingsError = signal<string | null>(null);
  readonly settingsNotice = signal<string | null>(null);

  readonly sendGate = computed(() => {
    const review = this.selected();
    if (!review) {
      return { allowed: false, reason: null } as SendGate;
    }
    return canSendReply(review, this.currentDraft());
  });
  readonly canApprove = computed(() => canApproveDraft(this.currentDraft()));

  readonly drafting = signal(false);
  readonly approving = signal(false);
  readonly sending = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly selectedReviewIds = signal<string[]>([]);
  readonly bulkBusy = signal(false);
  readonly bulkNotice = signal<string | null>(null);
  readonly bulkError = signal<string | null>(null);

  readonly showHistory = signal(false);
  readonly historyEvents = signal<ReviewReplyEvent[]>([]);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly reviewService: ReviewService,
  ) {
    this.refreshList();
  }

  isNegative(review: GoogleReview): boolean {
    return review.rating <= 2 || review.requires_approval || Boolean(review.escalated);
  }

  initialFor(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed[0].toUpperCase() : '•';
  }

  avatarTintClass(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const index = hash % 5;
    return index === 0 ? '' : `avatar-initial--${index}`;
  }

  starString(rating: number): string {
    const clamped = Math.max(0, Math.min(5, rating));
    return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
  }

  toggleSettingsPanel(): void {
    const next = !this.showSettings();
    this.showSettings.set(next);
    if (next) {
      this.loadSettings();
    }
  }

  isBulkSelected(reviewId: string): boolean {
    return this.selectedReviewIds().includes(reviewId);
  }

  toggleBulkSelect(reviewId: string, checked: boolean): void {
    this.selectedReviewIds.update((list) => (checked ? [...new Set([...list, reviewId])] : list.filter((id) => id !== reviewId)));
  }

  selectAllUnreplied(): void {
    const ids = this.reviews()
      .filter((r) => !r.has_reply)
      .map((r) => r.id);
    this.selectedReviewIds.set(ids);
  }

  clearBulkSelection(): void {
    this.selectedReviewIds.set([]);
  }

  runBulkAction(action: 'draft' | 'approve' | 'approve_and_send'): void {
    const tenantId = this.tenantId();
    const ids = this.selectedReviewIds();
    if (!tenantId || ids.length === 0 || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    this.bulkNotice.set(null);
    this.bulkError.set(null);
    this.reviewService.bulkAction(tenantId, action, ids).subscribe({
      next: (res) => {
        this.bulkBusy.set(false);
        this.clearBulkSelection();
        if (res.failed.length > 0) {
          this.bulkError.set(`${res.succeeded.length} succeeded, ${res.failed.length} failed (${res.failed[0].message}).`);
        } else {
          const label = action === 'draft' ? 'Drafts generated' : action === 'approve' ? 'Drafts approved' : 'Replies approved & sent';
          this.bulkNotice.set(`${label} for ${res.succeeded.length} review(s).`);
        }
        this.refreshList();
      },
      error: (err: unknown) => {
        this.bulkBusy.set(false);
        this.bulkError.set(apiErrorMessage(err));
      },
    });
  }

  loadSettings(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loadingSettings.set(true);
    this.settingsError.set(null);
    this.reviewService.getSettings(tenantId).subscribe({
      next: (cfg: ReviewApprovalSettings) => {
        this.loadingSettings.set(false);
        this.settingsMaxRating.set(cfg.approval_max_rating);
        this.settingsRequireAll.set(cfg.require_approval_for_all);
        this.settingsKeywordsText.set(cfg.sensitive_keywords.join(', '));
      },
      error: (err: unknown) => {
        this.loadingSettings.set(false);
        this.settingsError.set(apiErrorMessage(err));
      },
    });
  }

  saveSettings(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.savingSettings()) {
      return;
    }
    this.savingSettings.set(true);
    this.settingsError.set(null);
    this.settingsNotice.set(null);
    const keywords = this.settingsKeywordsText()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    this.reviewService
      .updateSettings(tenantId, {
        approval_max_rating: this.settingsMaxRating(),
        require_approval_for_all: this.settingsRequireAll(),
        sensitive_keywords: keywords,
      })
      .subscribe({
        next: () => {
          this.savingSettings.set(false);
          this.settingsNotice.set('Approval rules saved.');
          this.refreshList();
        },
        error: (err: unknown) => {
          this.savingSettings.set(false);
          this.settingsError.set(apiErrorMessage(err));
        },
      });
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as '' | 'replied' | 'unreplied');
    this.refreshList();
  }

  onRatingFilterChange(event: Event): void {
    this.ratingFilter.set((event.target as HTMLSelectElement).value as '' | '1' | '2' | '3' | '4' | '5');
    this.refreshList();
  }

  onSortChange(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value as SortOrder);
  }

  private refreshList(): void {
    const tenantId = this.tenantId();
    const locationId = this.locationId();
    if (!tenantId || !locationId) {
      this.loadingList.set(false);
      return;
    }
    this.loadingList.set(true);
    this.listError.set(null);
    const filters: { rating?: number; status?: 'replied' | 'unreplied' } = {};
    if (this.ratingFilter()) {
      filters.rating = Number(this.ratingFilter());
    }
    if (this.statusFilter()) {
      filters.status = this.statusFilter() as 'replied' | 'unreplied';
    }
    this.reviewService.list(tenantId, locationId, filters).subscribe({
      next: (reviews) => {
        this.loadingList.set(false);
        this.reviews.set(reviews);
      },
      error: (err: unknown) => {
        this.loadingList.set(false);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }

  select(review: GoogleReview): void {
    this.selected.set(review);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.showHistory.set(false);
    this.historyEvents.set([]);
    this.draftEditBody.set(this.draftsByReviewId()[review.id]?.body ?? '');
    this.triageNotes.set(review.internal_notes ?? '');
    this.triageTagsText.set((review.tags ?? []).join(', '));
    this.triageAssigneeId.set(review.assigned_user_id ?? '');
    this.triageEscalated.set(Boolean(review.escalated));
    this.triageEscalationReason.set(review.escalation_reason ?? '');
  }

  private setDraft(reviewId: string, draft: ReviewReplyDraft): void {
    this.draftsByReviewId.update((map) => ({ ...map, [reviewId]: draft }));
    if (this.selected()?.id === reviewId) {
      this.draftEditBody.set(draft.body);
    }
  }

  draftReply(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    if (!tenantId || !review || this.drafting()) {
      return;
    }
    this.drafting.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.reviewService.draftReply(tenantId, review.id).subscribe({
      next: (draft) => {
        this.drafting.set(false);
        this.setDraft(review.id, draft);
        this.actionNotice.set('Draft generated.');
      },
      error: (err: unknown) => {
        this.drafting.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  saveDraftEdit(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    const draft = this.currentDraft();
    const body = this.draftEditBody().trim();
    if (!tenantId || !review || !draft || !body || this.savingDraft()) {
      return;
    }
    this.savingDraft.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.reviewService.updateDraftReply(tenantId, review.id, body, draft.id).subscribe({
      next: (updated) => {
        this.savingDraft.set(false);
        this.setDraft(review.id, updated);
        this.actionNotice.set('Draft reply updated.');
      },
      error: (err: unknown) => {
        this.savingDraft.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  saveTriage(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    if (!tenantId || !review || this.savingTriage()) {
      return;
    }
    this.savingTriage.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);
    const tags = this.triageTagsText()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    this.reviewService
      .updateTriage(tenantId, review.id, {
        internal_notes: this.triageNotes().trim() || null,
        tags,
        assigned_user_id: this.triageAssigneeId().trim() || null,
        escalated: this.triageEscalated(),
        escalation_reason: this.triageEscalated() ? this.triageEscalationReason().trim() || null : null,
      })
      .subscribe({
        next: (updated) => {
          this.savingTriage.set(false);
          this.selected.set(updated);
          this.reviews.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
          this.actionNotice.set('Review triage saved.');
        },
        error: (err: unknown) => {
          this.savingTriage.set(false);
          this.actionError.set(apiErrorMessage(err));
        },
      });
  }

  approveReply(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    const draft = this.currentDraft();
    if (!tenantId || !review || !draft || this.approving()) {
      return;
    }
    this.approving.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.reviewService.approveReply(tenantId, review.id, draft.id).subscribe({
      next: (updated) => {
        this.approving.set(false);
        this.setDraft(review.id, updated);
        this.actionNotice.set('Reply approved.');
      },
      error: (err: unknown) => {
        this.approving.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  sendReply(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    const draft = this.currentDraft();
    if (!tenantId || !review || !draft || this.sending() || !this.sendGate().allowed) {
      return;
    }
    this.sending.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.reviewService.sendReply(tenantId, review.id, draft.id).subscribe({
      next: (sent) => {
        this.sending.set(false);
        this.setDraft(review.id, sent);
        this.actionNotice.set('Reply sent.');
        this.refreshList();
      },
      error: (err: unknown) => {
        this.sending.set(false);
        const code = apiErrorCode(err);
        this.actionError.set(
          code === 'APPROVAL_REQUIRED'
            ? 'The backend refused to send: this review needs an approved reply first.'
            : apiErrorMessage(err),
        );
      },
    });
  }

  loadHistory(): void {
    const tenantId = this.tenantId();
    const review = this.selected();
    if (!tenantId || !review) {
      return;
    }
    this.showHistory.set(true);
    this.reviewService.history(tenantId, review.id).subscribe({
      next: (events) => this.historyEvents.set(events),
      error: (err: unknown) => this.actionError.set(apiErrorMessage(err)),
    });
  }
}
