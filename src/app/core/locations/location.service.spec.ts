import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LocationApiService } from './location.service';
import { LocationSummary } from './location.models';

const meta = { request_id: 'r1' };

describe('LocationApiService', () => {
  let service: LocationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LocationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the tenant locations from GET /tenants/{t}/locations', () => {
    const summary = { id: 'loc-1', name: 'Main' } as LocationSummary;
    let result: LocationSummary[] | undefined;
    service.list('t1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/locations');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { locations: [summary] }, meta });
    expect(result).toEqual([summary]);
  });

  it('creates, edits and archives a location', () => {
    service.create('t1', { name: 'Branch' }).subscribe();
    const create = httpMock.expectOne('/api/v1/tenants/t1/locations');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Branch' });
    create.flush({ data: { id: 'loc-2' }, meta });

    service.update('t1', 'loc-2', { phone: null }).subscribe();
    const update = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-2');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ phone: null });
    update.flush({ data: { id: 'loc-2' }, meta });

    service.archive('t1', 'loc-2').subscribe();
    const archive = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-2');
    expect(archive.request.method).toBe('DELETE');
    archive.flush({ data: { archived: true }, meta });
  });

  it('PUTs the hours, holidays, categories and service areas bodies the backend expects', () => {
    service.setHours('t1', 'loc-1', [{ weekday: 0, is_closed: true }]).subscribe();
    const hours = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/hours');
    expect(hours.request.method).toBe('PUT');
    expect(hours.request.body).toEqual({ hours: [{ weekday: 0, is_closed: true }] });
    hours.flush({ data: {}, meta });

    service.setHolidays('t1', 'loc-1', []).subscribe();
    const holidays = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/holidays');
    expect(holidays.request.body).toEqual({ holidays: [] });
    holidays.flush({ data: {}, meta });

    service.setCategories('t1', 'loc-1', { categories: ['Spa'], attributes: { wifi: 'yes' } }).subscribe();
    const categories = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/categories');
    expect(categories.request.body).toEqual({ categories: ['Spa'], attributes: { wifi: 'yes' } });
    categories.flush({ data: {}, meta });

    service.setServiceAreas('t1', 'loc-1', [{ area_type: 'pincode', area_name: '600002' }]).subscribe();
    const areas = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/service-areas');
    expect(areas.request.body).toEqual({ areas: [{ area_type: 'pincode', area_name: '600002' }] });
    areas.flush({ data: {}, meta });
  });

  it('manages services and keeps prices as strings; URL-encodes ids', () => {
    service.createService('t1', 'loc-1', { name: 'Haircut', price: '499.00' }).subscribe();
    const create = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/services');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.price).toBe('499.00');
    expect(typeof create.request.body.price).toBe('string');
    create.flush({ data: { id: 's1' }, meta });

    service.updateService('t1', 'loc-1', 's 1', { is_active: false }).subscribe();
    const update = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/services/s%201');
    expect(update.request.method).toBe('PATCH');
    update.flush({ data: { id: 's 1' }, meta });

    service.deleteService('t1', 'loc-1', 's1').subscribe();
    const del = httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/services/s1');
    expect(del.request.method).toBe('DELETE');
    del.flush({ data: { deleted: true }, meta });
  });

  it('reads the change history events', () => {
    let count = -1;
    service.history('t1', 'loc-1').subscribe((e) => (count = e.length));
    httpMock.expectOne('/api/v1/tenants/t1/locations/loc-1/history').flush({ data: { events: [{ id: 'e1' }] }, meta });
    expect(count).toBe(1);
  });
});
