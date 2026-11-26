import { DatePipe } from '@angular/common';
import { Component, computed, inject, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Campaign, CampaignChannel, CampaignDetail, CampaignReport, ChannelRule } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LocationSummary } from '../../core/locations/location.models';
import { localTodayDateString } from '../../core/utils/date.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';

const CHANNELS: CampaignChannel[] = ['google', 'meta_page', 'meta_instagram'];
const STATUS_CLASS: Record<string, string> = {
  draft: 'badge--neutral',
  pending_approval: 'badge--warning',
  approved: 'badge--info',
  scheduled: 'badge--info',
  publishing: 'badge--info',
  published: 'badge--success',
  failed: 'badge--danger',
  cancelled: 'badge--neutral',
};

/**
 * Campaigns (BW-064, BW-085..087, BW-090): a campaign groups one content
 * DRAFT per channel, each with its own caption checked against that channel's
 * published limit. The drafts then go through the normal approve -> schedule
 * -> publish steps in Content/Calendar, so nothing is published from here.
 * The report shows pipeline and publishing outcomes only; reach/likes/clicks
 * are not available from the providers, and the API says so.
 */
@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [DatePipe, RouterLink, ReactiveFormsModule, SkeletonLoaderComponent, EmptyStateComponent, IconComponent, PaginationComponent],
  template: `
    <section class="layout">
      <div class="left">
        @if (canEdit) {
          <form class="card form" [formGroup]="createForm" (ngSubmit)="saveCampaign()" novalidate data-testid="campaign-form">
            <div class="form-head">
              <h3>{{ editingId() ? 'Edit campaign' : 'New campaign' }}</h3>
              @if (editingId()) {
                <button type="button" class="btn-secondary btn-sm" (click)="cancelEdit()">Cancel</button>
              }
            </div>
            <label>Name<input type="text" formControlName="name" maxlength="120" placeholder="e.g. Weekend Thali Promo" />
              @if (cerr('name')) { <span class="form-error" role="alert">{{ cerr('name') }}</span> }
            </label>
            <label>Objective (optional)<input type="text" formControlName="objective" maxlength="255" placeholder="e.g. Drive weekend dine-in bookings" /></label>
            <div class="row">
              <label>Starts<input type="date" formControlName="starts_on" [attr.min]="editingId() ? null : minToday" />
                @if (cerr('starts_on')) { <span class="form-error" role="alert">{{ cerr('starts_on') }}</span> }
              </label>
              <label>Ends<input type="date" formControlName="ends_on" [attr.min]="createForm.controls.starts_on.value || (editingId() ? null : minToday)" />
                @if (cerr('ends_on')) { <span class="form-error" role="alert">{{ cerr('ends_on') }}</span> }
              </label>
            </div>
            @if (createError()) { <p class="form-error" role="alert">{{ createError() }}</p> }
            <button type="submit" class="btn-primary btn-sm" [disabled]="busy() || createForm.invalid">
              <ui-icon [name]="editingId() ? 'approvals' : 'plus'" [size]="14" />
              <span>{{ editingId() ? 'Save changes' : 'Create campaign' }}</span>
            </button>
          </form>
        }

        @if (loading()) {
          <app-skeleton-loader [rows]="3" />
        } @else if (loadError()) {
          <p class="form-error" role="alert">{{ loadError() }}</p>
        } @else if (campaigns().length === 0) {
          <app-empty-state icon="campaigns" title="No campaigns yet" message="Create one, then compose one draft per channel." />
        } @else {
          <ul class="list" data-testid="campaign-list">
            @for (c of pagedCampaigns(); track c.id) {
              <li [class.selected]="c.id === selectedId()">
                <button type="button" class="row-btn" (click)="select(c.id)">
                  <strong class="camp-name">{{ c.name }}</strong>
                  <span class="meta">
                    {{ c.starts_on ? (c.starts_on | date: 'd MMM') : 'No start' }} – {{ c.ends_on ? (c.ends_on | date: 'd MMM y') : 'open' }}
                  </span>
                  <span class="camp-stats">
                    {{ c.item_count }} post{{ c.item_count === 1 ? '' : 's' }} · {{ c.published_count }} published
                  </span>
                </button>
                @if (canEdit) {
                  <div class="list-item-actions">
                    <button
                      type="button"
                      class="btn-secondary action-icon-btn"
                      data-testid="edit-campaign"
                      title="Edit campaign"
                      [attr.aria-label]="'Edit ' + c.name"
                      [disabled]="busy()"
                      (click)="startEdit(c, $event)"
                    >
                      <ui-icon name="edit" [size]="14" />
                      <span class="sr-only">Edit</span>
                    </button>
                    <button
                      type="button"
                      class="btn-danger action-icon-btn"
                      data-testid="delete-campaign"
                      title="Delete campaign"
                      [attr.aria-label]="'Delete ' + c.name"
                      [disabled]="busy()"
                      (click)="archiveById(c.id, $event)"
                    >
                      <ui-icon name="trash" [size]="14" />
                      <span class="sr-only">Delete</span>
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
          <app-pagination
            [totalItems]="campaigns().length"
            [currentPage]="page()"
            [pageSize]="pageSize()"
            (pageChange)="page.set($event)"
            (pageSizeChange)="pageSize.set($event)"
          />
        }
      </div>

      <div class="right">
        @if (detail(); as d) {
          <article class="card detail" data-testid="campaign-detail">
            <header>
              <h3>{{ d.name }}</h3>
              @if (canEdit) {
                <div class="detail-header-actions">
                  <button
                    type="button"
                    class="btn-secondary action-icon-btn"
                    title="Edit campaign"
                    aria-label="Edit campaign"
                    [disabled]="busy()"
                    (click)="startEdit(d)"
                  >
                    <ui-icon name="edit" [size]="14" />
                    <span class="sr-only">Edit</span>
                  </button>
                  <button
                    type="button"
                    class="btn-danger action-icon-btn"
                    (click)="archive(d)"
                    [disabled]="busy()"
                    title="Delete campaign"
                    aria-label="Delete campaign"
                  >
                    <ui-icon name="trash" [size]="14" />
                    <span class="sr-only">Delete</span>
                  </button>
                </div>
              }
            </header>
            @if (d.objective) { <p class="meta">{{ d.objective }}</p> }
            @if (actionError()) { <p class="form-error" role="alert">{{ actionError() }}</p> }
            @if (notice()) { <p class="success" role="status">{{ notice() }}</p> }

            @if (d.items.length === 0) {
              <p class="meta">No posts yet. Compose drafts for one or more channels below.</p>
            } @else {
              <table class="data-table">
                <thead><tr><th>Channel</th><th>Status</th><th>Scheduled</th><th>Publish job</th></tr></thead>
                <tbody>
                  @for (i of d.items; track i.item_id) {
                    <tr>
                      <td><strong>{{ rule(d, i.intended_channel)?.label }}</strong><p class="snippet">{{ i.body }}</p></td>
                      <td><span class="badge badge--dot" [class]="statusClass(i.content_status)">{{ i.content_status }}</span></td>
                      <td class="meta">{{ i.scheduled_utc ? (i.scheduled_utc | date: 'medium') : '—' }}</td>
                      <td class="meta">
                        @if (i.publish_job; as j) {
                          {{ j.status }} · {{ j.attempts }} attempt{{ j.attempts === 1 ? '' : 's' }}
                          @if (j.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }
                          @if (j.last_error_code) { <br />{{ j.last_error_code }} }
                        } @else { Not scheduled }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <p class="meta">Approve and schedule each post from <a [routerLink]="['/app', tenantId, 'content']">Content</a> and <a [routerLink]="['/app', tenantId, 'calendar']">Calendar</a>.</p>
            }

            @if (canEdit) {
              <form class="compose" [formGroup]="composeForm" (ngSubmit)="compose(d)" novalidate>
                <h4>Compose for channels</h4>
                <label>Location
                  <select formControlName="location_id">
                    @for (l of locations; track l.id) { <option [value]="l.id">{{ l.name }}</option> }
                  </select>
                </label>
                <label>Caption
                  <textarea rows="4" formControlName="body" placeholder="Write once; you can tailor each channel below."></textarea>
                </label>
                <fieldset>
                  <legend>Channels</legend>
                  @for (ch of channels; track ch) {
                    <div class="chan">
                      <label class="check">
                        <input type="checkbox" [checked]="selectedChannels().includes(ch)" (change)="toggleChannel(ch)" />
                        {{ rule(d, ch)?.label }}
                      </label>
                      @if (selectedChannels().includes(ch)) {
                        <textarea rows="2" [value]="variants()[ch] ?? ''" (input)="setVariant(ch, $any($event.target).value)" placeholder="Optional: caption just for this channel"></textarea>
                        <span class="meta" [class.over]="over(d, ch)">
                          {{ length(ch) }} / {{ rule(d, ch)?.max_chars }} characters — {{ rule(d, ch)?.note }}
                        </span>
                        @if (ferr('variants.' + ch)) { <span class="form-error" role="alert">{{ ferr('variants.' + ch) }}</span> }
                      }
                    </div>
                  }
                  @if (ferr('channels')) { <span class="form-error" role="alert">{{ ferr('channels') }}</span> }
                </fieldset>
                <button type="submit" [disabled]="busy() || selectedChannels().length === 0">Create drafts</button>
              </form>
            }

            <h4>Campaign report</h4>
            @if (report(); as r) {
              <div class="stats">
                <div><span class="n">{{ r.items_total }}</span><span class="l">posts</span></div>
                <div><span class="n">{{ r.publishing.succeeded }}</span><span class="l">published</span></div>
                <div><span class="n">{{ r.publishing.in_flight }}</span><span class="l">in progress</span></div>
                <div><span class="n">{{ r.publishing.failed }}</span><span class="l">failed</span></div>
                <div><span class="n">{{ r.publishing.success_rate_pct === null ? '—' : r.publishing.success_rate_pct + '%' }}</span><span class="l">success rate</span></div>
              </div>
              @if (r.channels.length > 0) {
                <table class="data-table">
                  <thead><tr><th>Channel</th><th>Drafts</th><th>Pending</th><th>Approved</th><th>Scheduled</th><th>Published</th><th>Failed</th></tr></thead>
                  <tbody>
                    @for (c of r.channels; track c.channel) {
                      <tr><td>{{ c.label }}</td><td>{{ c.drafts }}</td><td>{{ c.pending_approval }}</td><td>{{ c.approved }}</td><td>{{ c.scheduled }}</td><td>{{ c.published }}</td><td>{{ c.failed }}</td></tr>
                    }
                  </tbody>
                </table>
              }
              <p class="meta">{{ r.engagement.reason }}</p>
              @if (r.mock_provider) { <span class="badge badge--mock">MOCK_PROVIDER</span> }
            }
          </article>
        } @else if (detailLoading()) {
          <app-skeleton-loader [rows]="4" />
        } @else {
          <div class="card empty-detail-card">
            <app-empty-state icon="campaigns" title="Select a campaign" message="Choose one on the left to see its posts and report." />
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .layout { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 1rem; align-items: start; }
      .left, .right { min-width: 0; }
      @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
      .form, .detail { padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
      label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.82rem; flex: 1; }
      input, select, textarea { padding: 0.45rem; font: inherit; font-weight: 400; }
      .row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
      .form-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
      .list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
      .list li { background: var(--color-surface, #fff); border: 1px solid var(--color-border); border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.65rem 0.25rem 0.25rem; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
      .list li:hover { border-color: var(--color-primary); }
      .list li.selected { border-color: var(--color-primary); background: var(--color-primary-light); }
      .row-btn { flex: 1; min-width: 0; text-align: left; background: none; border: none; padding: 0.5rem 0.6rem; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 0.2rem; }
      .row-btn:hover:not(:disabled) { background: transparent; color: var(--color-text); }
      .camp-name { font-size: 0.92rem; font-weight: 700; color: var(--color-text); line-height: 1.25; }
      .camp-stats { font-size: 0.76rem; color: var(--color-text-muted); font-weight: 500; }
      .empty-detail-card { padding: 2rem 1rem; }
      .list-item-actions, .detail-header-actions { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
      .meta.over { color: #b00020; font-weight: 600; }
      .snippet { margin: 0.2rem 0 0; font-size: 0.85rem; max-width: 34rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
      h3, h4 { margin: 0; }
      fieldset { border: 1px solid var(--color-border); border-radius: 10px; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.6rem; }
      .chan { display: flex; flex-direction: column; gap: 0.25rem; }
      .check { flex-direction: row; align-items: center; gap: 0.5rem; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.5rem; }
      .stats div { background: var(--color-surface-muted, #f3f6f8); border-radius: 10px; padding: 0.6rem; display: flex; flex-direction: column; }
      .stats .n { font-size: 1.4rem; font-weight: 700; }
      .stats .l { font-size: 0.78rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; font-weight: 400; }
      .success { color: #1b6b3a; }
    `,
  ],
})
export class CampaignListComponent implements OnChanges {
  readonly minToday = localTodayDateString();
  @Input({ required: true }) tenantId = '';
  @Input() canEdit = false;
  @Input() locations: LocationSummary[] = [];

  readonly channels = CHANNELS;
  readonly campaigns = signal<Campaign[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pagedCampaigns = computed(() => paginateItems(this.campaigns(), this.page(), this.pageSize()));
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly detail = signal<CampaignDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly report = signal<CampaignReport | null>(null);
  readonly busy = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createFieldErrors = signal<Record<string, string> | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly composeErrors = signal<Record<string, string> | null>(null);
  readonly notice = signal<string | null>(null);
  readonly selectedChannels = signal<CampaignChannel[]>([]);
  readonly variants = signal<Partial<Record<CampaignChannel, string>>>({});

  private readonly fb = inject(FormBuilder);

  readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    objective: [''],
    starts_on: [''],
    ends_on: [''],
  });
  readonly composeForm = this.fb.nonNullable.group({ location_id: [''], body: [''] });

  constructor(
    private readonly api: CampaignService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] && this.tenantId) {
      this.reload();
    }
    if (changes['locations'] && this.locations.length && !this.composeForm.controls.location_id.value) {
      this.composeForm.controls.location_id.setValue(this.locations[0].id);
    }
  }

  cerr(f: string): string | null {
    return this.createFieldErrors()?.[f] ?? null;
  }

  ferr(f: string): string | null {
    return this.composeErrors()?.[f] ?? null;
  }

  statusClass(s: string): string {
    return STATUS_CLASS[s] ?? 'badge--neutral';
  }

  rule(d: CampaignDetail, ch: CampaignChannel): ChannelRule | undefined {
    return d.channel_rules[ch];
  }

  length(ch: CampaignChannel): number {
    return (this.variants()[ch] ?? this.composeForm.controls.body.value).length;
  }

  over(d: CampaignDetail, ch: CampaignChannel): boolean {
    return this.length(ch) > (d.channel_rules[ch]?.max_chars ?? Infinity);
  }

  toggleChannel(ch: CampaignChannel): void {
    this.selectedChannels.update((list) => (list.includes(ch) ? list.filter((c) => c !== ch) : [...list, ch]));
  }

  setVariant(ch: CampaignChannel, value: string): void {
    this.variants.update((v) => ({ ...v, [ch]: value }));
  }

  reload(selectId?: string): void {
    this.loading.set(true);
    this.api.list(this.tenantId).subscribe({
      next: (list) => {
        this.campaigns.set(list);
        this.loading.set(false);
        const id = selectId ?? this.selectedId();
        if (id && list.some((c) => c.id === id)) {
          this.select(id);
        }
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.detail.set(null);
    this.detailLoading.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    this.api.get(this.tenantId, id).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.detailLoading.set(false);
      },
      error: (err: unknown) => {
        this.detailLoading.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
    this.api.report(this.tenantId, id).subscribe({ next: (r) => this.report.set(r), error: () => this.report.set(null) });
  }

  startEdit(c: Pick<Campaign, 'id' | 'name' | 'objective' | 'starts_on' | 'ends_on'>, event?: Event): void {
    event?.stopPropagation();
    this.editingId.set(c.id);
    this.createError.set(null);
    this.createFieldErrors.set(null);
    this.createForm.setValue({
      name: c.name,
      objective: c.objective ?? '',
      starts_on: c.starts_on ?? '',
      ends_on: c.ends_on ?? '',
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.createError.set(null);
    this.createFieldErrors.set(null);
    this.createForm.reset({ name: '', objective: '', starts_on: '', ends_on: '' });
  }

  saveCampaign(): void {
    const editId = this.editingId();
    if (!editId) {
      this.create();
      return;
    }
    const v = this.createForm.getRawValue();
    this.busy.set(true);
    this.createError.set(null);
    this.createFieldErrors.set(null);
    this.api
      .update(this.tenantId, editId, {
        name: v.name.trim(),
        objective: v.objective.trim() || null,
        starts_on: v.starts_on || null,
        ends_on: v.ends_on || null,
      })
      .subscribe({
        next: (d) => {
          this.busy.set(false);
          this.cancelEdit();
          this.reload(d.id);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.createFieldErrors.set(apiErrorFields(err));
          this.createError.set(apiErrorFields(err) ? null : apiErrorMessage(err));
        },
      });
  }

  create(): void {
    const v = this.createForm.getRawValue();
    this.busy.set(true);
    this.createError.set(null);
    this.createFieldErrors.set(null);
    this.api
      .create(this.tenantId, { name: v.name.trim(), objective: v.objective.trim() || null, starts_on: v.starts_on || null, ends_on: v.ends_on || null })
      .subscribe({
        next: (d) => {
          this.busy.set(false);
          this.createForm.reset({ name: '', objective: '', starts_on: '', ends_on: '' });
          this.reload(d.id);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.createFieldErrors.set(apiErrorFields(err));
          this.createError.set(apiErrorFields(err) ? null : apiErrorMessage(err));
        },
      });
  }

  compose(d: CampaignDetail): void {
    const v = this.composeForm.getRawValue();
    const variants: Partial<Record<CampaignChannel, string>> = {};
    for (const ch of this.selectedChannels()) {
      const text = (this.variants()[ch] ?? '').trim();
      if (text) {
        variants[ch] = text;
      }
    }
    this.busy.set(true);
    this.composeErrors.set(null);
    this.actionError.set(null);
    this.api
      .compose(this.tenantId, d.id, { location_id: v.location_id, body: v.body.trim(), channels: this.selectedChannels(), variants })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.detail.set(res);
          this.notice.set(`Created ${this.selectedChannels().length} draft(s). Approve and schedule them from Content and Calendar.`);
          this.selectedChannels.set([]);
          this.variants.set({});
          this.composeForm.controls.body.setValue('');
          this.reload(d.id);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.composeErrors.set(apiErrorFields(err));
          this.actionError.set(apiErrorFields(err) ? null : apiErrorMessage(err));
        },
      });
  }

  archiveById(id: string, event?: Event): void {
    event?.stopPropagation();
    this.busy.set(true);
    this.api.archive(this.tenantId, id).subscribe({
      next: () => {
        this.busy.set(false);
        if (this.editingId() === id) {
          this.cancelEdit();
        }
        if (this.selectedId() === id) {
          this.detail.set(null);
          this.report.set(null);
          this.selectedId.set(null);
        }
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  archive(d: CampaignDetail): void {
    this.archiveById(d.id);
  }
}
