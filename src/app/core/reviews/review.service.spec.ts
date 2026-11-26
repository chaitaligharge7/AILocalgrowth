import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReviewService } from './review.service';
import { GoogleReview, ReviewReplyDraft, ReviewReplyEvent } from './review.models';

const negativeReview: GoogleReview = {
  id: 'rev1',
  tenant_id: 't1',
  location_id: 'loc1',
  external_review_id: 'mock-review-1',
  author_display: 'A. Kumar (mock review)',
  rating: 1,
  comment: 'Terrible service, never going back.',
  mock_provider: true,
  requires_approval: true,
  has_reply: false,
  reviewed_at: '2026-01-01T00:00:00.000Z',
  last_synced_at: '2026-01-01T00:00:00.000Z',
};

const draft: ReviewReplyDraft = {
  id: 'draft1',
  tenant_id: 't1',
  review_id: 'rev1',
  generated_by: 'mock:v1',
  body: 'We are sorry to hear that — please reach out to us directly so we can help.',
  status: 'draft',
  draft: true,
  requires_approval: true,
  approved_by: null,
  approved_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('ReviewService', () => {
  let service: ReviewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReviewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists reviews for a location with no filters', () => {
    let result: GoogleReview[] | undefined;
    service.list('t1', 'loc1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/locations/loc1/reviews');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { reviews: [negativeReview] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([negativeReview]);
  });

  it('lists reviews with rating and status filters as query params', () => {
    service.list('t1', 'loc1', { rating: 2, status: 'unreplied' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/loc1/reviews');
    expect(req.request.params.get('rating')).toBe('2');
    expect(req.request.params.get('status')).toBe('unreplied');
    req.flush({ data: { reviews: [] }, meta: { request_id: 'r1' } });
  });

  it('drafts a reply for a review', () => {
    let result: ReviewReplyDraft | undefined;
    service.draftReply('t1', 'rev1').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/draft-reply');
    expect(req.request.method).toBe('POST');
    req.flush({ data: draft, meta: { request_id: 'r1' } });

    expect(result).toEqual(draft);
  });

  it('approves a reply draft', () => {
    service.approveReply('t1', 'rev1', 'draft1').subscribe();

    const req = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/approve-reply');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ draft_id: 'draft1' });
    req.flush({ data: { ...draft, status: 'approved' }, meta: { request_id: 'r1' } });
  });

  it('sends a reply and surfaces a 409 APPROVAL_REQUIRED error unchanged (never optimistic)', () => {
    let result: ReviewReplyDraft | undefined;
    let error: unknown;
    service.sendReply('t1', 'rev1').subscribe({ next: (r) => (result = r), error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/send-reply');
    expect(req.request.method).toBe('POST');
    req.flush(
      { error: { code: 'APPROVAL_REQUIRED', message: 'This review requires an approved reply before it can be sent.' }, request_id: 'r1' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(result).toBeUndefined();
    expect((error as { status: number }).status).toBe(409);
  });

  it('gets reply history events for a review', () => {
    let result: ReviewReplyEvent[] | undefined;
    service.history('t1', 'rev1').subscribe((r) => (result = r));

    const event: ReviewReplyEvent = {
      id: 'evt1',
      review_id: 'rev1',
      draft_id: 'draft1',
      event_type: 'drafted',
      external_reply_id: null,
      actor_id: 'u1',
      event_at: '2026-01-01T00:00:00.000Z',
    };
    const req = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/history');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { events: [event] }, meta: { request_id: 'r1' } });

    expect(result).toEqual([event]);
  });
});
