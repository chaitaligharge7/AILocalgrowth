import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MemberService } from './member.service';
import { RoleMatrix, TenantInvite, TenantMember } from './member.models';

describe('MemberService', () => {
  let service: MemberService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MemberService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the tenant members from GET /tenants/{t}/members', () => {
    const member: TenantMember = {
      user_id: 'u1',
      name: 'Owner One',
      email: 'owner@example.test',
      role: 'owner',
      status: 'active',
      created_at: '2026-11-01T00:00:00.000Z',
    };
    let result: TenantMember[] | undefined;
    service.list('t1').subscribe((members) => (result = members));
    const req = httpMock.expectOne('/api/v1/tenants/t1/members');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { members: [member] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([member]);
  });

  it('loads the role/permission matrix from GET /tenants/{t}/roles', () => {
    const matrix: RoleMatrix = {
      roles: [{ code: 'viewer', name: 'Viewer', permissions: ['analytics.view'] }],
      permissions: [{ code: 'analytics.view', description: 'View analytics' }],
    };
    let result: RoleMatrix | undefined;
    service.roleMatrix('t1').subscribe((m) => (result = m));
    const req = httpMock.expectOne('/api/v1/tenants/t1/roles');
    expect(req.request.method).toBe('GET');
    req.flush({ data: matrix, meta: { request_id: 'r1' } });
    expect(result).toEqual(matrix);
  });

  it('changes a role with PATCH /tenants/{t}/members/{userId} and a role_code body', () => {
    service.changeRole('t1', 'u 2', 'admin').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/members/u%202');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role_code: 'admin' });
    req.flush({ data: { user_id: 'u 2', role: 'admin', previous_role: 'editor' }, meta: { request_id: 'r1' } });
  });

  it('removes a member with DELETE /tenants/{t}/members/{userId}', () => {
    service.remove('t1', 'u2').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/members/u2');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { user_id: 'u2', status: 'removed' }, meta: { request_id: 'r1' } });
  });

  it('lists and revokes invites', () => {
    const invite: TenantInvite = {
      id: 'i1',
      email: 'new@example.test',
      role: 'viewer',
      status: 'pending',
      invited_by: 'Owner One',
      expires_at: '2026-11-08T00:00:00.000Z',
      created_at: '2026-11-01T00:00:00.000Z',
    };
    let result: TenantInvite[] | undefined;
    service.listInvites('t1').subscribe((invites) => (result = invites));
    const list = httpMock.expectOne('/api/v1/tenants/t1/invites');
    expect(list.request.method).toBe('GET');
    list.flush({ data: { invites: [invite] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([invite]);

    service.revokeInvite('t1', 'i1').subscribe();
    const revoke = httpMock.expectOne('/api/v1/tenants/t1/invites/i1');
    expect(revoke.request.method).toBe('DELETE');
    revoke.flush({ data: { id: 'i1', status: 'revoked' }, meta: { request_id: 'r1' } });
  });
});
