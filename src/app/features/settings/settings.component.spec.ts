import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountService, UserSession } from '../../core/account/account.service';
import { AuthService } from '../../core/auth/auth.service';
import { SettingsService } from '../../core/settings/settings.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { SettingsComponent } from './settings.component';
import { SettingsActivityComponent } from './settings-activity.component';
import { SettingsDataComponent } from './settings-data.component';
import { SettingsNotificationsComponent } from './settings-notifications.component';
import { SettingsSessionsComponent } from './settings-sessions.component';

function tenant(role: Tenant['caller_role']): Tenant {
  return {
    id: 't1', display_name: 'Acme', legal_name: null, business_type: null, currency: 'INR', timezone: 'Asia/Kolkata',
    country: 'IN', status: 'active', caller_role: role, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
  };
}

const prefs = [
  { event_type: 'content.approval_requested', label: 'A content draft is waiting for approval', enabled: true },
  { event_type: 'usage.threshold_reached', label: 'A plan usage limit is reached', enabled: false },
];

function settingsStub(overrides: Record<string, unknown> = {}) {
  return {
    notificationPreferences: jasmine.createSpy('notificationPreferences').and.returnValue(of(prefs)),
    saveNotificationPreferences: jasmine.createSpy('saveNotificationPreferences').and.returnValue(of(prefs)),
    markAllNotificationsRead: jasmine.createSpy('markAllNotificationsRead').and.returnValue(of({ marked_read: 2 })),
    activityLog: jasmine.createSpy('activityLog').and.returnValue(of({ events: [], actions: [], filters: {} })),
    exportActivityLogCsv: jasmine.createSpy('exportActivityLogCsv').and.returnValue(of(new Blob(['a,b\n'], { type: 'text/csv' }))),
    downloadDataExport: jasmine.createSpy('downloadDataExport').and.returnValue(of(new Blob(['{}'], { type: 'application/json' }))),
    dataRequests: jasmine.createSpy('dataRequests').and.returnValue(of({ requests: [], note: 'manual' })),
    createDataRequest: jasmine.createSpy('createDataRequest').and.returnValue(of({ id: 'd1', type: 'export', status: 'pending' })),
    ...overrides,
  };
}

describe('SettingsComponent — role-aware tabs', () => {
  function setup(role: Tenant['caller_role']) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: SettingsService, useValue: settingsStub() },
        { provide: AccountService, useValue: { sessions: () => of([]) } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', email: 'a@example.test', name: 'A' }), me: () => of({ email: 'a@example.test', name: 'A', phone_e164: null }) } },
        { provide: CurrentTenantService, useValue: { tenant: () => tenant(role), selectedTenantId: () => 't1' } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim());

  it('shows every tab to an owner', () => {
    expect(labels(setup('owner').el)).toEqual(['Notifications', 'Account', 'Security', 'Activity log', 'Data & privacy']);
  });

  it('hides the data tab from an admin but keeps the activity log', () => {
    expect(labels(setup('admin').el)).toEqual(['Notifications', 'Account', 'Security', 'Activity log']);
  });

  it('shows only personal tabs to an editor/analyst/viewer', () => {
    for (const role of ['editor', 'analyst', 'viewer'] as const) {
      expect(labels(setup(role).el)).toEqual(['Notifications', 'Account', 'Security']);
    }
  });

  it('switches tab content when a tab is clicked', () => {
    const { fixture, el } = setup('owner');
    expect(el.querySelector('app-settings-notifications')).not.toBeNull();
    (Array.from(el.querySelectorAll('[role="tab"]')).find((b) => b.textContent?.includes('Security')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-settings-sessions')).not.toBeNull();
    expect(el.querySelector('app-settings-notifications')).toBeNull();
  });
});

describe('SettingsNotificationsComponent', () => {
  function setup(stub = settingsStub()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SettingsNotificationsComponent],
      providers: [
        { provide: SettingsService, useValue: stub },
        { provide: CurrentTenantService, useValue: { tenant: () => tenant('owner'), selectedTenantId: () => 't1' } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsNotificationsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, stub, el: fixture.nativeElement as HTMLElement };
  }

  it('renders each preference with its saved in-app, email, and web-push states', () => {
    const { el } = setup();
    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('[data-testid="notification-prefs"] input[type="checkbox"]'));
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, false, true, false]);
  });

  it('saves a single toggled preference', () => {
    const { component, stub } = setup();
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = false;
    component.toggle(prefs[0], { target: box } as unknown as Event);
    expect(stub.saveNotificationPreferences).toHaveBeenCalledWith('t1', [{ event_type: 'content.approval_requested', enabled: false }]);
  });

  it('reverts the checkbox and shows the error when saving fails', () => {
    const { component } = setup(
      settingsStub({
        saveNotificationPreferences: jasmine.createSpy('save').and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 500, error: { error: { code: 'X', message: 'Could not save.' }, request_id: 'r' } })),
        ),
      }),
    );
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = false;
    component.toggle(prefs[0], { target: box } as unknown as Event);
    expect(box.checked).toBeTrue();
    expect(component.saveError()).toBe('Could not save.');
  });

  it('marks all notifications read and reports the count', () => {
    const { component, stub } = setup();
    component.markAllRead();
    expect(stub.markAllNotificationsRead).toHaveBeenCalledWith('t1');
    expect(component.notice()).toBe('2 marked as read.');
  });
});

describe('SettingsSessionsComponent', () => {
  const sessions: UserSession[] = [
    { id: 's1', device: 'Chrome on Windows', signed_in_at: '2026-11-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z', current: true },
    { id: 's2', device: null, signed_in_at: '2026-11-02T00:00:00.000Z', expires_at: '2026-12-02T00:00:00.000Z', current: false },
  ];

  function setup() {
    TestBed.resetTestingModule();
    const account = {
      sessions: jasmine.createSpy('sessions').and.returnValue(of(sessions)),
      revokeSession: jasmine.createSpy('revokeSession').and.callFake((id: string) => of({ id, status: 'revoked', was_current: id === 's1' })),
      revokeOtherSessions: jasmine.createSpy('revokeOtherSessions').and.returnValue(of({ revoked: 1 })),
    };
    const auth = { clearSession: jasmine.createSpy('clearSession') };
    const router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    TestBed.configureTestingModule({
      imports: [SettingsSessionsComponent],
      providers: [
        { provide: AccountService, useValue: account },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    const fixture = TestBed.createComponent(SettingsSessionsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, account, auth, router, el: fixture.nativeElement as HTMLElement };
  }

  it('marks this device and labels an unknown one', () => {
    const { el } = setup();
    const text = el.querySelector('[data-testid="session-list"]')?.textContent ?? '';
    expect(text).toContain('Chrome on Windows');
    expect(text).toContain('This device');
    expect(text).toContain('Unknown device');
  });

  it('signs out another device without leaving the page', () => {
    const { component, account, auth, router } = setup();
    component.revoke(sessions[1]);
    expect(account.revokeSession).toHaveBeenCalledWith('s2');
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(account.sessions).toHaveBeenCalledTimes(2);
  });

  it('routes to login after the user signs out their own session', () => {
    const { component, auth, router } = setup();
    component.revoke(sessions[0]);
    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('signs out all other devices', () => {
    const { component, account } = setup();
    expect(component.otherCount()).toBe(1);
    component.revokeOthers();
    expect(account.revokeOtherSessions).toHaveBeenCalled();
    expect(component.notice()).toBe('1 device signed out.');
  });
});

describe('SettingsActivityComponent & SettingsDataComponent exports', () => {
  it('exports filtered activity log as CSV', () => {
    TestBed.resetTestingModule();
    const stub = settingsStub();
    TestBed.configureTestingModule({
      imports: [SettingsActivityComponent],
      providers: [
        { provide: SettingsService, useValue: stub },
        { provide: CurrentTenantService, useValue: { tenant: () => tenant('owner'), selectedTenantId: () => 't1' } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsActivityComponent);
    fixture.detectChanges();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');
    fixture.componentInstance.form.patchValue({ action: 'member.invited' });
    fixture.componentInstance.exportCsv();
    expect(stub.exportActivityLogCsv).toHaveBeenCalledWith('t1', { action: 'member.invited', from: '', to: '' });
  });

  it('downloads self-service JSON business data export', () => {
    TestBed.resetTestingModule();
    const stub = settingsStub();
    TestBed.configureTestingModule({
      imports: [SettingsDataComponent],
      providers: [
        { provide: SettingsService, useValue: stub },
        { provide: CurrentTenantService, useValue: { tenant: () => tenant('owner'), selectedTenantId: () => 't1' } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsDataComponent);
    fixture.detectChanges();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-json');
    spyOn(URL, 'revokeObjectURL');
    fixture.componentInstance.downloadJsonExport();
    expect(stub.downloadDataExport).toHaveBeenCalledWith('t1');
    expect(fixture.componentInstance.notice()).toContain('downloaded as JSON');
  });
});
