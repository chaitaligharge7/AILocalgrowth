import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminTenantsComponent } from './admin-tenants.component';
import { AdminService } from '../../../core/admin/admin.service';
import { AdminTenant } from '../../../core/admin/admin.models';

const activeTenant: AdminTenant = {
  id: 't1',
  display_name: 'Acme Salon',
  legal_name: null,
  status: 'active',
  owner_user_id: 'u1',
  currency: 'INR',
  country: 'IN',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

describe('AdminTenantsComponent', () => {
  function setup() {
    const adminStub = {
      listTenants: jasmine.createSpy('listTenants').and.returnValue(of([activeTenant])),
      updateTenantStatus: jasmine.createSpy('updateTenantStatus').and.returnValue(of({ ...activeTenant, status: 'suspended' as const })),
    };
    TestBed.configureTestingModule({
      imports: [AdminTenantsComponent],
      providers: [{ provide: AdminService, useValue: adminStub }, provideRouter([])],
    });
    const fixture = TestBed.createComponent(AdminTenantsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, adminStub };
  }

  it('the reason field is required — the form is invalid with an empty reason', () => {
    const { component } = setup();
    component.startEdit(activeTenant);
    component.form.patchValue({ status: 'suspended', reason: '' });
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.reason.hasError('required')).toBe(true);
  });

  it('refuses to submit without a reason, even if called directly', () => {
    const { component, adminStub } = setup();
    component.startEdit(activeTenant);
    component.form.patchValue({ status: 'suspended', reason: '' });
    component.submit(activeTenant);
    expect(adminStub.updateTenantStatus).not.toHaveBeenCalled();
  });

  it('submits status + reason together once the reason is filled in', () => {
    const { component, adminStub } = setup();
    component.startEdit(activeTenant);
    component.form.patchValue({ status: 'suspended', reason: 'Non-payment for 60 days' });
    expect(component.form.valid).toBe(true);
    component.submit(activeTenant);
    expect(adminStub.updateTenantStatus).toHaveBeenCalledWith('t1', { status: 'suspended', reason: 'Non-payment for 60 days' });
  });

  it('updates the tenant row in place after a successful status change', () => {
    const { component } = setup();
    component.startEdit(activeTenant);
    component.form.patchValue({ status: 'suspended', reason: 'Non-payment' });
    component.submit(activeTenant);
    expect(component.tenants().find((t) => t.id === 't1')?.status).toBe('suspended');
    expect(component.editingId()).toBeNull();
  });
});
