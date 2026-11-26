import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AssetService } from '../../core/assets/asset.service';
import { GbpHealth, GbpPost, GbpPushJob, SyncHistoryItem } from '../../core/google/gbp.models';
import { GbpService } from '../../core/google/gbp.service';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { GoogleHealthComponent } from './google-health.component';
import { GoogleHistoryComponent } from './google-history.component';
import { GooglePostsComponent } from './google-posts.component';
import { GoogleProfilePushComponent } from './google-profile-push.component';
import { GoogleComponent } from './google.component';

const health: GbpHealth = {
  mode: 'mock',
  mock_provider: true,
  overall: 'attention',
  attention: ['Some pushes or posts failed and can be retried.'],
  connection: {
    id: 'c1', status: 'connected', external_account_id: 'mock-acct-1', last_checked_at: '2026-11-20T10:00:00.000Z', expires_at: null,
    granted_scopes: ['profile.manage'], capabilities: { profile: true, posts: false, reviews: false }, missing_capabilities: ['posts', 'reviews'],
  },
  locations: [{ location_id: 'l1', name: 'Glow Salon', linked: true, external_location_id: 'mock-loc-1' }],
  last_runs: { profile: { status: 'succeeded', at: '2026-11-20T10:00:00.000Z', error_code: null }, review: null },
  counters: { failed_pushes: 1, unknown_pushes: 0, failed_posts: 0, unknown_posts: 0, draft_posts: 2 },
  checked_at: '2026-11-20T10:05:00.000Z',
};

function post(overrides: Partial<GbpPost> = {}): GbpPost {
  return {
    id: 'p1', location_id: 'l1', post_type: 'update', body: 'Diwali offer', cta_type: null, cta_url: null, status: 'draft',
    external_post_id: null, error_code: null, error_hint: null, attempt_count: 0, mock_provider: null, published_at: null,
    last_attempt_at: null, created_at: '2026-11-20T10:00:00.000Z', updated_at: '2026-11-20T10:00:00.000Z', ...overrides,
  };
}

function job(overrides: Partial<GbpPushJob> = {}): GbpPushJob {
  return {
    id: 'j1', location_id: 'l1', kind: 'profile', summary: { fields: ['category'] }, status: 'failed', external_ref: null,
    error_code: 'PROVIDER_NOT_CONFIGURED', error_hint: 'Google is not configured in this environment (no real credentials).',
    attempt_count: 1, mock_provider: null, last_attempt_at: '2026-11-20T10:00:00.000Z', created_at: '2026-11-20T10:00:00.000Z', ...overrides,
  };
}

const apiError = (status: number, code: string, message: string) =>
  throwError(() => new HttpErrorResponse({ status, error: { error: { code, message }, request_id: 'r' } }));

function gbpStub(overrides: Record<string, unknown> = {}) {
  return {
    health: jasmine.createSpy('health').and.returnValue(of(health)),
    history: jasmine.createSpy('history').and.returnValue(of({ mode: 'mock', mock_provider: true, items: [] })),
    listPosts: jasmine.createSpy('listPosts').and.returnValue(of({ mock_provider: true, posts: [post()] })),
    createPost: jasmine.createSpy('createPost').and.returnValue(of(post())),
    updatePost: jasmine.createSpy('updatePost').and.returnValue(of(post())),
    deletePost: jasmine.createSpy('deletePost').and.returnValue(of(undefined)),
    publishPost: jasmine.createSpy('publishPost').and.returnValue(of(post({ status: 'published', mock_provider: true }))),
    listPushJobs: jasmine.createSpy('listPushJobs').and.returnValue(of({ mock_provider: true, jobs: [job()] })),
    pushProfile: jasmine.createSpy('pushProfile').and.returnValue(of(job({ status: 'succeeded', mock_provider: true }))),
    pushPhoto: jasmine.createSpy('pushPhoto').and.returnValue(of(job({ kind: 'photo', status: 'succeeded', mock_provider: true }))),
    retryPushJob: jasmine.createSpy('retryPushJob').and.returnValue(of(job({ status: 'succeeded', mock_provider: true }))),
    ...overrides,
  };
}

describe('GoogleHealthComponent', () => {
  function setup(data: GbpHealth) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GoogleHealthComponent],
      providers: [provideRouter([]), { provide: GbpService, useValue: gbpStub({ health: () => of(data) }) }],
    });
    const fixture = TestBed.createComponent(GoogleHealthComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows overall status, MOCK_PROVIDER, attention reasons and missing permissions', () => {
    const el = setup(health);
    expect(el.querySelector('[data-testid="overall-badge"]')?.textContent).toContain('Needs attention');
    expect(el.querySelector('.badge--mock')?.textContent).toContain('MOCK_PROVIDER');
    expect(el.querySelector('[data-testid="attention-list"]')?.textContent).toContain('failed and can be retried');
    expect(el.textContent).toContain('Missing');
    expect(el.textContent).toContain('Failed pushes: 1');
    expect(el.textContent).toContain('Glow Salon');
  });

  it('offers the Integrations link when Google is not connected', () => {
    const el = setup({ ...health, overall: 'not_connected', connection: null, attention: [] });
    expect(el.textContent).toContain('Not connected');
    expect(el.querySelector('a')?.textContent).toContain('Connect Google');
  });
});

describe('GooglePostsComponent', () => {
  function setup(canDraft: boolean, stub = gbpStub()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GooglePostsComponent], providers: [{ provide: GbpService, useValue: stub }] });
    const fixture = TestBed.createComponent(GooglePostsComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.componentRef.setInput('canDraft', canDraft);
    fixture.componentRef.setInput('canPublish', canDraft);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('saves a draft through the API', () => {
    const { fixture, el, stub } = setup(true);
    const body = el.querySelector('textarea') as HTMLTextAreaElement;
    body.value = 'New festival offer';
    body.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(stub.createPost).toHaveBeenCalledWith('t1', 'l1', { post_type: 'update', body: 'New festival offer', cta_type: null, cta_url: null });
    expect(el.textContent).toContain('Draft saved.');
  });

  it('publishes a draft and labels the result as mock', () => {
    const { fixture, el, stub } = setup(true);
    stub.listPosts.and.returnValue(of({ mock_provider: true, posts: [post({ status: 'published', mock_provider: true, attempt_count: 1 })] }));
    const publish = Array.from(el.querySelectorAll('[data-testid="post-table"] button')).find((b) => b.textContent?.trim() === 'Publish') as HTMLButtonElement;
    publish.click();
    fixture.detectChanges();
    expect(stub.publishPost).toHaveBeenCalledWith('t1', 'p1');
    expect(el.querySelector('.badge--mock')?.textContent).toContain('MOCK_PROVIDER');
    expect(el.textContent).toContain('Published');
    expect(el.textContent).toContain('Accepted by the mock Google provider — nothing was sent to a real Google profile.');
  });

  it('shows the real failure and a retry button for a failed post', () => {
    const failed = post({ status: 'failed', error_code: 'PROVIDER_NOT_CONFIGURED', error_hint: 'Nothing was sent; retry once Google is connected live.', attempt_count: 1 });
    const { el } = setup(true, gbpStub({ listPosts: () => of({ mock_provider: true, posts: [failed] }) }));
    expect(el.textContent).toContain('Failed');
    expect(el.textContent).toContain('Nothing was sent');
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Retry publish'))).toBeTrue();
  });

  it('does not offer edit/publish on an unknown-outcome post', () => {
    const { el } = setup(true, gbpStub({ listPosts: () => of({ mock_provider: true, posts: [post({ status: 'unknown' })] }) }));
    expect(el.textContent).toContain('Outcome unknown');
    const labels = Array.from(el.querySelectorAll('[data-testid="post-table"] button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual([]);
  });

  it('hides the editor for roles that cannot draft', () => {
    const { el } = setup(false);
    expect(el.querySelector('form')).toBeNull();
    expect(Array.from(el.querySelectorAll('[data-testid="post-table"] button'))).toEqual([]);
  });

  it('shows the server refusal when publishing fails', () => {
    const stub = gbpStub({ publishPost: jasmine.createSpy().and.returnValue(apiError(409, 'INTEGRATION_NOT_CONNECTED', 'Connect a Google Business Profile account first.')) });
    const { fixture, el } = setup(true, stub);
    (Array.from(el.querySelectorAll('[data-testid="post-table"] button')).find((b) => b.textContent?.trim() === 'Publish') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Connect a Google Business Profile account first.');
  });
});

describe('GoogleProfilePushComponent', () => {
  function setup(canPush: boolean, stub = gbpStub()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GoogleProfilePushComponent],
      providers: [
        { provide: GbpService, useValue: stub },
        { provide: AssetService, useValue: { list: () => of([{ id: 'as1', mime: 'image/jpeg', bytes: 2048, created_at: '2026-11-20T10:00:00.000Z' }]), uploadFile: () => of({ id: 'as2' }) } },
      ],
    });
    const fixture = TestBed.createComponent(GoogleProfilePushComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.componentRef.setInput('canPush', canPush);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('pushes the ticked fields (and the description when ticked)', () => {
    const { fixture, el, stub } = setup(true);
    const boxes = Array.from(el.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    for (const i of [0, 1]) {
      boxes[i].checked = true;
      boxes[i].dispatchEvent(new Event('change'));
    }
    fixture.detectChanges();
    const description = el.querySelector('textarea') as HTMLTextAreaElement;
    description.value = 'Friendly salon.';
    description.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(stub.pushProfile).toHaveBeenCalledWith('t1', 'l1', { fields: ['description', 'category'], description: 'Friendly salon.' });
    expect(el.textContent).toContain('Profile push accepted by the mock Google provider');
    expect(el.textContent).toContain('nothing was sent to a real Google profile');
  });

  it('refuses to submit with nothing selected', () => {
    const { el } = setup(true);
    const push = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Push to Google')) as HTMLButtonElement;
    expect(push.disabled).toBeTrue();
  });

  it('pushes the chosen photo with its category', () => {
    const { fixture, el, stub } = setup(true);
    const selects = el.querySelectorAll('select');
    (selects[0] as HTMLSelectElement).value = 'as1';
    selects[0].dispatchEvent(new Event('change'));
    (selects[1] as HTMLSelectElement).value = 'exterior';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Push photo')) as HTMLButtonElement).click();
    expect(stub.pushPhoto).toHaveBeenCalledWith('t1', 'l1', { asset_id: 'as1', photo_category: 'exterior' });
  });

  it('lists recent pushes and retries a failed one', () => {
    const { fixture, el, stub } = setup(true);
    expect(el.querySelector('[data-testid="push-table"]')?.textContent).toContain('Profile: category');
    expect(el.textContent).toContain('no real credentials');
    (Array.from(el.querySelectorAll('[data-testid="push-table"] button')).find((b) => b.textContent?.trim() === 'Retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(stub.retryPushJob).toHaveBeenCalledWith('t1', 'j1');
  });

  it('explains the restriction and hides forms for non-admins', () => {
    const { el } = setup(false);
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('Only owner and admin can push');
  });
});

describe('GoogleHistoryComponent', () => {
  const items: SyncHistoryItem[] = [
    { source: 'push_job', id: 'j1', kind: 'profile_push', status: 'failed', error_code: 'PROVIDER_NOT_CONFIGURED', error_hint: 'Google is not configured here.', location_id: 'l1', at: '2026-11-20T10:00:00.000Z', attempt_count: 2, retryable: true, retry_hint: null, mock_provider: null },
    { source: 'post', id: 'p1', kind: 'post_publish', status: 'failed', error_code: 'PROVIDER_ERROR', error_hint: null, location_id: 'l1', at: '2026-11-20T09:00:00.000Z', attempt_count: 1, retryable: true, retry_hint: null, mock_provider: null },
    { source: 'sync_run', id: 's1', kind: 'profile_sync', status: 'failed', error_code: 'PROVIDER_NOT_CONFIGURED', error_hint: null, location_id: null, at: '2026-11-20T08:00:00.000Z', attempt_count: 1, retryable: false, retry_hint: 'Run "Sync now" for the affected location.', mock_provider: null },
  ];

  function setup(canManage: boolean, stub = gbpStub({ history: jasmine.createSpy('history').and.returnValue(of({ mode: 'mock', mock_provider: true, items })) })) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GoogleHistoryComponent], providers: [{ provide: GbpService, useValue: stub }] });
    const fixture = TestBed.createComponent(GoogleHistoryComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, stub };
  }

  it('lists every source with hints and only offers retry for pushes and posts', () => {
    const { el } = setup(true);
    const rows = Array.from(el.querySelectorAll('[data-testid="history-table"] tbody tr'));
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Profile push');
    expect(rows[0].textContent).toContain('Google is not configured here.');
    expect(rows[2].textContent).toContain('Run "Sync now"');
    expect(rows.map((r) => r.querySelectorAll('button').length)).toEqual([1, 1, 0]);
  });

  it('retries a post through publish and a push through the retry endpoint', () => {
    const { fixture, el, stub } = setup(true);
    const rows = Array.from(el.querySelectorAll('[data-testid="history-table"] tbody tr'));
    (rows[0].querySelector('button') as HTMLButtonElement).click();
    expect(stub.retryPushJob).toHaveBeenCalledWith('t1', 'j1');
    fixture.detectChanges();
    (Array.from(el.querySelectorAll('[data-testid="history-table"] tbody tr'))[1].querySelector('button') as HTMLButtonElement).click();
    expect(stub.publishPost).toHaveBeenCalledWith('t1', 'p1');
  });

  it('filters by status through the API', () => {
    const { fixture, el, stub } = setup(true);
    (Array.from(el.querySelectorAll('.filters button')).find((b) => b.textContent?.includes('Failed')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(stub.history).toHaveBeenCalledWith('t1', 'failed');
  });

  it('hides retry for roles that cannot manage', () => {
    const { el } = setup(false);
    expect(el.querySelectorAll('[data-testid="history-table"] button').length).toBe(0);
  });

  it('shows an empty state', () => {
    const { el } = setup(true, gbpStub({ history: () => of({ mode: 'mock', mock_provider: true, items: [] }) }));
    expect(el.textContent).toContain('Nothing here');
  });
});

describe('GoogleComponent', () => {
  function setup(role: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GoogleComponent],
      providers: [
        provideRouter([]),
        { provide: GbpService, useValue: gbpStub() },
        { provide: AssetService, useValue: { list: () => of([]), uploadFile: () => of({}) } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => ({ caller_role: role }) } },
        { provide: LocationApiService, useValue: { list: () => of([{ id: 'l1', name: 'Glow Salon', status: 'active' }, { id: 'l2', name: 'Old', status: 'archived' }]) } },
      ],
    });
    const fixture = TestBed.createComponent(GoogleComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('starts on connection health and offers four tabs', () => {
    const { el } = setup('owner');
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim())).toEqual([
      'Connection health', 'Posts', 'Profile & photos', 'Sync history',
    ]);
    expect(el.querySelector('app-google-health')).not.toBeNull();
    expect(el.querySelector('.picker')).toBeNull();
  });

  it('shows the location picker (active locations only) on location tabs', () => {
    const { fixture, el } = setup('owner');
    (el.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-google-posts')).not.toBeNull();
    expect(Array.from(el.querySelectorAll('.picker option')).map((o) => o.textContent?.trim())).toEqual(['Glow Salon']);
  });

  it('derives permissions from the caller role', () => {
    expect(setup('owner').fixture.componentInstance.canPush()).toBeTrue();
    expect(setup('editor').fixture.componentInstance.canPush()).toBeFalse();
    expect(setup('editor').fixture.componentInstance.canDraft()).toBeTrue();
    expect(setup('viewer').fixture.componentInstance.canDraft()).toBeFalse();
  });
});
