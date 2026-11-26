import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { GoogleReview, ReviewReplyDraft } from '../../core/reviews/review.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { ReviewsComponent, canApproveDraft, canSendReply } from './reviews.component';

const sampleTenant: Tenant = {
  id: 't1',
  display_name: 'Acme Cafe',
  legal_name: null,
  business_type: null,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  country: 'IN',
  status: 'active',
  caller_role: 'owner',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const negativeReview: GoogleReview = {
  id: 'rev1',
  tenant_id: 't1',
  location_id: 'loc1',
  external_review_id: 'mock-review-1',
  author_display: 'A. Kumar (mock review)',
  rating: 1,
  comment: 'Terrible service.',
  mock_provider: true,
  requires_approval: true,
  has_reply: false,
  reviewed_at: '2026-01-01T00:00:00.000Z',
  last_synced_at: '2026-01-01T00:00:00.000Z',
};

const positiveReview: GoogleReview = {
  ...negativeReview,
  id: 'rev2',
  rating: 5,
  requires_approval: false,
  comment: 'Loved it!',
};

function draftWith(status: ReviewReplyDraft['status']): ReviewReplyDraft {
  return {
    id: 'draft1',
    tenant_id: 't1',
    review_id: 'rev1',
    generated_by: 'mock:v1',
    body: 'We are sorry to hear that.',
    status,
    draft: status !== 'sent',
    approved_by: status === 'approved' || status === 'sent' ? 'u1' : null,
    approved_at: status === 'approved' || status === 'sent' ? '2026-01-01T00:00:00.000Z' : null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('canSendReply (pure gating logic)', () => {
  it('blocks sending with no draft at all', () => {
    expect(canSendReply(negativeReview, null)).toEqual({ allowed: false, reason: 'Draft a reply first.' });
  });

  it('blocks sending a rating<=2/sensitive review until the draft is approved', () => {
    const gate = canSendReply(negativeReview, draftWith('draft'));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('approval');
  });

  it('allows sending a rating<=2 review once its draft is approved', () => {
    expect(canSendReply(negativeReview, draftWith('approved'))).toEqual({ allowed: true, reason: null });
  });

  it('allows sending a non-sensitive review straight from draft, no approval needed', () => {
    expect(canSendReply(positiveReview, draftWith('draft'))).toEqual({ allowed: true, reason: null });
  });

  it('blocks sending an already-sent draft a second time, regardless of rating', () => {
    expect(canSendReply(positiveReview, draftWith('sent')).allowed).toBe(false);
    expect(canSendReply(negativeReview, draftWith('sent')).allowed).toBe(false);
  });
});

describe('canApproveDraft (pure)', () => {
  it('allows approving only a draft in "draft" status', () => {
    expect(canApproveDraft(draftWith('draft'))).toBe(true);
    expect(canApproveDraft(draftWith('approved'))).toBe(false);
    expect(canApproveDraft(draftWith('sent'))).toBe(false);
    expect(canApproveDraft(null)).toBe(false);
  });
});

describe('ReviewsComponent (DOM gating)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ locationId: 'loc1' }) } } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  it('disables Send until an approval-required draft is approved, and never flips to sent before the HTTP response', () => {
    const fixture = TestBed.createComponent(ReviewsComponent);
    const listReq = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/loc1/reviews');
    listReq.flush({ data: { reviews: [negativeReview] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.select(negativeReview);
    fixture.detectChanges();

    component.draftReply();
    const draftReq = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/draft-reply');
    draftReq.flush({ data: { ...draftWith('draft'), requires_approval: true }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(component.sendGate().allowed).toBe(false);
    const sendButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Send reply',
    ) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    component.approveReply();
    const approveReq = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/approve-reply');
    approveReq.flush({ data: draftWith('approved'), meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(component.sendGate().allowed).toBe(true);
    expect(component.currentDraft()?.status).toBe('approved');
    // Still not "sent" — no optimistic flip happened from approve alone.
    expect(component.currentDraft()?.status).not.toBe('sent');

    component.sendReply();
    // No local state changes until the HTTP response below resolves.
    expect(component.currentDraft()?.status).toBe('approved');

    const sendReq = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/send-reply');
    sendReq.flush({ data: { ...draftWith('sent'), external_reply_id: 'mock-reply-1' }, meta: { request_id: 'r1' } });

    const refreshReq = httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/loc1/reviews');
    refreshReq.flush({ data: { reviews: [{ ...negativeReview, has_reply: true }] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(component.currentDraft()?.status).toBe('sent');
  });

  it('supports editing draft reply, saving review triage, and updating per-tenant approval rules', () => {
    const fixture = TestBed.createComponent(ReviewsComponent);
    httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/loc1/reviews').flush({
      data: { reviews: [negativeReview] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.select(negativeReview);
    component.draftReply();
    httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/draft-reply').flush({
      data: { ...draftWith('draft'), requires_approval: true },
      meta: { request_id: 'r2' },
    });

    // Edit draft reply
    component.draftEditBody.set('Updated empathetic reply.');
    component.saveDraftEdit();
    const editReq = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/draft-reply');
    expect(editReq.request.method).toBe('PATCH');
    expect(editReq.request.body).toEqual({ body: 'Updated empathetic reply.', draft_id: 'draft1' });
    editReq.flush({ data: { ...draftWith('draft'), body: 'Updated empathetic reply.' }, meta: { request_id: 'r3' } });
    expect(component.currentDraft()?.body).toBe('Updated empathetic reply.');

    // Save triage
    component.triageNotes.set('Manager called customer');
    component.triageTagsText.set('vip, urgent');
    component.triageEscalated.set(true);
    component.triageEscalationReason.set('1-star review');
    component.saveTriage();
    const triageReq = httpMock.expectOne('/api/v1/tenants/t1/reviews/rev1/triage');
    expect(triageReq.request.method).toBe('PATCH');
    expect(triageReq.request.body.tags).toEqual(['vip', 'urgent']);
    triageReq.flush({
      data: { ...negativeReview, internal_notes: 'Manager called customer', tags: ['vip', 'urgent'], escalated: true },
      meta: { request_id: 'r4' },
    });
    expect(component.selected()?.escalated).toBe(true);

    // Load and save per-tenant approval rules
    component.toggleSettingsPanel();
    httpMock.expectOne('/api/v1/tenants/t1/review-settings').flush({
      data: { approval_max_rating: 2, sensitive_keywords: ['unsafe'], require_approval_for_all: false, is_default: true },
      meta: { request_id: 'r5' },
    });
    component.settingsMaxRating.set(3);
    component.saveSettings();
    const putReq = httpMock.expectOne('/api/v1/tenants/t1/review-settings');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body.approval_max_rating).toBe(3);
    putReq.flush({
      data: { approval_max_rating: 3, sensitive_keywords: ['unsafe'], require_approval_for_all: false, is_default: false },
      meta: { request_id: 'r6' },
    });
    httpMock.expectOne((r) => r.url === '/api/v1/tenants/t1/locations/loc1/reviews').flush({
      data: { reviews: [negativeReview] },
      meta: { request_id: 'r7' },
    });
  });
});
