import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProviderConnection } from '../../core/integrations/integration.models';
import { IntegrationService } from '../../core/integrations/integration.service';
import { apiErrorCode, apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import {
  CHANNEL_PROVIDER,
  CalendarEntry,
  PublishJob,
  PublishJobStatus,
  SCHEDULE_CHANNEL_LABELS,
  ScheduleChannel,
  describePublishError,
  describeScheduleError,
} from '../../core/publishing/publishing.models';
import { ApprovedContentOption, PublishingService } from '../../core/publishing/publishing.service';
import { formatLocalDateTimeWithZone } from '../../core/publishing/timezone.util';
import { localNowDateTimeString, localTodayDateString } from '../../core/utils/date.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn, TableExportComponent } from '../../shared/table/table-export.component';

interface ScheduleHandoffState {
  scheduleContentId?: string;
  scheduleContentTitle?: string;
  scheduleContentObjective?: string;
}

export type CalendarViewMode = 'list' | 'week' | 'month';

export interface CalendarDayCell {
  isoDate: string;
  dayNumber: number;
  inCurrentRange: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

const CONTENT_STATUS_FILTERS = ['scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
const PUBLISH_JOB_STATUS_FILTERS: PublishJobStatus[] = [
  'queued',
  'leased',
  'attempting',
  'reconciling',
  'succeeded',
  'retry_wait',
  'dead_letter',
  'cancelled',
];

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    PaginationComponent,
    SortHeaderComponent,
    TableExportComponent,
  ],
  template: `
    <section class="calendar">
      <app-page-header
        eyebrow="PUBLISHING"
        eyebrowLabel="Calendar"
        title="Calendar &amp; publishing queue"
        subtitle="Schedule single or bulk posts, drag-and-drop to reschedule in week/month views, and monitor publish jobs."
      />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="toolbar-top">
          <p class="tz-note">
            Timezone: <strong>{{ tenant()!.timezone }}</strong> (stored in UTC, displayed locally).
          </p>
          <div class="toolbar-top__actions">
            <div class="view-toggle" role="group" aria-label="Calendar view mode">
              <button type="button" [class.active]="viewMode() === 'list'" (click)="setViewMode('list')">List</button>
              <button type="button" [class.active]="viewMode() === 'week'" (click)="setViewMode('week')">Week</button>
              <button type="button" [class.active]="viewMode() === 'month'" (click)="setViewMode('month')">Month</button>
            </div>
            <button type="button" class="btn-primary" (click)="toggleBulkPanel()">
              {{ showBulkPanel() ? 'Close bulk schedule' : 'Bulk schedule' }}
            </button>
          </div>
        </div>

        @if (showBulkPanel()) {
          <section class="bulk-panel card">
            <h2>Bulk schedule approved posts</h2>
            @if (loadingApproved()) {
              <p>Loading approved content…</p>
            } @else if (approvedContents().length === 0) {
              <p class="placeholder">No approved content items available to bulk schedule.</p>
            } @else {
              <div class="bulk-list">
                @for (item of approvedContents(); track item.id) {
                  <label class="bulk-item">
                    <input
                      type="checkbox"
                      [checked]="selectedBulkIds().includes(item.id)"
                      (change)="toggleBulkSelection(item.id, $event)"
                    />
                    <span>{{ item.title || item.objective }}</span>
                  </label>
                }
              </div>
              <form [formGroup]="bulkForm" (ngSubmit)="submitBulkSchedule()" class="bulk-form" novalidate>
                <div class="bulk-grid">
                  <label>
                    Channel
                    <select formControlName="channel" (change)="onBulkChannelChange()">
                      @for (ch of availableChannels(); track ch) {
                        <option [value]="ch">{{ channelLabel(ch) }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    Connection
                    <select formControlName="providerConnectionId">
                      @for (conn of bulkConnectionsForChannel(); track conn.id) {
                        <option [value]="conn.id">{{ conn.external_account_id }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    First post date &amp; time ({{ bulkForm.controls.timezone.value }})
                    <input type="datetime-local" formControlName="startAt" [min]="minDateTime" />
                  </label>
                  <label>
                    Interval (hours between posts)
                    <input type="number" min="1" max="168" formControlName="intervalHours" />
                  </label>
                </div>
                <div class="actions">
                  <button
                    type="submit"
                    class="btn-primary"
                    [disabled]="bulkForm.invalid || selectedBulkIds().length === 0 || bulkScheduling() || bulkConnectionsForChannel().length === 0"
                  >
                    {{ bulkScheduling() ? 'Scheduling…' : 'Schedule ' + selectedBulkIds().length + ' post(s)' }}
                  </button>
                </div>
              </form>
            }
            @if (bulkError()) {
              <p class="form-error" role="alert">{{ bulkError() }}</p>
            }
            @if (bulkResult()) {
              <p class="success" role="status">{{ bulkResult() }}</p>
            }
          </section>
        }

        @if (scheduleHandoff()) {
          <section class="schedule-panel card">
            <h2>Schedule "{{ scheduleHandoff()!.scheduleContentTitle || scheduleHandoff()!.scheduleContentObjective }}"</h2>
            @if (hasAnyConnectedAccount() === false) {
              <p class="gap-note">
                No connected Google or Meta account found for this business. Connect one on the
                <a href="javascript:void(0)" (click)="goToIntegrations()">Integrations</a> screen first.
              </p>
            } @else {
              <form [formGroup]="scheduleForm" (ngSubmit)="submitSchedule()" novalidate>
                <label>
                  Channel
                  <select formControlName="channel" (change)="onChannelChange()">
                    @for (ch of availableChannels(); track ch) {
                      <option [value]="ch">{{ channelLabel(ch) }}</option>
                    }
                  </select>
                </label>
                @if (connectionsForChannel().length === 0) {
                  <p class="gap-note">
                    No connected {{ channelProviderLabel() }} account found. Connect one on the
                    <a href="javascript:void(0)" (click)="goToIntegrations()">Integrations</a> screen first.
                  </p>
                } @else {
                  <label>
                    Connection
                    <select formControlName="providerConnectionId">
                      @for (conn of connectionsForChannel(); track conn.id) {
                        <option [value]="conn.id">{{ conn.external_account_id }}</option>
                      }
                    </select>
                  </label>
                }
                <label>
                  Date &amp; time ({{ scheduleForm.controls.timezone.value }})
                  <input type="datetime-local" formControlName="scheduledAt" [min]="minDateTime" />
                  @if (scheduleFieldError('scheduled_at')) {
                    <p class="field-error">{{ scheduleFieldError('scheduled_at') }}</p>
                  }
                </label>
                <label>
                  Timezone
                  <input type="text" formControlName="timezone" />
                  @if (scheduleFieldError('timezone')) {
                    <p class="field-error">{{ scheduleFieldError('timezone') }}</p>
                  }
                </label>

                @if (scheduleForm.controls.channel.value !== 'google') {
                  <p class="gap-note">
                    This content's business location must already be linked to this Meta connection's Page/Instagram
                    account (Integrations screen) or scheduling will fail with a clear remediation message.
                  </p>
                }

                @if (scheduleError() && !hasScheduleFieldErrors()) {
                  <p class="form-error" role="alert">{{ scheduleError() }}</p>
                }

                <div class="actions">
                  <button
                    type="submit"
                    [disabled]="scheduleForm.invalid || scheduling() || connectionsForChannel().length === 0"
                  >
                    {{ scheduling() ? 'Scheduling…' : 'Confirm schedule' }}
                  </button>
                  <button type="button" (click)="dismissScheduleHandoff()">Cancel</button>
                </div>
              </form>
            }
          </section>
        }

        <section class="entries card">
          <section class="filters-bar">
            <div class="filters-group">
              <label class="filter-field">
                <span class="filter-label">Content status</span>
                <select [value]="statusFilter()" (change)="onStatusFilterChange($event)" class="filter-select">
                  <option value="">All</option>
                  @for (s of contentStatusFilters; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </label>
              <label class="filter-field">
                <span class="filter-label">From</span>
                <input type="date" [value]="rangeStart()" (change)="onRangeChange('start', $event)" class="filter-input" />
              </label>
              <label class="filter-field">
                <span class="filter-label">To</span>
                <input type="date" [value]="rangeEnd()" [min]="rangeStart()" (change)="onRangeChange('end', $event)" class="filter-input" />
              </label>
              <input
                type="search"
                class="filter-input calendar-search"
                placeholder="Search content, channel…"
                [value]="calendarSearch()"
                (input)="calendarSearch.set($any($event.target).value); page.set(1)"
              />
            </div>
            <ui-table-export
              [data]="sortedEntries()"
              [columns]="calendarExportColumns"
              filename="calendar_schedule"
              [loading]="loadingCalendar()"
              (refresh)="refreshCalendar()"
            />
          </section>

          @if (loadingCalendar()) {
            <p>Loading…</p>
          } @else if (viewMode() === 'list') {
            @if (filteredEntries().length === 0) {
              <p class="placeholder">No scheduled content in this range/filter.</p>
            } @else {
              <div class="table-wrap">
                <table class="list-view">
                  <thead>
                    <tr>
                      <th class="col-when"><ui-sort-header label="When (local)" [active]="sortCol() === 'scheduled_utc'" [direction]="sortDir()" (sort)="toggleSort('scheduled_utc')" /></th>
                      <th class="col-content"><ui-sort-header label="Content" [active]="sortCol() === 'content'" [direction]="sortDir()" (sort)="toggleSort('content')" /></th>
                      <th class="col-channel"><ui-sort-header label="Channel" [active]="sortCol() === 'channel'" [direction]="sortDir()" (sort)="toggleSort('channel')" /></th>
                      <th class="col-status"><ui-sort-header label="Status" [active]="sortCol() === 'status'" [direction]="sortDir()" (sort)="toggleSort('status')" /></th>
                      <th class="col-error">Last error</th>
                      <th class="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of pagedEntries(); track entry.id) {
                      <tr [class.collision]="hasCollision(entry)">
                        <td class="col-when">
                          <div class="when-time">{{ localTime(entry.scheduled_utc) }}</div>
                        </td>
                        <td class="col-content">
                          <div class="content-text">
                            <strong>{{ entry.content_title || entry.content_objective }}</strong>
                            @if (hasCollision(entry)) {
                              <span class="collision-badge" title="Another post on the same channel is scheduled for the same minute.">⚠ collision</span>
                            }
                          </div>
                        </td>
                        <td class="col-channel">
                          <span class="channel-pill">{{ channelLabel(entry.channel) }}</span>
                        </td>
                        <td class="col-status">
                          <div class="status-stack">
                            <span class="badge" [class]="contentStatusBadgeClass(entry.content_status)">{{ entry.content_status }}</span>
                            @if (entry.publish_job_status) {
                              <span class="badge-sub" [class]="jobStatusBadgeClass(entry.publish_job_status)">
                                job: {{ entry.publish_job_status }}
                              </span>
                            }
                          </div>
                        </td>
                        <td class="col-error">
                          @if (entry.last_error_code) {
                            <div class="error-box" [title]="entry.last_error_code">
                              <span class="error-icon">⚠️</span>
                              <span class="error-note">{{ describeError(entry.last_error_code) }}</span>
                            </div>
                          } @else {
                            <span class="text-muted">—</span>
                          }
                        </td>
                        <td class="col-actions">
                          <div class="row-actions">
                            @if (entry.status === 'scheduled') {
                              @if (editingScheduleId() === entry.id) {
                                <input
                                  type="date"
                                  class="inline-date"
                                  [min]="minToday"
                                  [value]="inlineRescheduleDate()"
                                  (change)="inlineRescheduleDate.set($any($event.target).value)"
                                />
                                <button
                                  type="button"
                                  class="btn-action-save"
                                  (click)="confirmInlineReschedule(entry)"
                                  [disabled]="reschedulingId() === entry.id || !inlineRescheduleDate()"
                                >
                                  {{ reschedulingId() === entry.id ? 'Moving…' : 'Save' }}
                                </button>
                                <button type="button" class="btn-action-cancel" (click)="editingScheduleId.set(null)">×</button>
                              } @else {
                                <button type="button" class="btn-action-reschedule" (click)="openInlineReschedule(entry)">
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                  <span>Reschedule</span>
                                </button>
                              }
                            }
                            @if (entry.content_status === 'scheduled' || entry.content_status === 'failed') {
                              <button type="button" class="btn-action-cancel-entry" (click)="cancelEntry(entry)" [disabled]="cancellingId() === entry.content_id">
                                {{ cancellingId() === entry.content_id ? 'Cancelling…' : 'Cancel' }}
                              </button>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination
                [totalItems]="filteredEntries().length"
                [currentPage]="page()"
                [pageSize]="pageSize()"
                (pageChange)="page.set($event)"
                (pageSizeChange)="pageSize.set($event)"
              />
            }
          } @else {
            <p class="drag-hint">Drag any scheduled post chip onto a future date cell to reschedule it.</p>
            <div class="cal-weekdays">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
            <div class="cal-grid" [class.cal-grid--week]="viewMode() === 'week'">
              @for (cell of gridCells(); track cell.isoDate) {
                <div
                  class="cal-cell"
                  [class.cal-cell--muted]="!cell.inCurrentRange"
                  [class.cal-cell--today]="cell.isToday"
                  [class.cal-cell--dragover]="dragOverDate() === cell.isoDate"
                  (dragover)="onDayDragOver($event, cell.isoDate)"
                  (dragleave)="onDayDragLeave(cell.isoDate)"
                  (drop)="onDayDrop($event, cell.isoDate)"
                >
                  <div class="cal-cell__date">{{ cell.dayNumber }} <span class="cal-cell__iso">{{ cell.isoDate.slice(5) }}</span></div>
                  <div class="cal-cell__items">
                    @for (entry of cell.entries; track entry.id) {
                      <div
                        class="cal-chip"
                        data-testid="cal-chip"
                        [class.cal-chip--draggable]="entry.status === 'scheduled'"
                        [class.cal-chip--dragging]="draggingEntry()?.id === entry.id"
                        [class.cal-chip--collision]="hasCollision(entry)"
                        [attr.draggable]="entry.status === 'scheduled' ? 'true' : 'false'"
                        (dragstart)="onEntryDragStart($event, entry)"
                        (dragend)="onEntryDragEnd()"
                        [title]="localTime(entry.scheduled_utc) + ' · ' + entry.channel + (entry.status === 'scheduled' ? ' (Drag to reschedule)' : '')"
                      >
                        <div class="cal-chip__head">
                          @if (entry.status === 'scheduled') {
                            <span class="cal-chip__grip" aria-hidden="true">⋮⋮</span>
                          }
                          <span class="cal-chip__time">{{ reschedulingId() === entry.id ? 'Moving…' : localTime(entry.scheduled_utc) }}</span>
                        </div>
                        <span class="cal-chip__title">{{ entry.content_title || entry.content_objective }}</span>
                        <span class="cal-chip__meta">{{ entry.channel }} · {{ entry.content_status }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }

          @if (calendarError()) {
            <p class="form-error" role="alert">{{ calendarError() }}</p>
          }
          @if (actionNotice()) {
            <p class="success" role="status">{{ actionNotice() }}</p>
          }
        </section>

        <section class="jobs">
          <h2>Publish jobs</h2>
          <label>
            Status
            <select [value]="jobStatusFilter()" (change)="onJobStatusFilterChange($event)">
              <option value="">All</option>
              @for (s of publishJobStatusFilters; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </label>

          @if (loadingJobs()) {
            <p>Loading…</p>
          } @else if (jobs().length === 0) {
            <p class="placeholder">No publish jobs for this filter.</p>
          } @else {
            <table class="list-view">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Next run (local)</th>
                  <th>Last error / remediation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (job of jobs(); track job.id) {
                  <tr>
                    <td><code>{{ job.id }}</code></td>
                    <td><span class="badge" [class]="jobStatusBadgeClass(job.status)">{{ job.status }}</span></td>
                    <td>{{ job.attempts }}</td>
                    <td>{{ job.next_run_at ? localTime(job.next_run_at) : '—' }}</td>
                    <td>
                      @if (job.last_error_code) {
                        <span class="error-note">{{ describeError(job.last_error_code) }}</span>
                      } @else {
                        —
                      }
                    </td>
                    <td>
                      @if (job.status === 'dead_letter' || job.status === 'retry_wait') {
                        <button type="button" (click)="retryJob(job)" [disabled]="retryingId() === job.id">
                          {{ retryingId() === job.id ? 'Retrying…' : 'Retry' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (jobsError()) {
            <p class="form-error" role="alert">{{ jobsError() }}</p>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .calendar {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .toolbar-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      .toolbar-top__actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .view-toggle {
        display: inline-flex;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .view-toggle button {
        background: var(--color-surface);
        border: none;
        padding: 6px 12px;
        font-size: var(--text-sm);
        cursor: pointer;
      }
      .view-toggle button.active {
        background: var(--color-primary);
        color: #fff;
        font-weight: 600;
      }
      .btn-primary {
        background: var(--color-primary);
        color: #fff;
        border: none;
        border-radius: var(--radius-sm);
        padding: 7px 14px;
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
      }
      .tz-note {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        margin: 0;
      }
      .row-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .inline-date {
        padding: 3px 6px;
        font-size: 0.78rem;
        border: 1px solid var(--color-border);
        border-radius: 4px;
      }
      .cal-chip__head {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .cal-chip__grip {
        font-size: 0.7rem;
        color: var(--color-text-muted);
        letter-spacing: -1px;
        cursor: grab;
      }
      .cal-chip--dragging {
        opacity: 0.45;
      }
      .bulk-panel h2 {
        margin: 0 0 var(--space-3);
        font-size: var(--text-md);
      }
      .bulk-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        margin-bottom: var(--space-3);
      }
      .bulk-item {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        font-size: var(--text-sm);
      }
      .bulk-form {
        max-width: 100%;
      }
      .bulk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3);
      }
      .drag-hint {
        margin: var(--space-2) 0;
        font-size: 12px;
        color: var(--color-text-muted);
      }
      .cal-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted);
        margin-bottom: 6px;
      }
      .cal-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
      }
      .cal-cell {
        min-height: 96px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 6px;
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .cal-grid--week .cal-cell {
        min-height: 180px;
      }
      .cal-cell--muted {
        background: var(--color-neutral-bg);
        opacity: 0.72;
      }
      .cal-cell--today {
        border-color: var(--color-primary);
      }
      .cal-cell--dragover {
        background: #eff6ff;
        border: 2px dashed var(--color-primary);
      }
      .cal-cell__date {
        font-size: 12px;
        font-weight: 700;
        display: flex;
        justify-content: space-between;
      }
      .cal-cell__iso {
        font-weight: 400;
        color: var(--color-text-subtle);
      }
      .cal-cell__items {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .cal-chip {
        padding: 4px 6px;
        border-radius: 4px;
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .cal-chip--draggable {
        cursor: grab;
      }
      .cal-chip--collision {
        background: var(--color-warning-bg);
        border-color: var(--color-warning-border);
      }
      .cal-chip__time {
        font-weight: 700;
        color: var(--color-primary);
      }
      .cal-chip__title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cal-chip__meta {
        color: var(--color-text-muted);
        font-size: 10px;
      }
      .gap-note {
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
        font-size: var(--text-sm);
      }
      .filters-bar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        margin-bottom: var(--space-4);
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        flex-wrap: wrap;
      }
      .filters-group {
        display: flex;
        align-items: flex-end;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .filter-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text-muted);
      }
      .filter-input,
      .filter-select {
        height: 36px;
        padding: 0 10px;
        font-size: var(--text-sm);
        font-family: inherit;
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        color: var(--color-text);
        box-sizing: border-box;
      }
      .filter-input:focus,
      .filter-select:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px var(--color-primary-ring);
      }
      .btn-refresh {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 14px;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-refresh:hover {
        background: var(--color-surface-alt);
        border-color: var(--color-primary);
        color: var(--color-primary);
      }

      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        box-shadow: var(--shadow-xs);
      }
      table.list-view {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      table.list-view th {
        text-align: center;
        padding: 0.75rem 1rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        background: var(--color-surface-alt, #f8fafc);
        border-bottom: 1px solid var(--color-border);
        white-space: nowrap;
      }
      table.list-view td {
        text-align: center;
        padding: 0.85rem 1rem;
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
        color: var(--color-text);
      }
      table.list-view tr:last-child td {
        border-bottom: none;
      }
      table.list-view tr:hover {
        background: var(--color-surface-alt, #f8fafc);
      }
      tr.collision {
        background: var(--color-warning-bg);
      }
      .col-when {
        width: 155px;
        white-space: nowrap;
        font-weight: 500;
        font-size: 0.8125rem;
      }
      .col-content {
        min-width: 190px;
        line-height: 1.35;
      }
      .col-channel {
        width: 120px;
        white-space: nowrap;
      }
      .channel-pill {
        display: inline-block;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: var(--radius-pill);
        background: var(--color-neutral-bg);
        color: var(--color-text);
        border: 1px solid var(--color-border);
      }
      .col-status {
        width: 150px;
        white-space: nowrap;
      }
      .status-stack {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
      }
      .badge-sub {
        font-size: 0.65rem;
        font-weight: 600;
        color: var(--color-text-muted);
        background: var(--color-surface-alt, #f8fafc);
        border: 1px solid var(--color-border);
        padding: 1px 5px;
        border-radius: var(--radius-pill);
        line-height: 1.3;
      }
      .col-error {
        min-width: 220px;
      }
      .error-box {
        display: inline-flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        color: var(--color-warning);
        font-size: 0.78rem;
        line-height: 1.35;
      }
      .error-icon {
        flex-shrink: 0;
        font-size: 0.85rem;
      }
      .error-note {
        font-size: 0.78rem;
        font-weight: 500;
      }
      .text-muted {
        color: var(--color-text-muted);
      }
      .col-actions {
        width: 135px;
        text-align: center;
        white-space: nowrap;
      }
      .row-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .btn-action-reschedule {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0.35rem 0.75rem;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-action-reschedule:hover {
        background: var(--color-surface-alt);
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .btn-action-save {
        padding: 0.3rem 0.65rem;
        font-size: var(--text-xs);
        font-weight: 600;
        color: #fff;
        background: var(--color-primary);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-sm);
        cursor: pointer;
      }
      .btn-action-cancel {
        padding: 0.3rem 0.5rem;
        font-size: var(--text-xs);
        border: 1px solid var(--color-border);
        background: transparent;
        border-radius: var(--radius-sm);
        cursor: pointer;
      }
      .btn-action-cancel-entry {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.65rem;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-danger);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-action-cancel-entry:hover {
        background: #fee2e2;
        border-color: var(--color-danger);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        max-width: 480px;
      }
      .collision-badge {
        color: var(--color-warning);
        font-size: var(--text-xs);
        margin-left: var(--space-2);
      }
      .error-note {
        color: var(--color-warning);
        font-size: var(--text-sm);
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
      }
      .placeholder {
        color: var(--color-text-subtle);
      }
      .actions {
        display: flex;
        gap: var(--space-3);
      }
      section.jobs,
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4);
      }
    `,
  ],
})
export class CalendarComponent {
  private readonly fb = new FormBuilder();
  readonly minToday = localTodayDateString();
  readonly minDateTime = localNowDateTimeString();

  contentStatusBadgeClass(status: string): string {
    switch (status) {
      case 'published':
        return 'badge--success';
      case 'failed':
      case 'cancelled':
        return 'badge--danger';
      case 'scheduled':
      case 'publishing':
        return 'badge--info';
      default:
        return 'badge--neutral';
    }
  }

  jobStatusBadgeClass(status: string | null | undefined): string {
    switch (status) {
      case 'succeeded':
        return 'badge--success';
      case 'dead_letter':
        return 'badge--danger';
      case 'retry_wait':
      case 'attempting':
      case 'reconciling':
        return 'badge--warning';
      case 'queued':
      case 'leased':
        return 'badge--info';
      default:
        return 'badge--neutral';
    }
  }

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly contentStatusFilters = CONTENT_STATUS_FILTERS;
  readonly publishJobStatusFilters = PUBLISH_JOB_STATUS_FILTERS;

  readonly viewMode = signal<CalendarViewMode>('list');
  readonly rangeStart = signal<string>(CalendarComponent.defaultRangeStart());
  readonly rangeEnd = signal<string>(CalendarComponent.defaultRangeEnd());
  readonly statusFilter = signal<string>('');
  readonly entries = signal<CalendarEntry[]>([]);
  readonly loadingCalendar = signal(true);
  readonly calendarError = signal<string | null>(null);
  readonly actionNotice = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);

  readonly draggingEntry = signal<CalendarEntry | null>(null);
  readonly dragOverDate = signal<string | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly sortCol = signal<string>('');
  readonly sortDir = signal<SortDirection>('asc');
  readonly calendarSearch = signal('');

  readonly calendarExportColumns: TableExportColumn[] = [
    { key: 'scheduled_utc', label: 'When (UTC)' },
    { key: 'content_title', label: 'Content' },
    { key: 'channel', label: 'Channel' },
    { key: 'content_status', label: 'Status' },
  ];

  toggleSort(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  readonly filteredEntries = computed(() => {
    const status = this.statusFilter();
    let list = this.entries();
    if (status) {
      list = list.filter((e) => e.content_status === status);
    }
    const q = this.calendarSearch().trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        [e.channel, e.content_status, e.content_title || '', e.content_objective || ''].some((f) =>
          f.toLowerCase().includes(q),
        ),
      );
    }
    return list;
  });

  readonly sortedEntries = computed(() =>
    sortTableRows(this.filteredEntries(), this.sortCol(), this.sortDir(), (e, col) => {
      switch (col) {
        case 'scheduled_utc':
          return e.scheduled_utc;
        case 'content':
          return e.content_title || e.content_objective;
        case 'channel':
          return e.channel;
        case 'status':
          return e.content_status;
        default:
          return '';
      }
    }),
  );

  readonly pagedEntries = computed(() => paginateItems(this.sortedEntries(), this.page(), this.pageSize()));

  readonly gridCells = computed<CalendarDayCell[]>(() => {
    const mode = this.viewMode();
    if (mode === 'list') {
      return [];
    }
    const startStr = this.rangeStart();
    const base = new Date(`${startStr}T00:00:00Z`);
    const todayIso = new Date().toISOString().slice(0, 10);

    // Align grid start to Monday
    const dayOfWeek = (base.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    const gridStart = new Date(base);
    gridStart.setUTCDate(gridStart.getUTCDate() - dayOfWeek);

    const totalDays = mode === 'week' ? 7 : 35;
    const byDate = new Map<string, CalendarEntry[]>();
    for (const e of this.filteredEntries()) {
      const key = e.scheduled_utc.slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push(e);
      byDate.set(key, list);
    }

    const cells: CalendarDayCell[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart);
      d.setUTCDate(gridStart.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      cells.push({
        isoDate: iso,
        dayNumber: d.getUTCDate(),
        inCurrentRange: iso >= this.rangeStart() && iso <= this.rangeEnd(),
        isToday: iso === todayIso,
        entries: byDate.get(iso) ?? [],
      });
    }
    return cells;
  });

  readonly jobStatusFilter = signal<PublishJobStatus | ''>('');
  readonly jobs = signal<PublishJob[]>([]);
  readonly loadingJobs = signal(true);
  readonly jobsError = signal<string | null>(null);
  readonly retryingId = signal<string | null>(null);

  readonly scheduleHandoff = signal<ScheduleHandoffState | null>(null);
  readonly connections = signal<ProviderConnection[]>([]);
  readonly connectedGoogleConnections = computed(() =>
    this.connections().filter((c) => c.provider === 'google' && c.status === 'connected'),
  );
  readonly connectedMetaConnections = computed(() =>
    this.connections().filter((c) => c.provider === 'meta' && c.status === 'connected'),
  );
  readonly hasAnyConnectedAccount = computed(
    () => this.connectedGoogleConnections().length > 0 || this.connectedMetaConnections().length > 0,
  );
  readonly availableChannels = computed<ScheduleChannel[]>(() => {
    const channels: ScheduleChannel[] = [];
    if (this.connectedGoogleConnections().length > 0) {
      channels.push('google');
    }
    if (this.connectedMetaConnections().length > 0) {
      channels.push('meta_page', 'meta_instagram');
    }
    return channels;
  });
  readonly connectionsForChannel = computed<ProviderConnection[]>(() => {
    const channel = this.scheduleForm.controls.channel.value as ScheduleChannel;
    return CHANNEL_PROVIDER[channel] === 'meta' ? this.connectedMetaConnections() : this.connectedGoogleConnections();
  });
  readonly bulkConnectionsForChannel = computed<ProviderConnection[]>(() => {
    const channel = this.bulkForm.controls.channel.value as ScheduleChannel;
    return CHANNEL_PROVIDER[channel] === 'meta' ? this.connectedMetaConnections() : this.connectedGoogleConnections();
  });

  readonly scheduleForm = this.fb.nonNullable.group({
    providerConnectionId: ['', [Validators.required]],
    scheduledAt: ['', [Validators.required]],
    timezone: ['Asia/Kolkata', [Validators.required]],
    channel: ['google' as ScheduleChannel, [Validators.required]],
  });
  readonly scheduling = signal(false);
  readonly scheduleError = signal<string | null>(null);
  readonly scheduleFieldErrors = signal<Record<string, string> | null>(null);

  // Bulk schedule panel state
  readonly showBulkPanel = signal(false);
  readonly loadingApproved = signal(false);
  readonly approvedContents = signal<ApprovedContentOption[]>([]);
  readonly selectedBulkIds = signal<string[]>([]);
  readonly bulkScheduling = signal(false);
  readonly bulkError = signal<string | null>(null);
  readonly bulkResult = signal<string | null>(null);
  readonly bulkForm = this.fb.nonNullable.group({
    channel: ['google' as ScheduleChannel, [Validators.required]],
    providerConnectionId: ['', [Validators.required]],
    startAt: ['', [Validators.required]],
    intervalHours: [24, [Validators.required, Validators.min(1)]],
    timezone: ['Asia/Kolkata', [Validators.required]],
  });

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly publishingService: PublishingService,
    private readonly integrationService: IntegrationService,
    private readonly router: Router,
  ) {
    this.applyScheduleHandoffFromRouterState();
    this.refreshCalendar();
    this.refreshJobs();
    this.loadConnections();
  }

  private static defaultRangeStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  private static defaultRangeEnd(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

  setViewMode(mode: CalendarViewMode): void {
    this.viewMode.set(mode);
  }

  toggleBulkPanel(): void {
    const next = !this.showBulkPanel();
    this.showBulkPanel.set(next);
    if (next) {
      const tz = this.tenant()?.timezone;
      if (tz) {
        this.bulkForm.patchValue({ timezone: tz });
      }
      const channels = this.availableChannels();
      if (channels.length > 0 && !channels.includes(this.bulkForm.controls.channel.value)) {
        this.bulkForm.patchValue({ channel: channels[0] });
      }
      const conns = this.bulkConnectionsForChannel();
      if (conns.length > 0 && !this.bulkForm.controls.providerConnectionId.value) {
        this.bulkForm.patchValue({ providerConnectionId: conns[0].id });
      }
      this.loadApprovedContents();
    }
  }

  private loadApprovedContents(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.loadingApproved.set(true);
    this.bulkError.set(null);
    this.publishingService.listApprovedContents(tenantId).subscribe({
      next: (items) => {
        this.loadingApproved.set(false);
        this.approvedContents.set(items);
      },
      error: (err: unknown) => {
        this.loadingApproved.set(false);
        this.bulkError.set(apiErrorMessage(err));
      },
    });
  }

  toggleBulkSelection(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedBulkIds.update((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)));
  }

  onBulkChannelChange(): void {
    const connected = this.bulkConnectionsForChannel();
    this.bulkForm.patchValue({ providerConnectionId: connected.length > 0 ? connected[0].id : '' });
  }

  submitBulkSchedule(): void {
    const tenantId = this.tenant()?.id;
    const ids = this.selectedBulkIds();
    if (!tenantId || ids.length === 0 || this.bulkForm.invalid || this.bulkScheduling()) {
      return;
    }
    this.bulkScheduling.set(true);
    this.bulkError.set(null);
    this.bulkResult.set(null);

    const raw = this.bulkForm.getRawValue();
    const baseMs = new Date(raw.startAt).getTime();
    const stepMs = Math.max(1, Number(raw.intervalHours)) * 3600 * 1000;

    const items = ids.map((contentId, idx) => {
      const d = new Date(baseMs + idx * stepMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      return { content_id: contentId, scheduled_at: localStr };
    });

    this.publishingService
      .bulkSchedule(tenantId, {
        items,
        provider_connection_id: raw.providerConnectionId,
        channel: raw.channel,
        timezone: raw.timezone,
      })
      .subscribe({
        next: (res) => {
          this.bulkScheduling.set(false);
          this.selectedBulkIds.set([]);
          this.bulkResult.set(`Bulk scheduled ${res.scheduled_count} post(s) (${res.failed_count} failed).`);
          this.refreshCalendar();
          this.refreshJobs();
          this.loadApprovedContents();
        },
        error: (err: unknown) => {
          this.bulkScheduling.set(false);
          this.bulkError.set(apiErrorMessage(err));
        },
      });
  }

  readonly reschedulingId = signal<string | null>(null);
  readonly editingScheduleId = signal<string | null>(null);
  readonly inlineRescheduleDate = signal<string>('');

  openInlineReschedule(entry: CalendarEntry): void {
    this.editingScheduleId.set(entry.id);
    this.inlineRescheduleDate.set(entry.scheduled_utc.slice(0, 10));
  }

  confirmInlineReschedule(entry: CalendarEntry): void {
    const targetDate = this.inlineRescheduleDate().trim();
    if (!targetDate) {
      return;
    }
    this.editingScheduleId.set(null);
    this.rescheduleEntryToDate(entry, targetDate);
  }

  onEntryDragStart(event: DragEvent, entry: CalendarEntry): void {
    if (entry.status !== 'scheduled') {
      return;
    }
    this.draggingEntry.set(entry);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', entry.id);
    }
  }

  onEntryDragEnd(): void {
    this.draggingEntry.set(null);
    this.dragOverDate.set(null);
  }

  onDayDragOver(event: DragEvent, isoDate: string): void {
    if (!this.draggingEntry()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverDate.set(isoDate);
  }

  onDayDragLeave(isoDate: string): void {
    if (this.dragOverDate() === isoDate) {
      this.dragOverDate.set(null);
    }
  }

  onDayDrop(event: DragEvent, targetIsoDate: string): void {
    event.preventDefault();
    const entry = this.draggingEntry();
    this.draggingEntry.set(null);
    this.dragOverDate.set(null);
    if (!entry) {
      return;
    }
    if (entry.scheduled_utc.slice(0, 10) === targetIsoDate) {
      return;
    }
    this.rescheduleEntryToDate(entry, targetIsoDate);
  }

  rescheduleEntryToDate(entry: CalendarEntry, targetIsoDate: string): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    // Keep original HH:mm:ss UTC time-of-day on the new date
    const timePart = entry.scheduled_utc.slice(11, 19) || '10:00:00';
    const targetUtc = new Date(`${targetIsoDate}T${timePart}Z`);
    if (Number.isNaN(targetUtc.getTime()) || targetUtc.getTime() <= Date.now()) {
      this.calendarError.set('Cannot reschedule to a past date/time. Please pick a future date.');
      return;
    }
    const scheduledAt = `${targetIsoDate} ${timePart}`;
    this.reschedulingId.set(entry.id);
    this.calendarError.set(null);
    this.actionNotice.set(null);

    this.publishingService.reschedule(tenantId, entry.id, { scheduled_at: scheduledAt, timezone: 'UTC' }).subscribe({
      next: () => {
        this.reschedulingId.set(null);
        this.actionNotice.set(`Rescheduled "${entry.content_title || entry.content_objective}" to ${targetIsoDate}.`);
        this.refreshCalendar();
        this.refreshJobs();
      },
      error: (err: unknown) => {
        this.reschedulingId.set(null);
        this.calendarError.set(apiErrorMessage(err));
      },
    });
  }

  private applyScheduleHandoffFromRouterState(): void {
    const state = (typeof history !== 'undefined' ? history.state : null) as ScheduleHandoffState | null;
    if (state?.scheduleContentId) {
      this.scheduleHandoff.set(state);
      const tz = this.tenant()?.timezone;
      if (tz) {
        this.scheduleForm.patchValue({ timezone: tz });
      }
    }
  }

  dismissScheduleHandoff(): void {
    this.scheduleHandoff.set(null);
  }

  goToIntegrations(): void {
    const tenantId = this.tenant()?.id;
    if (tenantId) {
      void this.router.navigate(['/app', tenantId, 'integrations']);
    }
  }

  private loadConnections(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.integrationService.list(tenantId).subscribe({
      next: (conns) => {
        this.connections.set(conns);
        const channels = this.availableChannels();
        if (channels.length > 0 && !channels.includes(this.scheduleForm.controls.channel.value)) {
          this.scheduleForm.patchValue({ channel: channels[0] });
        }
        const connected = this.connectionsForChannel();
        if (connected.length > 0 && !this.scheduleForm.controls.providerConnectionId.value) {
          this.scheduleForm.patchValue({ providerConnectionId: connected[0].id });
        }
      },
      error: () => this.connections.set([]),
    });
  }

  onChannelChange(): void {
    const connected = this.connectionsForChannel();
    this.scheduleForm.patchValue({ providerConnectionId: connected.length > 0 ? connected[0].id : '' });
  }

  channelLabel(channel: string): string {
    return SCHEDULE_CHANNEL_LABELS[channel as ScheduleChannel] ?? channel;
  }

  channelProviderLabel(): string {
    const channel = this.scheduleForm.controls.channel.value as ScheduleChannel;
    return CHANNEL_PROVIDER[channel] === 'meta' ? 'Meta' : 'Google';
  }

  scheduleFieldError(field: string): string | null {
    return this.scheduleFieldErrors()?.[field] ?? null;
  }

  hasScheduleFieldErrors(): boolean {
    return this.scheduleFieldErrors() !== null;
  }

  submitSchedule(): void {
    const tenantId = this.tenant()?.id;
    const handoff = this.scheduleHandoff();
    if (!tenantId || !handoff?.scheduleContentId || this.scheduleForm.invalid || this.scheduling()) {
      return;
    }
    this.scheduling.set(true);
    this.scheduleError.set(null);
    this.scheduleFieldErrors.set(null);

    const raw = this.scheduleForm.getRawValue();
    const scheduledAt = raw.scheduledAt.replace('T', ' ') + (raw.scheduledAt.length === 16 ? ':00' : '');

    this.publishingService
      .schedule(tenantId, handoff.scheduleContentId, {
        provider_connection_id: raw.providerConnectionId,
        scheduled_at: scheduledAt,
        timezone: raw.timezone,
        channel: raw.channel || undefined,
      })
      .subscribe({
        next: () => {
          this.scheduling.set(false);
          this.scheduleHandoff.set(null);
          this.actionNotice.set('Content scheduled.');
          this.refreshCalendar();
          this.refreshJobs();
        },
        error: (err: unknown) => {
          this.scheduling.set(false);
          this.scheduleError.set(describeScheduleError(apiErrorCode(err), apiErrorMessage(err)));
          this.scheduleFieldErrors.set(apiErrorFields(err));
        },
      });
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  onJobStatusFilterChange(event: Event): void {
    this.jobStatusFilter.set((event.target as HTMLSelectElement).value as PublishJobStatus | '');
    this.refreshJobs();
  }

  onRangeChange(which: 'start' | 'end', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (which === 'start') {
      this.rangeStart.set(value);
    } else {
      this.rangeEnd.set(value);
    }
    this.refreshCalendar();
  }

  refreshCalendar(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingCalendar.set(false);
      return;
    }
    this.loadingCalendar.set(true);
    this.calendarError.set(null);
    const startUtc = new Date(`${this.rangeStart()}T00:00:00Z`).toISOString();
    const endUtc = new Date(`${this.rangeEnd()}T23:59:59Z`).toISOString();
    this.publishingService.calendar(tenantId, startUtc, endUtc).subscribe({
      next: (entries) => {
        this.loadingCalendar.set(false);
        this.entries.set(entries);
      },
      error: (err: unknown) => {
        this.loadingCalendar.set(false);
        this.calendarError.set(apiErrorMessage(err));
      },
    });
  }

  refreshJobs(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      this.loadingJobs.set(false);
      return;
    }
    this.loadingJobs.set(true);
    this.jobsError.set(null);
    const status = this.jobStatusFilter() || undefined;
    this.publishingService.listPublishJobs(tenantId, status).subscribe({
      next: (jobs) => {
        this.loadingJobs.set(false);
        this.jobs.set(jobs);
      },
      error: (err: unknown) => {
        this.loadingJobs.set(false);
        this.jobsError.set(apiErrorMessage(err));
      },
    });
  }

  cancelEntry(entry: CalendarEntry): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.cancellingId()) {
      return;
    }
    this.cancellingId.set(entry.content_id);
    this.actionNotice.set(null);
    this.calendarError.set(null);
    this.publishingService.cancel(tenantId, entry.content_id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.actionNotice.set('Schedule cancelled.');
        this.refreshCalendar();
        this.refreshJobs();
      },
      error: (err: unknown) => {
        this.cancellingId.set(null);
        this.calendarError.set(apiErrorMessage(err));
      },
    });
  }

  retryJob(job: PublishJob): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.retryingId()) {
      return;
    }
    this.retryingId.set(job.id);
    this.jobsError.set(null);
    this.publishingService.retryPublishJob(tenantId, job.id).subscribe({
      next: () => {
        this.retryingId.set(null);
        this.actionNotice.set('Publish job re-queued.');
        this.refreshJobs();
        this.refreshCalendar();
      },
      error: (err: unknown) => {
        this.retryingId.set(null);
        this.jobsError.set(apiErrorMessage(err));
      },
    });
  }

  localTime(utcIso: string): string {
    const tz = this.tenant()?.timezone ?? 'UTC';
    return formatLocalDateTimeWithZone(utcIso, tz);
  }

  describeError(code: string | null): string {
    return describePublishError(code) ?? '';
  }

  hasCollision(entry: CalendarEntry): boolean {
    if (entry.content_status === 'cancelled') {
      return false;
    }
    const minuteKey = entry.scheduled_utc.slice(0, 16);
    return this.entries().some(
      (other) =>
        other.id !== entry.id &&
        other.content_status !== 'cancelled' &&
        other.channel === entry.channel &&
        other.scheduled_utc.slice(0, 16) === minuteKey,
    );
  }
}
