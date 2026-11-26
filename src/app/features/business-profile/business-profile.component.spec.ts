import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BusinessProfileComponent } from './business-profile.component';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { LocationApiService } from '../../core/locations/location.service';
import { LocationProfile, LocationSummary } from '../../core/locations/location.models';

const summary: LocationSummary = {
  id: 'loc-1',
  name: 'Glow Salon Main',
  category: 'Beauty salon',
  status: 'active',
  timezone: 'Asia/Kolkata',
  phone: '+91 98765 43210',
  website: null,
  address: { city: 'Chennai' },
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

function hoursWith(configuredDays: number[]) {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    configured: configuredDays.includes(weekday),
    is_closed: weekday === 6 && configuredDays.includes(6),
    opens_at: configuredDays.includes(weekday) && weekday !== 6 ? '10:00' : null,
    closes_at: configuredDays.includes(weekday) && weekday !== 6 ? '20:00' : null,
  }));
}

const profile: LocationProfile = {
  ...summary,
  lat: null,
  lng: null,
  hours: hoursWith([0, 1, 6]),
  holidays: [{ date: '2026-11-08', label: 'Diwali', is_closed: true, opens_at: null, closes_at: null }],
  secondary_categories: ['Spa'],
  attributes: { wifi: 'yes' },
  service_areas: [{ area_type: 'pincode', area_name: '600002' }],
  service_count: 1,
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

function setup(role: Tenant['caller_role'] = 'owner', locations: LocationSummary[] = [summary]) {
  const api = {
    list: jasmine.createSpy('list').and.returnValue(of(locations)),
    get: jasmine.createSpy('get').and.returnValue(of(profile)),
    update: jasmine.createSpy('update').and.returnValue(of({ ...profile, name: 'Renamed' })),
    setHours: jasmine.createSpy('setHours').and.returnValue(of(profile)),
    setHolidays: jasmine.createSpy('setHolidays').and.returnValue(of(profile)),
    setCategories: jasmine.createSpy('setCategories').and.returnValue(of(profile)),
    setServiceAreas: jasmine.createSpy('setServiceAreas').and.returnValue(of(profile)),
    listServices: jasmine.createSpy('listServices').and.returnValue(
      of([{ id: 's1', name: 'Haircut', description: null, price: '499.00', currency: 'INR', duration_minutes: 45, is_active: true }]),
    ),
    createService: jasmine.createSpy('createService').and.returnValue(of({ id: 's2' })),
    updateService: jasmine.createSpy('updateService').and.returnValue(of({ id: 's1' })),
    deleteService: jasmine.createSpy('deleteService').and.returnValue(of(undefined)),
    create: jasmine.createSpy('create').and.returnValue(of({ ...profile, id: 'loc-2', name: 'Branch' })),
    archive: jasmine.createSpy('archive').and.returnValue(of(undefined)),
    history: jasmine.createSpy('history').and.returnValue(
      of([{ id: 'e1', action: 'location.service_added', actor_name: 'Owner One', before: null, after: { service: 'Facial' }, created_at: '2026-11-02T10:00:00.000Z' }]),
    ),
  };
  TestBed.configureTestingModule({
    imports: [BusinessProfileComponent],
    providers: [
      { provide: CurrentTenantService, useValue: { selectedTenantId: () => 't1', tenant: () => tenantWithRole(role) } },
      { provide: LocationApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(BusinessProfileComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, api, root: fixture.nativeElement as HTMLElement };
}

describe('BusinessProfileComponent', () => {
  it('loads the real location list and the selected location profile into the details form', () => {
    const { component, api } = setup();
    expect(api.list).toHaveBeenCalledWith('t1');
    expect(api.get).toHaveBeenCalledWith('t1', 'loc-1');
    expect(component.detailsForm.getRawValue().name).toBe('Glow Salon Main');
    expect(component.detailsForm.getRawValue().city).toBe('Chennai');
  });

  it('shows "not set" for weekdays that were never configured instead of treating them as closed', () => {
    const { component, fixture, root } = setup();
    component.openTab('hours');
    fixture.detectChanges();
    expect(component.hoursConfigured(0)).toBeTrue();
    expect(component.hoursConfigured(2)).toBeFalse();
    expect(root.querySelectorAll('[data-testid="tab-hours"] .badge--neutral').length).toBe(4); // Wed-Sat
    expect(component.hoursDraft()[6].is_closed).toBeTrue(); // Sunday really is closed
    expect(component.hoursDraft()[2].is_closed).toBeFalse(); // unset day is a suggestion, not "closed"
  });

  it('saves all seven days, sending closed days without times', () => {
    const { component, api } = setup();
    component.setHour(1, 'opens_at', '09:30');
    component.saveHours();
    const [tenantId, locationId, hours] = api.setHours.calls.mostRecent().args;
    expect(tenantId).toBe('t1');
    expect(locationId).toBe('loc-1');
    expect(hours.length).toBe(7);
    expect(hours[1]).toEqual({ weekday: 1, is_closed: false, opens_at: '09:30', closes_at: '20:00' });
    expect(hours[6]).toEqual({ weekday: 6, is_closed: true });
    expect(component.message()).toBe('Business hours saved.');
  });

  it('saves details trimmed, turning blanks into null and an empty address into null', () => {
    const { component, api } = setup();
    component.detailsForm.patchValue({ name: '  Renamed  ', phone: '', website: '', city: '' });
    component.detailsForm.markAsDirty();
    component.saveDetails();
    const payload = api.update.calls.mostRecent().args[2];
    expect(payload.name).toBe('Renamed');
    expect(payload.phone).toBeNull();
    expect(payload.website).toBeNull();
    expect(payload.address).toBeNull();
    expect(component.locations()[0].name).toBe('Renamed'); // picker label follows the saved name
  });

  it('surfaces the real server validation error instead of a fake success', () => {
    const { component, api } = setup();
    api.update.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              error: { code: 'VALIDATION_ERROR', message: 'Location failed validation.', fields: { website: 'website must be a valid http(s) URL' } },
              request_id: 'r1',
            },
          }),
      ),
    );
    component.detailsForm.patchValue({ website: 'nope' });
    component.detailsForm.markAsDirty();
    component.saveDetails();
    expect(component.message()).toBeNull();
    expect(component.errorMessage()).toContain('validation');
    expect(component.fieldErrors()).toEqual({ website: 'website must be a valid http(s) URL' });
  });

  it('builds the categories payload from the drafts, dropping blank attribute rows', () => {
    const { component, api } = setup();
    component.primaryDraft.set('Hair salon');
    component.secondaryInput.set('Bridal');
    component.addSecondary(new Event('submit'));
    component.addAttribute();
    component.saveCategories();
    expect(api.setCategories.calls.mostRecent().args[2]).toEqual({
      primary_category: 'Hair salon',
      categories: ['Spa', 'Bridal'],
      attributes: { wifi: 'yes' },
    });
  });

  it('creates a service with the price as a string and the duration as a number', () => {
    const { component, api } = setup();
    component.openTab('services');
    component.serviceForm.patchValue({ name: ' Facial ', price: '999.50', duration_minutes: '60' });
    component.saveService();
    expect(api.createService.calls.mostRecent().args[2]).toEqual({
      name: 'Facial',
      description: null,
      price: '999.50',
      duration_minutes: 60,
      is_active: true,
    });
    expect(api.listServices.calls.count()).toBeGreaterThan(1); // reloaded after the write
  });

  it('rejects a malformed price client-side', () => {
    const { component } = setup();
    component.openTab('services');
    component.serviceForm.patchValue({ name: 'X', price: '12.345' });
    expect(component.serviceForm.controls.price.valid).toBeFalse();
  });

  it('loads the change history lazily and labels the audit actions in plain words', () => {
    const { component, fixture, api, root } = setup();
    expect(api.history).not.toHaveBeenCalled();
    component.openTab('history');
    fixture.detectChanges();
    expect(api.history).toHaveBeenCalledWith('t1', 'loc-1');
    expect(root.querySelector('[data-testid="tab-history"]')?.textContent).toContain('Service added: Facial');
    expect(root.querySelector('[data-testid="tab-history"]')?.textContent).toContain('Owner One');
  });

  it('hides every editor for a viewer (backend 403s regardless) while still showing the data', () => {
    const { component, fixture, root } = setup('viewer');
    expect(component.canManage()).toBeFalse();
    expect(root.textContent).toContain('View only');
    expect(Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.includes('Save details'))).toBeFalse();
    component.openTab('hours');
    fixture.detectChanges();
    expect(Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.includes('Save hours'))).toBeFalse();
  });

  it('only offers Archive when more than one location exists, and refreshes after archiving', () => {
    const second: LocationSummary = { ...summary, id: 'loc-2', name: 'Branch' };
    const single = setup('owner', [summary]);
    single.component.openTab('locations');
    single.fixture.detectChanges();
    expect(Array.from(single.root.querySelectorAll('[data-testid="tab-locations"] button')).some((b) => b.textContent?.includes('Archive'))).toBeFalse();

    TestBed.resetTestingModule();
    const two = setup('owner', [summary, second]);
    two.component.openTab('locations');
    two.fixture.detectChanges();
    expect(Array.from(two.root.querySelectorAll('[data-testid="tab-locations"] button')).filter((b) => b.textContent?.includes('Archive')).length).toBe(2);
    two.component.archiveLocation(second);
    expect(two.api.archive).toHaveBeenCalledWith('t1', 'loc-2');
    expect(two.api.list.calls.count()).toBe(2);
  });
});
