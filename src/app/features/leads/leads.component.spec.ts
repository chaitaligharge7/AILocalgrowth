import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LeadsComponent } from './leads.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { LeadService } from '../../core/leads/lead.service';
import { Lead, LeadStatusSummary } from '../../core/leads/lead.models';
import { LocationApiService } from '../../core/locations/location.service';
import { LocationSummary } from '../../core/locations/location.models';
import { MemberService } from '../../core/members/member.service';
import { TenantMember } from '../../core/members/member.models';
import { Tenant } from '../../core/tenancy/tenant.models';

const emptyStatusSummary: LeadStatusSummary = {
  by_status: { new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0, archived: 0 },
};

const editor: TenantMember = {
  user_id: 'u-editor',
  name: 'Eden Editor',
  email: 'eden@example.test',
  role: 'editor',
  status: 'active',
  created_at: '2026-11-01T00:00:00.000Z',
};

function leadServiceDefaults() {
  return {
    statusSummary: jasmine.createSpy('statusSummary').and.returnValue(of(emptyStatusSummary)),
    sourcesSummary: jasmine.createSpy('sourcesSummary').and.returnValue(of({ by_source: {} })),
  };
}

function memberServiceStub(members: TenantMember[] = [editor]) {
  return { provide: MemberService, useValue: { list: jasmine.createSpy('list').and.returnValue(of(members)) } };
}

const mainLocation: LocationSummary = {
  id: 'loc-1',
  name: 'Glow Salon Main',
  category: 'Beauty salon',
  status: 'active',
  timezone: 'Asia/Kolkata',
  phone: null,
  website: null,
  address: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

function locationServiceStub(locations: LocationSummary[] = [mainLocation]) {
  return { provide: LocationApiService, useValue: { list: jasmine.createSpy('list').and.returnValue(of(locations)) } };
}

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

const createdLead: Lead = {
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
};

describe('LeadsComponent — consent-required validation on creation', () => {
  function setup(leadServiceStub: Partial<LeadService> = {}) {
    const defaultStub = {
      ...leadServiceDefaults(),
      list: jasmine.createSpy('list').and.returnValue(of([])),
      create: jasmine.createSpy('create').and.returnValue(of(createdLead)),
    };
    const stub = { ...defaultStub, ...leadServiceStub };

    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: stub },
        memberServiceStub(),
        locationServiceStub(),
      ],
    });

    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges(); // ngOnInit → refresh()
    return { component: fixture.componentInstance, leadServiceStub: stub };
  }

  it('requires a consent_status value — the form control is required and defaults to "unknown", never empty', () => {
    const { component } = setup();
    expect(component.form.controls.consentStatus.hasValidator).toBeDefined();
    expect(component.form.getRawValue().consentStatus).toBe('unknown');
    component.form.controls.consentStatus.setValue('' as never);
    expect(component.form.controls.consentStatus.valid).toBe(false);
  });

  it('blocks submission when neither phone nor email is provided (phoneOrEmailRequired)', () => {
    const { component, leadServiceStub } = setup();
    component.form.patchValue({ name: 'No Contact', phone: '', email: '', source: 'manual', consentStatus: 'granted' });
    expect(component.form.errors?.['phoneOrEmailRequired']).toBe(true);
    component.submit();
    expect(leadServiceStub.create).not.toHaveBeenCalled();
  });

  it('allows submission once phone is filled in (email still empty)', () => {
    const { component, leadServiceStub } = setup();
    component.form.patchValue({ name: 'Has Phone', phone: '+919999999999', email: '', source: 'manual', consentStatus: 'granted' });
    expect(component.form.errors).toBeNull();
    component.submit();
    expect(leadServiceStub.create).toHaveBeenCalledWith(
      't1',
      jasmine.objectContaining({ consent_status: 'granted', phone: '+919999999999' }),
    );
  });

  it('sends the chosen consent_status through to the backend unchanged', () => {
    const { component, leadServiceStub } = setup();
    component.form.patchValue({ email: 'lead@example.com', consentStatus: 'declined' });
    component.submit();
    expect(leadServiceStub.create).toHaveBeenCalledWith(
      't1',
      jasmine.objectContaining({ consent_status: 'declined' }),
    );
  });

  it('hides the create form for a viewer (no lead.manage permission)', () => {
    const { component } = setup();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('viewer') } },
        {
          provide: LeadService,
          useValue: { ...leadServiceDefaults(), list: jasmine.createSpy('list').and.returnValue(of([])), create: jasmine.createSpy('create') },
        },
        memberServiceStub(),
        locationServiceStub(),
      ],
    });
    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.canManage()).toBe(false);
    expect(component.canManage()).toBe(true); // sanity: original owner setup unaffected
  });
});

describe('LeadsComponent — list-pattern search filter (client-side over the already-fetched page)', () => {
  const leads: Lead[] = [
    createdLead,
    {
      ...createdLead,
      id: 'l2',
      name: 'Amit Verma',
      phone: null,
      email: 'amit@example.com',
      source: 'google',
    },
  ];

  function setup() {
    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: { ...leadServiceDefaults(), list: jasmine.createSpy('list').and.returnValue(of(leads)), create: jasmine.createSpy('create') } },
        memberServiceStub(),
        locationServiceStub(),
      ],
    });
    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance };
  }

  it('shows every fetched lead when no search term is set', () => {
    const { component } = setup();
    expect(component.filteredLeads().length).toBe(2);
  });

  it('filters the already-fetched leads by name/phone/email/source — no extra API call', () => {
    const { component } = setup();
    component.searchTerm.set('amit');
    expect(component.filteredLeads().length).toBe(1);
    expect(component.filteredLeads()[0].id).toBe('l2');
  });

  it('is case-insensitive and matches on phone too', () => {
    const { component } = setup();
    component.searchTerm.set('9999999999');
    expect(component.filteredLeads().map((l) => l.id)).toEqual(['l1']);
  });
});

describe('LeadsComponent — board, funnel, sources and owner names (BW-095/098/100/096)', () => {
  const leads: Lead[] = [
    { ...createdLead, id: 'l1', status: 'new', owner_id: 'u-editor', tags: ['vip'] },
    { ...createdLead, id: 'l2', status: 'qualified', source: 'google' },
    { ...createdLead, id: 'l3', status: 'new', source: 'google' },
  ];

  function setup(role: Tenant['caller_role'] = 'owner') {
    const update = jasmine.createSpy('update').and.returnValue(of(createdLead));
    const list = jasmine.createSpy('list').and.returnValue(of(leads));
    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole(role) } },
        {
          provide: LeadService,
          useValue: {
            list,
            update,
            create: jasmine.createSpy('create'),
            statusSummary: jasmine.createSpy('statusSummary').and.returnValue(
              of({ by_status: { ...emptyStatusSummary.by_status, new: 2, qualified: 1 } }),
            ),
            sourcesSummary: jasmine.createSpy('sourcesSummary').and.returnValue(of({ by_source: { manual: 1, google: 2 } })),
          },
        },
        memberServiceStub(),
        locationServiceStub(),
      ],
    });
    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, update, list };
  }

  it('groups leads into board columns by their real status', () => {
    const { component } = setup();
    const columns = component.boardColumns();
    expect(columns.new.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(columns.qualified.map((l) => l.id)).toEqual(['l2']);
    expect(columns.won.length).toBe(0);
  });

  it('only offers transitions the lead state machine allows from the current status', () => {
    const { component } = setup();
    expect(component.transitionsFor(leads[0])).toEqual(['contacted', 'qualified', 'lost', 'archived']);
    expect(component.transitionsFor(leads[1])).toEqual(['proposal', 'lost', 'archived']);
  });

  it('moveLead calls the existing PATCH update with the chosen stage, then refreshes', () => {
    const { component, update, list } = setup();
    const select = document.createElement('select');
    select.innerHTML = '<option value=""></option><option value="contacted">contacted</option>';
    select.value = 'contacted';
    component.moveLead(leads[0], { target: select } as unknown as Event);
    expect(update).toHaveBeenCalledWith('t1', 'l1', { status: 'contacted' });
    expect(list.calls.count()).toBe(2); // initial load + refresh after the move
  });

  it('builds the funnel and source rows from the real summary endpoints (sources sorted by count)', () => {
    const { component } = setup();
    expect(component.statusSummary()?.by_status.new).toBe(2);
    expect(component.funnelMax()).toBe(2);
    expect(component.sourceRows()).toEqual([
      { source: 'google', count: 2 },
      { source: 'manual', count: 1 },
    ]);
    expect(component.barPercent(1, component.funnelMax())).toBe(50);
  });

  it('resolves a lead owner_id to the real member name, and null when unassigned/unknown', () => {
    const { component } = setup();
    expect(component.ownerName('u-editor')).toBe('Eden Editor');
    expect(component.ownerName(null)).toBeNull();
    expect(component.ownerName('someone-else')).toBeNull();
  });

  it('renders the board view with a column per status when toggled', () => {
    const { component, fixture } = setup();
    component.view.set('board');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="lead-board"] .board-column').length).toBe(7);
  });
});

describe('LeadsComponent — tag filter, date range and location picker (BW-099/100 leftovers)', () => {
  const leads: Lead[] = [
    { ...createdLead, id: 'l1', tags: ['vip', 'bridal'] },
    { ...createdLead, id: 'l2', tags: ['vip'] },
  ];

  function setup() {
    const list = jasmine.createSpy('list').and.returnValue(of(leads));
    const statusSummary = jasmine.createSpy('statusSummary').and.returnValue(of(emptyStatusSummary));
    const sourcesSummary = jasmine.createSpy('sourcesSummary').and.returnValue(of({ by_source: {} }));
    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: LeadService, useValue: { list, statusSummary, sourcesSummary, create: jasmine.createSpy('create') } },
        memberServiceStub(),
        locationServiceStub(),
      ],
    });
    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, list, statusSummary, sourcesSummary };
  }

  function change(el: HTMLInputElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('change'));
  }

  it('collects every tag seen on fetched leads as filter suggestions (sorted, unique)', () => {
    const { component } = setup();
    expect(component.knownTags()).toEqual(['bridal', 'vip']);
  });

  it('sends the normalised tag to the list endpoint when the tag filter changes', () => {
    const { fixture, list } = setup();
    const input = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="tag-filter"]') as HTMLInputElement;
    change(input, '  VIP ');
    expect(list.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ tag: 'vip' }));
  });

  it('passes the same inclusive date range to the list and BOTH summaries', () => {
    const { component, fixture, list, statusSummary, sourcesSummary } = setup();
    const [from, to] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="date-range"] input')) as HTMLInputElement[];
    change(from, '2026-11-01');
    change(to, '2026-11-15');
    expect(component.dateFrom()).toBe('2026-11-01');
    expect(list.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ from: '2026-11-01', to: '2026-11-15' }));
    expect(statusSummary.calls.mostRecent().args[1]).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(sourcesSummary.calls.mostRecent().args[1]).toEqual({ from: '2026-11-01', to: '2026-11-15' });
  });

  it('rejects a reversed range client-side without refetching, then clears it', () => {
    const { component, list } = setup();
    component.dateFrom.set('2026-11-20');
    const callsBefore = list.calls.count();
    component.onDateChange('to', { target: { value: '2026-11-01' } } as unknown as Event);
    expect(component.dateRangeError()).toContain('must not be after');
    expect(list.calls.count()).toBe(callsBefore);

    component.clearDates();
    expect(component.dateFrom()).toBe('');
    expect(component.dateTo()).toBe('');
    expect(component.dateRangeError()).toBeNull();
    expect(list.calls.count()).toBe(callsBefore + 1);
  });

  it('loads real locations and renders the Create new lead link for managers', () => {
    const { component, fixture } = setup();
    expect(component.locations().map((l) => l.id)).toEqual(['loc-1']);
    const createLink = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="create-new-lead"]') as HTMLAnchorElement | null;
    expect(createLink).not.toBeNull();
    expect(createLink?.getAttribute('href')).toContain('/app/t1/leads/new');
  });
});
