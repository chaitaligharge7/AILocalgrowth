import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { API_BASE_URL } from '../../core/http/api-base-url.token';
import { ApiSuccess } from '../../core/http/api-envelope.model';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { ToastService } from '../../core/feedback/toast.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LeadService } from '../../core/leads/lead.service';
import {
  LEAD_ALL_STATUSES,
  LEAD_CONSENT_STATUSES,
  LEAD_STATUS_TRANSITIONS,
  Lead,
  LeadConsentStatus,
  LeadSourcesSummary,
  LeadStatus,
  LeadStatusSummary,
} from '../../core/leads/lead.models';
import { LocationApiService } from '../../core/locations/location.service';
import { LocationSummary } from '../../core/locations/location.models';
import { MemberService } from '../../core/members/member.service';
import { TenantMember } from '../../core/members/member.models';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortHeaderComponent } from '../../shared/table/sort-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { TableExportColumn, TableExportComponent } from '../../shared/table/table-export.component';

/** Cross-field validator: the backend requires at least one of phone/email (blueprint §02 M14, `LeadService::create()`). */
function phoneOrEmailRequired(control: AbstractControl): ValidationErrors | null {
  const phone = (control.get('phone')?.value ?? '').trim();
  const email = (control.get('email')?.value ?? '').trim();
  return phone === '' && email === '' ? { phoneOrEmailRequired: true } : null;
}

/**
 * `/app/:tenantId/leads` — blueprint §02 M14, §03 "Flutter LEAD" mirrored
 * for Angular BUSINESS, §10.4. A filterable list or status board (BW-095;
 * columns grouped by real `status`, stage moves reuse the existing
 * `PATCH /leads/{id}` endpoint via a per-card select — true drag-and-drop
 * is deferred), a real status funnel (BW-100) and source breakdown
 * (BW-098) from the `status-summary`/`sources-summary` endpoints, owner
 * names from `GET /members` (BW-096), tag chips (BW-099), plus a
 * create-lead form.
 *
 * List/read is open to any active tenant member server-side
 * (`LeadService::list()`); creating a lead requires the `lead.manage`
 * permission (seeded to owner/admin/editor —
 * `database/seeders/0001_seed_permissions_roles.sql`), so the create form
 * is hidden for analyst/viewer as UX polish only — the backend
 * independently 403s regardless of this check.
 *
 * `owner_id` is a real member picker backed by `GET /tenants/{t}/members`;
 * `location_id` is a real picker backed by `GET /tenants/{t}/locations`.
 * The list can be filtered by tag and by an inclusive created-date range;
 * the same range drives the funnel and source breakdown (BW-099/BW-100).
 */
@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    DatePipe,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    PaginationComponent,
    SortHeaderComponent,
    TableExportComponent,
  ],
  template: `
    <section class="leads">
      <app-page-header eyebrow="CRM" eyebrowLabel="Follow ups" title="Leads" subtitle="Records & activity for this business." />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="summary-grid">
          <div class="card summary-card" data-testid="status-funnel">
            <h2>Pipeline funnel</h2>
            @if (statusSummary(); as summary) {
              @for (status of statusOptions; track status) {
                <div class="bar-row">
                  <span class="bar-label">{{ status }}</span>
                  <span class="bar-track">
                    <span class="bar-fill" [style.width.%]="barPercent(summary.by_status[status], funnelMax())"></span>
                  </span>
                  <span class="bar-count">{{ summary.by_status[status] }}</span>
                </div>
              }
            } @else if (summaryError()) {
              <p class="empty">Funnel unavailable.</p>
            } @else {
              <app-skeleton-loader [rows]="3" />
            }
          </div>
          <div class="card summary-card" data-testid="source-breakdown">
            <h2>Lead sources</h2>
            @if (sourceRows(); as rows) {
              @if (rows.length === 0) {
                <p class="empty">No leads yet — sources will appear here.</p>
              }
              @for (row of rows; track row.source) {
                <div class="bar-row">
                  <span class="bar-label">{{ row.source }}</span>
                  <span class="bar-track">
                    <span class="bar-fill bar-fill--gold" [style.width.%]="barPercent(row.count, sourceMax())"></span>
                  </span>
                  <span class="bar-count">{{ row.count }}</span>
                </div>
              }
            } @else if (summaryError()) {
              <p class="empty">Source breakdown unavailable.</p>
            } @else {
              <app-skeleton-loader [rows]="3" />
            }
          </div>
        </div>

        <div class="view-toggle-bar">
          <div class="view-toggle" role="group" aria-label="Lead view">
            <button type="button" [class.active]="view() === 'list'" (click)="view.set('list')">List</button>
            <button type="button" [class.active]="view() === 'board'" (click)="view.set('board')">Board</button>
          </div>
          <div class="view-toggle-actions">
            @if (canConfigureRouting()) {
              <button type="button" class="routing-btn" (click)="toggleRoutingPanel()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <polyline points="16 11 18 13 22 9"></polyline>
                </svg>
                <span>{{ showRoutingPanel() ? 'Close auto-assign' : 'Auto-assign (Round-robin)' }}</span>
              </button>
            }
            @if (canManage()) {
              <button type="button" class="routing-btn" (click)="exportLeadsCsv()" [disabled]="exportingCsv()" data-testid="export-leads-csv">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>{{ exportingCsv() ? 'Exporting…' : 'Export CSV' }}</span>
              </button>
              <button type="button" class="routing-btn" (click)="showImportPanel.set(!showImportPanel())" data-testid="toggle-import-csv">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>{{ showImportPanel() ? 'Close import' : 'Import CSV' }}</span>
              </button>
              <a
                class="btn-primary btn-sm"
                [routerLink]="['/app', tenantId(), 'leads', 'new']"
                data-testid="create-new-lead"
              >
                + Create new lead
              </a>
            }
          </div>
        </div>

        @if (showImportPanel() && canManage()) {
          <section class="card import-panel" data-testid="leads-import-panel">
            <div class="import-head">
              <div>
                <h3>Bulk import leads (CSV)</h3>
                <p class="meta">Headers: <code>name,phone,email,source,consent_status</code></p>
              </div>
              <div class="import-tools">
                <label class="routing-btn file-label">
                  Upload .csv
                  <input type="file" accept=".csv,text/csv" (change)="onImportFile($event)" hidden />
                </label>
                <button type="button" class="routing-btn" (click)="loadSampleLeadsCsv()">Load sample</button>
              </div>
            </div>
            <textarea
              rows="4"
              class="import-textarea"
              [ngModel]="importCsvText()"
              (ngModelChange)="importCsvText.set($event)"
              placeholder="name,phone,email,source,consent_status&#10;Ramesh Kumar,+919876543210,ramesh@example.com,csv_import,granted"
            ></textarea>
            <div class="import-actions">
              <button type="button" (click)="runBulkImport()" [disabled]="importingCsv() || !importCsvText().trim()">
                {{ importingCsv() ? 'Importing…' : 'Import leads' }}
              </button>
            </div>
            @if (importError()) {
              <p class="form-error" role="alert">{{ importError() }}</p>
            }
            @if (importNotice()) {
              <p class="success" role="status">{{ importNotice() }}</p>
            }
          </section>
        }

        @if (showRoutingPanel() && canConfigureRouting()) {
          <section class="card routing-panel">
            <h2>Automatic lead assignment</h2>
            @if (loadingRouting()) {
              <p class="empty">Loading assignment rule…</p>
            } @else {
              <div class="routing-controls">
                <label>
                  Assignment mode
                  <select [ngModel]="routingMode()" (ngModelChange)="routingMode.set($event)">
                    <option value="manual">Manual assignment</option>
                    <option value="round_robin">Round-robin (automatic)</option>
                  </select>
                </label>
                @if (routingMode() === 'round_robin' && members().length > 0) {
                  <div class="routing-members">
                    <span class="routing-label">Rotation pool (leave unchecked for all active owners/admins/editors):</span>
                    <div class="routing-checks">
                      @for (m of members(); track m.user_id) {
                        <label class="routing-check">
                          <input
                            type="checkbox"
                            [checked]="routingMemberIds().includes(m.user_id)"
                            (change)="toggleRoutingMember(m.user_id, $event)"
                          />
                          <span>{{ m.name || m.email }}</span>
                        </label>
                      }
                    </div>
                  </div>
                }
                <button type="button" (click)="saveRoutingRule()" [disabled]="savingRouting()">
                  {{ savingRouting() ? 'Saving…' : 'Save assignment rule' }}
                </button>
              </div>
              @if (routingError()) {
                <p class="form-error" role="alert">{{ routingError() }}</p>
              }
              @if (routingNotice()) {
                <p class="success" role="status">{{ routingNotice() }}</p>
              }
            }
          </section>
        }

        @if (view() === 'board') {
          <div class="board" data-testid="lead-board">
            @for (status of statusOptions; track status) {
              <div
                class="board-column"
                [class.board-column--drop-target]="dragOverStatus() === status"
                (dragover)="onBoardDragOver($event, status)"
                (dragleave)="onBoardDragLeave(status)"
                (drop)="onBoardDrop($event, status)"
              >
                <div class="board-column-head">
                  <span class="badge badge--dot" [class]="leadStatusBadgeClass(status)">{{ status }}</span>
                  <span class="board-count">{{ boardColumns()[status].length }}</span>
                </div>
                @for (lead of boardColumns()[status]; track lead.id) {
                  <div
                    class="board-card"
                    [class.board-card--dragging]="draggingLeadId() === lead.id"
                    [attr.draggable]="canManage()"
                    (dragstart)="onBoardDragStart($event, lead)"
                    (dragend)="onBoardDragEnd()"
                  >
                    <a [routerLink]="['/app', tenantId(), 'leads', lead.id]" class="board-card-title">
                      {{ lead.name || '(no name)' }}
                    </a>
                    <span class="list-row-subtitle">{{ lead.phone || lead.email || '—' }} · {{ lead.source }}</span>
                    @if (ownerName(lead.owner_id); as owner) {
                      <span class="owner-chip">{{ owner }}</span>
                    }
                    @if (canManage() && transitionsFor(lead).length > 0) {
                      <select
                        class="board-move"
                        [attr.aria-label]="'Move ' + (lead.name || 'lead') + ' to stage'"
                        (change)="moveLead(lead, $event)"
                      >
                        <option value="">Move to…</option>
                        @for (target of transitionsFor(lead); track target) {
                          <option [value]="target">{{ target }}</option>
                        }
                      </select>
                    }
                  </div>
                }
              </div>
            }
          </div>
          @if (boardError()) {
            <p class="form-error" role="alert">{{ boardError() }}</p>
          }
        }

        <div class="layout" [class.layout--board]="view() === 'board'">
          <div class="list-pane card" [hidden]="view() === 'board'">
            <div class="list-toolbar">
              <input
                type="search"
                class="list-search"
                placeholder="Search by name, phone or email…"
                [value]="searchTerm()"
                (input)="onSearchInput($event)"
              />
              <label class="status-filter">
                Status
                <select [value]="statusFilter()" (change)="onStatusFilterChange($event)">
                  <option value="">All</option>
                  @for (status of statusOptions; track status) {
                    <option [value]="status">{{ status }}</option>
                  }
                </select>
              </label>
              <div class="date-range" role="group" aria-label="Created date range" data-testid="date-range">
                <label>
                  From
                  <input type="date" [value]="dateFrom()" (change)="onDateChange('from', $event)" />
                </label>
                <label>
                  To
                  <input type="date" [value]="dateTo()" [min]="dateFrom()" (change)="onDateChange('to', $event)" />
                </label>
                @if (dateFrom() || dateTo()) {
                  <button type="button" class="link-button" (click)="clearDates()">Clear dates</button>
                }
              </div>
              <label class="status-filter">
                Tag
                <input
                  type="text"
                  class="tag-filter"
                  list="known-lead-tags"
                  placeholder="any"
                  [value]="tagFilter()"
                  (change)="onTagFilterChange($event)"
                  data-testid="tag-filter"
                />
                <datalist id="known-lead-tags">
                  @for (tag of knownTags(); track tag) {
                    <option [value]="tag"></option>
                  }
                </datalist>
              </label>
              <ui-table-export
                [data]="filteredLeads()"
                [columns]="leadExportColumns"
                filename="leads"
                [loading]="loading()"
                (refresh)="refresh()"
                (exportCsv)="exportLeadsCsv()"
              />
            </div>
            @if (dateRangeError()) {
              <p class="field-error" role="alert">{{ dateRangeError() }}</p>
            }

            @if (canManage() && selectedLeadIds().length > 0) {
              <div class="lead-bulk-bar" data-testid="lead-bulk-bar">
                <span class="lead-bulk-bar__count">{{ selectedLeadIds().length }} selected</span>
                <div class="lead-bulk-bar__controls">
                  <select [ngModel]="bulkStatus()" (ngModelChange)="bulkStatus.set($event)" aria-label="Bulk stage">
                    <option value="">Change stage…</option>
                    @for (status of statusOptions; track status) {
                      <option [value]="status">{{ status }}</option>
                    }
                  </select>
                  <select [ngModel]="bulkOwnerId()" (ngModelChange)="bulkOwnerId.set($event)" aria-label="Bulk owner">
                    <option value="__unchanged__">Reassign owner…</option>
                    <option value="">Unassigned</option>
                    @for (m of members(); track m.user_id) {
                      <option [value]="m.user_id">{{ m.name }}</option>
                    }
                  </select>
                  <button
                    type="button"
                    (click)="applyBulkLeadAction()"
                    [disabled]="bulkBusy() || (!bulkStatus() && bulkOwnerId() === '__unchanged__')"
                  >
                    {{ bulkBusy() ? 'Applying…' : 'Apply' }}
                  </button>
                  <button type="button" class="link-button" (click)="clearLeadSelection()">Clear</button>
                </div>
              </div>
            }
            @if (bulkNotice()) {
              <p class="success" role="status">{{ bulkNotice() }}</p>
            }
            @if (bulkError()) {
              <p class="form-error" role="alert">{{ bulkError() }}</p>
            }

            @if (shareNotice()) {
              <p class="success share-toast" role="status">{{ shareNotice() }}</p>
            }

            @if (loading()) {
              <app-skeleton-loader [rows]="4" />
            } @else if (loadError()) {
              <p class="form-error" role="alert">{{ loadError() }}</p>
            } @else if (leads().length === 0) {
              <app-empty-state icon="leads" title="No leads yet" message="New enquiries from Google, Meta or WhatsApp will show up here." />
            } @else if (filteredLeads().length === 0) {
              <p class="empty">No leads match "{{ searchTerm() }}".</p>
            } @else {
              <div class="leads-table-wrap">
                <div class="list-header" [class.list-header--manage]="canManage()">
                  @if (canManage()) {
                    <div class="col-check">
                      <input
                        type="checkbox"
                        class="lead-check"
                        aria-label="Select all leads"
                        [checked]="isAllSelected()"
                        (change)="toggleSelectAll($any($event.target).checked)"
                      />
                    </div>
                  }
                  <div class="list-header-cols">
                    <ui-sort-header
                      label="Name / item"
                      [active]="sortColumn() === 'name'"
                      [direction]="sortDescending() ? 'desc' : 'asc'"
                      (sort)="toggleSort('name')"
                    />
                    <ui-sort-header
                      label="Status"
                      [active]="sortColumn() === 'status'"
                      [direction]="sortDescending() ? 'desc' : 'asc'"
                      (sort)="toggleSort('status')"
                    />
                    <ui-sort-header
                      class="col-meta"
                      label="Last updated"
                      [active]="sortColumn() === 'updated_at'"
                      [direction]="sortDescending() ? 'desc' : 'asc'"
                      (sort)="toggleSort('updated_at')"
                    />
                  </div>
                  <div class="col-actions-head">Actions</div>
                </div>
                <div class="list-body">
                  @for (lead of pagedLeads(); track lead.id) {
                    <div class="list-row-wrap" [class.list-row-wrap--selected]="isLeadSelected(lead.id)">
                      @if (canManage()) {
                        <div class="col-check">
                          <input
                            type="checkbox"
                            class="lead-check"
                            [attr.aria-label]="'Select ' + (lead.name || 'lead')"
                            [checked]="isLeadSelected(lead.id)"
                            (change)="toggleLeadSelection(lead.id, $any($event.target).checked)"
                          />
                        </div>
                      }
                      <a class="list-row" [routerLink]="['/app', tenantId(), 'leads', lead.id]">
                        <span class="avatar-initial" [class]="avatarTintClass(lead.name || lead.id)">
                          {{ initialFor(lead.name) }}
                        </span>
                        <span class="list-row-main">
                          <span class="list-row-title">{{ lead.name || '(no name)' }}</span>
                          <span class="list-row-subtitle">
                            {{ lead.phone || lead.email || '—' }} · {{ lead.source }} · consent {{ lead.consent_status }}
                            @if (ownerName(lead.owner_id); as owner) {
                              · owner {{ owner }}
                            }
                          </span>
                          @if (lead.tags && lead.tags.length > 0) {
                            <span class="tag-row">
                              @for (tag of lead.tags; track tag) {
                                <span class="tag-chip">{{ tag }}</span>
                              }
                            </span>
                          }
                        </span>
                        <span class="badge badge--dot" [class]="leadStatusBadgeClass(lead.status)">{{ lead.status }}</span>
                        <span class="list-row-meta">{{ lead.updated_at | date: 'mediumDate' }}</span>
                      </a>
                      <div class="col-row-actions">
                        <button
                          type="button"
                          class="btn-secondary action-icon-btn share-link-btn"
                          [class.share-link-btn--copied]="copiedLeadId() === lead.id"
                          data-testid="share-lead-link"
                          [title]="copiedLeadId() === lead.id ? 'Link copied!' : 'Copy shareable lead link'"
                          [attr.aria-label]="'Copy link for ' + (lead.name || 'lead')"
                          (click)="shareLeadLink(lead, $event)"
                        >
                          <ui-icon [name]="copiedLeadId() === lead.id ? 'approvals' : 'link'" [size]="14" />
                          <span class="sr-only">Copy link</span>
                        </button>
                        <a
                          class="btn-secondary action-icon-btn"
                          [routerLink]="['/app', tenantId(), 'leads', lead.id]"
                          title="Edit lead"
                          [attr.aria-label]="'Edit ' + (lead.name || 'lead')"
                          data-testid="edit-lead-btn"
                        >
                          <ui-icon name="edit" [size]="14" />
                          <span class="sr-only">Edit</span>
                        </a>
                        @if (canManage()) {
                          <button
                            type="button"
                            class="btn-secondary action-icon-btn action-icon-btn--danger"
                            data-testid="delete-lead-btn"
                            [disabled]="deletingLeadId() === lead.id"
                            title="Delete lead"
                            [attr.aria-label]="'Delete ' + (lead.name || 'lead')"
                            (click)="deleteLead(lead)"
                          >
                            <ui-icon name="trash" [size]="14" />
                            <span class="sr-only">Delete</span>
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
              <app-pagination
                [totalItems]="sortedLeads().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event)"
              />
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .leads {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-5);
        align-items: start;
      }
      .list-pane,
      .create-pane {
        /* Grid items default to min-width: auto, which lets a wide table's
           natural (shrink-to-fit) content width — e.g. the free-text Owner
           column's full member UUIDs — force this card wider than its grid
           track instead of letting the table's own overflow-x:auto scroll
           contain it. min-width: 0 lets the card shrink to the track and
           pushes the overflow down into the table where it belongs. */
        min-width: 0;
      }
      .layout--board {
        grid-template-columns: 1fr;
      }
      @media (max-width: 900px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
      .summary-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5);
        margin-bottom: var(--space-5);
      }
      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: 1fr;
        }
      }
      .summary-card h2 {
        font-size: var(--text-md, 1rem);
        margin: 0 0 var(--space-3);
      }
      .bar-row {
        display: grid;
        grid-template-columns: 90px 1fr 36px;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-2);
        font-size: var(--text-sm);
      }
      .bar-label {
        text-transform: capitalize;
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-track {
        height: 10px;
        border-radius: 999px;
        background: var(--color-primary-light);
        overflow: hidden;
      }
      .bar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-primary);
      }
      .bar-fill--gold {
        background: var(--color-accent-gold);
      }
      .bar-count {
        text-align: right;
        font-weight: var(--font-semibold);
      }
      .view-toggle-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
        flex-wrap: wrap;
      }
      .view-toggle {
        display: inline-flex;
        border-radius: var(--radius-sm, 6px);
        overflow: hidden;
        border: 1px solid var(--color-border);
        box-shadow: var(--shadow-sm);
        margin-bottom: 0;
      }
      .view-toggle button {
        border: none;
        border-radius: 0;
        padding: 0.42rem 1rem;
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        background: var(--color-surface);
        color: var(--color-text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .view-toggle button.active {
        background: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .view-toggle-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .routing-btn {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        padding: 0.42rem 0.85rem;
        border-radius: var(--radius-sm, 6px);
        background: var(--color-surface);
        border: 1px solid var(--color-border-strong);
        color: var(--color-text);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        box-shadow: var(--shadow-sm);
        transition: all 0.15s ease;
      }
      .routing-btn:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
        background: var(--color-surface-alt);
      }
      .board {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(220px, 1fr);
        gap: var(--space-3);
        overflow-x: auto;
        padding-bottom: var(--space-3);
        margin-bottom: var(--space-5);
      }
      .board-column {
        background: var(--color-primary-light);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
      }
      .board-column-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .board-count {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .board-card {
        background: #fff;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 10px);
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }
      .board-card-title {
        font-weight: var(--font-semibold);
        text-decoration: none;
      }
      .board-move {
        font-size: var(--text-xs);
      }
      .owner-chip,
      .tag-chip {
        display: inline-block;
        font-size: var(--text-xs);
        border-radius: 999px;
        padding: 2px 8px;
        background: var(--color-accent-gold-bg);
        color: var(--color-text);
      }
      .tag-chip {
        background: var(--color-primary-light);
      }
      .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }
      .status-filter {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .tag-filter {
        width: 110px;
      }
      .date-range {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--space-2);
        margin-bottom: 0;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .date-range label {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .link-button {
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-primary);
        text-decoration: underline;
        cursor: pointer;
        font: inherit;
      }
      .lead-bulk-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: var(--radius-sm, 6px);
        padding: var(--space-2) var(--space-3);
        margin-bottom: var(--space-3);
        font-size: var(--text-sm);
        flex-wrap: wrap;
      }
      .lead-bulk-bar__count {
        font-weight: var(--font-semibold);
        color: var(--color-primary);
      }
      .lead-bulk-bar__controls {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .leads-table-wrap {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 8px);
        overflow: hidden;
        background: var(--color-surface);
        margin-top: var(--space-2);
      }
      .list-header {
        display: grid;
        grid-template-columns: 1fr 108px;
        align-items: center;
        gap: var(--space-2);
        background: #f8fafc;
        border-bottom: 1px solid var(--color-border);
        padding: 0 var(--space-3);
        min-height: 40px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }
      .list-header.list-header--manage {
        grid-template-columns: 36px 1fr 108px;
      }
      .list-header .col-check,
      .list-row-wrap .col-check {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
      }
      .list-header-cols {
        display: grid;
        grid-template-columns: 1fr 100px 105px;
        gap: var(--space-3);
        align-items: center;
      }
      .col-actions-head {
        text-align: center;
      }
      .sortable-th {
        background: none;
        border: none;
        padding: var(--space-2) 0;
        font: inherit;
        text-transform: inherit;
        letter-spacing: inherit;
        color: inherit;
        font-weight: var(--font-semibold);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        text-align: center;
      }
      .sortable-th:hover {
        color: var(--color-text);
      }
      .sortable-th .sort-arrow {
        font-size: 0.85em;
        color: var(--color-primary);
        font-weight: 700;
      }
      .list-body {
        display: flex;
        flex-direction: column;
      }
      .list-row-wrap {
        display: grid;
        grid-template-columns: 1fr 108px;
        align-items: center;
        gap: var(--space-2);
        border-bottom: 1px solid var(--color-border);
        padding: 0 var(--space-3);
        transition: background-color 0.15s ease;
      }
      .list-row-wrap:has(.col-check) {
        grid-template-columns: 36px 1fr 108px;
      }
      .list-row-wrap:last-child {
        border-bottom: none;
      }
      .list-row-wrap:hover {
        background: var(--color-surface-alt, #f8fafc);
      }
      .list-row-wrap--selected {
        background: rgba(7, 141, 126, 0.05);
      }
      .lead-check {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--color-primary);
        margin: 0;
      }
      .leads .list-row {
        display: grid;
        grid-template-columns: 34px 1fr 100px 105px;
        gap: var(--space-3);
        align-items: center;
        padding: var(--space-3) 0;
        text-decoration: none;
        color: inherit;
        border-bottom: none;
      }
      .leads .list-row .badge,
      .leads .list-row .list-row-meta {
        justify-self: center;
        text-align: center;
      }
      .leads .list-row .list-row-main {
        text-align: center;
      }
      .col-row-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .share-link-btn--copied {
        border-color: var(--color-success, #16a34a);
        color: var(--color-success, #16a34a);
        background: #f0fdf4;
      }
      .action-icon-btn--danger:hover:not(:disabled) {
        background: var(--color-danger-bg, #fef2f2);
        border-color: var(--color-danger-border, #fecaca);
        color: var(--color-danger, #dc2626);
      }
      .share-toast {
        padding: 6px 10px;
        border-radius: var(--radius-sm, 6px);
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        margin-bottom: var(--space-2, 8px);
      }
      @media (max-width: 560px) {
        .list-header-cols {
          grid-template-columns: 34px 1fr 80px;
        }
        .leads .list-row {
          grid-template-columns: 34px 1fr 80px;
        }
        .col-meta,
        .leads .list-row-meta {
          display: none;
        }
      }
      .empty {
        color: var(--color-text-muted);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .create-pane h2 {
        margin: 0 0 var(--space-3);
        font-size: var(--text-md, 1rem);
      }
      .create-pane form label {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .create-pane form input,
      .create-pane form select {
        width: 100%;
        box-sizing: border-box;
      }
      .consent-label .required {
        font-weight: var(--font-normal);
        font-size: var(--text-xs);
        color: var(--color-warning);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .success {
        color: var(--color-success);
        margin: 0;
        font-size: var(--text-sm);
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }
    `,
  ],
})
export class LeadsComponent implements OnInit {
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly leadExportColumns: TableExportColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
    { key: 'source', label: 'Source' },
    { key: 'consent_status', label: 'Consent' },
    { key: 'updated_at', label: 'Updated' },
  ];
  readonly pagedLeads = computed(() => paginateItems(this.sortedLeads(), this.page(), this.pageSize()));
  readonly copiedLeadId = signal<string | null>(null);
  readonly shareNotice = signal<string | null>(null);
  private shareTimer: ReturnType<typeof setTimeout> | null = null;

  shareLeadLink(lead: Lead, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/app/${this.tenantId()}/leads/${lead.id}`;
    const label = lead.name || 'lead';

    const markCopied = () => {
      this.copiedLeadId.set(lead.id);
      this.shareNotice.set(`Copied shareable link for ${label} to clipboard.`);
      if (this.shareTimer) {
        clearTimeout(this.shareTimer);
      }
      this.shareTimer = setTimeout(() => {
        this.copiedLeadId.set(null);
        this.shareNotice.set(null);
      }, 3000);
    };

    const fallbackCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        markCopied();
      } catch {
        this.shareNotice.set(`Share link: ${url}`);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(markCopied, fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  /** Maps a lead status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
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

  /** Maps a lead consent status to the shared `.badge--*` semantic modifier. */
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

  readonly statusOptions = LEAD_ALL_STATUSES;
  readonly consentOptions = LEAD_CONSENT_STATUSES;

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canManage = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly leads = signal<Lead[]>([]);
  readonly members = signal<TenantMember[]>([]);
  readonly locations = signal<LocationSummary[]>([]);
  readonly tagFilter = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly dateRangeError = signal<string | null>(null);
  /** Every tag seen on any fetched lead — feeds the tag filter's suggestions (the filtered list alone would shrink it). */
  readonly knownTags = signal<string[]>([]);
  readonly view = signal<'list' | 'board'>('list');
  readonly statusSummary = signal<LeadStatusSummary | null>(null);
  readonly sourcesSummary = signal<LeadSourcesSummary | null>(null);
  readonly summaryError = signal(false);
  readonly boardError = signal<string | null>(null);

  readonly funnelMax = computed(() => {
    const summary = this.statusSummary();
    return summary ? Math.max(1, ...Object.values(summary.by_status)) : 1;
  });

  readonly sourceRows = computed(() => {
    const summary = this.sourcesSummary();
    if (!summary) {
      return null;
    }
    return Object.entries(summary.by_source)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly sourceMax = computed(() => Math.max(1, ...(this.sourceRows() ?? []).map((r) => r.count)));

  /** Leads grouped by their real `status` — the board's columns (BW-095). */
  readonly boardColumns = computed(() => {
    const columns = Object.fromEntries(LEAD_ALL_STATUSES.map((s) => [s, [] as Lead[]])) as Record<LeadStatus, Lead[]>;
    for (const lead of this.filteredLeads()) {
      columns[lead.status]?.push(lead);
    }
    return columns;
  });

  barPercent(value: number, max: number): number {
    return max > 0 ? Math.round((value / max) * 100) : 0;
  }

  /** Real member name for a lead's `owner_id`; null when unassigned or the member list hasn't resolved it. */
  ownerName(ownerId: string | null): string | null {
    if (!ownerId) {
      return null;
    }
    return this.members().find((m) => m.user_id === ownerId)?.name ?? null;
  }

  /** Only transitions the backend state machine allows (mirrors `LeadStateMachine`). */
  transitionsFor(lead: Lead): LeadStatus[] {
    return LEAD_STATUS_TRANSITIONS[lead.status] ?? [];
  }

  moveLead(lead: Lead, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const target = select.value as LeadStatus | '';
    select.value = '';
    const tenantId = this.tenantId();
    if (!target || !tenantId) {
      return;
    }
    this.boardError.set(null);
    this.leadService.update(tenantId, lead.id, { status: target }).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err: unknown) => this.boardError.set(apiErrorMessage(err)),
    });
  }

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly statusFilter = signal<LeadStatus | ''>('');
  readonly searchTerm = signal('');

  /** Client-side filter over the already-fetched page of leads — real data already in memory, no extra API call. */
  readonly filteredLeads = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) {
      return this.leads();
    }
    return this.leads().filter((lead) =>
      [lead.name, lead.phone, lead.email, lead.source].some((field) => (field ?? '').toLowerCase().includes(q)),
    );
  });

  /** Premium data-grid sortable columns (BW-092) — client-side only, over the already-filtered/fetched page. */
  readonly sortColumn = signal<'name' | 'status' | 'updated_at'>('updated_at');
  readonly sortDescending = signal(true);

  readonly sortedLeads = computed(() => {
    const column = this.sortColumn();
    const descending = this.sortDescending();
    const rows = [...this.filteredLeads()];
    rows.sort((a, b) => {
      const av = (column === 'name' ? a.name ?? '' : column === 'status' ? a.status : a.updated_at) as string;
      const bv = (column === 'name' ? b.name ?? '' : column === 'status' ? b.status : b.updated_at) as string;
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return descending ? rows.reverse() : rows;
  });

  toggleSort(column: 'name' | 'status' | 'updated_at'): void {
    if (this.sortColumn() === column) {
      this.sortDescending.set(!this.sortDescending());
    } else {
      this.sortColumn.set(column);
      this.sortDescending.set(false);
    }
  }

  sortAriaSort(column: 'name' | 'status' | 'updated_at'): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDescending() ? 'descending' : 'ascending';
  }

  sortArrow(column: 'name' | 'status' | 'updated_at'): string {
    if (this.sortColumn() !== column) {
      return '';
    }
    return this.sortDescending() ? '↓' : '↑';
  }

  /** First letter of a real name/id — never a fabricated placeholder. */
  initialFor(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed[0].toUpperCase() : '•';
  }

  /** Stable hash of a real field onto one of 5 existing avatar tints — same record always gets the same color. */
  avatarTintClass(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const index = hash % 5;
    return index === 0 ? '' : `avatar-initial--${index}`;
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  private readonly http = inject(HttpClient, { optional: true });
  private readonly toast = inject(ToastService);
  private readonly apiBase = inject(API_BASE_URL, { optional: true }) ?? '/api/v1';
  private readonly fb = new FormBuilder();

  readonly deletingLeadId = signal<string | null>(null);

  deleteLead(lead: Lead): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.deletingLeadId()) {
      return;
    }
    if (!confirmDelete(lead.name || 'this lead')) {
      return;
    }
    this.deletingLeadId.set(lead.id);
    this.leadService.update(tenantId, lead.id, { status: 'archived' }).subscribe({
      next: () => {
        this.deletingLeadId.set(null);
        this.toast.success('Lead deleted.');
        this.refresh();
      },
      error: (err: unknown) => {
        this.deletingLeadId.set(null);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }

  readonly canConfigureRouting = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });
  readonly showRoutingPanel = signal(false);
  readonly loadingRouting = signal(false);
  readonly savingRouting = signal(false);
  readonly routingMode = signal<'manual' | 'round_robin'>('manual');
  readonly routingMemberIds = signal<string[]>([]);
  readonly routingError = signal<string | null>(null);
  readonly routingNotice = signal<string | null>(null);

  toggleRoutingPanel(): void {
    const next = !this.showRoutingPanel();
    this.showRoutingPanel.set(next);
    if (next) {
      this.loadRoutingRule();
    }
  }

  loadRoutingRule(): void {
    const tenantId = this.tenantId();
    if (!tenantId || !this.http) {
      return;
    }
    this.loadingRouting.set(true);
    this.routingError.set(null);
    this.routingNotice.set(null);
    this.http
      .get<ApiSuccess<{ mode: 'manual' | 'round_robin'; member_ids: string[] }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/lead-assignment`,
      )
      .pipe(map((res) => res.data))
      .subscribe({
        next: (rule) => {
          this.loadingRouting.set(false);
          this.routingMode.set(rule.mode);
          this.routingMemberIds.set(rule.member_ids ?? []);
        },
        error: (err: unknown) => {
          this.loadingRouting.set(false);
          this.routingError.set(apiErrorMessage(err));
        },
      });
  }

  toggleRoutingMember(userId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.routingMemberIds.update((ids) => (checked ? [...new Set([...ids, userId])] : ids.filter((id) => id !== userId)));
  }

  saveRoutingRule(): void {
    const tenantId = this.tenantId();
    if (!tenantId || !this.http || this.savingRouting()) {
      return;
    }
    this.savingRouting.set(true);
    this.routingError.set(null);
    this.routingNotice.set(null);
    this.http
      .put<ApiSuccess<{ mode: 'manual' | 'round_robin'; member_ids: string[] }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/lead-assignment`,
        { mode: this.routingMode(), member_ids: this.routingMemberIds() },
      )
      .pipe(map((res) => res.data))
      .subscribe({
        next: () => {
          this.savingRouting.set(false);
          this.routingNotice.set('Lead assignment rule saved.');
        },
        error: (err: unknown) => {
          this.savingRouting.set(false);
          this.routingError.set(apiErrorMessage(err));
        },
      });
  }
  readonly form = this.fb.nonNullable.group(
    {
      name: [''],
      phone: [''],
      email: [''],
      source: ['manual', [Validators.required]],
      consentStatus: ['unknown' as LeadConsentStatus, [Validators.required]],
      ownerId: [''],
      locationId: [''],
    },
    { validators: [phoneOrEmailRequired] },
  );

  readonly submitting = signal(false);
  readonly submitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly dedupedNotice = signal(false);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly leadService: LeadService,
    private readonly memberService: MemberService,
    private readonly locationService: LocationApiService,
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.loadMembers();
    this.loadLocations();
  }

  private loadLocations(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.locationService.list(tenantId).subscribe({
      next: (locations) => this.locations.set(locations),
      // The picker degrades to "No specific location"; never blocks the form.
      error: () => this.locations.set([]),
    });
  }

  onTagFilterChange(event: Event): void {
    this.tagFilter.set((event.target as HTMLInputElement).value.trim().toLowerCase());
    this.refresh();
  }

  onDateChange(which: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (which === 'from' ? this.dateFrom : this.dateTo).set(value);
    const from = this.dateFrom();
    const to = this.dateTo();
    if (from && to && from > to) {
      this.dateRangeError.set('"From" must not be after "To".');
      return;
    }
    this.dateRangeError.set(null);
    this.refresh();
  }

  clearDates(): void {
    this.dateFrom.set('');
    this.dateTo.set('');
    this.dateRangeError.set(null);
    this.refresh();
  }

  private currentRange(): { from?: string; to?: string } {
    return { from: this.dateFrom() || undefined, to: this.dateTo() || undefined };
  }

  private loadMembers(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.memberService.list(tenantId).subscribe({
      next: (members) => this.members.set(members),
      // Owner names degrade to "no owner chip"; never blocks the lead list.
      error: () => this.members.set([]),
    });
  }

  private loadSummaries(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.summaryError.set(false);
    const range = this.currentRange();
    this.leadService.statusSummary(tenantId, range).subscribe({
      next: (s) => this.statusSummary.set(s),
      error: () => this.summaryError.set(true),
    });
    this.leadService.sourcesSummary(tenantId, range).subscribe({
      next: (s) => this.sourcesSummary.set(s),
      error: () => this.summaryError.set(true),
    });
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as LeadStatus | '');
    this.refresh();
  }

  refresh(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.loadSummaries();
    const status = this.statusFilter() || undefined;
    const tag = this.tagFilter() || undefined;
    this.leadService.list(tenantId, { status, tag, ...this.currentRange() }).subscribe({
      next: (leads) => {
        this.loading.set(false);
        this.leads.set(leads);
        const known = new Set(this.knownTags());
        for (const lead of leads) {
          for (const t of lead.tags ?? []) {
            known.add(t);
          }
        }
        this.knownTags.set([...known].sort());
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  readonly draggingLeadId = signal<string | null>(null);
  readonly dragOverStatus = signal<LeadStatus | null>(null);

  readonly exportingCsv = signal(false);
  readonly showImportPanel = signal(false);
  readonly importCsvText = signal('');
  readonly importingCsv = signal(false);
  readonly importError = signal<string | null>(null);
  readonly importNotice = signal<string | null>(null);

  readonly selectedLeadIds = signal<string[]>([]);
  readonly bulkStatus = signal<string>('');
  readonly bulkOwnerId = signal<string>('__unchanged__');
  readonly bulkBusy = signal(false);
  readonly bulkNotice = signal<string | null>(null);
  readonly bulkError = signal<string | null>(null);

  onBoardDragStart(event: DragEvent, lead: Lead): void {
    this.draggingLeadId.set(lead.id);
    event.dataTransfer?.setData('text/plain', lead.id);
  }

  onBoardDragEnd(): void {
    this.draggingLeadId.set(null);
    this.dragOverStatus.set(null);
  }

  onBoardDragOver(event: DragEvent, status: LeadStatus): void {
    if (!this.canManage()) return;
    event.preventDefault();
    this.dragOverStatus.set(status);
  }

  onBoardDragLeave(status: LeadStatus): void {
    if (this.dragOverStatus() === status) {
      this.dragOverStatus.set(null);
    }
  }

  onBoardDrop(event: DragEvent, targetStatus: LeadStatus): void {
    event.preventDefault();
    const tenantId = this.tenantId();
    const leadId = this.draggingLeadId() ?? event.dataTransfer?.getData('text/plain') ?? '';
    this.draggingLeadId.set(null);
    this.dragOverStatus.set(null);
    if (!tenantId || !leadId || !this.canManage()) return;

    const lead = this.leads().find((l) => l.id === leadId);
    if (!lead || lead.status === targetStatus) return;

    this.boardError.set(null);
    this.leadService.update(tenantId, lead.id, { status: targetStatus }).subscribe({
      next: () => this.refresh(),
      error: (err: unknown) => this.boardError.set(apiErrorMessage(err)),
    });
  }

  exportLeadsCsv(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.exportingCsv()) return;
    this.exportingCsv.set(true);
    const status = this.statusFilter() || undefined;
    const tag = this.tagFilter() || undefined;
    this.leadService.exportCsv(tenantId, { status, tag, ...this.currentRange() }).subscribe({
      next: ({ blob, filename }) => {
        this.exportingCsv.set(false);
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      error: (err: unknown) => {
        this.exportingCsv.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  onImportFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.importCsvText.set(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  loadSampleLeadsCsv(): void {
    this.importCsvText.set(
      'name,phone,email,source,consent_status\nAnanya Iyer,+919840112233,ananya@example.com,csv_import,granted\nSuresh Babu,+919840445566,suresh@example.com,csv_import,unknown',
    );
  }

  runBulkImport(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.importingCsv() || !this.importCsvText().trim()) return;
    this.importingCsv.set(true);
    this.importError.set(null);
    this.importNotice.set(null);
    this.leadService.bulkImport(tenantId, this.importCsvText()).subscribe({
      next: (res) => {
        this.importingCsv.set(false);
        this.importNotice.set(
          `Imported ${res.created_count} lead(s), ${res.deduped_count} deduped, ${res.error_count} error(s).`,
        );
        if (res.errors.length > 0) {
          this.importError.set(`Row ${res.errors[0].row}: ${res.errors[0].message}`);
        }
        this.refresh();
      },
      error: (err: unknown) => {
        this.importingCsv.set(false);
        this.importError.set(apiErrorMessage(err));
      },
    });
  }

  isLeadSelected(id: string): boolean {
    return this.selectedLeadIds().includes(id);
  }

  isAllSelected(): boolean {
    const list = this.filteredLeads();
    return list.length > 0 && list.every((lead) => this.selectedLeadIds().includes(lead.id));
  }

  toggleSelectAll(checked: boolean): void {
    if (!checked) {
      this.clearLeadSelection();
    } else {
      this.selectedLeadIds.set(this.filteredLeads().map((l) => l.id));
    }
  }

  toggleLeadSelection(id: string, checked: boolean): void {
    this.selectedLeadIds.update((list) => (checked ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
  }

  clearLeadSelection(): void {
    this.selectedLeadIds.set([]);
    this.bulkStatus.set('');
    this.bulkOwnerId.set('__unchanged__');
  }

  applyBulkLeadAction(): void {
    const tenantId = this.tenantId();
    const ids = this.selectedLeadIds();
    if (!tenantId || ids.length === 0 || this.bulkBusy()) return;
    const payload: { lead_ids: string[]; status?: string; owner_id?: string | null } = { lead_ids: ids };
    if (this.bulkStatus()) payload.status = this.bulkStatus();
    if (this.bulkOwnerId() !== '__unchanged__') payload.owner_id = this.bulkOwnerId() || null;
    if (!payload.status && !('owner_id' in payload)) return;

    this.bulkBusy.set(true);
    this.bulkNotice.set(null);
    this.bulkError.set(null);
    this.leadService.bulkAction(tenantId, payload).subscribe({
      next: (res) => {
        this.bulkBusy.set(false);
        this.clearLeadSelection();
        if (res.failed.length > 0) {
          this.bulkError.set(`${res.succeeded.length} updated, ${res.failed.length} failed (${res.failed[0].message}).`);
        } else {
          this.bulkNotice.set(`Updated ${res.succeeded.length} lead(s).`);
        }
        this.refresh();
      },
      error: (err: unknown) => {
        this.bulkBusy.set(false);
        this.bulkError.set(apiErrorMessage(err));
      },
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  submit(): void {
    this.submitAttempted.set(true);
    const tenantId = this.tenantId();
    if (this.form.invalid || this.submitting() || !tenantId) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.dedupedNotice.set(false);

    const { name, phone, email, source, consentStatus, ownerId, locationId } = this.form.getRawValue();
    this.leadService
      .create(tenantId, {
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        source,
        consent_status: consentStatus,
        owner_id: ownerId || undefined,
        location_id: locationId || undefined,
      })
      .subscribe({
        next: (lead) => {
          this.submitting.set(false);
          this.submitAttempted.set(false);
          this.dedupedNotice.set(Boolean(lead.deduped));
          this.form.reset({
            name: '',
            phone: '',
            email: '',
            source: 'manual',
            consentStatus: 'unknown',
            ownerId: '',
            locationId: '',
          });
          this.refresh();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
