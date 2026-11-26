import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AssetService } from './asset.service';
import { Asset } from './asset.models';

const sampleAsset: Asset = {
  id: 'a1',
  tenant_id: 't1',
  uploader_id: 'u1',
  mime: 'image/png',
  bytes: 1234,
  width: 10,
  height: 10,
  sha256: 'deadbeef',
  status: 'active',
  tags: [],
  download_url: '/api/v1/assets/download/sometoken',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('AssetService', () => {
  let service: AssetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests an upload intent with filename/mime/bytes', () => {
    service.uploadIntent('t1', { filename: 'logo.png', declared_mime: 'image/png', declared_bytes: 100 }).subscribe();

    const req = httpMock.expectOne('/api/v1/tenants/t1/assets/upload-intent');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ filename: 'logo.png', declared_mime: 'image/png', declared_bytes: 100 });
    req.flush({
      data: { upload_intent_token: 'tok', expires_at: '2026-01-01T00:10:00.000Z', max_bytes: 15728640, allowed_mimes: ['image/png'] },
      meta: { request_id: 'r1' },
    });
  });

  it('completes an upload with the token and base64 bytes', () => {
    let result: Asset | undefined;
    service.complete('t1', { upload_intent_token: 'tok', file_base64: 'QUJD' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/assets/complete');
    expect(req.request.method).toBe('POST');
    req.flush({ data: sampleAsset, meta: { request_id: 'r1' } });

    expect(result).toEqual(sampleAsset);
  });

  it('lists the tenant assets', () => {
    let result: Asset[] | undefined;
    service.list('t1').subscribe((r) => (result = r));
    const req = httpMock.expectOne('/api/v1/tenants/t1/assets');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { assets: [sampleAsset] }, meta: { request_id: 'r1' } });
    expect(result).toEqual([sampleAsset]);
  });

  it('gets a single asset by id', () => {
    service.get('t1', 'a1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/assets/a1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleAsset, meta: { request_id: 'r1' } });
  });

  it('deletes an asset by id', () => {
    let result: { deleted: true } | undefined;
    service.delete('t1', 'a1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/assets/a1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { deleted: true }, meta: { request_id: 'r1' } });

    expect(result?.deleted).toBe(true);
  });

  it('uploadFile reads the File as base64 then calls upload-intent and complete', (done) => {
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });

    service.uploadFile('t1', file).subscribe((asset) => {
      expect(asset).toEqual(sampleAsset);
      done();
    });

    // Allow the FileReader (async, real browser API in Karma/Chrome) to finish
    // before the upload-intent request is expected.
    setTimeout(() => {
      const intentReq = httpMock.expectOne('/api/v1/tenants/t1/assets/upload-intent');
      expect(intentReq.request.body.filename).toBe('hello.png');
      expect(intentReq.request.body.declared_mime).toBe('image/png');
      intentReq.flush({
        data: { upload_intent_token: 'tok', expires_at: '2026-01-01T00:10:00.000Z', max_bytes: 15728640, allowed_mimes: ['image/png'] },
        meta: { request_id: 'r1' },
      });

      const completeReq = httpMock.expectOne('/api/v1/tenants/t1/assets/complete');
      expect(completeReq.request.body.upload_intent_token).toBe('tok');
      expect(typeof completeReq.request.body.file_base64).toBe('string');
      completeReq.flush({ data: sampleAsset, meta: { request_id: 'r1' } });
    }, 50);
  });
});
