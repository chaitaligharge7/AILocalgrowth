import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { CalendarComponent } from './calendar.component';

const sampleTenant: Tenant = {
  id: 't1',
  display_name: 'Acme Cafe',
  legal_name: null,
  business_type: null,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  country: 'IN',
  status: 'active',
  caller_role: 'owner',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('CalendarComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  function createAndFlushInitialLoads() {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;

    const calendarReq = httpMock.expectOne((r) => r.url.includes('/calendar'));
    calendarReq.flush({
      data: {
        schedules: [
          {
            id: 'sch1',
            content_id: 'c1',
            content_title: 'Weekend offer',
            content_objective: 'Promote weekend offer',
            content_status: 'scheduled',
            channel: 'google',
            status: 'scheduled',
            // 05:00 UTC == 10:30 AM IST (Asia/Kolkata is UTC+5:30).
            scheduled_utc: '2026-12-10T05:00:00.000Z',
            publish_job_id: 'job1',
            publish_job_status: 'retry_wait',
            external_post_id: null,
            last_error_code: 'REAUTH_REQUIRED',
            created_at: '2026-12-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });

    const jobsReq = httpMock.expectOne((r) => r.url.includes('/publish-jobs'));
    jobsReq.flush({
      data: {
        publish_jobs: [
          {
            id: 'job1',
            tenant_id: 't1',
            schedule_id: 'sch1',
            provider: 'google',
            status: 'retry_wait',
            attempts: 2,
            lease_until: null,
            next_run_at: '2026-12-10T05:00:00.000Z',
            idempotency_key: 'schedule:sch1',
            external_post_id: null,
            last_error_code: 'REAUTH_REQUIRED',
            created_at: '2026-12-01T00:00:00.000Z',
            updated_at: '2026-12-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });

    const connReq = httpMock.expectOne((r) => r.url.includes('/integrations'));
    connReq.flush({ data: { connections: [] }, meta: { request_id: 'r1' } });

    fixture.detectChanges();
    return { fixture, component };
  }

  it('displays scheduled_utc converted to the tenant timezone with an explicit zone label (e.g. "10:30 AM IST")', () => {
    const { fixture } = createAndFlushInitialLoads();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('10:30 AM IST');
    // Never render a bare UTC instant for a calendar entry.
    expect(text).not.toContain('2026-12-10T05:00:00.000Z');
  });

  it('maps REAUTH_REQUIRED to a plain-English remediation message, not the raw code', () => {
    const { fixture } = createAndFlushInitialLoads();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Reconnect it on the Integrations screen');
    expect(text).not.toContain('REAUTH_REQUIRED');
  });

  it('shows a Retry button for a retry_wait job and calls the retry endpoint', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.retryJob(component.jobs()[0]);

    const retryReq = httpMock.expectOne('/api/v1/tenants/t1/publish-jobs/job1/retry');
    expect(retryReq.request.method).toBe('POST');
    retryReq.flush({
      data: {
        id: 'job1',
        tenant_id: 't1',
        schedule_id: 'sch1',
        provider: 'google',
        status: 'queued',
        attempts: 0,
        lease_until: null,
        next_run_at: '2026-12-10T05:00:00.000Z',
        idempotency_key: 'schedule:sch1',
        external_post_id: null,
        last_error_code: null,
        created_at: '2026-12-01T00:00:00.000Z',
        updated_at: '2026-12-01T00:00:00.000Z',
      },
      meta: { request_id: 'r1' },
    });

    // retryJob() triggers refreshJobs() + refreshCalendar() afterward.
    httpMock.expectOne((r) => r.url.includes('/publish-jobs')).flush({ data: { publish_jobs: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne((r) => r.url.includes('/calendar')).flush({ data: { schedules: [] }, meta: { request_id: 'r1' } });

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Publish job re-queued.');
  });

  // Regression test: a bare HTML <select> visually highlights its first
  // <option> even when the bound FormControl's value ('') matches none of
  // them, so "Confirm schedule" stayed disabled with no visible reason
  // whenever a connected Google account existed. loadConnections() must
  // default-select the first connected connection once the list arrives.
  it('defaults the schedule form to the first connected Google connection once the list loads', () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;

    httpMock.expectOne((r) => r.url.includes('/calendar')).flush({ data: { schedules: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne((r) => r.url.includes('/publish-jobs')).flush({ data: { publish_jobs: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne((r) => r.url.includes('/integrations')).flush({
      data: {
        connections: [
          { id: 'conn1', tenant_id: 't1', provider: 'google', external_account_id: 'mock-acct-1', scopes: [], mock_provider: true, status: 'connected', expires_at: null, last_checked_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.scheduleForm.controls.providerConnectionId.value).toBe('conn1');
  });

  it('offers Meta channels only once a connected Meta connection exists, and defaults its connection selection', () => {
    const fixture = TestBed.createComponent(CalendarComponent);
    const component = fixture.componentInstance;

    httpMock.expectOne((r) => r.url.includes('/calendar')).flush({ data: { schedules: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne((r) => r.url.includes('/publish-jobs')).flush({ data: { publish_jobs: [] }, meta: { request_id: 'r1' } });
    httpMock.expectOne((r) => r.url.includes('/integrations')).flush({
      data: {
        connections: [
          {
            id: 'conn-meta',
            tenant_id: 't1',
            provider: 'meta',
            external_account_id: 'mock-meta-acct-1',
            scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
            mock_provider: true,
            status: 'connected',
            expires_at: null,
            last_checked_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.availableChannels()).toEqual(['meta_page', 'meta_instagram']);
    expect(component.scheduleForm.controls.channel.value).toBe('meta_page');
    expect(component.scheduleForm.controls.providerConnectionId.value).toBe('conn-meta');
  });

  it('maps META_PERMISSIONS_INSUFFICIENT and LOCATION_NOT_LINKED schedule errors to clear remediation copy, not the raw code', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.scheduleHandoff.set({ scheduleContentId: 'c1', scheduleContentTitle: 'Weekend offer' });
    component.scheduleForm.patchValue({
      channel: 'meta_page',
      providerConnectionId: 'conn-meta',
      scheduledAt: '2026-12-15T10:30',
      timezone: 'Asia/Kolkata',
    });
    fixture.detectChanges();

    component.submitSchedule();
    const scheduleReq = httpMock.expectOne((r) => r.url.includes('/contents/c1/schedule'));
    scheduleReq.flush(
      {
        error: {
          code: 'META_PERMISSIONS_INSUFFICIENT',
          message: 'This connection does not have the "pages_manage_posts" permission required to publish to the "meta_page" channel.',
        },
        request_id: 'r1',
      },
      { status: 409, statusText: 'Conflict' },
    );

    expect(component.scheduleError()).toContain('Reconnect Meta on the Integrations screen');
    expect(component.scheduleError()).not.toContain('META_PERMISSIONS_INSUFFICIENT');
  });

  it('maps LOCATION_NOT_LINKED to a remediation message pointing at the Integrations screen', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.scheduleHandoff.set({ scheduleContentId: 'c1', scheduleContentTitle: 'Weekend offer' });
    component.scheduleForm.patchValue({
      channel: 'meta_page',
      providerConnectionId: 'conn-meta',
      scheduledAt: '2026-12-15T10:30',
      timezone: 'Asia/Kolkata',
    });
    fixture.detectChanges();

    component.submitSchedule();
    const scheduleReq = httpMock.expectOne((r) => r.url.includes('/contents/c1/schedule'));
    scheduleReq.flush(
      { error: { code: 'LOCATION_NOT_LINKED', message: 'This business location is not linked to the selected Meta connection.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(component.scheduleError()).toContain('map this location to a Page/Instagram account');
    expect(component.scheduleError()).not.toContain('LOCATION_NOT_LINKED');
  });

  it('flags a same-channel, same-minute collision between two entries', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.entries.update((list) => [
      ...list,
      {
        id: 'sch2',
        content_id: 'c2',
        content_title: 'Second post',
        content_objective: 'Second',
        content_status: 'scheduled',
        channel: 'google',
        status: 'scheduled',
        scheduled_utc: '2026-12-10T05:00:30.000Z',
        publish_job_id: 'job2',
        publish_job_status: 'queued',
        external_post_id: null,
        last_error_code: null,
        created_at: '2026-12-01T00:00:00.000Z',
      },
    ]);
    fixture.detectChanges();

    expect(component.hasCollision(component.entries()[0])).toBe(true);
    expect(fixture.nativeElement.textContent as string).toContain('collision');
  });

  it('switches to month/week grid view and reschedules via drag-drop PATCH endpoint', () => {
    const { fixture, component } = createAndFlushInitialLoads();
    component.setViewMode('month');
    fixture.detectChanges();
    expect(component.gridCells().length).toBe(35);

    const entry = component.entries()[0];
    component.rescheduleEntryToDate(entry, '2026-12-18');
    const req = httpMock.expectOne('/api/v1/tenants/t1/schedules/sch1/reschedule');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ scheduled_at: '2026-12-18 05:00:00', timezone: 'UTC' });
    req.flush({ data: { id: 'sch1' }, meta: { request_id: 'r2' } });

    httpMock.expectOne((r) => r.url.includes('/calendar')).flush({ data: { schedules: [] }, meta: { request_id: 'r3' } });
    httpMock.expectOne((r) => r.url.includes('/publish-jobs')).flush({ data: { publish_jobs: [] }, meta: { request_id: 'r4' } });
    fixture.detectChanges();
    expect(component.actionNotice()).toContain('Rescheduled');
  });
});
