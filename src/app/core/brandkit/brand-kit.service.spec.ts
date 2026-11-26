import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrandKitService } from './brand-kit.service';
import { BrandKit } from './brand-kit.models';

const sampleBrandKit: BrandKit = {
  id: 'bk1',
  tenant_id: 't1',
  logo_asset_id: null,
  primary_hex: '#112233',
  secondary_hex: '#445566',
  voice_json: null,
  restrictions_json: { prohibited_phrases: ['guaranteed'] },
  locale: 'en-IN',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('BrandKitService', () => {
  let service: BrandKitService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BrandKitService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets the brand kit for a tenant', () => {
    let result: BrandKit | undefined;
    service.get('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/brand-kit');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleBrandKit, meta: { request_id: 'r1' } });

    expect(result).toEqual(sampleBrandKit);
  });

  it('PUTs an update with only the given fields', () => {
    let result: BrandKit | undefined;
    service.update('t1', { primary_hex: '#000000' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/brand-kit');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ primary_hex: '#000000' });
    req.flush({ data: { ...sampleBrandKit, primary_hex: '#000000' }, meta: { request_id: 'r1' } });

    expect(result?.primary_hex).toBe('#000000');
  });
});
