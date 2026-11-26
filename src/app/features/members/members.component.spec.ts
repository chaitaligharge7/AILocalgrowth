import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RoleMatrix, TenantInvite, TenantMember } from '../../core/members/member.models';
import { MemberService } from '../../core/members/member.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { TenantService } from '../../core/tenancy/tenant.service';
import { MembersComponent } from './members.component';

const members: TenantMember[] = [
  { user_id: 'u-owner', name: 'Olive Owner', email: 'o@example.test', role: 'owner', status: 'active', created_at: '2026-11-01T00:00:00.000Z' },
  { user_id: 'u-admin', name: 'Adam Admin', email: 'a@example.test', role: 'admin', status: 'active', created_at: '2026-11-01T00:00:00.000Z' },
  { user_id: 'u-view', name: 'Vera Viewer', email: 'v@example.test', role: 'viewer', status: 'active', created_at: '2026-11-01T00:00:00.000Z' },
];

const invites: TenantInvite[] = [
  { id: 'i1', email: 'pending@example.test', role: 'editor', status: 'pending', invited_by: 'Olive Owner', expires_at: '2026-11-08T00:00:00.000Z', created_at: '2026-11-01T00:00:00.000Z' },
];

const matrix: RoleMatrix = {
  roles: [
    { code: 'owner', name: 'Owner', permissions: ['member.manage', 'analytics.view'] },
    { code: 'viewer', name: 'Viewer', permissions: ['analytics.view'] },
  ],
  permissions: [
    { code: 'member.manage', description: 'Invite/remove members' },
    { code: 'analytics.view', description: 'View analytics' },
  ],
};

function tenant(role: Tenant['caller_role']): Tenant {
  return {
    id: 't1', display_name: 'Acme', legal_name: null, business_type: null, currency: 'INR', timezone: 'Asia/Kolkata',
    country: 'IN', status: 'active', caller_role: role, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
  };
}

describe('MembersComponent — team management', () => {
  function setup(role: Tenant['caller_role'], selfId: string, memberStub: Partial<Record<keyof MemberService, unknown>> = {}) {
    TestBed.resetTestingModule();
    const stub = {
      list: jasmine.createSpy('list').and.returnValue(of(members)),
      roleMatrix: jasmine.createSpy('roleMatrix').and.returnValue(of(matrix)),
      listInvites: jasmine.createSpy('listInvites').and.returnValue(of(invites)),
      changeRole: jasmine.createSpy('changeRole').and.returnValue(of({ user_id: 'u-view', role: 'editor', previous_role: 'viewer' })),
      remove: jasmine.createSpy('remove').and.returnValue(of({ user_id: 'u-view', status: 'removed' })),
      revokeInvite: jasmine.createSpy('revokeInvite').and.returnValue(of({ id: 'i1', status: 'revoked' })),
      ...memberStub,
    };
    TestBed.configureTestingModule({
      imports: [MembersComponent],
      providers: [
        { provide: MemberService, useValue: stub },
        { provide: TenantService, useValue: { invite: jasmine.createSpy('invite').and.returnValue(of({ email: 'x@example.test' })) } },
        { provide: CurrentTenantService, useValue: { tenant: () => tenant(role), selectedTenantId: () => 't1' } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: selfId, email: 'me@example.test', name: 'Me' }) } },
      ],
    });
    const fixture = TestBed.createComponent(MembersComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, stub, el: fixture.nativeElement as HTMLElement };
  }

  it('lets an owner edit and remove other members but never their own row', () => {
    const { component } = setup('owner', 'u-owner');
    expect(component.canEdit(members[0])).toBeFalse(); // self
    expect(component.canEdit(members[1])).toBeTrue();
    expect(component.canEdit(members[2])).toBeTrue();
    expect(component.assignableRoles()).toContain('owner');
  });

  it('never offers an admin the owner role or any action on an owner', () => {
    const { component, el } = setup('admin', 'u-admin');
    expect(component.canEdit(members[0])).toBeFalse(); // an owner
    expect(component.canEdit(members[2])).toBeTrue();
    expect(component.assignableRoles()).not.toContain('owner');
    expect(el.querySelector('[data-testid="member-u-owner"] select')).toBeNull();
    expect(el.querySelector('[data-testid="member-u-view"] select')).not.toBeNull();
  });

  it('shows no management controls, invite form or invite list to a viewer', () => {
    const { component, el, stub } = setup('viewer', 'u-view');
    expect(component.canManage()).toBeFalse();
    expect(component.canEdit(members[1])).toBeFalse();
    expect(el.querySelector('select.role-select')).toBeNull();
    expect(el.querySelector('form')).toBeNull();
    expect(stub.listInvites).not.toHaveBeenCalled();
    // but the permission matrix is visible to every member
    expect(stub.roleMatrix).toHaveBeenCalledWith('t1');
    expect(el.querySelector('[data-testid="role-matrix"]')).not.toBeNull();
  });

  it('changes a role through the API and refreshes the roster', () => {
    const { component, stub } = setup('owner', 'u-owner');
    const select = document.createElement('select');
    select.innerHTML = '<option value="viewer">viewer</option><option value="editor">editor</option>';
    select.value = 'editor';
    component.onRoleChange(members[2], { target: select } as unknown as Event);
    expect(stub.changeRole).toHaveBeenCalledWith('t1', 'u-view', 'editor');
    expect(stub.list).toHaveBeenCalledTimes(2);
    expect(component.actionNotice()).toContain('Vera Viewer');
  });

  it('shows the server refusal and restores the select when a change is rejected', () => {
    const { component } = setup('admin', 'u-admin', {
      changeRole: jasmine.createSpy('changeRole').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 403,
              error: { error: { code: 'OWNER_ONLY', message: 'Only an owner can grant the owner role.' }, request_id: 'r1' },
            }),
        ),
      ),
    });
    const select = document.createElement('select');
    select.innerHTML = '<option value="viewer">viewer</option><option value="owner">owner</option>';
    select.value = 'owner';
    component.onRoleChange(members[2], { target: select } as unknown as Event);
    expect(component.actionError()).toContain('Only an owner');
    expect(select.value).toBe('viewer');
    expect(component.busyUserId()).toBeNull();
  });

  it('removes a member and revokes an invite via the API', () => {
    const { component, stub } = setup('owner', 'u-owner');
    component.remove(members[2]);
    expect(stub.remove).toHaveBeenCalledWith('t1', 'u-view');
    expect(component.actionNotice()).toContain('removed');

    component.revoke(invites[0]);
    expect(stub.revokeInvite).toHaveBeenCalledWith('t1', 'i1');
    expect(stub.listInvites).toHaveBeenCalledTimes(2);
  });

  it('renders the pending invites and never a token', () => {
    const { el } = setup('owner', 'u-owner');
    const table = el.querySelector('[data-testid="invite-list"]');
    expect(table?.textContent).toContain('pending@example.test');
    expect(table?.textContent?.toLowerCase()).not.toContain('token');
  });
});
