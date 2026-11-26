import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { SupportDetailComponent } from './support-detail.component';
import { AuthService } from '../../core/auth/auth.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { SupportService } from '../../core/support/support.service';
import { SupportTicketDetail } from '../../core/support/support.models';
import { Tenant } from '../../core/tenancy/tenant.models';

const baseTicket: SupportTicketDetail = {
  id: 'tk1',
  tenant_id: 't1',
  requester_id: 'u1',
  assignee_id: null,
  category: 'billing',
  priority: 'normal',
  status: 'open',
  subject: 'Invoice looks wrong',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  closed_at: null,
  age_seconds: 10,
  time_since_last_response_seconds: null,
  messages: [],
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

describe('SupportDetailComponent', () => {
  function setup(role: Tenant['caller_role'], currentUserId: string, ticket: SupportTicketDetail = baseTicket) {
    const supportServiceStub = { get: jasmine.createSpy('get').and.returnValue(of(ticket)) };
    const currentTenantStub = {
      selectedTenantId: () => 't1',
      tenant: () => tenantWithRole(role),
    };
    const authStub = { currentUser: () => ({ id: currentUserId, email: 'x@example.com', name: 'X' }) };

    TestBed.configureTestingModule({
      imports: [SupportDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ ticketId: 'tk1' }) } } },
        { provide: CurrentTenantService, useValue: currentTenantStub },
        { provide: AuthService, useValue: authStub },
        { provide: SupportService, useValue: supportServiceStub },
      ],
    });

    const fixture = TestBed.createComponent(SupportDetailComponent);
    fixture.detectChanges(); // ngOnInit → load()
    return fixture.componentInstance;
  }

  it('allows an owner to change status and offers only valid next states for "open"', () => {
    const component = setup('owner', 'someone-else');
    expect(component.canChangeStatus()).toBe(true);
    expect(component.availableTransitions()).toEqual(['in_progress', 'resolved', 'closed']);
    // Never offers an invalid/no-op transition the backend state machine forbids.
    expect(component.availableTransitions()).not.toContain('waiting_customer');
    expect(component.availableTransitions()).not.toContain('open');
  });

  it('allows the ticket requester (non-owner/admin) to change status', () => {
    const component = setup('viewer', 'u1'); // u1 === baseTicket.requester_id
    expect(component.canChangeStatus()).toBe(true);
  });

  it('denies status changes to a non-owner/admin who is not the requester', () => {
    const component = setup('viewer', 'someone-else');
    expect(component.canChangeStatus()).toBe(false);
  });

  it('offers only "open" as the valid transition from "closed" (reopen)', () => {
    const closedTicket: SupportTicketDetail = { ...baseTicket, status: 'closed' };
    const component = setup('admin', 'someone-else', closedTicket);
    expect(component.availableTransitions()).toEqual(['open']);
  });

  it('offers in_progress/closed (not waiting_customer) as the valid transitions from "resolved"', () => {
    const resolvedTicket: SupportTicketDetail = { ...baseTicket, status: 'resolved' };
    const component = setup('admin', 'someone-else', resolvedTicket);
    expect(component.availableTransitions()).toEqual(['in_progress', 'closed']);
  });

  it('calls changeStatus() on the service with the chosen target status', () => {
    const supportServiceStub = {
      get: jasmine.createSpy('get').and.returnValue(of(baseTicket)),
      changeStatus: jasmine.createSpy('changeStatus').and.returnValue(of({ ...baseTicket, status: 'resolved' })),
    };
    TestBed.configureTestingModule({
      imports: [SupportDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ ticketId: 'tk1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', email: 'x@example.com', name: 'X' }) } },
        { provide: SupportService, useValue: supportServiceStub },
      ],
    });
    const fixture = TestBed.createComponent(SupportDetailComponent);
    fixture.detectChanges();
    fixture.componentInstance.changeStatus('resolved');
    expect(supportServiceStub.changeStatus).toHaveBeenCalledWith('t1', 'tk1', { status: 'resolved' });
  });

  it('shows CSAT rating card on resolved tickets and submits rating', () => {
    const resolvedTicket: SupportTicketDetail = { ...baseTicket, status: 'resolved', csat: null };
    const ratedTicket: SupportTicketDetail = {
      ...resolvedTicket,
      csat: { rating: 5, comment: 'Fast help!', rated_by: 'u1', rated_at: '2026-11-24T10:00:00.000Z' },
    };
    const supportServiceStub = {
      get: jasmine.createSpy('get').and.returnValue(of(resolvedTicket)),
      rateTicket: jasmine.createSpy('rateTicket').and.returnValue(of(ratedTicket)),
    };
    TestBed.configureTestingModule({
      imports: [SupportDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ ticketId: 'tk1' }) } } },
        { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole('owner') } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', email: 'x@example.com', name: 'X' }) } },
        { provide: SupportService, useValue: supportServiceStub },
      ],
    });
    const fixture = TestBed.createComponent(SupportDetailComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.canRate()).toBe(true);
    fixture.componentInstance.csatRating.set(5);
    fixture.componentInstance.csatComment.set('Fast help!');
    fixture.componentInstance.submitCsat();
    expect(supportServiceStub.rateTicket).toHaveBeenCalledWith('t1', 'tk1', { rating: 5, comment: 'Fast help!' });
    expect(fixture.componentInstance.ticket()?.csat?.rating).toBe(5);
    expect(fixture.componentInstance.ratingNotice()).toContain('Thanks');
  });
});
