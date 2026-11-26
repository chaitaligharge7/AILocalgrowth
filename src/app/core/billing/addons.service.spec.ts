import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AddonsService } from './addons.service';

const ok = <T>(data: T) => ({ data, meta: { request_id: 'r1' } });

describe('AddonsService', () => {
  let service: AddonsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AddonsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads the catalog', () => {
    service.catalog('t1').subscribe((c) => expect(c.mock_provider).toBeTrue());
    http.expectOne('/api/v1/tenants/t1/billing/addons').flush(ok({ mock_provider: true, addons: [], purchases: [] }));
  });

  it('purchases, mock-completes and cancels with POST', () => {
    service.purchase('t1', 'a1').subscribe();
    const p = http.expectOne('/api/v1/tenants/t1/billing/addons/a1/purchase');
    expect(p.request.method).toBe('POST');
    p.flush(ok({ id: 'p1' }));

    service.mockComplete('t1', 'p1').subscribe();
    const m = http.expectOne('/api/v1/tenants/t1/billing/addon-purchases/p1/mock-complete');
    expect(m.request.method).toBe('POST');
    m.flush(ok({ id: 'p1' }));

    service.cancel('t1', 'p1').subscribe();
    http.expectOne('/api/v1/tenants/t1/billing/addon-purchases/p1/cancel').flush(ok({ id: 'p1' }));
  });
});
