import { Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { AutomationService } from '../../core/automations/automation.service';
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_LABELS,
  Automation,
  AutomationTrigger,
} from '../../core/automations/automation.models';
import { WhatsAppTemplateService } from '../../core/automations/whatsapp-template.service';
import { WhatsAppTemplate } from '../../core/automations/whatsapp-template.models';
import { MessageService } from '../../core/automations/message.service';
import { MessageDelivery } from '../../core/automations/message.models';
import { LEAD_ALL_STATUSES } from '../../core/leads/lead.models';
import { WhatsAppCampaignsComponent } from './whatsapp-campaigns.component';
import { WhatsAppConfigComponent } from './whatsapp-config.component';
import { WhatsAppConsentComponent } from './whatsapp-consent.component';
import { WhatsAppUsageComponent } from './whatsapp-usage.component';
import { WhatsAppWebhookLogsComponent } from './whatsapp-webhook-logs.component';

type AutomationsTab = 'rules' | 'campaigns' | 'consent' | 'activity' | 'usage' | 'setup';

const TABS: { id: AutomationsTab; label: string }[] = [
  { id: 'rules', label: 'Rules' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'consent', label: 'Contacts & consent' },
  { id: 'activity', label: 'Activity' },
  { id: 'usage', label: 'Usage' },
  { id: 'setup', label: 'Setup' },
];
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

/**
 * `/app/:tenantId/automations` — blueprint §02 M15, §10.4. Three sections:
 *
 * 1. Automations list/create (`GET/POST /tenants/{t}/automations`) — gated
 *    by the `lead.manage` permission (owner/admin/editor) for create, same
 *    as leads; list is open to any active member.
 * 2. WhatsApp templates (`GET /tenants/{t}/whatsapp/templates`) — **read
 *    only**, no create/update endpoint exists. Every row is badged
 *    `MOCK_PROVIDER` (blueprint §09 "Integration simulation requires
 *    visible MOCK_PROVIDER badge") because there is no real WABA template
 *    review reachable from this codebase.
 * 3. Messages log (`GET /tenants/{t}/messages`) — delivery status + cost,
 *    with cost always labelled simulated/mock (blueprint §07 "never assume
 *    a fixed message pricing" — the backend's `cost` is provider-reported
 *    by the mock adapter, never a hardcoded constant, but it is still not
 *    a real charge).
 */
@Component({
  selector: 'app-automations',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
    SortHeaderComponent,
    TableToolbarComponent,
    WhatsAppCampaignsComponent,
    WhatsAppConfigComponent,
    WhatsAppConsentComponent,
    WhatsAppUsageComponent,
    WhatsAppWebhookLogsComponent,
  ],
  template: `
    <section class="automations">
      <app-page-header
        eyebrow="WhatsApp &amp; Customer Communication"
        eyebrowLabel="Workspace"
        title="Automations &amp; WhatsApp"
        subtitle="Trigger WhatsApp templates on lead events and review delivery status."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <nav class="tabs" role="tablist" aria-label="WhatsApp sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
          }
        </nav>

        @if (tab() === 'rules') {
        <section class="block">
          <h2>Automations</h2>
          <ui-table-toolbar
            placeholder="Search automations…"
            [searchTerm]="autoSearch()"
            (searchChange)="autoSearch.set($event); automationsPage.set(1)"
            [data]="filteredAutomations()"
            [columns]="autoExportColumns"
            filename="automations"
            [loading]="automationsLoading()"
            (refresh)="refreshAutomations()"
          />
          @if (automationsLoading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (automationsError()) {
            <p class="form-error" role="alert">{{ automationsError() }}</p>
          } @else if (automations().length === 0) {
            <app-empty-state icon="integrations" title="No automations yet" message="Automations fire a WhatsApp template when a lead event occurs." />
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th><ui-sort-header label="Trigger" [active]="autoSortCol() === 'trigger'" [direction]="autoSortDir()" (sort)="toggleAutoSort('trigger')" /></th>
                  <th><ui-sort-header label="Template" [active]="autoSortCol() === 'template'" [direction]="autoSortDir()" (sort)="toggleAutoSort('template')" /></th>
                  <th>Rule</th>
                  <th><ui-sort-header label="Enabled" [active]="autoSortCol() === 'enabled'" [direction]="autoSortDir()" (sort)="toggleAutoSort('enabled')" /></th>
                  <th><ui-sort-header label="Created" [active]="autoSortCol() === 'created_at'" [direction]="autoSortDir()" (sort)="toggleAutoSort('created_at')" /></th>
                  @if (canManage()) {
                    <th>Actions</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (automation of pagedAutomations(); track automation.id) {
                  <tr>
                    <td>
                      {{ triggerShortLabel(automation.trigger_code) }}
                      @if (automation.trigger_code === 'lead.owner_alert') {
                        <span class="meta">(stored only — never fires)</span>
                      }
                    </td>
                    <td>{{ templateLabel(automation.template_id) }}</td>
                    <td class="meta">{{ ruleSummary(automation) }}</td>
                    <td>
                      <span class="badge badge--dot" [class]="automation.enabled ? 'badge--success' : 'badge--neutral'">{{ automation.enabled ? 'on' : 'off' }}</span>
                    </td>
                    <td class="meta">{{ automation.created_at }}</td>
                    @if (canManage()) {
                      <td class="row-actions">
                        <button type="button" (click)="toggleAutomation(automation)" [disabled]="busyAutomationId() === automation.id">{{ automation.enabled ? 'Turn off' : 'Turn on' }}</button>
                        <button type="button" class="btn-danger action-icon-btn" (click)="deleteAutomation(automation)" [disabled]="busyAutomationId() === automation.id" title="Delete automation" aria-label="Delete automation">
                          <ui-icon name="trash" [size]="14" />
                          <span class="sr-only">Delete</span>
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            <app-pagination
              [totalItems]="automations().length"
              [currentPage]="automationsPage()"
              [pageSize]="automationsPageSize()"
              (pageChange)="automationsPage.set($event)"
              (pageSizeChange)="automationsPageSize.set($event)"
            />
          }

          @if (automationActionError()) {
            <p class="form-error" role="alert">{{ automationActionError() }}</p>
          }

          @if (canManage()) {
            <h3>New automation</h3>
            <form [formGroup]="automationForm" (ngSubmit)="submitAutomation()" novalidate>
              <label>
                Trigger
                <select formControlName="triggerCode">
                  @for (trigger of triggerOptions; track trigger) {
                    <option [value]="trigger">{{ triggerLabel(trigger) }}</option>
                  }
                </select>
              </label>
              @if (automationFieldError('trigger_code')) {
                <p class="field-error">{{ automationFieldError('trigger_code') }}</p>
              }

              <label>
                Template
                <select formControlName="templateId">
                  <option value="">(none)</option>
                  @for (template of approvedTemplates(); track template.id) {
                    <option [value]="template.id">{{ template.external_template_id }} ({{ template.language }})</option>
                  }
                </select>
              </label>
              @if (automationFieldError('template_id')) {
                <p class="field-error">{{ automationFieldError('template_id') }}</p>
              }

              @if (automationForm.controls.triggerCode.value === 'lead.follow_up') {
                <label>
                  Send after (hours)
                  <input type="number" min="1" max="720" formControlName="delayHours" />
                </label>
              }
              @if (automationForm.controls.triggerCode.value === 'lead.status_changed') {
                <label>
                  Only when moved to (optional)
                  <select formControlName="toStatus">
                    <option value="">Any stage</option>
                    @for (status of leadStatuses; track status) {
                      <option [value]="status">{{ status }}</option>
                    }
                  </select>
                </label>
              }
              @if (automationFieldError('rules_json')) {
                <p class="field-error">{{ automationFieldError('rules_json') }}</p>
              }

              <label class="checkbox-label">
                <input type="checkbox" formControlName="enabled" />
                Enabled
              </label>

              @if (automationErrorMessage() && !hasAutomationFieldErrors()) {
                <p class="form-error" role="alert">{{ automationErrorMessage() }}</p>
              }

              <button type="submit" [disabled]="automationForm.invalid || creatingAutomation()">
                {{ creatingAutomation() ? 'Creating…' : 'Create automation' }}
              </button>
            </form>
          } @else {
            <p class="owner-only-note">
              Only an owner, admin or editor may create automations (enforced server-side regardless of this message).
            </p>
          }
        </section>

        <section class="block">
          <h2>WhatsApp templates <span class="mock-badge">MOCK_PROVIDER</span></h2>
          <p class="meta">
            Read-only. These 3 templates are deterministic mock-approved seeds — there is no real WABA template review
            reachable from this environment (blueprint §09).
          </p>
          @if (templatesLoading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (templatesError()) {
            <p class="form-error" role="alert">{{ templatesError() }}</p>
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Category</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>Variables</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (template of templates(); track template.id) {
                  <tr>
                    <td>{{ template.external_template_id }}</td>
                    <td>{{ template.category }}</td>
                    <td>{{ template.language }}</td>
                    <td>{{ template.status }}</td>
                    <td>{{ template.variables.join(', ') || '—' }}</td>
                    <td><span class="mock-badge">MOCK_PROVIDER</span></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        }

        @if (tab() === 'activity') {
        <section class="block">
          <h2>Messages log</h2>
          <ui-table-toolbar
            placeholder="Search messages…"
            [searchTerm]="msgSearch()"
            (searchChange)="msgSearch.set($event); messagesPage.set(1)"
            [data]="filteredMessages()"
            [columns]="msgExportColumns"
            filename="whatsapp_messages"
            [loading]="messagesLoading()"
            (refresh)="refreshMessages()"
          >
            <label filters class="status-filter">
              Status
              <select [value]="messageStatusFilter()" (change)="onMessageStatusFilterChange($event)">
                <option value="">All</option>
                <option value="queued">queued</option>
                <option value="sent">sent</option>
                <option value="delivered">delivered</option>
                <option value="failed">failed</option>
                <option value="read">read</option>
              </select>
            </label>
          </ui-table-toolbar>
          @if (messagesLoading()) {
            <app-skeleton-loader [rows]="4" />
          } @else if (messagesError()) {
            <p class="form-error" role="alert">{{ messagesError() }}</p>
          } @else if (messages().length === 0) {
            <app-empty-state icon="support" title="No message deliveries yet" message="WhatsApp sends triggered by automations will appear here." />
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th><ui-sort-header label="Lead" [active]="msgSortCol() === 'lead_id'" [direction]="msgSortDir()" (sort)="toggleMsgSort('lead_id')" /></th>
                  <th><ui-sort-header label="Status" [active]="msgSortCol() === 'status'" [direction]="msgSortDir()" (sort)="toggleMsgSort('status')" /></th>
                  <th><ui-sort-header label="Cost (simulated)" [active]="msgSortCol() === 'cost'" [direction]="msgSortDir()" (sort)="toggleMsgSort('cost')" /></th>
                  <th><ui-sort-header label="Sent at" [active]="msgSortCol() === 'sent_at'" [direction]="msgSortDir()" (sort)="toggleMsgSort('sent_at')" /></th>
                </tr>
              </thead>
              <tbody>
                @for (message of pagedMessages(); track message.id) {
                  <tr>
                    <td>{{ message.lead_id || '—' }}</td>
                    <td><span class="badge badge--dot" [class]="messageStatusBadgeClass(message.status)">{{ message.status }}</span></td>
                    <td>{{ message.cost !== null ? '₹' + message.cost + ' (mock, not a real charge)' : '—' }}</td>
                    <td class="meta">{{ message.sent_at || 'not sent yet' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <app-pagination
              [totalItems]="messages().length"
              [currentPage]="messagesPage()"
              [pageSize]="messagesPageSize()"
              (pageChange)="messagesPage.set($event)"
              (pageSizeChange)="messagesPageSize.set($event)"
            />
          }
        </section>
        <app-whatsapp-webhook-logs />
        }

        @if (tab() === 'campaigns') {
          <app-whatsapp-campaigns [canManage]="canManage()" [templates]="approvedTemplates()" />
        }
        @if (tab() === 'consent') {
          <app-whatsapp-consent />
        }
        @if (tab() === 'usage') {
          <app-whatsapp-usage />
        }
        @if (tab() === 'setup') {
          <app-whatsapp-config />
        }
      }
    </section>
  `,
  styles: [
    `
      .automations {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .block {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .block h2 {
        margin: 0;
        font-size: var(--text-lg);
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 10px;
      }
      .tabs button {
        border-radius: 999px;
        padding: 0.4rem 0.95rem;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
      }
      .tabs button.active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .row-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .mock-badge {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        background: #333;
        color: #fff;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
        margin-bottom: 1rem;
      }
      .data-table th,
      .data-table td {
        text-align: center;
        padding: 0.5rem;
        border-bottom: 1px solid #eee;
      }
      .filter-row {
        display: flex;
        align-items: end;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .filter-row label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
        font-size: 0.875rem;
      }
      .meta {
        font-size: 0.8rem;
        color: #666;
      }
      .empty {
        color: #666;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        max-width: 460px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: var(--font-semibold);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .checkbox-label {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text);
      }
      select,
      input {
        padding: 0.45rem 0.65rem;
        font: inherit;
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .owner-only-note {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      form button[type='submit'] {
        align-self: flex-start;
      }
    `,
  ],
})
export class AutomationsComponent implements OnInit {
  readonly triggerOptions = AUTOMATION_TRIGGERS;
  readonly leadStatuses = LEAD_ALL_STATUSES;
  readonly tabs = TABS;
  readonly tab = signal<AutomationsTab>('rules');
  readonly busyAutomationId = signal<string | null>(null);
  readonly automationActionError = signal<string | null>(null);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canManage = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly automations = signal<Automation[]>([]);
  readonly automationsPage = signal(1);
  readonly automationsPageSize = signal(10);
  readonly autoSortCol = signal<string>('');
  readonly autoSortDir = signal<SortDirection>('asc');

  toggleAutoSort(col: string): void {
    if (this.autoSortCol() === col) {
      this.autoSortDir.set(this.autoSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.autoSortCol.set(col);
      this.autoSortDir.set('asc');
    }
  }

  readonly sortedAutomations = computed(() =>
    sortTableRows(this.automations(), this.autoSortCol(), this.autoSortDir(), (a, col) => {
      switch (col) {
        case 'trigger':
          return this.triggerShortLabel(a.trigger_code);
        case 'template':
          return this.templateLabel(a.template_id);
        case 'enabled':
          return a.enabled;
        case 'created_at':
          return a.created_at;
        default:
          return '';
      }
    }),
  );

  readonly autoSearch = signal('');
  readonly autoExportColumns: TableExportColumn[] = [
    { key: 'trigger_code', label: 'Trigger' },
    { key: 'template_id', label: 'Template' },
    { key: 'enabled', label: 'Enabled' },
    { key: 'created_at', label: 'Created' },
  ];
  readonly filteredAutomations = computed(() => {
    const q = this.autoSearch().trim().toLowerCase();
    const list = this.sortedAutomations();
    if (!q) return list;
    return list.filter(
      (a) =>
        this.triggerShortLabel(a.trigger_code).toLowerCase().includes(q) ||
        this.templateLabel(a.template_id).toLowerCase().includes(q),
    );
  });
  readonly pagedAutomations = computed(() => paginateItems(this.filteredAutomations(), this.automationsPage(), this.automationsPageSize()));
  readonly automationsLoading = signal(false);
  readonly automationsError = signal<string | null>(null);

  readonly templates = signal<WhatsAppTemplate[]>([]);
  readonly templatesLoading = signal(false);
  readonly templatesError = signal<string | null>(null);
  readonly approvedTemplates = computed(() => this.templates().filter((t) => t.status === 'approved'));

  readonly messages = signal<MessageDelivery[]>([]);
  readonly messagesPage = signal(1);
  readonly messagesPageSize = signal(10);
  readonly msgSortCol = signal<string>('');
  readonly msgSortDir = signal<SortDirection>('asc');

  toggleMsgSort(col: string): void {
    if (this.msgSortCol() === col) {
      this.msgSortDir.set(this.msgSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.msgSortCol.set(col);
      this.msgSortDir.set('asc');
    }
  }

  readonly sortedMessages = computed(() =>
    sortTableRows(this.messages(), this.msgSortCol(), this.msgSortDir(), (m, col) => {
      switch (col) {
        case 'lead_id':
          return m.lead_id ?? '';
        case 'status':
          return m.status;
        case 'cost':
          return m.cost ?? 0;
        case 'sent_at':
          return m.sent_at ?? '';
        default:
          return '';
      }
    }),
  );

  readonly msgSearch = signal('');
  readonly msgExportColumns: TableExportColumn[] = [
    { key: 'lead_id', label: 'Lead' },
    { key: 'status', label: 'Status' },
    { key: 'cost', label: 'Cost' },
    { key: 'sent_at', label: 'Sent' },
  ];
  readonly filteredMessages = computed(() => {
    const q = this.msgSearch().trim().toLowerCase();
    const list = this.sortedMessages();
    if (!q) return list;
    return list.filter((m) => (m.lead_id ?? '').toLowerCase().includes(q) || m.status.toLowerCase().includes(q));
  });
  readonly pagedMessages = computed(() => paginateItems(this.filteredMessages(), this.messagesPage(), this.messagesPageSize()));
  readonly messagesLoading = signal(false);
  readonly messagesError = signal<string | null>(null);
  readonly messageStatusFilter = signal('');

  private readonly fb = new FormBuilder();
  readonly automationForm = this.fb.nonNullable.group({
    triggerCode: ['lead.created' as AutomationTrigger, [Validators.required]],
    templateId: [''],
    enabled: [true],
    delayHours: [24],
    toStatus: [''],
  });

  readonly creatingAutomation = signal(false);
  readonly automationErrorMessage = signal<string | null>(null);
  readonly automationFieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly automationService: AutomationService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.refreshAutomations();
    this.refreshTemplates();
    this.refreshMessages();
  }

  /** Maps a message delivery status to the shared `.badge--*` semantic modifier (styles.scss design tokens). */
  messageStatusBadgeClass(status: string): string {
    switch (status) {
      case 'delivered':
      case 'read':
        return 'badge--success';
      case 'failed':
        return 'badge--danger';
      case 'sent':
        return 'badge--info';
      default:
        return 'badge--warning';
    }
  }

  triggerShortLabel(trigger: AutomationTrigger): string {
    return AUTOMATION_TRIGGER_LABELS[trigger].split(' — ')[0];
  }

  ruleSummary(automation: Automation): string {
    const rules = automation.rules_json;
    if (automation.trigger_code === 'lead.follow_up') {
      return `after ${(rules?.['delay_hours'] as number | undefined) ?? 24} h`;
    }
    if (automation.trigger_code === 'lead.status_changed') {
      return rules?.['to_status'] ? `to "${rules['to_status']}"` : 'any stage';
    }
    return '—';
  }

  toggleAutomation(automation: Automation): void {
    this.runAutomationAction(automation, (tenantId) =>
      this.automationService.update(tenantId, automation.id, { enabled: !automation.enabled }),
    );
  }

  deleteAutomation(automation: Automation): void {
    if (!confirmDelete('this automation rule')) {
      return;
    }
    this.runAutomationAction(automation, (tenantId) => this.automationService.delete(tenantId, automation.id));
  }

  private runAutomationAction(
    automation: Automation,
    call: (tenantId: string) => Observable<unknown>,
  ): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.busyAutomationId()) {
      return;
    }
    this.busyAutomationId.set(automation.id);
    this.automationActionError.set(null);
    call(tenantId).subscribe({
      next: () => {
        this.busyAutomationId.set(null);
        this.refreshAutomations();
      },
      error: (err: unknown) => {
        this.busyAutomationId.set(null);
        this.automationActionError.set(apiErrorMessage(err));
      },
    });
  }

  triggerLabel(trigger: AutomationTrigger): string {
    return AUTOMATION_TRIGGER_LABELS[trigger];
  }

  templateLabel(templateId: string | null): string {
    if (!templateId) {
      return '—';
    }
    const match = this.templates().find((t) => t.id === templateId);
    return match ? match.external_template_id : templateId;
  }

  refreshAutomations(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.automationsLoading.set(true);
    this.automationsError.set(null);
    this.automationService.list(tenantId).subscribe({
      next: (automations) => {
        this.automationsLoading.set(false);
        this.automations.set(automations);
      },
      error: (err: unknown) => {
        this.automationsLoading.set(false);
        this.automationsError.set(apiErrorMessage(err));
      },
    });
  }

  refreshTemplates(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.templatesLoading.set(true);
    this.templatesError.set(null);
    this.templateService.list(tenantId).subscribe({
      next: (templates) => {
        this.templatesLoading.set(false);
        this.templates.set(templates);
      },
      error: (err: unknown) => {
        this.templatesLoading.set(false);
        this.templatesError.set(apiErrorMessage(err));
      },
    });
  }

  onMessageStatusFilterChange(event: Event): void {
    this.messageStatusFilter.set((event.target as HTMLSelectElement).value);
    this.refreshMessages();
  }

  refreshMessages(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.messagesLoading.set(true);
    this.messagesError.set(null);
    const status = this.messageStatusFilter() || undefined;
    this.messageService.list(tenantId, { status }).subscribe({
      next: (messages) => {
        this.messagesLoading.set(false);
        this.messages.set(messages);
      },
      error: (err: unknown) => {
        this.messagesLoading.set(false);
        this.messagesError.set(apiErrorMessage(err));
      },
    });
  }

  automationFieldError(field: string): string | null {
    return this.automationFieldErrors()?.[field] ?? null;
  }

  hasAutomationFieldErrors(): boolean {
    return this.automationFieldErrors() !== null;
  }

  submitAutomation(): void {
    const tenantId = this.tenantId();
    if (this.automationForm.invalid || this.creatingAutomation() || !tenantId) {
      return;
    }
    this.creatingAutomation.set(true);
    this.automationErrorMessage.set(null);
    this.automationFieldErrors.set(null);

    const { triggerCode, templateId, enabled, delayHours, toStatus } = this.automationForm.getRawValue();
    let rules: Record<string, unknown> | undefined;
    if (triggerCode === 'lead.follow_up') {
      rules = { delay_hours: Number(delayHours) };
    } else if (triggerCode === 'lead.status_changed' && toStatus) {
      rules = { to_status: toStatus };
    }
    this.automationService
      .create(tenantId, { trigger_code: triggerCode, template_id: templateId || undefined, enabled, rules_json: rules })
      .subscribe({
        next: () => {
          this.creatingAutomation.set(false);
          this.automationForm.reset({ triggerCode: 'lead.created', templateId: '', enabled: true, delayHours: 24, toStatus: '' });
          this.refreshAutomations();
        },
        error: (err: unknown) => {
          this.creatingAutomation.set(false);
          this.automationErrorMessage.set(apiErrorMessage(err));
          this.automationFieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
