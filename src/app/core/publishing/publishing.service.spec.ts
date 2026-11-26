import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PublishingService } from './publishing.service';
import { PublishJob, Schedule } from './publishing.models';

const sampleJob: PublishJob = {
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
};

const sampleSchedule: Schedule = {
  id: 'sch1',
  tenant_id: 't1',
  content_id: 'c1',
  revision_id: 'rev1',
  channel_id: 'ch1',
  status: 'scheduled',
  scheduled_utc: '2026-12-10T05:00:00.000Z',
  scheduled_local: '2026-12-10T10:30:00+05:30',
  timezone: 'Asia/Kolkata',
  created_by: 'u1',
  created_at: '2026-12-01T00:00:00.000Z',
  publish_job: sampleJob,
};

describe('PublishingService', () => {
  let service: PublishingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PublishingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('schedules content with provider_connection_id/scheduled_at/timezone', () => {
    service
      .schedule('t1', 'c1', { provider_connection_id: 'conn1', scheduled_at: '2026-12-10 10:30:00', timezone: 'Asia/Kolkata' })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/schedule');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ provider_connection_id: 'conn1', scheduled_at: '2026-12-10 10:30:00', timezone: 'Asia/Kolkata' });
    req.flush({ data: sampleSchedule, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 CONTENT_NOT_APPROVED from schedule unchanged', () => {
    let error: unknown;
    service.schedule('t1', 'c1', { provider_connection_id: 'conn1', scheduled_at: '2026-12-10 10:30:00' }).subscribe({
      error: (e) => (error = e),
    });
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/schedule');
    req.flush(
      { error: { code: 'CONTENT_NOT_APPROVED', message: 'Content in status "draft" cannot be scheduled.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((error as { status: number }).status).toBe(409);
  });

  it('cancels a scheduled content item', () => {
    service.cancel('t1', 'c1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/cancel');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { content_id: 'c1', status: 'cancelled' }, meta: { request_id: 'r1' } });
  });

  it('lists publish jobs, optionally filtered by status', () => {
    service.listPublishJobs('t1', 'dead_letter').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/publish-jobs?status=dead_letter');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { publish_jobs: [sampleJob] }, meta: { request_id: 'r1' } });
  });

  it('retries a publish job', () => {
    service.retryPublishJob('t1', 'job1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/publish-jobs/job1/retry');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...sampleJob, status: 'queued', attempts: 0 }, meta: { request_id: 'r1' } });
  });

  it('surfaces 409 JOB_NOT_RETRYABLE from retry unchanged', () => {
    let error: unknown;
    service.retryPublishJob('t1', 'job1').subscribe({ error: (e) => (error = e) });
    const req = httpMock.expectOne('/api/v1/tenants/t1/publish-jobs/job1/retry');
    req.flush(
      { error: { code: 'JOB_NOT_RETRYABLE', message: 'Publish job in status "queued" cannot be manually retried.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((error as { status: number }).status).toBe(409);
  });

  it('fetches the calendar feed for a UTC range', () => {
    service.calendar('t1', '2026-12-01T00:00:00Z', '2026-12-31T23:59:59Z').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/calendar?start=2026-12-01T00%3A00%3A00Z&end=2026-12-31T23%3A59%3A59Z');
    expect(req.request.method).toBe('GET');
    req.flush({
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
            scheduled_utc: '2026-12-10T05:00:00.000Z',
            publish_job_id: 'job1',
            publish_job_status: 'queued',
            external_post_id: null,
            last_error_code: null,
            created_at: '2026-12-01T00:00:00.000Z',
          },
        ],
      },
      meta: { request_id: 'r1' },
    });
  });
});
