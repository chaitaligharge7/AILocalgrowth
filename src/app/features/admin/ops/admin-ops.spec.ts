import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnnouncementBannerComponent } from '../../../shared/announcement-banner/announcement-banner.component';
import { AdminAdminsComponent, AdminAiUsageComponent, AdminAnnouncementsComponent, AdminSupportReportComponent } from './admin-console.components';
import { AdminOpsComponent } from './admin-ops.component';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });
const text = (f: { nativeElement: unknown }): string => (f.nativeElement as HTMLElement).textContent ?? '';

describe('Platform admin operations console', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('ops health renders the counts it was given and notes that no latency is measured', () => {
    const f = TestBed.createComponent(AdminOpsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/ops/health').flush(
      ok({
        generated_at: '2026-11-21T00:00:00.000Z',
        webhooks: {
          provider_events: { by_status: { processed: 4, dead_letter: 2 }, by_provider: { meta: 6 }, last_received_at: '2026-11-21T08:00:00.000Z' },
          payment_events: { by_status: { processed: 1 }, last_received_at: null },
          whatsapp: { last_24h_by_kind: { status: 3 }, last_received_at: null },
        },
        queues: { jobs_by_status: { queued: 5 }, jobs_overdue_15m: 7, outbox_by_status: { pending: 1 }, outbox_oldest_pending_at: null },
        connections: { by_provider_status: { 'google:connected': 2 }, token_expired: 3, token_expiring_7d: 1 },
        notes: ['No latency, uptime or provider-side status is measured, so none is shown.'],
      }),
    );
    f.detectChanges();
    const t = text(f);
    expect(t).toContain('Jobs overdue');
    expect(t).toContain('dead_letter');
    expect(t).toContain('google:connected');
    expect(t).toContain('No latency, uptime');
    const stats = (f.nativeElement as HTMLElement).querySelector('[data-testid="health-stats"]')!.textContent!;
    expect(stats).toContain('7');
    expect(stats).toContain('3');
  });

  it('events tab loads the chosen source and shows status and verification', () => {
    const f = TestBed.createComponent(AdminOpsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/ops/health').flush(ok({ webhooks: { provider_events: { by_status: {}, by_provider: {}, last_received_at: null }, payment_events: { by_status: {}, last_received_at: null }, whatsapp: { last_24h_by_kind: {}, last_received_at: null } }, queues: { jobs_by_status: {}, jobs_overdue_15m: 0, outbox_by_status: {}, outbox_oldest_pending_at: null }, connections: { by_provider_status: {}, token_expired: 0, token_expiring_7d: 0 }, notes: [] }));
    f.componentInstance.select('events');
    http.expectOne('/api/v1/admin/ops/events?source=provider').flush(
      ok({
        source: 'provider',
        events: [{ id: 'e1', provider: 'meta', event_id: 'evt-123', status: 'dead_letter', verified: true, received_at: '2026-11-21T08:00:00.000Z', processed_at: null, tenant_name: null, detail: null }],
      }),
    );
    f.detectChanges();
    expect(text(f)).toContain('evt-123');
    expect(text(f)).toContain('dead_letter');

    f.componentInstance.setSource('payment');
    http.expectOne('/api/v1/admin/ops/events?source=payment').flush(ok({ source: 'payment', events: [] }));
    f.detectChanges();
    expect(text(f)).toContain('No events');
  });

  it('failures tab requests the selected window', () => {
    const f = TestBed.createComponent(AdminOpsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/ops/health').flush(ok({ webhooks: { provider_events: { by_status: {}, by_provider: {}, last_received_at: null }, payment_events: { by_status: {}, last_received_at: null }, whatsapp: { last_24h_by_kind: {}, last_received_at: null } }, queues: { jobs_by_status: {}, jobs_overdue_15m: 0, outbox_by_status: {}, outbox_oldest_pending_at: null }, connections: { by_provider_status: {}, token_expired: 0, token_expiring_7d: 0 }, notes: [] }));
    f.componentInstance.select('failures');
    http.expectOne('/api/v1/admin/ops/failures?days=7').flush(
      ok({
        days: 7,
        counts: { publish_jobs_failed: 2, ai_generations_not_completed: 1, jobs_needing_attention: 4, outbox_dead_letter: 0 },
        jobs: [{ id: 'j1', type: 'outbox.dispatch', status: 'dead_letter', attempts: 5, tenant_name: 'Acme', updated_at: '2026-11-20T00:00:00.000Z' }],
        publish_jobs: [{ id: 'p1', provider: 'google', attempts: 3, error_code: 'RATE_LIMITED', tenant_name: 'Acme', updated_at: '2026-11-20T00:00:00.000Z' }],
        notes: ['Only error codes the platform stored are shown.'],
      }),
    );
    f.detectChanges();
    expect(text(f)).toContain('outbox.dispatch');
    expect(text(f)).toContain('RATE_LIMITED');
    f.componentInstance.setDays(30);
    http.expectOne('/api/v1/admin/ops/failures?days=30').flush(ok({ days: 30, counts: { publish_jobs_failed: 0, ai_generations_not_completed: 0, jobs_needing_attention: 0, outbox_dead_letter: 0 }, jobs: [], publish_jobs: [], notes: [] }));
  });

  it('shows the server error when health cannot be loaded', () => {
    const f = TestBed.createComponent(AdminOpsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/ops/health').flush({ error: { code: 'PLATFORM_ADMIN_REQUIRED', message: 'Platform admin access required.' }, request_id: 'r' }, { status: 403, statusText: 'Forbidden' });
    f.detectChanges();
    expect(text(f)).toContain('Platform admin access required.');
  });

  it('AI usage shows recorded cost honestly and re-queries when the window changes', () => {
    const f = TestBed.createComponent(AdminAiUsageComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/ai/usage?days=30').flush(
      ok({
        days: 30,
        totals: { generations: 12, not_completed: 2, tokens_in: 100, tokens_out: 250, recorded_cost: '0.0000', rows_with_recorded_cost: 0 },
        by_provider_model: [{ provider: 'mock', model: 'mock-1', generations: 12, not_completed: 2, tokens_in: 100, tokens_out: 250, recorded_cost: '0.0000' }],
        by_use_case: [{ use_case: 'caption', generations: 12, not_completed: 2 }],
        daily: [],
        top_tenants: [{ tenant_id: 't1', tenant_name: 'Acme Cafe', generations: 12, tokens: 350 }],
        not_completed: [{ id: 'g1', use_case: 'caption', provider: 'mock', model: 'mock-1', status: 'blocked', tenant_name: 'Acme Cafe', created_at: '2026-11-20T00:00:00.000Z' }],
        quota: [{ meter_code: 'ai_generations_per_month', wallets: 3, limit_qty: 300, used_qty: 150, reserved_qty: 0, near_limit_wallets: 1 }],
        notes: ['recorded_cost is the sum of unit_cost values the AI adapter stored.'],
      }),
    );
    f.detectChanges();
    const t = text(f);
    expect(t).toContain('Acme Cafe');
    expect(t).toContain('0 rows carry a cost');
    expect(t).toContain('150 / 300');
    expect(t).toContain('blocked');
    expect(f.componentInstance.pct(150, 300)).toBe(50);
    expect(f.componentInstance.pct(5, 0)).toBe(0);
    f.componentInstance.setDays(7);
    http.expectOne('/api/v1/admin/ai/usage?days=7').flush(ok({ days: 7, totals: { generations: 0, not_completed: 0, tokens_in: 0, tokens_out: 0, recorded_cost: '0.0000', rows_with_recorded_cost: 0 }, by_provider_model: [], by_use_case: [], daily: [], top_tenants: [], not_completed: [], quota: [], notes: [] }));
  });

  it('admin roster hides the remove button for the caller and posts a reason to revoke', () => {
    const f = TestBed.createComponent(AdminAdminsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/admins').flush(
      ok({
        admins: [
          { id: 'me', name: 'Me Admin', email: 'me@example.test', status: 'active', mfa_enrolled: true, mfa_last_verified_at: null, active_sessions: 1, last_login_at: null, is_you: true },
          { id: 'other', name: 'Other Admin', email: 'other@example.test', status: 'active', mfa_enrolled: true, mfa_last_verified_at: null, active_sessions: 0, last_login_at: null, is_you: false },
        ],
        notes: ['Platform admin access is granted only from the server command line.'],
      }),
    );
    f.detectChanges();
    const buttons = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).filter((b) => b.textContent!.includes('Remove access'));
    expect(buttons.length).toBe(1);
    f.componentInstance.startRevoke(f.componentInstance.admins()[1]);
    f.componentInstance.form.setValue({ reason: 'Left the company' });
    f.componentInstance.confirmRevoke();
    const req = http.expectOne('/api/v1/admin/admins/other/revoke');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Left the company' });
    req.flush(ok({ revoked: true, user_id: 'other' }));
    http.expectOne('/api/v1/admin/admins').flush(ok({ admins: [], notes: [] }));
    expect(f.componentInstance.target()).toBeNull();
  });

  it('revoke shows the server rejection and does not close the form', () => {
    const f = TestBed.createComponent(AdminAdminsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/admins').flush(ok({ admins: [{ id: 'other', name: 'Other', email: 'o@example.test', status: 'active', mfa_enrolled: true, mfa_last_verified_at: null, active_sessions: 0, last_login_at: null, is_you: false }], notes: [] }));
    f.componentInstance.startRevoke(f.componentInstance.admins()[0]);
    f.componentInstance.form.setValue({ reason: 'x' });
    f.componentInstance.confirmRevoke();
    http.expectOne('/api/v1/admin/admins/other/revoke').flush({ error: { code: 'LAST_ADMIN', message: 'The last platform admin cannot be removed.' }, request_id: 'r' }, { status: 409, statusText: 'Conflict' });
    expect(f.componentInstance.formError()).toBe('The last platform admin cannot be removed.');
    expect(f.componentInstance.target()).not.toBeNull();
  });

  it('announcement form needs a reason and posts the typed notice', () => {
    const f = TestBed.createComponent(AdminAnnouncementsComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/announcements').flush(ok({ announcements: [] }));
    f.detectChanges();
    expect(text(f)).toContain('No notices yet');
    f.componentInstance.form.patchValue({ title: 'Planned downtime', kind: 'maintenance', severity: 'warning', body: 'Short break' });
    expect(f.componentInstance.form.invalid).toBeTrue();
    f.componentInstance.create();
    http.expectNone('/api/v1/admin/announcements');

    f.componentInstance.form.patchValue({ reason: 'Scheduled work' });
    f.componentInstance.create();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/admin/announcements');
    expect(req.request.body).toEqual(jasmine.objectContaining({ title: 'Planned downtime', kind: 'maintenance', severity: 'warning', reason: 'Scheduled work' }));
    req.flush(ok({ id: 'a1', kind: 'maintenance', severity: 'warning', title: 'Planned downtime', body: 'Short break', starts_at: '2026-11-21T00:00:00.000Z', ends_at: null, status: 'active', created_at: '2026-11-21T00:00:00.000Z' }));
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/admin/announcements').flush(
      ok({ announcements: [{ id: 'a1', kind: 'maintenance', severity: 'warning', title: 'Planned downtime', body: 'Short break', starts_at: '2026-11-21T00:00:00.000Z', ends_at: null, status: 'active', created_at: '2026-11-21T00:00:00.000Z' }] }),
    );
    f.detectChanges();
    expect(text(f)).toContain('Planned downtime');
    expect(text(f)).toContain('until retired');
  });

  it('support report shows ageing buckets and says when there is no resolution data', () => {
    const f = TestBed.createComponent(AdminSupportReportComponent);
    f.detectChanges();
    http.expectOne('/api/v1/admin/support/report?days=30').flush(
      ok({
        days: 30,
        created: 9,
        closed: 0,
        created_by_category: { billing: 5, technical: 4 },
        created_by_priority: { normal: 9 },
        resolution_hours: null,
        open_now: 9,
        open_age: { under_1_day: 2, '1_to_3_days': 3, '3_to_7_days': 1, over_7_days: 3 },
        open_by_category: { billing: 5 },
        notes: ['No SLA targets and no first-response time are recorded.'],
      }),
    );
    f.detectChanges();
    const t = text(f);
    expect(t).toContain('No data');
    expect(t).toContain('No ticket closed in this window');
    expect(t).toContain('Over 7 days');
    expect(t).toContain('No SLA targets');
  });

  it('announcement banner shows live notices, hides dismissed ones and survives a failed fetch', () => {
    const f = TestBed.createComponent(AnnouncementBannerComponent);
    f.detectChanges();
    http.expectOne('/api/v1/announcements').flush(
      ok({
        announcements: [
          { id: 'a1', kind: 'maintenance', severity: 'critical', title: 'Downtime tonight', body: '', starts_at: '2026-11-21T20:00:00.000Z', ends_at: '2026-11-21T21:00:00.000Z', status: 'active', created_at: '2026-11-20T00:00:00.000Z' },
          { id: 'a2', kind: 'announcement', severity: 'info', title: 'New reports', body: 'See Analytics', starts_at: '2026-11-20T00:00:00.000Z', ends_at: null, status: 'active', created_at: '2026-11-20T00:00:00.000Z' },
        ],
      }),
    );
    f.detectChanges();
    expect(text(f)).toContain('Maintenance: Downtime tonight');
    expect(text(f)).toContain('New reports');
    f.componentInstance.dismiss('a1');
    f.detectChanges();
    expect(text(f)).not.toContain('Downtime tonight');
    expect(text(f)).toContain('New reports');

    const g = TestBed.createComponent(AnnouncementBannerComponent);
    g.detectChanges();
    http.expectOne('/api/v1/announcements').flush({ error: { code: 'X', message: 'boom' }, request_id: 'r' }, { status: 500, statusText: 'Server Error' });
    g.detectChanges();
    expect(text(g).trim()).toBe('');
  });
});
