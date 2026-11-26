import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { LeadDetailComponent } from './lead-detail.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { LeadService } from '../../core/leads/lead.service';
import { LeadCustomFieldDef, LeadDetail } from '../../core/leads/lead.models';
import { MemberService } from '../../core/members/member.service';

const memberServiceProvider = {
  provide: MemberService,
  useValue: {
    list: () =>
      of([
        { user_id: 'u-editor', name: 'Eden Editor', email: 'e@example.test', role: 'editor', status: 'active', created_at: '2026-11-01T00:00:00.000Z' },
      ]),
  },
};
import { Tenant } from '../../core/tenancy/tenant.models';

const baseLead: LeadDetail = {
  id: 'l1',
  tenant_id: 't1',
  location_id: null,
  source: 'manual',
  external_lead_id: null,
  name: 'Jane Doe',
  phone: '+919999999999',
  email: null,
  status: 'new',
  owner_id: null,
  consent_status: 'granted',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  activities: [],
};

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

describe('LeadDetailComponent — status transition gating (mirrors LeadStateMachine)', () => {
  function setup(role: Tenant['caller_role'], lead: LeadDetail = baseLead) {
    TestBed.resetTestingModule();
    const leadServiceStub = {
      listFields: jasmine.createSpy('listFields').and.returnValue(of([])),
      get: jasmine.createSpy('get').and.returnValue(of(lead)),
    };
    const currentTenantStub = {
      selectedTenantId: () => 't1',
      tenant: () => tenantWithRole(role),
    };

    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: currentTenantStub },
        { provide: LeadService, useValue: leadServiceStub },
        memberServiceProvider,
      ],
    });

    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges(); // ngOnInit → load()
    return { component: fixture.componentInstance, leadServiceStub };
  }

  it('offers only the valid next states for "new" (contacted/qualified/lost/archived)', () => {
    const { component } = setup('owner');
    expect(component.availableTransitions()).toEqual(['contacted', 'qualified', 'lost', 'archived']);
    expect(component.availableTransitions()).not.toContain('proposal');
    expect(component.availableTransitions()).not.toContain('won');
  });

  it('offers only "proposal/lost/archived" from "qualified" (not "new" or "won" directly)', () => {
    const qualified: LeadDetail = { ...baseLead, status: 'qualified' };
    const { component } = setup('owner', qualified);
    expect(component.availableTransitions()).toEqual(['proposal', 'lost', 'archived']);
  });

  it('offers only "archived" from "won" (terminal except for archiving)', () => {
    const won: LeadDetail = { ...baseLead, status: 'won' };
    const { component } = setup('owner', won);
    expect(component.availableTransitions()).toEqual(['archived']);
  });

  it('offers no transitions out of "archived" (true terminal state)', () => {
    const archived: LeadDetail = { ...baseLead, status: 'archived' };
    const { component } = setup('owner', archived);
    expect(component.availableTransitions()).toEqual([]);
  });

  it('allows owner/admin/editor to manage status and owner (lead.manage permission)', () => {
    expect(setup('owner').component.canManage()).toBe(true);
    expect(setup('admin').component.canManage()).toBe(true);
    expect(setup('editor').component.canManage()).toBe(true);
  });

  it('denies analyst/viewer from managing status and owner', () => {
    expect(setup('analyst').component.canManage()).toBe(false);
    expect(setup('viewer').component.canManage()).toBe(false);
  });

  it('calls update() on the service with the chosen target status', () => {
    const leadServiceStub = {
      listFields: jasmine.createSpy('listFields').and.returnValue(of([])),
      get: jasmine.createSpy('get').and.returnValue(of(baseLead)),
      update: jasmine.createSpy('update').and.returnValue(of({ ...baseLead, status: 'contacted' })),
    };
    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: leadServiceStub },
        memberServiceProvider,
      ],
    });
    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges();
    fixture.componentInstance.changeStatus('contacted');
    expect(leadServiceStub.update).toHaveBeenCalledWith('t1', 'l1', { status: 'contacted' });
  });

  it('requires due_at for a task/reminder activity before calling the service', () => {
    const leadServiceStub = {
      listFields: jasmine.createSpy('listFields').and.returnValue(of([])),
      get: jasmine.createSpy('get').and.returnValue(of(baseLead)),
      addActivity: jasmine.createSpy('addActivity'),
    };
    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: leadServiceStub },
        memberServiceProvider,
      ],
    });
    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.setValue({ type: 'task', note: 'Follow up tomorrow', dueAt: '' });
    component.submitActivity();
    expect(leadServiceStub.addActivity).not.toHaveBeenCalled();
    expect(component.activityError()).toContain('due_at is required');
  });

  it('shows the real member name for the lead owner', () => {
    const { component } = setup('owner', { ...baseLead, owner_id: 'u-editor' });
    expect(component.ownerName()).toBe('Eden Editor');
  });

  it('adds a tag through the service and replaces the lead with the response (BW-099)', () => {
    const tagged: LeadDetail = { ...baseLead, tags: ['vip'] };
    const leadServiceStub = {
      listFields: jasmine.createSpy('listFields').and.returnValue(of([])),
      get: jasmine.createSpy('get').and.returnValue(of(baseLead)),
      addTag: jasmine.createSpy('addTag').and.returnValue(of(tagged)),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: leadServiceStub },
        memberServiceProvider,
      ],
    });
    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.tagInput.set('  VIP ');
    component.addTag(new Event('submit'));
    expect(leadServiceStub.addTag).toHaveBeenCalledWith('t1', 'l1', 'VIP');
    expect(component.lead()?.tags).toEqual(['vip']);
    expect(component.tagInput()).toBe('');
  });

  it('removes a tag through the service (BW-099)', () => {
    const leadServiceStub = {
      listFields: jasmine.createSpy('listFields').and.returnValue(of([])),
      get: jasmine.createSpy('get').and.returnValue(of({ ...baseLead, tags: ['vip'] })),
      removeTag: jasmine.createSpy('removeTag').and.returnValue(of({ ...baseLead, tags: [] })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: leadServiceStub },
        memberServiceProvider,
      ],
    });
    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges();
    fixture.componentInstance.removeTag('vip');
    expect(leadServiceStub.removeTag).toHaveBeenCalledWith('t1', 'l1', 'vip');
    expect(fixture.componentInstance.lead()?.tags).toEqual([]);
  });
});

describe('LeadDetailComponent — custom fields (BW-099 leftover)', () => {
  const defs: LeadCustomFieldDef[] = [
    { id: 'd1', field_key: 'preferred_stylist', label: 'Preferred stylist', field_type: 'text', options: null },
    { id: 'd2', field_key: 'skin_type', label: 'Skin type', field_type: 'select', options: ['dry', 'oily'] },
  ];

  function setup(role: Tenant['caller_role'] = 'owner', lead: LeadDetail = { ...baseLead, custom_fields: { preferred_stylist: 'Anita' } }) {
    TestBed.resetTestingModule();
    const stub = {
      get: jasmine.createSpy('get').and.returnValue(of(lead)),
      listFields: jasmine.createSpy('listFields').and.returnValue(of(defs)),
      setFieldValues: jasmine.createSpy('setFieldValues').and.returnValue(of({ ...lead, custom_fields: { preferred_stylist: 'Meera', skin_type: 'oily' } })),
      createField: jasmine
        .createSpy('createField')
        .and.returnValue(of({ id: 'd3', field_key: 'budget', label: 'Budget', field_type: 'number', options: null } as LeadCustomFieldDef)),
      deleteField: jasmine.createSpy('deleteField').and.returnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [LeadDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ leadId: 'l1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole(role) } },
        { provide: LeadService, useValue: stub },
        memberServiceProvider,
      ],
    });
    const fixture = TestBed.createComponent(LeadDetailComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, stub };
  }

  it('loads the tenant field definitions and shows the saved value of each field', () => {
    const { component, fixture, stub } = setup();
    expect(stub.listFields).toHaveBeenCalledWith('t1');
    expect(component.fieldDefs().length).toBe(2);
    expect(component.fieldValue('preferred_stylist')).toBe('Anita');
    expect(component.fieldValue('skin_type')).toBe('');
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="lead-custom-fields"] .cf-row');
    expect(labels.length).toBe(2);
  });

  it('only sends changed fields, and clears the draft + shows the saved lead on success', () => {
    const { component, stub } = setup();
    expect(component.fieldsDirty()).toBeFalse();
    component.setDraft('preferred_stylist', 'Meera');
    component.setDraft('skin_type', 'oily');
    component.setDraft('preferred_stylist', 'Anita'); // back to saved value -> no longer a change
    expect(component.fieldDraft()).toEqual({ skin_type: 'oily' });
    component.setDraft('preferred_stylist', 'Meera');
    component.saveFields();
    expect(stub.setFieldValues).toHaveBeenCalledWith('t1', 'l1', { skin_type: 'oily', preferred_stylist: 'Meera' });
    expect(component.fieldDraft()).toEqual({});
    expect(component.fieldValue('skin_type')).toBe('oily');
    expect(component.fieldsMessage()).toBe('Saved.');
  });

  it('lets an owner define a field (select options split on commas) and delete one', () => {
    const { component, stub } = setup('owner');
    component.newFieldLabel.set('Skin tone');
    component.newFieldType.set('select');
    component.newFieldOptions.set(' fair, medium ,, deep ');
    component.defineField(new Event('submit'));
    expect(stub.createField).toHaveBeenCalledWith('t1', { label: 'Skin tone', field_type: 'select', options: ['fair', 'medium', 'deep'] });
    expect(component.fieldDefs().map((d) => d.id)).toContain('d3');

    component.deleteField(defs[0]);
    expect(stub.deleteField).toHaveBeenCalledWith('t1', 'd1');
    expect(component.fieldDefs().map((d) => d.id)).not.toContain('d1');
  });

  it('hides the define-field form for a viewer (backend 403s regardless) but still allows filling values', () => {
    const { fixture, component } = setup('viewer');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="define-field"]')).toBeNull();
    component.setDraft('skin_type', 'dry');
    expect(component.fieldsDirty()).toBeTrue();
  });
});
