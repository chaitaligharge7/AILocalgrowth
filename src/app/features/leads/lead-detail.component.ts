import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { localNowDateTimeString } from '../../core/utils/date.util';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorMessage } from '../../core/http/error.util';
import { LeadService } from '../../core/leads/lead.service';
import { MemberService } from '../../core/members/member.service';
import { TenantMember } from '../../core/members/member.models';
import {
  LEAD_ALL_STATUSES,
  LEAD_CREATABLE_ACTIVITY_TYPES,
  LeadCustomFieldDef,
  LeadCustomFieldType,
  LeadDetail,
  LeadStatus,
  canTransitionLeadStatus,
} from '../../core/leads/lead.models';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

type CreatableActivityType = 'note' | 'task' | 'reminder';

/**
 * `/app/:tenantId/leads/:leadId` — activity timeline + status transitions +
 * owner reassignment (blueprint §02 M14 "owner, notes, tasks, reminders and
 * history").
 */
@Component({
  selector: 'app-lead-detail',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent, IconComponent, PaginationComponent, SkeletonLoaderComponent],
  template: `
    <section class="lead-detail">
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (lead()) {
        <app-page-header
          eyebrow="CRM"
          eyebrowLabel="Lead Detail"
          [title]="lead()!.name || '(no name)'"
          subtitle="Manage pipeline stage, ownership, custom attributes, and follow-up timeline."
        />

        <!-- Top Overview Card: Badges, Contact Info, Stage & Owner Controls, Tags -->
        <div class="card overview-card">
          <div class="summary-bar">
            <div class="summary-badges">
              <span class="badge badge--dot" [class]="leadStatusBadgeClass(lead()!.status)">{{ lead()!.status }}</span>
              <span class="badge badge--dot" [class]="consentBadgeClass(lead()!.consent_status)">consent: {{ lead()!.consent_status }}</span>
              <span class="info-chip">
                <ui-icon name="leads" [size]="13" />
                <span>{{ lead()!.source }}</span>
              </span>
              <span class="info-chip">
                <ui-icon name="support" [size]="13" />
                <span>{{ lead()!.phone || lead()!.email || 'No contact info' }}</span>
              </span>
              @if (ownerName(); as owner) {
                <span class="info-chip">
                  <ui-icon name="users" [size]="13" />
                  <span>Owner: <strong>{{ owner }}</strong></span>
                </span>
              }
            </div>
          </div>

          @if (canManage()) {
            <div class="stage-owner-grid">
              <div class="control-box">
                <span class="section-kicker">Pipeline stage</span>
                <div class="status-actions">
                  @for (target of availableTransitions(); track target) {
                    <button
                      type="button"
                      class="btn-secondary btn-sm stage-btn"
                      (click)="changeStatus(target)"
                      [disabled]="statusChanging()"
                    >
                      <ui-icon name="chevronRight" [size]="13" />
                      <span>Move to {{ target }}</span>
                    </button>
                  }
                  @if (availableTransitions().length === 0) {
                    <span class="meta">No transitions available (<strong>{{ lead()!.status }}</strong> is terminal).</span>
                  }
                </div>
              </div>

              <div class="control-box">
                <span class="section-kicker">Assigned owner</span>
                <div class="owner-row">
                  <select aria-label="Owner" [value]="ownerInput()" (change)="ownerInput.set($any($event.target).value)">
                    <option value="">Unassigned</option>
                    @for (member of members(); track member.user_id) {
                      @if (member.status === 'active') {
                        <option [value]="member.user_id" [selected]="member.user_id === ownerInput()">
                          {{ member.name }} ({{ member.role }})
                        </option>
                      }
                    }
                  </select>
                  <button type="button" class="btn-primary btn-sm" (click)="assignOwner()" [disabled]="ownerSaving()">
                    <ui-icon name="users" [size]="14" />
                    <span>{{ ownerSaving() ? 'Saving…' : 'Assign owner' }}</span>
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <p class="owner-only-note">
              Only an owner, admin or editor may change status or reassign owner (enforced server-side regardless of this message).
            </p>
          }

          @if (statusError()) {
            <p class="form-error" role="alert">{{ statusError() }}</p>
          }

          <div class="tags-block" data-testid="lead-tags">
            <div class="tags-list">
              <span class="section-kicker">Tags</span>
              @for (tag of lead()!.tags ?? []; track tag) {
                <span class="tag-chip">
                  <span>#{{ tag }}</span>
                  <button
                    type="button"
                    class="tag-remove"
                    [attr.aria-label]="'Remove tag ' + tag"
                    title="Remove tag"
                    (click)="removeTag(tag)"
                  >
                    ×
                  </button>
                </span>
              }
              @if ((lead()!.tags ?? []).length === 0) {
                <span class="meta">No tags yet.</span>
              }
            </div>
            <form class="tag-add" (submit)="addTag($event)">
              <input
                type="text"
                maxlength="60"
                placeholder="Add a tag…"
                aria-label="New tag"
                [value]="tagInput()"
                (input)="tagInput.set($any($event.target).value)"
              />
              <button type="submit" class="btn-primary btn-sm" [disabled]="tagSaving() || !tagInput().trim()">
                <ui-icon name="plus" [size]="14" />
                <span>Add</span>
              </button>
            </form>
          </div>
          @if (tagError()) {
            <p class="form-error" role="alert">{{ tagError() }}</p>
          }
        </div>

        <!-- Main Two-Column Content Grid -->
        <div class="detail-grid">
          <!-- Left Column: Custom Fields -->
          <div class="card custom-fields" data-testid="lead-custom-fields">
            <div class="card-head">
              <div>
                <h2>Custom fields</h2>
                <p class="meta">Store structured attributes tailored to your business.</p>
              </div>
            </div>

            @if (canManage()) {
              <form class="cf-define" (submit)="defineField($event)" data-testid="define-field">
                <div class="cf-define-title">
                  <ui-icon name="plus" [size]="14" />
                  <strong>Add a custom field</strong>
                </div>
                <div class="cf-define-fields">
                  <label class="field-group">
                    <span>Field label</span>
                    <input
                      type="text"
                      placeholder="e.g. Preferred stylist"
                      aria-label="Field label"
                      [value]="newFieldLabel()"
                      (input)="newFieldLabel.set($any($event.target).value)"
                    />
                  </label>
                  <label class="field-group field-group--type">
                    <span>Field type</span>
                    <select aria-label="Field type" [value]="newFieldType()" (change)="newFieldType.set($any($event.target).value)">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="select">Choice list</option>
                    </select>
                  </label>
                  @if (newFieldType() === 'select') {
                    <label class="field-group field-group--wide">
                      <span>Choices (comma separated)</span>
                      <input
                        type="text"
                        placeholder="e.g. Morning, Afternoon, Evening"
                        aria-label="Field options"
                        [value]="newFieldOptions()"
                        (input)="newFieldOptions.set($any($event.target).value)"
                      />
                    </label>
                  }
                </div>
                <div class="cf-define-actions">
                  <button type="submit" class="btn-primary btn-sm" [disabled]="defineSaving() || !newFieldLabel().trim()">
                    <ui-icon name="plus" [size]="14" />
                    <span>{{ defineSaving() ? 'Adding…' : 'Add field' }}</span>
                  </button>
                </div>
              </form>
              @if (defineError()) {
                <p class="form-error" role="alert">{{ defineError() }}</p>
              }
            }

            <div class="cf-list">
              @if (fieldDefs().length === 0) {
                <p class="empty-box">
                  No custom fields defined yet.
                  @if (!canManage()) {
                    An owner, admin or editor can add them.
                  }
                </p>
              }
              @for (def of fieldDefs(); track def.id) {
                <div class="cf-row">
                  <span class="cf-label">{{ def.label }}</span>
                  <div class="cf-input-wrap">
                    @switch (def.field_type) {
                      @case ('select') {
                        <select [value]="fieldValue(def.field_key)" (change)="setDraft(def.field_key, $any($event.target).value)">
                          <option value="">—</option>
                          @for (option of def.options ?? []; track option) {
                            <option [value]="option" [selected]="fieldValue(def.field_key) === option">{{ option }}</option>
                          }
                        </select>
                      }
                      @case ('number') {
                        <input type="number" step="any" [value]="fieldValue(def.field_key)" (input)="setDraft(def.field_key, $any($event.target).value)" />
                      }
                      @case ('date') {
                        <input type="date" [value]="fieldValue(def.field_key)" (input)="setDraft(def.field_key, $any($event.target).value)" />
                      }
                      @default {
                        <input type="text" maxlength="500" [value]="fieldValue(def.field_key)" (input)="setDraft(def.field_key, $any($event.target).value)" />
                      }
                    }
                    @if (canManage()) {
                      <button
                        type="button"
                        class="btn-danger action-icon-btn"
                        [attr.aria-label]="'Delete field ' + def.label"
                        title="Delete field"
                        (click)="deleteField(def)"
                      >
                        <ui-icon name="trash" [size]="14" />
                        <span class="sr-only">Delete</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>

            @if (fieldDefs().length > 0) {
              <div class="cf-save-bar">
                <button type="button" class="btn-primary btn-sm" (click)="saveFields()" [disabled]="fieldsSaving() || !fieldsDirty()">
                  <ui-icon name="approvals" [size]="14" />
                  <span>{{ fieldsSaving() ? 'Saving…' : 'Save fields' }}</span>
                </button>
                @if (fieldsMessage()) {
                  <span class="save-msg" role="status">{{ fieldsMessage() }}</span>
                }
              </div>
            }
            @if (fieldsError()) {
              <p class="form-error" role="alert">{{ fieldsError() }}</p>
            }
          </div>

          <!-- Right Column: Add Activity + Activity Timeline -->
          <div class="activity-column">
            <div class="card activity-form-card">
              <div class="card-head">
                <div>
                  <h2>Add activity</h2>
                  <p class="meta">Log a note, follow-up task, or scheduled reminder.</p>
                </div>
              </div>

              <form class="activity-form" [formGroup]="form" (ngSubmit)="submitActivity()" novalidate>
                <div class="activity-form-row">
                  <label class="field-group">
                    <span>Type</span>
                    <select formControlName="type">
                      @for (type of activityTypes; track type) {
                        <option [value]="type">{{ type }}</option>
                      }
                    </select>
                  </label>

                  @if (dueAtRequired()) {
                    <label class="field-group">
                      <span>Due at <em class="required">(required)</em></span>
                      <input type="datetime-local" formControlName="dueAt" [min]="minDateTime" />
                    </label>
                  }
                </div>

                <label class="field-group">
                  <span>Note</span>
                  <textarea formControlName="note" rows="3" placeholder="Write follow-up details or notes…"></textarea>
                </label>

                @if (activityError()) {
                  <p class="form-error" role="alert">{{ activityError() }}</p>
                }

                <div class="activity-form-actions">
                  <button type="submit" class="btn-primary btn-sm" [disabled]="form.invalid || addingActivity()">
                    <ui-icon name="plus" [size]="14" />
                    <span>{{ addingActivity() ? 'Saving…' : 'Add activity' }}</span>
                  </button>
                </div>
              </form>
            </div>

            <div class="card timeline-card">
              <div class="card-head">
                <h2>Activity timeline</h2>
                <span class="badge badge--neutral">{{ lead()!.activities.length }} entries</span>
              </div>

              <ul class="timeline">
                @for (activity of pagedActivities(); track activity.id) {
                  <li class="timeline-item">
                    <div class="timeline-item-head">
                      <span class="badge badge--info type-{{ activity.type }}">{{ activity.type }}</span>
                      <span class="timeline-date">{{ activity.created_at | date: 'medium' }}</span>
                    </div>
                    <p class="body">{{ activity.note }}</p>
                    @if (activity.due_at) {
                      <p class="due-chip">
                        <ui-icon name="calendar" [size]="12" />
                        <span>Due {{ activity.due_at | date: 'medium' }}</span>
                      </p>
                    }
                  </li>
                } @empty {
                  <li class="empty-box">No activity recorded yet.</li>
                }
              </ul>

              <app-pagination
                [totalItems]="lead()!.activities.length"
                [currentPage]="activityPage()"
                [pageSize]="activityPageSize()"
                (pageChange)="activityPage.set($event)"
                (pageSizeChange)="activityPageSize.set($event)"
              />
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .lead-detail {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .meta {
        color: var(--color-text-muted);
        font-size: var(--text-xs, 0.78rem);
        margin: 0;
      }
      .section-kicker {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }

      /* Overview Card */
      .overview-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }
      .summary-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
        padding-bottom: var(--space-3, 12px);
        border-bottom: 1px solid var(--color-border);
      }
      .summary-badges {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
      }
      .info-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        font-size: var(--text-xs, 0.78rem);
        color: var(--color-text);
      }

      /* Stage & Owner Row */
      .stage-owner-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4, 16px);
        align-items: start;
        padding-bottom: var(--space-3, 12px);
        border-bottom: 1px solid var(--color-border);
      }
      @media (max-width: 820px) {
        .stage-owner-grid {
          grid-template-columns: 1fr;
        }
      }
      .control-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .status-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        min-height: 36px;
      }
      .stage-btn {
        text-transform: capitalize;
        height: 36px;
      }
      .owner-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .owner-row select {
        flex: 1;
        min-width: 180px;
        height: 36px;
        padding: 0 0.65rem;
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        background: var(--color-surface, #fff);
        font: inherit;
        font-size: var(--text-sm);
      }
      .owner-row button {
        height: 36px;
        white-space: nowrap;
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        margin: 0;
      }

      /* Tags Row */
      .tags-block {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-3, 12px);
      }
      .tags-list {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        border-radius: 999px;
        padding: 3px 10px;
        background: var(--color-primary-light, #e6f6f4);
        color: var(--color-primary, #078d7e);
      }
      .tag-remove {
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 0 2px;
        font-size: 14px;
        line-height: 1;
      }
      .tag-remove:hover {
        color: var(--color-danger);
      }
      .tag-add {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .tag-add input {
        height: 34px;
        width: 170px;
        padding: 0 0.65rem;
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        font-size: var(--text-xs);
      }
      .tag-add button {
        height: 34px;
      }

      /* Detail Two-Column Grid */
      .detail-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        gap: var(--space-4, 16px);
        align-items: start;
      }
      @media (max-width: 920px) {
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }
      .activity-column {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
        min-width: 0;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: var(--space-3, 12px);
      }
      .card-head h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }

      /* Custom Fields */
      .cf-define {
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        padding: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .cf-define-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--text-xs);
        color: var(--color-text);
      }
      .cf-define-fields {
        display: grid;
        grid-template-columns: 1fr 140px;
        gap: 10px;
      }
      @media (max-width: 520px) {
        .cf-define-fields {
          grid-template-columns: 1fr;
        }
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text);
      }
      .field-group--wide {
        grid-column: 1 / -1;
      }
      .field-group input,
      .field-group select,
      .field-group textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 0.45rem 0.65rem;
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        background: var(--color-surface, #fff);
        font: inherit;
        font-weight: 400;
        font-size: var(--text-sm);
      }
      .field-group input,
      .field-group select {
        height: 36px;
      }
      .cf-define-actions {
        display: flex;
        justify-content: flex-end;
      }
      .cf-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .cf-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .cf-label {
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text);
      }
      .cf-input-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cf-input-wrap input,
      .cf-input-wrap select {
        flex: 1;
        min-width: 0;
        height: 36px;
        padding: 0 0.65rem;
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        font: inherit;
        font-size: var(--text-sm);
      }
      .cf-save-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: var(--space-3, 12px);
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border);
      }
      .save-msg {
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-success);
      }

      /* Activity Form & Timeline */
      .activity-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .activity-form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
      }
      .activity-form-actions {
        display: flex;
        justify-content: flex-end;
      }
      .required {
        font-style: normal;
        font-weight: 500;
        color: var(--color-warning);
      }
      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .timeline-item {
        padding: 10px 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface-alt, #f8fafc);
      }
      .timeline-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .timeline-date {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .timeline-item .body {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--color-text);
        line-height: 1.45;
      }
      .due-chip {
        margin: 6px 0 0;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-xs);
        color: var(--color-warning);
        font-weight: 600;
      }
      .empty-box {
        padding: 14px;
        text-align: center;
        border: 1px dashed var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        margin: 0;
      }
      .form-error {
        color: var(--color-danger, #b00020);
        margin: 4px 0 0;
        font-size: var(--text-xs);
      }
    `,
  ],
})
export class LeadDetailComponent implements OnInit {
  readonly minDateTime = localNowDateTimeString();
  readonly activityPage = signal(1);
  readonly activityPageSize = signal(10);
  readonly pagedActivities = computed(() =>
    paginateItems(this.lead()?.activities ?? [], this.activityPage(), this.activityPageSize()),
  );
  /** Maps a lead status to the shared `.badge--*` semantic modifier (styles.scss design tokens) — mirrors LeadsComponent. */
  leadStatusBadgeClass(status: string): string {
    switch (status) {
      case 'won':
        return 'badge--success';
      case 'lost':
      case 'archived':
        return 'badge--neutral';
      case 'new':
        return 'badge--info';
      default:
        return 'badge--warning';
    }
  }

  /** Maps a lead consent status to the shared `.badge--*` semantic modifier — mirrors LeadsComponent. */
  consentBadgeClass(status: string): string {
    switch (status) {
      case 'granted':
        return 'badge--success';
      case 'declined':
        return 'badge--danger';
      default:
        return 'badge--warning';
    }
  }

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly activityTypes = LEAD_CREATABLE_ACTIVITY_TYPES;

  readonly lead = signal<LeadDetail | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly canManage = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly statusChanging = signal(false);
  readonly statusError = signal<string | null>(null);

  readonly ownerInput = signal('');
  readonly ownerSaving = signal(false);

  readonly members = signal<TenantMember[]>([]);
  readonly ownerName = computed(() => {
    const ownerId = this.lead()?.owner_id;
    return ownerId ? (this.members().find((m) => m.user_id === ownerId)?.name ?? null) : null;
  });

  readonly tagInput = signal('');
  readonly tagSaving = signal(false);
  readonly tagError = signal<string | null>(null);

  // --- custom fields (BW-099 leftover) ------------------------------------
  readonly fieldDefs = signal<LeadCustomFieldDef[]>([]);
  /** Unsaved edits keyed by `field_key`; merged over the saved values on display. */
  readonly fieldDraft = signal<Record<string, string>>({});
  readonly fieldsSaving = signal(false);
  readonly fieldsMessage = signal<string | null>(null);
  readonly fieldsError = signal<string | null>(null);
  readonly fieldsDirty = computed(() => Object.keys(this.fieldDraft()).length > 0);

  readonly newFieldLabel = signal('');
  readonly newFieldType = signal<LeadCustomFieldType>('text');
  readonly newFieldOptions = signal('');
  readonly defineSaving = signal(false);
  readonly defineError = signal<string | null>(null);

  fieldValue(key: string): string {
    const draft = this.fieldDraft();
    if (key in draft) {
      return draft[key];
    }
    return this.lead()?.custom_fields?.[key] ?? '';
  }

  setDraft(key: string, value: string): void {
    const saved = this.lead()?.custom_fields?.[key] ?? '';
    const next = { ...this.fieldDraft() };
    if (value === saved) {
      delete next[key];
    } else {
      next[key] = value;
    }
    this.fieldDraft.set(next);
    this.fieldsMessage.set(null);
  }

  saveFields(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.fieldsSaving() || !this.fieldsDirty()) {
      return;
    }
    this.fieldsSaving.set(true);
    this.fieldsError.set(null);
    this.fieldsMessage.set(null);
    this.leadService.setFieldValues(tenantId, this.leadId, this.fieldDraft()).subscribe({
      next: (lead) => {
        this.fieldsSaving.set(false);
        this.fieldDraft.set({});
        this.lead.set(lead);
        this.fieldsMessage.set('Saved.');
      },
      error: (err: unknown) => {
        this.fieldsSaving.set(false);
        this.fieldsError.set(apiErrorMessage(err));
      },
    });
  }

  defineField(event: Event): void {
    event.preventDefault();
    const tenantId = this.tenantId();
    const label = this.newFieldLabel().trim();
    if (!tenantId || !label || this.defineSaving()) {
      return;
    }
    const type = this.newFieldType();
    const options = this.newFieldOptions()
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o !== '');
    this.defineSaving.set(true);
    this.defineError.set(null);
    this.leadService
      .createField(tenantId, { label, field_type: type, ...(type === 'select' ? { options } : {}) })
      .subscribe({
        next: (def) => {
          this.defineSaving.set(false);
          this.fieldDefs.set([...this.fieldDefs(), def]);
          this.newFieldLabel.set('');
          this.newFieldOptions.set('');
        },
        error: (err: unknown) => {
          this.defineSaving.set(false);
          this.defineError.set(apiErrorMessage(err));
        },
      });
  }

  deleteField(def: LeadCustomFieldDef): void {
    const tenantId = this.tenantId();
    if (!tenantId || !confirmDelete(def.label || 'this custom field')) {
      return;
    }
    this.defineError.set(null);
    this.leadService.deleteField(tenantId, def.id).subscribe({
      next: () => {
        this.fieldDefs.set(this.fieldDefs().filter((d) => d.id !== def.id));
        const draft = { ...this.fieldDraft() };
        delete draft[def.field_key];
        this.fieldDraft.set(draft);
        this.load();
      },
      error: (err: unknown) => this.defineError.set(apiErrorMessage(err)),
    });
  }

  readonly availableTransitions = computed(() => {
    const l = this.lead();
    if (!l) {
      return [];
    }
    return LEAD_ALL_STATUSES.filter((target) => canTransitionLeadStatus(l.status, target));
  });

  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    type: ['note' as CreatableActivityType, [Validators.required]],
    note: ['', [Validators.required]],
    dueAt: [''],
  });

  readonly addingActivity = signal(false);
  readonly activityError = signal<string | null>(null);

  readonly dueAtRequired = computed(() => {
    const type = this.form.controls.type.value;
    return type === 'task' || type === 'reminder';
  });

  private leadId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly currentTenant: CurrentTenantService,
    private readonly leadService: LeadService,
    private readonly memberService: MemberService,
  ) {}

  ngOnInit(): void {
    this.leadId = this.route.snapshot.paramMap.get('leadId') ?? '';
    this.load();
    const tenantId = this.tenantId();
    if (tenantId) {
      this.memberService.list(tenantId).subscribe({
        next: (members) => this.members.set(members),
        error: () => this.members.set([]),
      });
      this.leadService.listFields(tenantId).subscribe({
        next: (defs) => this.fieldDefs.set(defs),
        // Custom fields degrade to "none defined"; never blocks the lead.
        error: () => this.fieldDefs.set([]),
      });
    }
  }

  addTag(event: Event): void {
    event.preventDefault();
    const tenantId = this.tenantId();
    const tag = this.tagInput().trim();
    if (!tenantId || !tag || this.tagSaving()) {
      return;
    }
    this.tagSaving.set(true);
    this.tagError.set(null);
    this.leadService.addTag(tenantId, this.leadId, tag).subscribe({
      next: (lead) => {
        this.tagSaving.set(false);
        this.tagInput.set('');
        this.lead.set(lead);
      },
      error: (err: unknown) => {
        this.tagSaving.set(false);
        this.tagError.set(apiErrorMessage(err));
      },
    });
  }

  removeTag(tag: string): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.tagSaving()) {
      return;
    }
    this.tagSaving.set(true);
    this.tagError.set(null);
    this.leadService.removeTag(tenantId, this.leadId, tag).subscribe({
      next: (lead) => {
        this.tagSaving.set(false);
        this.lead.set(lead);
      },
      error: (err: unknown) => {
        this.tagSaving.set(false);
        this.tagError.set(apiErrorMessage(err));
      },
    });
  }

  load(): void {
    const tenantId = this.tenantId();
    if (!tenantId || !this.leadId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.leadService.get(tenantId, this.leadId).subscribe({
      next: (lead) => {
        this.loading.set(false);
        this.lead.set(lead);
        this.ownerInput.set(lead.owner_id ?? '');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  changeStatus(target: LeadStatus): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.statusChanging()) {
      return;
    }
    this.statusChanging.set(true);
    this.statusError.set(null);
    this.leadService.update(tenantId, this.leadId, { status: target }).subscribe({
      next: (lead) => {
        this.statusChanging.set(false);
        this.lead.set(lead);
      },
      error: (err: unknown) => {
        this.statusChanging.set(false);
        this.statusError.set(apiErrorMessage(err));
      },
    });
  }

  assignOwner(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.ownerSaving()) {
      return;
    }
    this.ownerSaving.set(true);
    this.statusError.set(null);
    const ownerId = this.ownerInput().trim() || null;
    this.leadService.update(tenantId, this.leadId, { owner_id: ownerId }).subscribe({
      next: (lead) => {
        this.ownerSaving.set(false);
        this.lead.set(lead);
      },
      error: (err: unknown) => {
        this.ownerSaving.set(false);
        this.statusError.set(apiErrorMessage(err));
      },
    });
  }

  submitActivity(): void {
    const tenantId = this.tenantId();
    if (this.form.invalid || this.addingActivity() || !tenantId) {
      return;
    }
    const { type, note, dueAt } = this.form.getRawValue();
    if ((type === 'task' || type === 'reminder') && !dueAt) {
      this.activityError.set('due_at is required for task/reminder activities.');
      return;
    }
    this.addingActivity.set(true);
    this.activityError.set(null);
    this.leadService
      .addActivity(tenantId, this.leadId, {
        type,
        note,
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      })
      .subscribe({
        next: (lead) => {
          this.addingActivity.set(false);
          this.lead.set(lead);
          this.form.reset({ type: 'note', note: '', dueAt: '' });
        },
        error: (err: unknown) => {
          this.addingActivity.set(false);
          this.activityError.set(apiErrorMessage(err));
        },
      });
  }
}
