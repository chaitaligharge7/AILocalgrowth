import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AutomationsComponent } from './automations.component';
import { WhatsAppCampaignsComponent } from './whatsapp-campaigns.component';
import { WhatsAppUsageComponent } from './whatsapp-usage.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { AutomationService } from '../../core/automations/automation.service';
import { WhatsAppTemplateService } from '../../core/automations/whatsapp-template.service';
import { MessageService } from '../../core/automations/message.service';
import { WhatsAppInsightsService } from '../../core/automations/whatsapp-insights.service';
import { Automation } from '../../core/automations/automation.models';
import { Campaign, UsageReport } from '../../core/automations/whatsapp-insights.models';
import { WhatsAppTemplate } from '../../core/automations/whatsapp-template.models';
import { Tenant } from '../../core/tenancy/tenant.models';

function tenantWithRole(role: Tenant['caller_role']): Tenant {
  return {
    id: 't1',
    display_name: 'Acme',
    legal_name: null,
    business_type: null,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    country: 'IN',
    status: 'active',
    caller_role: role,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
}

const template: WhatsAppTemplate = {
  id: 'tpl1',
  tenant_id: 't1',
  provider: 'whatsapp',
  external_template_id: 'lead_welcome',
  category: 'utility',
  language: 'en',
  status: 'approved',
  variables: [],
  mock_provider: true,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
} as unknown as WhatsAppTemplate;

const automation: Automation = {
  id: 'a1',
  tenant_id: 't1',
  trigger_code: 'lead.follow_up',
  template_id: 'tpl1',
  rules_json: { delay_hours: 2 },
  enabled: true,
  created_by: 'u1',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const draftCampaign: Campaign = {
  id: 'c1',
  name: 'VIP offer',
  template_id: 'tpl1',
  segment_status: null,
  segment_tag: 'vip',
  status: 'draft',
  recipients_total: 0,
  outcomes: {},
  skip_reasons: {},
  mock_provider: true,
  launched_at: null,
  created_at: '2026-11-20T04:30:00.000Z',
};

const launchedCampaign: Campaign = {
  ...draftCampaign,
  id: 'c2',
  name: 'Diwali',
  status: 'launched',
  recipients_total: 2,
  outcomes: { sent: 1, skipped: 1 },
  skip_reasons: { CONSENT_NOT_GRANTED: 1 },
};

const usage: UsageReport = {
  days: 30,
  total_messages: 3,
  by_status: { sent: 2, delivered: 1 },
  by_template: [{ template_id: 'tpl1', template_category: 'utility', count: 3, cost: '0.7500' }],
  by_day: [{ day: '2026-11-20', count: 3 }],
  total_cost: '0.7500',
  cost_basis: 'mock_provider_estimate',
  mock_provider: true,
};

function tenantProvider(role: Tenant['caller_role']) {
  return { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole(role) } };
}

describe('AutomationsComponent — rule actions and tabs', () => {
  function setup(role: Tenant['caller_role'] = 'owner', automationStub: Partial<AutomationService> = {}) {
    const stub = {
      list: jasmine.createSpy('list').and.returnValue(of([automation])),
      create: jasmine.createSpy('create').and.returnValue(of(automation)),
      update: jasmine.createSpy('update').and.returnValue(of({ ...automation, enabled: false })),
      delete: jasmine.createSpy('delete').and.returnValue(of(undefined)),
      ...automationStub,
    };
    TestBed.configureTestingModule({
      imports: [AutomationsComponent],
      providers: [
        provideRouter([]),
        tenantProvider(role),
        { provide: AutomationService, useValue: stub },
        { provide: WhatsAppTemplateService, useValue: { list: () => of([template]) } },
        { provide: MessageService, useValue: { list: () => of([]) } },
        {
          provide: WhatsAppInsightsService,
          useValue: {
            listCampaigns: () => of([]),
            webhookLogs: () => of({ mock_provider: true, logs: [] }),
            consentSummary: () => of(null),
            usageReport: () => of(usage),
            config: () => of(null),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AutomationsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, stub };
  }

  it('turns a rule off through PATCH {enabled:false} and refreshes the list', () => {
    const { component, stub } = setup();
    component.toggleAutomation(automation);
    expect(stub.update).toHaveBeenCalledWith('t1', 'a1', { enabled: false });
    expect(stub.list).toHaveBeenCalledTimes(2);
  });

  it('deletes a rule and refreshes the list', () => {
    const { component, stub } = setup();
    component.deleteAutomation(automation);
    expect(stub.delete).toHaveBeenCalledWith('t1', 'a1');
    expect(stub.list).toHaveBeenCalledTimes(2);
  });

  it('shows the server error when a rule action is rejected', () => {
    const { component } = setup('owner', {
      update: jasmine.createSpy('update').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 403,
              error: { error: { code: 'FORBIDDEN', message: 'Only members with lead.manage may change automations.' }, request_id: 'r1' },
            }),
        ),
      ),
    });
    component.toggleAutomation(automation);
    expect(component.automationActionError()).toContain('lead.manage');
    expect(component.busyAutomationId()).toBeNull();
  });

  it('sends delay_hours for a follow-up rule and to_status for a status rule', () => {
    const { component, stub } = setup();
    component.automationForm.patchValue({ triggerCode: 'lead.follow_up', templateId: 'tpl1', delayHours: 6 });
    component.submitAutomation();
    expect(stub.create).toHaveBeenCalledWith(
      't1',
      jasmine.objectContaining({ trigger_code: 'lead.follow_up', rules_json: { delay_hours: 6 } }),
    );

    component.automationForm.patchValue({ triggerCode: 'lead.status_changed', templateId: 'tpl1', toStatus: 'contacted' });
    component.submitAutomation();
    expect(stub.create).toHaveBeenCalledWith(
      't1',
      jasmine.objectContaining({ trigger_code: 'lead.status_changed', rules_json: { to_status: 'contacted' } }),
    );
  });

  it('hides rule actions and the create form from a viewer', () => {
    const { fixture } = setup('viewer');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Turn off');
    expect(text).toContain('Only an owner, admin or editor');
  });

  it('switches to the usage tab and renders the real report numbers', () => {
    const { fixture, component } = setup();
    component.tab.set('usage');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Usage report');
    expect(text).toContain('0.7500');
    expect(text).toContain('not a real charge');
  });
});

describe('WhatsAppCampaignsComponent', () => {
  function setup(role: Tenant['caller_role'], campaigns: Campaign[], insightsStub: Record<string, unknown> = {}) {
    const stub = {
      listCampaigns: jasmine.createSpy('listCampaigns').and.returnValue(of(campaigns)),
      createCampaign: jasmine.createSpy('createCampaign').and.returnValue(of(draftCampaign)),
      launchCampaign: jasmine.createSpy('launchCampaign').and.returnValue(of(launchedCampaign)),
      ...insightsStub,
    };
    TestBed.configureTestingModule({
      imports: [WhatsAppCampaignsComponent],
      providers: [tenantProvider(role), { provide: WhatsAppInsightsService, useValue: stub }],
    });
    const fixture = TestBed.createComponent(WhatsAppCampaignsComponent);
    fixture.componentInstance.canManage = role !== 'viewer';
    fixture.componentInstance.templates = [template];
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, stub };
  }

  it('creates a campaign with the chosen segment and trims the tag', () => {
    const { component, stub } = setup('owner', []);
    component.form.patchValue({ name: 'VIP offer', templateId: 'tpl1', segmentStatus: 'qualified', segmentTag: ' vip ' });
    component.create();
    expect(stub.createCampaign).toHaveBeenCalledWith('t1', {
      name: 'VIP offer',
      template_id: 'tpl1',
      segment_status: 'qualified',
      segment_tag: 'vip',
    });
  });

  it('will not submit without a name and template', () => {
    const { component, stub } = setup('owner', []);
    component.create();
    expect(stub.createCampaign).not.toHaveBeenCalled();
  });

  it('launches a draft campaign and shows real outcomes + skip reasons for a launched one', () => {
    const { fixture, component, stub } = setup('owner', [draftCampaign, launchedCampaign]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Launch campaign');
    expect(text).toContain('sent · 1');
    expect(text).toContain('skipped · 1');
    expect(text).toContain('No WhatsApp consent (1)');

    component.launch(draftCampaign);
    expect(stub.launchCampaign).toHaveBeenCalledWith('t1', 'c1');
  });

  it('shows the server rejection when launching fails', () => {
    const { component } = setup('owner', [draftCampaign], {
      launchCampaign: jasmine.createSpy('launchCampaign').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: { error: { code: 'VALIDATION_ERROR', message: "No leads match this campaign's segment." }, request_id: 'r1' },
            }),
        ),
      ),
    });
    component.launch(draftCampaign);
    expect(component.actionError()).toContain('No leads match');
    expect(component.launchingId()).toBeNull();
  });

  it('hides create and launch controls from a viewer', () => {
    const { fixture } = setup('viewer', [draftCampaign]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Launch campaign');
    expect(text).not.toContain('New campaign');
  });
});

describe('WhatsAppUsageComponent', () => {
  it('reloads with the chosen window', () => {
    const usageReport = jasmine.createSpy('usageReport').and.returnValue(of(usage));
    TestBed.configureTestingModule({
      imports: [WhatsAppUsageComponent],
      providers: [tenantProvider('owner'), { provide: WhatsAppInsightsService, useValue: { usageReport } }],
    });
    const fixture = TestBed.createComponent(WhatsAppUsageComponent);
    fixture.detectChanges();
    expect(usageReport).toHaveBeenCalledWith('t1', 30);

    fixture.componentInstance.onDaysChange({ target: { value: '7' } } as unknown as Event);
    expect(usageReport).toHaveBeenCalledWith('t1', 7);
  });
});
