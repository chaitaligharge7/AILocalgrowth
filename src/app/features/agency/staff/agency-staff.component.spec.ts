import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AgencyStaffAssignment } from '../../../core/agency/agency.models';
import { AgencyStaffComponent } from './agency-staff.component';

const assignment: AgencyStaffAssignment = {
  id: 'assign1',
  agency_id: 'agency1',
  client_tenant_id: 't-client',
  agency_user_id: 'u-staff',
  role_code: 'editor',
  location_id: null,
  status: 'active',
  created_by: 'u-owner',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('AgencyStaffComponent', () => {
  let httpMock: HttpTestingController;

  async function setUp() {
    await TestBed.configureTestingModule({
      imports: [AgencyStaffComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ linkId: 'link1' }) } } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AgencyStaffComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/agency/clients/link1/assignments').flush({
      data: { assignments: [] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('only offers editor/analyst/viewer as role options, matching the backend allow-list', async () => {
    const fixture = await setUp();
    expect(fixture.componentInstance.roleOptions).toEqual(['editor', 'analyst', 'viewer']);

    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(['editor', 'analyst', 'viewer']);
    expect(options).not.toContain('owner');
    expect(options).not.toContain('admin');
  });

  it('marks the role control invalid for any value outside the allow-list', async () => {
    const fixture = await setUp();
    const roleControl = fixture.componentInstance.form.controls.roleCode;

    roleControl.setValue('editor' as never);
    expect(roleControl.valid).toBe(true);

    roleControl.setValue('owner' as never);
    expect(roleControl.valid).toBe(false);
    expect(roleControl.errors?.['invalidRole']).toBe(true);

    roleControl.setValue('admin' as never);
    expect(roleControl.valid).toBe(false);
  });

  it('submits a valid assignment and refreshes the list', async () => {
    const fixture = await setUp();
    fixture.componentInstance.form.setValue({ userId: 'u-staff', roleCode: 'editor' as never, locationId: '' });
    fixture.componentInstance.submit();

    const assignReq = httpMock.expectOne('/api/v1/agency/clients/link1/assign');
    expect(assignReq.request.method).toBe('POST');
    expect(assignReq.request.body).toEqual({ user_id: 'u-staff', role_code: 'editor', location_id: undefined });
    assignReq.flush({ data: assignment, meta: { request_id: 'r1' } });

    httpMock.expectOne('/api/v1/agency/clients/link1/assignments').flush({
      data: { assignments: [assignment] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.assignments()).toEqual([assignment]);
    expect(fixture.componentInstance.assignNotice()).toContain('editor');
  });

  it('surfaces a 422 role_code validation error from the backend unchanged', async () => {
    const fixture = await setUp();
    fixture.componentInstance.form.setValue({ userId: 'u-staff', roleCode: 'editor' as never, locationId: '' });
    fixture.componentInstance.submit();

    const assignReq = httpMock.expectOne('/api/v1/agency/clients/link1/assign');
    assignReq.flush(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Assignment request failed validation.',
          fields: { role_code: 'Must be one of: editor, analyst, viewer.' },
        },
        request_id: 'r1',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.fieldError('role_code')).toContain('editor, analyst, viewer');
  });

  it('revokes an assignment', async () => {
    const fixture = await setUp();
    httpMock.verify();
    // Re-seed one active assignment to revoke.
    fixture.componentInstance.assignments.set([assignment]);

    fixture.componentInstance.revoke(assignment);
    const revokeReq = httpMock.expectOne('/api/v1/agency/clients/link1/assignments/assign1/revoke');
    expect(revokeReq.request.method).toBe('POST');
    revokeReq.flush({ data: { ...assignment, status: 'revoked' }, meta: { request_id: 'r1' } });

    httpMock.expectOne('/api/v1/agency/clients/link1/assignments').flush({
      data: { assignments: [{ ...assignment, status: 'revoked' }] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.assignments()[0].status).toBe('revoked');
  });
});
