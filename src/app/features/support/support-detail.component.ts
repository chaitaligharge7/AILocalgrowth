import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { SupportService } from '../../core/support/support.service';
import { SUPPORT_ALL_STATUSES, SupportStatus, SupportTicketDetail, canTransitionSupportStatus } from '../../core/support/support.models';

/**
 * `/app/:tenantId/support/:ticketId` — message thread + status transitions.
 *
 * Status-change gating mirrors `SupportService::changeStatus()` exactly:
 * owner/admin OR the ticket's own requester may change status, everyone
 * else sees the thread read-only (no status controls at all). The set of
 * *target* statuses offered is additionally filtered through
 * {@link canTransitionSupportStatus}, mirroring
 * `SupportTicketStateMachine::TRANSITIONS` — this is UX convenience only;
 * the backend independently re-validates and 409s on an invalid edge.
 */
@Component({
  selector: 'app-support-detail',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="support-detail">
      <p class="back-row"><a class="btn-secondary btn-sm" [routerLink]="['/app', tenantId(), 'support']">&larr; Back to tickets</a></p>

      @if (loading()) {
        <p>Loading ticket…</p>
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (ticket()) {
        <h1>{{ ticket()!.subject }}</h1>
        <p class="meta">
          <span class="badge status-{{ ticket()!.status }}">{{ ticket()!.status }}</span>
          {{ ticket()!.category }} · {{ ticket()!.priority }}
          · opened {{ ticket()!.age_seconds }}s ago
        </p>

        @if (canChangeStatus()) {
          <div class="status-actions">
            <span>Change status:</span>
            @for (target of availableTransitions(); track target) {
              <button type="button" (click)="changeStatus(target)" [disabled]="statusChanging()">{{ target }}</button>
            }
            @if (availableTransitions().length === 0) {
              <span class="meta">No transitions available.</span>
            }
          </div>
        } @else {
          <p class="owner-only-note">
            Only an owner/admin or the ticket requester may change its status (enforced server-side regardless of this message).
          </p>
        }
        @if (statusError()) {
          <p class="form-error" role="alert">{{ statusError() }}</p>
        }

        @if (canRate()) {
          <section class="csat-box" data-testid="csat-box">
            <h3>How satisfied are you with this resolution?</h3>
            @if (ticket()!.csat) {
              <p class="csat-saved">
                Rated <strong>{{ ticket()!.csat!.rating }} / 5 ★</strong>
                @if (ticket()!.csat!.comment) {
                  — “{{ ticket()!.csat!.comment }}”
                }
              </p>
            }
            <div class="csat-stars" role="radiogroup" aria-label="Support satisfaction rating">
              @for (star of [1, 2, 3, 4, 5]; track star) {
                <button
                  type="button"
                  class="star-btn"
                  [class.star-active]="csatRating() >= star"
                  [attr.aria-label]="star + ' out of 5 stars'"
                  (click)="csatRating.set(star)"
                >
                  ★
                </button>
              }
              @if (csatRating() > 0) {
                <span class="meta">{{ csatLabel() }}</span>
              }
            </div>
            <input
              type="text"
              class="csat-input"
              placeholder="Optional feedback about your support experience…"
              [ngModel]="csatComment()"
              (ngModelChange)="csatComment.set($event)"
            />
            <div class="csat-actions">
              <button
                type="button"
                data-testid="submit-csat"
                (click)="submitCsat()"
                [disabled]="csatRating() < 1 || ratingSaving()"
              >
                {{ ratingSaving() ? 'Saving…' : (ticket()!.csat ? 'Update rating' : 'Submit rating') }}
              </button>
              @if (ratingNotice()) {
                <span class="csat-notice" role="status">{{ ratingNotice() }}</span>
              }
            </div>
            @if (ratingError()) {
              <p class="form-error" role="alert">{{ ratingError() }}</p>
            }
          </section>
        }

        <section class="attachments-box">
          <h3>Attachments ({{ ticket()!.attachments?.length ?? 0 }})</h3>
          @if ((ticket()!.attachments?.length ?? 0) > 0) {
            <ul class="attachment-list">
              @for (att of ticket()!.attachments!; track att.id) {
                <li>
                  <a [href]="att.download_url" target="_blank" rel="noopener noreferrer">{{ att.original_filename }}</a>
                  <span class="meta">({{ formatBytes(att.byte_size) }} · {{ att.mime_type }})</span>
                </li>
              }
            </ul>
          } @else {
            <p class="meta">No files attached yet.</p>
          }
          <div class="upload-row">
            <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv" (change)="onFileSelected($event)" />
            <button type="button" (click)="uploadSelectedFile()" [disabled]="!selectedFile() || uploadingFile()">
              {{ uploadingFile() ? 'Uploading…' : 'Attach file' }}
            </button>
          </div>
          @if (uploadError()) {
            <p class="form-error" role="alert">{{ uploadError() }}</p>
          }
        </section>

        <ul class="thread">
          @for (message of ticket()!.messages; track message.id) {
            <li>
              <p class="body">{{ message.body }}</p>
              <p class="meta">{{ message.created_at }}</p>
            </li>
          }
        </ul>

        <form [formGroup]="form" (ngSubmit)="submitMessage()" novalidate>
          <label>
            Reply
            <textarea formControlName="body" rows="3"></textarea>
          </label>
          @if (messageError()) {
            <p class="form-error" role="alert">{{ messageError() }}</p>
          }
          <button type="submit" [disabled]="form.invalid || sendingMessage()">
            {{ sendingMessage() ? 'Sending…' : 'Send reply' }}
          </button>
        </form>
      }
    </section>
  `,
  styles: [
    `
      .support-detail {
        font-family: var(--font-sans);
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .back-row {
        display: flex;
        justify-content: flex-end;
        margin: 0;
      }
      .support-detail h1 {
        margin: 0;
        font-size: var(--text-xl, 1.35rem);
        font-weight: var(--font-bold);
      }
      .meta {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        margin: 0;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.16rem 0.6rem;
        border-radius: var(--radius-pill);
        font-size: 0.72rem;
        font-weight: var(--font-semibold);
        background: var(--color-info-bg);
        color: var(--color-info);
        margin-right: 0.5rem;
      }
      .status-resolved,
      .status-closed {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
      .status-waiting_customer {
        background: var(--color-warning-bg);
        color: var(--color-warning);
      }
      .status-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .status-actions button {
        padding: 0.35rem 0.75rem;
        cursor: pointer;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface-alt);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
      }
      .status-actions button:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        margin: 0;
      }
      .thread {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .attachments-box {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
      }
      .attachments-box h3 {
        margin: 0 0 var(--space-2);
        font-size: var(--text-sm);
      }
      .attachment-list {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--space-2);
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .upload-row {
        display: flex;
        gap: var(--space-2);
        align-items: center;
        flex-wrap: wrap;
        margin-top: var(--space-2);
      }
      .thread li {
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .thread .body {
        margin: 0 0 var(--space-1);
        white-space: pre-wrap;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
      }
      textarea {
        padding: var(--space-2);
        font: inherit;
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      button[type='submit'] {
        padding: 0.5rem 1rem;
        cursor: pointer;
        align-self: flex-start;
        background: var(--color-primary);
        color: #fff;
        border: none;
        border-radius: var(--radius-sm);
        font-weight: var(--font-semibold);
      }
      .csat-box {
        border: 1px solid #d1fae5;
        background: #f0fdf4;
        border-radius: 8px;
        padding: 0.85rem 1rem;
        margin: 0.75rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .csat-box h3 {
        margin: 0;
        font-size: 0.92rem;
        color: #14532d;
      }
      .csat-saved {
        margin: 0;
        font-size: 0.85rem;
        color: #166534;
      }
      .csat-stars {
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .star-btn {
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0.25rem 0.5rem;
        font-size: 1.15rem;
        line-height: 1;
        color: #cbd5e1;
      }
      .star-btn.star-active {
        color: #f59e0b;
        border-color: #f59e0b;
        background: #fffbeb;
      }
      .csat-input {
        padding: 0.45rem 0.6rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font: inherit;
        font-size: 0.875rem;
      }
      .csat-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .csat-notice {
        font-size: 0.85rem;
        color: #15803d;
        font-weight: 600;
      }
    `,
  ],
})
export class SupportDetailComponent implements OnInit {
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  readonly ticket = signal<SupportTicketDetail | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly statusChanging = signal(false);
  readonly statusError = signal<string | null>(null);

  readonly sendingMessage = signal(false);
  readonly messageError = signal<string | null>(null);

  readonly selectedFile = signal<File | null>(null);
  readonly uploadingFile = signal(false);
  readonly uploadError = signal<string | null>(null);

  readonly csatRating = signal(0);
  readonly csatComment = signal('');
  readonly ratingSaving = signal(false);
  readonly ratingError = signal<string | null>(null);
  readonly ratingNotice = signal<string | null>(null);

  readonly canRate = computed(() => {
    const status = this.ticket()?.status;
    return status === 'resolved' || status === 'closed';
  });

  readonly csatLabel = computed(() => {
    const labels: Record<number, string> = {
      1: '1 / 5 — Poor',
      2: '2 / 5 — Fair',
      3: '3 / 5 — Good',
      4: '4 / 5 — Very good',
      5: '5 / 5 — Excellent',
    };
    return labels[this.csatRating()] ?? '';
  });

  readonly canChangeStatus = computed(() => {
    const t = this.ticket();
    const role = this.currentTenant.tenant()?.caller_role;
    const userId = this.auth.currentUser()?.id;
    if (!t) {
      return false;
    }
    return role === 'owner' || role === 'admin' || t.requester_id === userId;
  });

  readonly availableTransitions = computed(() => {
    const t = this.ticket();
    if (!t) {
      return [];
    }
    return SUPPORT_ALL_STATUSES.filter((target) => canTransitionSupportStatus(t.status, target));
  });

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    body: ['', [Validators.required]],
  });

  private ticketId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly currentTenant: CurrentTenantService,
    private readonly auth: AuthService,
    private readonly support: SupportService,
  ) {}

  ngOnInit(): void {
    this.ticketId = this.route.snapshot.paramMap.get('ticketId') ?? '';
    this.load();
  }

  load(): void {
    const tenantId = this.tenantId();
    if (!tenantId || !this.ticketId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.support.get(tenantId, this.ticketId).subscribe({
      next: (ticket) => {
        this.loading.set(false);
        this.ticket.set(ticket);
        if (ticket.csat) {
          this.csatRating.set(ticket.csat.rating);
          this.csatComment.set(ticket.csat.comment ?? '');
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  changeStatus(target: SupportStatus): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.statusChanging()) {
      return;
    }
    this.statusChanging.set(true);
    this.statusError.set(null);
    this.support.changeStatus(tenantId, this.ticketId, { status: target }).subscribe({
      next: (ticket) => {
        this.statusChanging.set(false);
        this.ticket.set(ticket);
      },
      error: (err: unknown) => {
        this.statusChanging.set(false);
        this.statusError.set(apiErrorMessage(err));
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
    this.uploadError.set(null);
  }

  uploadSelectedFile(): void {
    const tenantId = this.tenantId();
    const file = this.selectedFile();
    if (!tenantId || !this.ticketId || !file || this.uploadingFile()) {
      return;
    }
    this.uploadingFile.set(true);
    this.uploadError.set(null);
    this.support.uploadAttachment(tenantId, this.ticketId, file).subscribe({
      next: (att) => {
        this.uploadingFile.set(false);
        this.selectedFile.set(null);
        this.ticket.update((t) => (t ? { ...t, attachments: [...(t.attachments ?? []), att] } : t));
      },
      error: (err: unknown) => {
        this.uploadingFile.set(false);
        this.uploadError.set(apiErrorMessage(err));
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  submitCsat(): void {
    const tenantId = this.tenantId();
    const rating = this.csatRating();
    if (!tenantId || !this.ticketId || rating < 1 || rating > 5 || this.ratingSaving()) {
      return;
    }
    this.ratingSaving.set(true);
    this.ratingError.set(null);
    this.ratingNotice.set(null);
    const comment = this.csatComment().trim();
    this.support.rateTicket(tenantId, this.ticketId, { rating, comment: comment || undefined }).subscribe({
      next: (ticket) => {
        this.ratingSaving.set(false);
        this.ticket.set(ticket);
        this.ratingNotice.set('Thanks for your feedback!');
      },
      error: (err: unknown) => {
        this.ratingSaving.set(false);
        this.ratingError.set(apiErrorMessage(err));
      },
    });
  }

  submitMessage(): void {
    const tenantId = this.tenantId();
    if (this.form.invalid || this.sendingMessage() || !tenantId) {
      return;
    }
    this.sendingMessage.set(true);
    this.messageError.set(null);
    const { body } = this.form.getRawValue();
    this.support.addMessage(tenantId, this.ticketId, { body }).subscribe({
      next: (ticket) => {
        this.sendingMessage.set(false);
        this.ticket.set(ticket);
        this.form.reset({ body: '' });
      },
      error: (err: unknown) => {
        this.sendingMessage.set(false);
        this.messageError.set(apiErrorMessage(err));
      },
    });
  }
}
