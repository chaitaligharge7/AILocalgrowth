import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LocationApiService } from '../../../core/locations/location.service';
import { CurrentTenantService } from '../../../core/tenancy/current-tenant.service';
import { Tenant } from '../../../core/tenancy/tenant.models';
import { TenantService } from '../../../core/tenancy/tenant.service';
import { ChooseTenantComponent } from './choose-tenant.component';

const created = (o: Partial<Tenant> = {}): Tenant =>
  ({ id: 't9', display_name: 'Glow Salon', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', caller_role: 'owner', default_location_id: 'loc1', ...o }) as Tenant;

describe('ChooseTenantComponent create-business wizard', () => {
  let navigate: jasmine.Spy;

  function setup(tenantSvc: Partial<Record<keyof TenantService, unknown>>, locationSvc: Partial<Record<keyof LocationApiService, unknown>>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ChooseTenantComponent],
      providers: [
        provideRouter([]),
        { provide: TenantService, useValue: { list: () => of([]), ...tenantSvc } },
        { provide: LocationApiService, useValue: locationSvc },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(ChooseTenantComponent);
    fixture.detectChanges();
    return fixture;
  }

  function fillName(fixture: ReturnType<typeof setup>, name: string, type = ''): void {
    fixture.componentInstance.createForm.setValue({ displayName: name, businessType: type });
  }

  it('step 1 creates the business (with the optional type) and moves to step 2 without leaving', () => {
    const create = jasmine.createSpy('create').and.returnValue(of(created()));
    const fixture = setup({ create }, {});
    fillName(fixture, 'Glow Salon', 'Salon');
    fixture.componentInstance.submitCreate();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledOnceWith({ display_name: 'Glow Salon', business_type: 'Salon' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="wizard-step"]')?.textContent).toContain('Step 2 of 2');
    expect(el.querySelector('[data-test="tenant-created"]')?.textContent).toContain('has been created');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('omits the business type when it was left blank', () => {
    const create = jasmine.createSpy('create').and.returnValue(of(created()));
    const fixture = setup({ create }, {});
    fillName(fixture, 'Glow Salon');
    fixture.componentInstance.submitCreate();
    expect(create).toHaveBeenCalledOnceWith({ display_name: 'Glow Salon' });
  });

  it('step 2 sends only the fields that were filled in, then opens the business', () => {
    const update = jasmine.createSpy('update').and.returnValue(of({}));
    const fixture = setup({ create: () => of(created()) }, { update });
    fillName(fixture, 'Glow Salon');
    fixture.componentInstance.submitCreate();
    fixture.componentInstance.detailsForm.setValue({ category: 'Hair salon', phone: '', website: '', city: 'Pune' });
    fixture.componentInstance.submitDetails();
    expect(update).toHaveBeenCalledOnceWith('t9', 'loc1', { category: 'Hair salon', address: { city: 'Pune', country: 'IN' } });
    expect(navigate).toHaveBeenCalledWith(['/app', 't9', 'dashboard']);
  });

  it('saving nothing just opens the business and never calls the location API', () => {
    const update = jasmine.createSpy('update');
    const fixture = setup({ create: () => of(created()) }, { update });
    fillName(fixture, 'Glow Salon');
    fixture.componentInstance.submitCreate();
    fixture.componentInstance.submitDetails();
    expect(update).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/app', 't9', 'dashboard']);
  });

  it('when step 2 fails it says the business exists, shows the server reason and lets the user continue', () => {
    const update = jasmine.createSpy('update').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'VALIDATION_ERROR', message: 'Location failed validation.', fields: { phone: 'phone must be 6-20 digits.' } } } })),
    );
    const fixture = setup({ create: () => of(created()) }, { update });
    fillName(fixture, 'Glow Salon');
    fixture.componentInstance.submitCreate();
    fixture.componentInstance.detailsForm.setValue({ category: '', phone: 'abc', website: '', city: '' });
    fixture.componentInstance.submitDetails();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[data-test="details-error"]')?.textContent).toContain('Your business was created, but these details were not saved');
    expect(el.textContent).toContain('Location failed validation');
    expect(el.textContent).toContain('phone must be 6-20 digits');
    (el.querySelector('[data-test="skip-details"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/app', 't9', 'dashboard']);
  });

  it('is honest when the create response has no default location', () => {
    const update = jasmine.createSpy('update');
    const fixture = setup({ create: () => of(created({ default_location_id: undefined })) }, { update });
    fillName(fixture, 'Glow Salon');
    fixture.componentInstance.submitCreate();
    fixture.componentInstance.detailsForm.setValue({ category: 'Hair salon', phone: '', website: '', city: '' });
    fixture.componentInstance.submitDetails();
    fixture.detectChanges();
    expect(update).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="details-error"]')?.textContent).toContain('location could not be found');
  });

  it('a failed step 1 shows the server message and stays on step 1', () => {
    const fixture = setup({ create: () => throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'VALIDATION_ERROR', message: 'Tenant failed validation.' } } })) }, {});
    fillName(fixture, 'x');
    fixture.componentInstance.submitCreate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Tenant failed validation');
    expect(el.querySelector('[data-test="wizard-step"]')?.textContent).toContain('Step 1 of 2');
    expect(TestBed.inject(CurrentTenantService).tenant()).toBeNull();
  });
});
