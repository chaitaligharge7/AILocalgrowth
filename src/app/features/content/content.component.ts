import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ContentItem } from '../../core/content/content.models';
import { ContentService } from '../../core/content/content.service';
import { API_BASE_URL } from '../../core/http/api-base-url.token';
import { ApiSuccess } from '../../core/http/api-envelope.model';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { ToastService } from '../../core/feedback/toast.service';
import { apiErrorCode, apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../shared/table/table-export.component';

interface RouterPrefillState {
  prefillTitle?: string;
  prefillObjective?: string;
  prefillBody?: string;
  prefillLanguage?: string;
  prefillAssetId?: string | null;
}

interface AssetOption {
  id: string;
  original_filename?: string | null;
  album?: string | null;
  download_url?: string | null;
}

interface LocationOption {
  id: string;
  name: string;
  city?: string | null;
}

type StatusFilter = '' | 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published';

@Component({
  selector: 'app-content',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DatePipe,
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    PaginationComponent,
    SortHeaderComponent,
    TableExportComponent,
  ],
  template: `
    <section class="content-page">
      <app-page-header
        eyebrow="CONTENT STUDIO"
        eyebrowLabel="Drafts &amp; approvals"
        title="Content"
        subtitle="Create drafts, review approvals, and hand off publish-ready posts to the calendar."
      />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        @if (!canCreate()) {
          <p class="owner-only-note">
            Only owner/admin/editor members may create or edit content (enforced server-side).
          </p>
        }

        <div class="workspace" [class.workspace--split]="selected() !== null || showCreatePanel()">
          <!-- Left: Content table card -->
          <section class="card list-card">
            <div class="card__head">
              <div class="card__head-title">
                <h2>All content</h2>
                <span class="muted-count">{{ filteredItems().length }} of {{ items().length }}</span>
              </div>
              <div class="status-pills" role="tablist" aria-label="Filter by status">
                @for (tab of statusTabs(); track tab.value) {
                  <button
                    type="button"
                    class="pill"
                    [class.pill--active]="statusFilter() === tab.value"
                    (click)="statusFilter.set(tab.value)"
                  >
                    <span>{{ tab.label }}</span>
                    <span class="pill__count">{{ tab.count }}</span>
                  </button>
                }
              </div>
            </div>

            <div class="list-toolbar">
              <input
                type="search"
                class="search-input"
                placeholder="Search title, objective, body…"
                [value]="searchQuery()"
                (input)="onSearchInput($event)"
                aria-label="Search content"
              />
              <ui-table-export
                [data]="filteredItems()"
                [columns]="contentExportColumns"
                filename="content_items"
                [loading]="loadingList()"
                (refresh)="reloadList()"
              />
              @if (canManagePolicy()) {
                <button type="button" class="btn btn--secondary" (click)="togglePolicyPanel()">
                  {{ showPolicyPanel() ? 'Close policy' : 'Approval policy' }}
                </button>
              }
              @if (canCreate()) {
                <a
                  class="btn btn--primary btn-new-draft"
                  [routerLink]="['/app', tenant()!.id, 'content', 'new']"
                  data-testid="new-draft-btn"
                >
                  + New draft
                </a>
              }
            </div>

            @if (showPolicyPanel() && canManagePolicy()) {
              <div class="policy-card policy-panel">
                <div class="card__head">
                  <h2>Content approval &amp; compliance policy</h2>
                  <button type="button" class="btn-icon-close" (click)="showPolicyPanel.set(false)" aria-label="Close">×</button>
                </div>
                @if (loadingPolicy()) {
                  <p class="placeholder">Loading policy…</p>
                } @else {
                  <div class="policy-row">
                    <label class="policy-check">
                      <input
                        type="checkbox"
                        [ngModel]="policyDisallowSelfApproval()"
                        (ngModelChange)="policyDisallowSelfApproval.set($event)"
                      />
                      <span>Creators cannot self-approve their own drafts</span>
                    </label>
                    <label class="policy-select">
                      <span>Regulated industry checks</span>
                      <select [ngModel]="policyRegulatedIndustry()" (ngModelChange)="policyRegulatedIndustry.set($event)">
                        <option value="">General (standard profanity &amp; brand safety)</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="finance">Finance</option>
                        <option value="alcohol">Alcohol</option>
                        <option value="legal">Legal</option>
                      </select>
                    </label>
                    <button type="button" class="btn btn--primary" (click)="savePolicy()" [disabled]="savingPolicy()">
                      {{ savingPolicy() ? 'Saving…' : 'Save policy' }}
                    </button>
                  </div>
                  @if (policyError()) {
                    <p class="form-error" role="alert">{{ policyError() }}</p>
                  }
                  @if (policyNotice()) {
                    <p class="success" role="status">{{ policyNotice() }}</p>
                  }
                }
              </div>
            }

            @if (selectedIds().length > 0) {
              <div class="bulk-bar" data-testid="content-bulk-bar">
                <span class="bulk-bar__count">{{ selectedIds().length }} selected</span>
                <div class="bulk-bar__actions">
                  @if (canCreate()) {
                    <button type="button" class="btn btn--sm btn--secondary" [disabled]="bulkBusy()" (click)="runBulkAction('submit')">
                      Submit
                    </button>
                  }
                  @if (canApprove()) {
                    <button type="button" class="btn btn--sm btn--success" [disabled]="bulkBusy()" (click)="runBulkAction('approve')">
                      Approve
                    </button>
                    <button type="button" class="btn btn--sm btn--secondary" [disabled]="bulkBusy()" (click)="runBulkAction('reject')">
                      Reject
                    </button>
                  }
                  @if (canCreate()) {
                    <button type="button" class="btn btn--sm btn--danger action-icon-btn" [disabled]="bulkBusy()" (click)="runBulkAction('delete')" title="Delete selected" aria-label="Delete">
                      <ui-icon name="trash" [size]="14" />
                      <span class="sr-only">Delete</span>
                    </button>
                  }
                  <button type="button" class="btn btn--sm btn--ghost" (click)="clearSelection()">Clear</button>
                </div>
              </div>
            }
            @if (bulkNotice()) {
              <p class="success" role="status">{{ bulkNotice() }}</p>
            }
            @if (bulkError()) {
              <p class="form-error" role="alert">{{ bulkError() }}</p>
            }

            @if (loadingList()) {
              <p class="placeholder">Loading content…</p>
            } @else if (items().length === 0) {
              <div class="empty-box">
                <p class="empty-box__title">No content yet</p>
                <p class="placeholder">Create your first draft to start your approval and publishing workflow.</p>
                @if (canCreate()) {
                  <a class="btn btn--primary" [routerLink]="['/app', tenant()!.id, 'content', 'new']">+ Create first draft</a>
                }
              </div>
            } @else if (filteredItems().length === 0) {
              <p class="placeholder">No content matches the current filter or search query.</p>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th class="col-check">
                        <input
                          type="checkbox"
                          aria-label="Select all visible content"
                          [checked]="allVisibleSelected()"
                          (change)="toggleSelectAll($any($event.target).checked)"
                        />
                      </th>
                      <th><ui-sort-header label="Content" [active]="sortCol() === 'title'" [direction]="sortDir()" (sort)="toggleSort('title')" /></th>
                      <th class="col-status"><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
                      <th class="col-lang"><ui-sort-header label="Lang" [active]="sortCol() === 'language'" [direction]="sortDir()" (sort)="toggleSort('language')" /></th>
                      <th class="col-date"><ui-sort-header label="Updated" [active]="sortCol() === 'updated_at'" [direction]="sortDir()" (sort)="toggleSort('updated_at')" /></th>
                      <th class="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of pagedItems(); track item.id) {
                      <tr [class.selected]="selected()?.id === item.id" (click)="select(item)">
                        <td class="col-check" (click)="$event.stopPropagation()">
                          <input
                            type="checkbox"
                            [attr.aria-label]="'Select ' + (item.title || item.objective)"
                            [checked]="isSelectedId(item.id)"
                            (change)="toggleRowSelection(item.id, $any($event.target).checked)"
                          />
                        </td>
                        <td class="cell-title">
                          <div class="item-title">{{ item.title || item.objective }}</div>
                          @if (item.title && item.objective) {
                            <div class="item-sub">{{ item.objective }}</div>
                          }
                        </td>
                        <td class="cell-status">
                          <span class="badge" [class]="statusBadgeClass(item.status)">
                            {{ formatStatus(item.status) }}
                          </span>
                        </td>
                        <td class="cell-lang"><span class="lang-tag">{{ item.language }}</span></td>
                        <td class="cell-date">{{ item.updated_at | date: 'short' }}</td>
                        <td class="cell-actions" (click)="$event.stopPropagation()">
                          <div class="cell-actions-wrap">
                            <a
                              class="action-icon-btn"
                              [routerLink]="['/app', tenant()!.id, 'content', item.id, 'edit']"
                              title="Edit content"
                              aria-label="Edit content"
                              data-testid="edit-content-btn"
                            >
                              <ui-icon name="edit" [size]="14" />
                            </a>
                            <button
                              type="button"
                              class="action-icon-btn action-icon-btn--danger"
                              (click)="deleteItem(item)"
                              [disabled]="deletingId() === item.id"
                              title="Delete content"
                              aria-label="Delete content"
                              data-testid="delete-content-btn"
                            >
                              <ui-icon name="trash" [size]="14" />
                            </button>
                            @if (item.status === 'approved') {
                              <button type="button" class="btn btn--sm btn--accent" (click)="scheduleItem(item)">Schedule</button>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination
                [totalItems]="filteredItems().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event)"
              />
            }

            @if (listError()) {
              <p class="form-error" role="alert">{{ listError() }}</p>
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .content-page {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .status-pills {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .pill:hover {
        border-color: var(--color-primary);
        color: var(--color-text);
      }
      .pill--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;
      }
      .pill__count {
        font-size: 11px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
      }
      .pill--active .pill__count {
        background: rgba(255, 255, 255, 0.22);
        color: #fff;
      }

      .list-toolbar {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
      }
      .btn-new-draft {
        margin-left: auto;
        text-decoration: none !important;
        white-space: nowrap;
      }

      .search-input {
        flex: 0 1 240px;
        width: 240px;
        min-width: 180px;
        max-width: 260px;
        padding: 7px 11px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font: inherit;
        font-size: var(--text-sm);
        background: var(--color-surface);
      }
      .search-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
      }

      .policy-panel {
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-3) var(--space-4);
        margin-bottom: var(--space-3);
      }

      .workspace {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-4);
        align-items: start;
      }
      .workspace--split {
        grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.95fr);
      }
      @media (max-width: 960px) {
        .workspace--split {
          grid-template-columns: 1fr;
        }
      }

      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4);
      }

      .side-panel {
        position: sticky;
        top: var(--space-4);
      }

      .card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
      }
      .card__head h2 {
        margin: 0;
        font-size: var(--text-md);
        font-weight: 700;
      }
      .card__head-title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .muted-count {
        font-size: 12px;
        color: var(--color-text-muted);
      }

      .action-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-muted);
        cursor: pointer;
        text-decoration: none;
        transition: all 0.14s ease;
      }
      .action-icon-btn:hover:not(:disabled) {
        background: var(--color-surface-alt);
        border-color: var(--color-border-strong);
        color: var(--color-text);
      }
      .action-icon-btn--danger:hover:not(:disabled) {
        background: var(--color-danger-bg);
        border-color: var(--color-danger-border);
        color: var(--color-danger);
      }
      .action-icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-icon-close {
        width: 28px;
        height: 28px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: transparent;
        color: var(--color-text-muted);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .btn-icon-close:hover {
        background: var(--color-neutral-bg);
        color: var(--color-text);
      }

      .bulk-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: 0.55rem 0.9rem;
        margin-bottom: var(--space-3);
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-xs);
        flex-wrap: wrap;
      }
      .bulk-bar__count {
        font-size: var(--text-xs);
        font-weight: 700;
        color: var(--color-primary);
      }
      .bulk-bar__actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        box-shadow: var(--shadow-xs);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      th {
        text-align: center;
        padding: 0.7rem 0.9rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        background: var(--color-surface-alt, #f8fafc);
        border-bottom: 1px solid var(--color-border);
        white-space: nowrap;
      }
      td {
        text-align: center;
        padding: 0.75rem 0.9rem;
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
        color: var(--color-text);
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      tbody tr {
        cursor: pointer;
        transition: background 0.12s ease;
      }
      tbody tr:hover {
        background: var(--color-surface-alt, #f8fafc);
      }
      tbody tr.selected {
        background: var(--color-primary-light, #e6f5f3);
      }
      .col-check {
        width: 44px;
        min-width: 44px;
        text-align: center !important;
      }
      .col-status {
        width: 135px;
        white-space: nowrap;
      }
      .col-lang {
        width: 70px;
        text-align: center !important;
        white-space: nowrap;
      }
      .cell-lang {
        text-align: center;
      }
      .col-date {
        width: 135px;
        white-space: nowrap;
      }
      .col-actions {
        width: 140px;
        text-align: center;
        white-space: nowrap;
      }
      .cell-title {
        min-width: 180px;
        max-width: 320px;
      }
      .item-title {
        font-weight: 600;
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item-sub {
        font-size: 12px;
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 2px;
      }
      .lang-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 4px;
        background: var(--color-neutral-bg);
        color: var(--color-text-muted);
        border: 1px solid var(--color-border);
      }
      .cell-date {
        font-size: 12px;
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .cell-actions {
        text-align: center;
        white-space: nowrap;
      }
      .cell-actions-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .empty-box {
        text-align: center;
        padding: var(--space-6) var(--space-4);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
      }
      .empty-box__title {
        margin: 0;
        font-weight: 700;
        font-size: var(--text-md);
      }

      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .field--narrow {
        flex: 0 0 110px;
      }
      .field-row {
        display: flex;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .field__label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted);
      }
      input,
      select,
      textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font: inherit;
        font-size: var(--text-sm);
        background: var(--color-surface);
        color: var(--color-text);
      }
      input[readonly],
      textarea[readonly] {
        background: var(--color-neutral-bg);
        color: var(--color-text-muted);
      }
      input:focus,
      select:focus,
      textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 14px;
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
        font-weight: 600;
        border: 1px solid transparent;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .btn--sm {
        padding: 4px 10px;
        font-size: 12px;
      }
      .btn--primary {
        background: var(--color-primary);
        color: #fff;
      }
      .btn--secondary {
        background: var(--color-neutral-bg);
        border-color: var(--color-border);
        color: var(--color-text);
      }
      .btn--ghost {
        background: transparent;
        border-color: var(--color-border);
        color: var(--color-text);
      }
      .btn--accent {
        background: #0ea5e9;
        color: #fff;
      }
      .btn--success {
        background: #16a34a;
        color: #fff;
      }
      .btn--danger {
        background: var(--color-danger-bg, #fef2f2);
        border-color: var(--color-danger-border, #fecaca);
        color: var(--color-danger, #dc2626);
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--color-primary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .actions {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
        padding-top: 2px;
      }

      .lock-banner {
        font-size: 12px;
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-sm);
        padding: 8px 10px;
        margin-bottom: var(--space-3);
      }
      .history-divider {
        margin-top: var(--space-4);
        padding-top: var(--space-3);
        border-top: 1px solid var(--color-border);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: 12px;
      }
      .success {
        color: var(--color-success);
        margin: 0;
        font-size: var(--text-sm);
        font-weight: 500;
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        background: var(--color-neutral-bg);
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        margin: 0;
      }
      .placeholder {
        color: var(--color-text-subtle);
        font-size: var(--text-sm);
        margin: 0;
      }
      .policy-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        flex-wrap: wrap;
      }
      .policy-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: var(--text-sm);
        color: var(--color-text);
      }
      .policy-check input {
        width: auto;
      }
      .policy-select {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .policy-select select {
        width: auto;
        min-width: 220px;
      }
    `,
  ],
})
export class ContentComponent {
reloadList(): void {
  this.refreshList();
}
  private readonly fb = new FormBuilder();
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'published':
        return 'badge--success';
      case 'failed':
      case 'rejected':
        return 'badge--danger';
      case 'pending_approval':
        return 'badge--warning';
      case 'approved':
      case 'scheduled':
        return 'badge--info';
      default:
        return 'badge--neutral';
    }
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ');
  }

  readonly contentExportColumns: TableExportColumn[] = [
    { key: 'title', label: 'Title' },
    { key: 'objective', label: 'Objective' },
    { key: 'status', label: 'Status' },
    { key: 'language', label: 'Language' },
    { key: 'updated_at', label: 'Updated' },
  ];

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly canCreate = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });
  readonly canApprove = computed(() => this.canCreate());
  readonly canManagePolicy = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly showPolicyPanel = signal(false);
  readonly loadingPolicy = signal(false);
  readonly savingPolicy = signal(false);
  readonly policyDisallowSelfApproval = signal(false);
  readonly policyRegulatedIndustry = signal('');
  readonly policyError = signal<string | null>(null);
  readonly policyNotice = signal<string | null>(null);

  readonly items = signal<ContentItem[]>([]);
  readonly loadingList = signal(true);
  readonly listError = signal<string | null>(null);

  readonly statusFilter = signal<StatusFilter>('');
  readonly searchQuery = signal('');

  readonly statusTabs = computed(() => {
    const all = this.items();
    const countOf = (st: string) => all.filter((i) => i.status === st).length;
    return [
      { value: '' as StatusFilter, label: 'All', count: all.length },
      { value: 'draft' as StatusFilter, label: 'Drafts', count: countOf('draft') },
      { value: 'pending_approval' as StatusFilter, label: 'Pending', count: countOf('pending_approval') },
      { value: 'approved' as StatusFilter, label: 'Approved', count: countOf('approved') },
      { value: 'scheduled' as StatusFilter, label: 'Scheduled', count: countOf('scheduled') },
      { value: 'published' as StatusFilter, label: 'Published', count: countOf('published') },
    ];
  });

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('');
  readonly sortDir = signal<SortDirection>('asc');

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredItems = computed(() => {
    const status = this.statusFilter();
    const q = this.searchQuery().trim().toLowerCase();
    return this.items().filter((item) => {
      if (status && item.status !== status) {
        return false;
      }
      if (!q) {
        return true;
      }
      const hay = `${item.title ?? ''} ${item.objective} ${item.body}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly selected = signal<ContentItem | null>(null);
  readonly isEditable = computed(() => this.selected()?.status === 'draft');

  readonly showCreatePanel = signal(false);
  readonly locations = signal<LocationOption[]>([]);
  readonly loadingLocations = signal(false);
  readonly assetOptions = signal<AssetOption[]>([]);
  readonly loadingAssets = signal(false);
  readonly createAssetId = signal('');
  readonly editAssetId = signal('');

  readonly selectedIds = signal<string[]>([]);
  readonly bulkBusy = signal(false);
  readonly bulkNotice = signal<string | null>(null);
  readonly bulkError = signal<string | null>(null);
  readonly sortedItems = computed(() =>
    sortTableRows(this.filteredItems(), this.sortCol(), this.sortDir(), (item, col) => {
      switch (col) {
        case 'title':
          return item.title || item.objective;
        case 'status':
          return item.status;
        case 'language':
          return item.language;
        case 'updated_at':
          return item.updated_at;
        default:
          return '';
      }
    }),
  );

  readonly pagedItems = computed(() => paginateItems(this.sortedItems(), this.page(), this.pageSize()));

  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredItems();
    const sel = new Set(this.selectedIds());
    return visible.length > 0 && visible.every((i) => sel.has(i.id));
  });

  readonly editForm = this.fb.nonNullable.group({
    title: [''],
    body: ['', [Validators.required]],
    language: ['en-IN', [Validators.required]],
  });
  readonly saving = signal(false);
  readonly submitting = signal(false);
  readonly approving = signal(false);
  readonly editError = signal<string | null>(null);
  readonly editFieldErrors = signal<Record<string, string> | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    locationId: ['', [Validators.required]],
    objective: ['', [Validators.required]],
    title: [''],
    body: ['', [Validators.required]],
    language: ['en-IN', [Validators.required]],
  });
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createFieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly contentService: ContentService,
    private readonly router: Router,
  ) {
    this.applyPrefillFromRouterState();
    this.refreshList();
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreatePanel(): void {
    const next = !this.showCreatePanel();
    this.showCreatePanel.set(next);
    if (next) {
      this.selected.set(null);
      if (this.locations().length === 0) {
        this.loadLocations();
      }
      if (this.assetOptions().length === 0) {
        this.loadAssets();
      }
    }
  }

  loadAssets(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.loadingAssets()) {
      return;
    }
    this.loadingAssets.set(true);
    this.http
      .get<ApiSuccess<{ assets: AssetOption[] }>>(`${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/assets?limit=100`)
      .pipe(map((res) => res.data.assets ?? []))
      .subscribe({
        next: (list) => {
          this.loadingAssets.set(false);
          this.assetOptions.set(list);
        },
        error: () => this.loadingAssets.set(false),
      });
  }

  assetPreviewUrl(assetId: string): string | null {
    if (!assetId) return null;
    return this.assetOptions().find((a) => a.id === assetId)?.download_url ?? null;
  }

  isSelectedId(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleRowSelection(id: string, checked: boolean): void {
    this.selectedIds.update((list) => (checked ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
  }

  toggleSelectAll(checked: boolean): void {
    this.selectedIds.set(checked ? this.filteredItems().map((i) => i.id) : []);
  }

  clearSelection(): void {
    this.selectedIds.set([]);
  }

  runBulkAction(action: 'submit' | 'approve' | 'reject' | 'delete'): void {
    const tenantId = this.tenant()?.id;
    const ids = this.selectedIds();
    if (!tenantId || ids.length === 0 || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    this.bulkNotice.set(null);
    this.bulkError.set(null);
    this.contentService.bulkAction(tenantId, action, ids).subscribe({
      next: (res) => {
        this.bulkBusy.set(false);
        this.clearSelection();
        if (res.failed.length > 0) {
          this.bulkError.set(
            `${res.succeeded.length} succeeded, ${res.failed.length} failed (${res.failed[0].message}).`,
          );
        } else {
          this.bulkNotice.set(`Bulk "${action}" completed for ${res.succeeded.length} item(s).`);
        }
        this.refreshList();
      },
      error: (err: unknown) => {
        this.bulkBusy.set(false);
        this.bulkError.set(apiErrorMessage(err));
      },
    });
  }

  closeCreatePanel(): void {
    this.showCreatePanel.set(false);
  }

  closeEditor(): void {
    this.selected.set(null);
  }

  togglePolicyPanel(): void {
    const next = !this.showPolicyPanel();
    this.showPolicyPanel.set(next);
    if (next) {
      this.loadPolicy();
    }
  }

  loadPolicy(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.loadingPolicy.set(true);
    this.policyError.set(null);
    this.policyNotice.set(null);
    this.http
      .get<ApiSuccess<{ disallow_self_approval: boolean; regulated_industry: string | null }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/content-policy`,
      )
      .pipe(map((res) => res.data))
      .subscribe({
        next: (p) => {
          this.loadingPolicy.set(false);
          this.policyDisallowSelfApproval.set(p.disallow_self_approval);
          this.policyRegulatedIndustry.set(p.regulated_industry ?? '');
        },
        error: (err: unknown) => {
          this.loadingPolicy.set(false);
          this.policyError.set(apiErrorMessage(err));
        },
      });
  }

  savePolicy(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.savingPolicy()) {
      return;
    }
    this.savingPolicy.set(true);
    this.policyError.set(null);
    this.policyNotice.set(null);
    this.http
      .put<ApiSuccess<{ disallow_self_approval: boolean; regulated_industry: string | null }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/content-policy`,
        {
          disallow_self_approval: this.policyDisallowSelfApproval(),
          regulated_industry: this.policyRegulatedIndustry() || null,
        },
      )
      .pipe(map((res) => res.data))
      .subscribe({
        next: () => {
          this.savingPolicy.set(false);
          this.policyNotice.set('Content approval policy saved.');
        },
        error: (err: unknown) => {
          this.savingPolicy.set(false);
          this.policyError.set(apiErrorMessage(err));
        },
      });
  }

  loadLocations(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.loadingLocations()) {
      return;
    }
    this.loadingLocations.set(true);
    this.http
      .get<ApiSuccess<{ locations: LocationOption[] }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/locations`,
      )
      .pipe(map((res) => res.data.locations ?? []))
      .subscribe({
        next: (locs) => {
          this.loadingLocations.set(false);
          this.locations.set(locs);
          if (!this.createForm.controls.locationId.value && locs.length > 0) {
            this.createForm.patchValue({ locationId: locs[0].id });
          }
        },
        error: () => {
          this.loadingLocations.set(false);
        },
      });
  }

  private readonly toast = inject(ToastService);
  readonly deletingId = signal<string | null>(null);

  deleteItem(item: ContentItem): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.deletingId()) {
      return;
    }
    if (!confirmDelete(item.title || item.objective || 'this content')) {
      return;
    }
    this.deletingId.set(item.id);
    this.listError.set(null);
    this.contentService.bulkAction(tenantId, 'delete', [item.id]).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.items.update((list) => list.filter((x) => x.id !== item.id));
        if (this.selected()?.id === item.id) {
          this.selected.set(null);
        }
        this.toast.success('Content deleted.');
      },
      error: (err: unknown) => {
        this.deletingId.set(null);
        const msg = apiErrorMessage(err);
        this.listError.set(msg);
        this.toast.error(msg);
      },
    });
  }

  scheduleItem(item: ContentItem): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    void this.router.navigate(['/app', tenantId, 'calendar'], {
      state: {
        scheduleContentId: item.id,
        scheduleContentTitle: item.title ?? '',
        scheduleContentObjective: item.objective,
      },
    });
  }

  private applyPrefillFromRouterState(): void {
    const state = (typeof history !== 'undefined' ? history.state : null) as RouterPrefillState | null;
    if (state?.prefillBody || state?.prefillObjective || state?.prefillTitle) {
      this.showCreatePanel.set(true);
      this.createForm.patchValue({
        title: state.prefillTitle ?? '',
        objective: state.prefillObjective ?? '',
        body: state.prefillBody ?? '',
        language: state.prefillLanguage ?? 'en-IN',
      });
      if (state.prefillAssetId) {
        this.createAssetId.set(state.prefillAssetId);
      }
    }
  }

  private refreshList(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingList.set(false);
      return;
    }
    this.loadingList.set(true);
    this.contentService.list(tenantId).subscribe({
      next: (items) => {
        this.loadingList.set(false);
        this.items.set(items);
        const selectedId = this.selected()?.id;
        if (selectedId) {
          this.selected.set(items.find((i) => i.id === selectedId) ?? null);
        }
      },
      error: (err: unknown) => {
        this.loadingList.set(false);
        this.listError.set(apiErrorMessage(err));
      },
    });
  }

  select(item: ContentItem): void {
    this.showCreatePanel.set(false);
    this.selected.set(item);
    this.actionNotice.set(null);
    this.editError.set(null);
    this.editFieldErrors.set(null);
    this.editForm.patchValue({
      title: item.title ?? '',
      body: item.body,
      language: item.language,
    });
  }

  reloadSelected(): void {
    const tenantId = this.tenant()?.id;
    const id = this.selected()?.id;
    if (!tenantId || !id) {
      return;
    }
    this.contentService.get(tenantId, id).subscribe({
      next: (item) => {
        this.select(item);
        this.refreshList();
        this.actionNotice.set('Version restored as a new draft version.');
      },
    });
  }

  editFieldError(field: string): string | null {
    return this.editFieldErrors()?.[field] ?? null;
  }

  hasEditFieldErrors(): boolean {
    return this.editFieldErrors() !== null;
  }

  createFieldError(field: string): string | null {
    return this.createFieldErrors()?.[field] ?? null;
  }

  hasCreateFieldErrors(): boolean {
    return this.createFieldErrors() !== null;
  }

  saveEdit(): void {
    const tenantId = this.tenant()?.id;
    const item = this.selected();
    if (!tenantId || !item || this.editForm.invalid || this.saving() || !this.isEditable()) {
      return;
    }
    this.saving.set(true);
    this.editError.set(null);
    this.editFieldErrors.set(null);
    this.actionNotice.set(null);

    const { title, body, language } = this.editForm.getRawValue();
    const assetId = this.editAssetId();
    this.contentService
      .update(tenantId, item.id, {
        title,
        body,
        language,
        ...(assetId ? { assets_json: [assetId] } : {}),
      })
      .subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.selected.set(updated);
        this.actionNotice.set('Changes saved.');
        this.refreshList();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (apiErrorCode(err) === 'CONTENT_NOT_EDITABLE') {
          this.editError.set(apiErrorMessage(err));
          this.refreshList();
        } else {
          this.editError.set(apiErrorMessage(err));
          this.editFieldErrors.set(apiErrorFields(err));
        }
      },
    });
  }

  submitForApproval(): void {
    const tenantId = this.tenant()?.id;
    const item = this.selected();
    if (!tenantId || !item || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.editError.set(null);
    this.actionNotice.set(null);
    this.contentService.submit(tenantId, item.id).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.selected.set(updated);
        this.actionNotice.set('Submitted for approval.');
        this.refreshList();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.editError.set(apiErrorMessage(err));
      },
    });
  }

  approve(decision: 'approve' | 'reject'): void {
    const tenantId = this.tenant()?.id;
    const item = this.selected();
    if (!tenantId || !item || this.approving()) {
      return;
    }
    this.approving.set(true);
    this.editError.set(null);
    this.actionNotice.set(null);
    this.contentService.approve(tenantId, item.id, { decision }).subscribe({
      next: (updated) => {
        this.approving.set(false);
        this.selected.set(updated);
        this.editForm.patchValue({ title: updated.title ?? '', body: updated.body, language: updated.language });
        this.actionNotice.set(decision === 'approve' ? 'Content approved.' : 'Content rejected and returned to draft.');
        this.refreshList();
      },
      error: (err: unknown) => {
        this.approving.set(false);
        this.editError.set(apiErrorMessage(err));
      },
    });
  }

  create(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.createForm.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.createFieldErrors.set(null);

    const { locationId, objective, title, body, language } = this.createForm.getRawValue();
    const assetId = this.createAssetId();
    this.contentService
      .create(tenantId, {
        location_id: locationId,
        objective,
        title: title || undefined,
        body,
        language,
        ...(assetId ? { assets_json: [assetId] } : {}),
      })
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.createForm.patchValue({ title: '', body: '' });
          this.createAssetId.set('');
          this.showCreatePanel.set(false);
          this.select(created);
          this.refreshList();
        },
        error: (err: unknown) => {
          this.creating.set(false);
          this.createError.set(apiErrorMessage(err));
          this.createFieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
