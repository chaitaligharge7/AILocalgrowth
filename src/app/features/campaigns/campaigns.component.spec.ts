import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CampaignDetail, CampaignReport } from '../../core/campaigns/campaign.models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { LocationApiService } from '../../core/locations/location.service';
import { PublishingService } from '../../core/publishing/publishing.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { CampaignListComponent } from './campaign-list.component';
import { CampaignMonitorComponent } from './campaign-monitor.component';
import { CampaignPerformanceComponent } from './campaign-performance.component';
import { CampaignsComponent } from './campaigns.component';

const rules = {
  google: { label: 'Google Business Profile post', max_chars: 1500, note: 'Google caps a Business Profile post at 1,500 characters.' },
  meta_page: { label: 'Facebook Page post', max_chars: 63206, note: 'long' },
  meta_instagram: { label: 'Instagram caption', max_chars: 2200, note: 'Instagram captions are capped at 2,200 characters.' },
};

const detail = (o: Partial<CampaignDetail> = {}): CampaignDetail => ({
  id: 'c1', name: 'Diwali push', objective: 'Festive footfall', starts_on: '2026-11-01', ends_on: '2026-11-15', item_count: 1, status_counts: { draft: 1 }, published_count: 0,
  created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', channel_rules: rules as never,
  items: [{ item_id: 'i1', content_id: 'x1', title: 'Diwali push - Instagram caption', body: 'Festive offers! #diwali', location_id: 'l1', intended_channel: 'meta_instagram', content_status: 'draft', scheduled_utc: null, schedule_status: null, scheduled_channel: null, publish_job: null }],
  ...o,
});

const report: CampaignReport = {
  campaign: { id: 'c1', name: 'Diwali push', objective: null, starts_on: null, ends_on: null }, items_total: 1,
  channels: [{ channel: 'meta_instagram', label: 'Instagram caption', items: 1, drafts: 1, pending_approval: 0, approved: 0, scheduled: 0, published: 0, failed: 0, cancelled: 0 }],
  publishing: { succeeded: 0, failed: 0, in_flight: 0, cancelled: 0, not_scheduled: 1, attempts_total: 0, success_rate_pct: null },
  mock_provider: false, engagement: { available: false, reason: 'Reach, likes and clicks are not returned by the connected providers yet, so none are shown.' },
};

describe('CampaignsComponent', () => {
  function setup(role: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CampaignsComponent],
      providers: [
        provideRouter([]),
        { provide: LocationApiService, useValue: { list: () => of([{ id: 'l1', name: 'Glow Salon' }]) } },
        { provide: CampaignService, useValue: { list: () => of([]), report: () => of(report) } },
      ],
    });
    TestBed.inject(CurrentTenantService).select({ id: 't1', caller_role: role } as never);
    const fixture = TestBed.createComponent(CampaignsComponent);
    fixture.detectChanges();
    return fixture;
  }

  const tabs = (f: ReturnType<typeof setup>) => Array.from((f.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim());

  it('shows the audit log tab only to owners and admins', () => {
    expect(tabs(setup('owner'))).toEqual(['Campaigns', 'Campaign calendar', 'Job monitor', 'Performance', 'Audit log']);
    expect(tabs(setup('admin'))).toContain('Audit log');
    expect(tabs(setup('editor'))).not.toContain('Audit log');
    expect(tabs(setup('viewer'))).toEqual(['Campaigns', 'Campaign calendar', 'Job monitor', 'Performance']);
  });

  it('lets only content editors create campaigns', () => {
    expect(setup('editor').componentInstance.canEdit()).toBeTrue();
    expect(setup('analyst').componentInstance.canEdit()).toBeFalse();
  });
});

describe('CampaignListComponent', () => {
  function setup(api: Partial<Record<keyof CampaignService, unknown>>, canEdit = true) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CampaignListComponent], providers: [provideRouter([]), { provide: CampaignService, useValue: api }] });
    const fixture = TestBed.createComponent(CampaignListComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.componentRef.setInput('locations', [{ id: 'l1', name: 'Glow Salon' }]);
    fixture.detectChanges();
    return fixture;
  }

  const summary = { id: 'c1', name: 'Diwali push', objective: null, starts_on: '2026-11-01', ends_on: '2026-11-15', item_count: 1, status_counts: { draft: 1 }, published_count: 0, created_at: '', updated_at: '' };

  it('lists campaigns and opens one with its posts, report and honest engagement note', () => {
    const fixture = setup({ list: () => of([summary]), get: () => of(detail()), report: () => of(report) });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="campaign-list"]')?.textContent).toContain('Diwali push');
    (el.querySelector('.row-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const d = el.querySelector('[data-testid="campaign-detail"]')?.textContent ?? '';
    expect(d).toContain('Instagram caption');
    expect(d).toContain('Not scheduled');
    expect(d).toContain('Campaign report');
    expect(d).toContain('Reach, likes and clicks are not returned');
  });

  it('flags a caption that is over a channel limit and shows the server field error', () => {
    const compose = jasmine.createSpy('compose').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'VALIDATION_ERROR', message: 'Campaign composer failed validation.', fields: { 'variants.meta_instagram': 'Instagram caption is limited to 2200 characters (this one is 2300).' } }, request_id: 'r' } })),
    );
    const fixture = setup({ list: () => of([summary]), get: () => of(detail()), report: () => of(report), compose });
    const c = fixture.componentInstance;
    c.select('c1');
    c.composeForm.patchValue({ body: 'x'.repeat(2300) });
    c.toggleChannel('meta_instagram');
    fixture.detectChanges();
    expect(c.over(detail(), 'meta_instagram')).toBeTrue();
    expect(c.over(detail(), 'google')).toBeTrue();
    c.compose(detail());
    fixture.detectChanges();
    expect(compose).toHaveBeenCalledWith('t1', 'c1', jasmine.objectContaining({ channels: ['meta_instagram'], location_id: 'l1' }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('limited to 2200 characters');
  });

  it('sends per-channel variants only when they were typed', () => {
    const compose = jasmine.createSpy('compose').and.returnValue(of(detail()));
    const fixture = setup({ list: () => of([summary]), get: () => of(detail()), report: () => of(report), compose });
    const c = fixture.componentInstance;
    c.composeForm.patchValue({ body: 'Shared caption' });
    c.toggleChannel('google');
    c.toggleChannel('meta_instagram');
    c.setVariant('meta_instagram', ' Short #tag ');
    c.compose(detail());
    expect(compose.calls.mostRecent().args[2].variants).toEqual({ meta_instagram: 'Short #tag' });
  });

  it('hides the create and compose forms for read-only roles', () => {
    const fixture = setup({ list: () => of([summary]), get: () => of(detail()), report: () => of(report) }, false);
    fixture.componentInstance.select('c1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('Diwali push');
  });

  it('creates a campaign and surfaces field errors', () => {
    const create = jasmine.createSpy('create').and.returnValue(of(detail()));
    const fixture = setup({ list: () => of([]), get: () => of(detail()), report: () => of(report), create });
    fixture.componentInstance.createForm.patchValue({ name: ' Diwali push ', starts_on: '2026-11-01' });
    fixture.componentInstance.create();
    expect(create).toHaveBeenCalledWith('t1', { name: 'Diwali push', objective: null, starts_on: '2026-11-01', ends_on: null });
  });
});

describe('CampaignMonitorComponent', () => {
  const job = { id: 'j1', status: 'dead_letter', provider: 'google', channel: 'google', content_id: 'x', content_title: 'Diwali post', attempts: 3, last_outcome: 'failed', last_error_code: 'PROVIDER_ERROR', external_post_id: null, scheduled_utc: '2026-11-20T10:00:00.000Z', next_run_at: null, updated_at: '2026-11-20T10:00:00.000Z', retryable: true, mock_provider: true };

  function setup(canRetry: boolean, retry = jasmine.createSpy('retry').and.returnValue(of({}))) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CampaignMonitorComponent],
      providers: [
        { provide: CampaignService, useValue: { monitor: () => of({ jobs: [job], status_counts: { dead_letter: 1, queued: 0 }, viewer_can_retry: canRetry }) } },
        { provide: PublishingService, useValue: { retryPublishJob: retry } },
      ],
    });
    const fixture = TestBed.createComponent(CampaignMonitorComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    return { fixture, retry };
  }

  it('labels mock jobs and shows the error code', () => {
    const text = (setup(false).fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Diwali post');
    expect(text).toContain('MOCK_PROVIDER');
    expect(text).toContain('PROVIDER_ERROR');
  });

  it('offers Retry only to owners/admins and re-queues through the publishing API', () => {
    expect((setup(false).fixture.nativeElement as HTMLElement).querySelector('table button')).toBeNull();
    const { fixture, retry } = setup(true);
    ((fixture.nativeElement as HTMLElement).querySelector('table button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(retry).toHaveBeenCalledWith('t1', 'j1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Job re-queued');
  });
});

describe('CampaignPerformanceComponent', () => {
  function setup(data: unknown) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CampaignPerformanceComponent], providers: [{ provide: CampaignService, useValue: { performance: () => of(data) } }] });
    const fixture = TestBed.createComponent(CampaignPerformanceComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const base = {
    from: '2026-11-01', to: '2026-11-20', totals: { scheduled: 4, succeeded: 3, failed: 1, in_flight: 0, cancelled: 0, success_rate_pct: 75, avg_attempts_per_success: 1 },
    by_channel: [{ channel: 'google', provider: 'google', total: 4, succeeded: 3, failed: 1, in_flight: 0, cancelled: 0, success_rate_pct: 75 }],
    by_day: [{ day: '2026-11-18', scheduled: 4, succeeded: 3, failed: 1 }], mock_provider: true, timezone_note: 'Days are UTC.',
    engagement: { available: false, reason: 'Reach, likes and clicks are not returned by the connected providers yet, so none are shown.' },
  };

  it('shows outcomes per channel and day, plus the no-engagement note and mock badge', () => {
    const el = setup(base);
    expect(el.textContent).toContain('75%');
    expect(el.querySelectorAll('[data-testid="perf-channels"] tbody tr').length).toBe(1);
    expect(el.querySelectorAll('[data-testid="perf-days"] .bar').length).toBe(1);
    expect(el.textContent).toContain('Days are UTC.');
    expect(el.textContent).toContain('Reach, likes and clicks are not returned');
    expect(el.textContent).toContain('MOCK_PROVIDER');
  });

  it('shows an empty state and an em dash success rate when nothing was scheduled', () => {
    const el = setup({ ...base, totals: { ...base.totals, scheduled: 0, succeeded: 0, failed: 0, success_rate_pct: null }, by_channel: [], by_day: [] });
    expect(el.textContent).toContain('Nothing scheduled in this period');
    expect(el.textContent).toContain('—');
  });
});
