import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';
import { ContentItem } from './content.models';

const sampleContent: ContentItem = {
  id: 'c1',
  tenant_id: 't1',
  location_id: 'l1',
  creator_id: 'u1',
  objective: 'Promote weekend offer',
  title: null,
  body: 'Come visit us this weekend!',
  language: 'en-IN',
  status: 'draft',
  draft: true,
  current_revision_id: 'rev1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('ContentService', () => {
  let service: ContentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists contents for a tenant', () => {
    let result: ContentItem[] | undefined;
    service.list('t1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/contents');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { contents: [sampleContent] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([sampleContent]);
  });

  it('creates content with location_id/objective/body', () => {
    service.create('t1', { location_id: 'l1', objective: 'Promote weekend offer', body: 'Come visit us!' }).subscribe();

    const req = httpMock.expectOne('/api/v1/tenants/t1/contents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ location_id: 'l1', objective: 'Promote weekend offer', body: 'Come visit us!' });
    req.flush({ data: sampleContent, meta: { request_id: 'r1' } });
  });

  it('gets a single content item', () => {
    service.get('t1', 'c1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1');
    expect(req.request.method).toBe('GET');
    req.flush({ data: sampleContent, meta: { request_id: 'r1' } });
  });

  it('PATCHes a content item', () => {
    service.update('t1', 'c1', { body: 'Updated body' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ body: 'Updated body' });
    req.flush({ data: { ...sampleContent, body: 'Updated body' }, meta: { request_id: 'r1' } });
  });

  it('surfaces a 409 CONTENT_NOT_EDITABLE error from PATCH unchanged', () => {
    let error: unknown;
    service.update('t1', 'c1', { body: 'x' }).subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1');
    req.flush(
      { error: { code: 'CONTENT_NOT_EDITABLE', message: 'Content in status "pending_approval" cannot be edited directly.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );

    expect((error as { status: number }).status).toBe(409);
  });

  it('submits content for approval', () => {
    service.submit('t1', 'c1').subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/submit');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ...sampleContent, status: 'pending_approval', draft: true }, meta: { request_id: 'r1' } });
  });

  it('approves content with a decision and comment', () => {
    service.approve('t1', 'c1', { decision: 'approve', comment: 'Looks good' }).subscribe();
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/approve');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'approve', comment: 'Looks good' });
    req.flush({ data: { ...sampleContent, status: 'approved', draft: false }, meta: { request_id: 'r1' } });
  });
});
