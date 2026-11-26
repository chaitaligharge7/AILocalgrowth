import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentItem } from '../../core/content/content.models';
import { StudioService } from '../../core/studio/studio.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { ContentComponent } from './content.component';

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

const draftItem: ContentItem = {
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

describe('ContentComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The embedded version-history panel has its own spec; stub it here so this spec only sees content-list traffic.
        {
          provide: StudioService,
          useValue: {
            revisions: () => of({ content_id: 'c', status: 'draft', restorable: true, revisions: [] }),
            timeline: () => of({ content_id: 'c', status: 'draft', events: [] }),
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  function createWithInitialList(items: ContentItem[]) {
    const fixture = TestBed.createComponent(ContentComponent);
    const req = httpMock.expectOne('/api/v1/tenants/t1/contents');
    req.flush({ data: { contents: items }, meta: { request_id: 'r1' } });
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('allows editing a draft item and lets it be submitted for approval', () => {
    const { component } = createWithInitialList([draftItem]);
    component.select(draftItem);

    expect(component.isEditable()).toBe(true);
  });

  it('blocks editing once the item has been submitted for approval (409 CONTENT_NOT_EDITABLE server-side)', () => {
    const { fixture, component } = createWithInitialList([draftItem]);
    component.select(draftItem);
    expect(component.isEditable()).toBe(true);

    component.submitForApproval();
    const submitReq = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/submit');
    submitReq.flush({
      data: { ...draftItem, status: 'pending_approval', draft: true },
      meta: { request_id: 'r1' },
    });

    // submitForApproval() also triggers a list refresh.
    const listReq = httpMock.expectOne('/api/v1/tenants/t1/contents');
    listReq.flush({
      data: { contents: [{ ...draftItem, status: 'pending_approval', draft: true }] },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.selected()?.status).toBe('pending_approval');
    expect(component.isEditable()).toBe(false);

    // Attempting to save edits once not-editable must not issue a PATCH at all —
    // the guard in saveEdit() short-circuits before any HTTP call.
    component.saveEdit();
    httpMock.expectNone('/api/v1/tenants/t1/contents/c1');
  });

  it('shows approve/reject actions once pending_approval and refreshes status after approving', () => {
    const pending: ContentItem = { ...draftItem, status: 'pending_approval', draft: true };
    const { fixture, component } = createWithInitialList([pending]);
    component.select(pending);
    fixture.detectChanges();

    expect(component.canApprove()).toBe(true);

    component.approve('approve');
    const approveReq = httpMock.expectOne('/api/v1/tenants/t1/contents/c1/approve');
    expect(approveReq.request.body).toEqual({ decision: 'approve' });
    approveReq.flush({
      data: { ...pending, status: 'approved', draft: false },
      meta: { request_id: 'r1' },
    });

    const listReq = httpMock.expectOne('/api/v1/tenants/t1/contents');
    listReq.flush({ data: { contents: [{ ...pending, status: 'approved', draft: false }] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(component.selected()?.status).toBe('approved');
    expect(component.actionNotice()).toContain('approved');
  });

  it('shows a Schedule button only for approved items and hands off to the calendar screen with router state', () => {
    const approved: ContentItem = { ...draftItem, id: 'c2', status: 'approved', draft: false };
    const { fixture, component } = createWithInitialList([draftItem, approved]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Schedule');

    const router = TestBed.inject(Router);
    const spy = spyOn(router, 'navigate').and.resolveTo(true);

    component.scheduleItem(approved);

    expect(spy).toHaveBeenCalledWith(['/app', 't1', 'calendar'], {
      state: {
        scheduleContentId: approved.id,
        scheduleContentTitle: '',
        scheduleContentObjective: approved.objective,
      },
    });
  });

  it('renders edit link and deletes an item via bulkAction delete', () => {
    const { fixture, component } = createWithInitialList([draftItem]);
    const el = fixture.nativeElement as HTMLElement;

    const editLink = el.querySelector('[data-testid="edit-content-btn"]') as HTMLAnchorElement | null;
    expect(editLink).not.toBeNull();
    expect(editLink?.getAttribute('href')).toContain('/app/t1/content/c1/edit');

    const newBtn = el.querySelector('[data-testid="new-draft-btn"]') as HTMLAnchorElement | null;
    expect(newBtn).not.toBeNull();
    expect(newBtn?.getAttribute('href')).toContain('/app/t1/content/new');

    component.deleteItem(draftItem);
    const delReq = httpMock.expectOne('/api/v1/tenants/t1/contents/bulk-action');
    expect(delReq.request.body).toEqual({ action: 'delete', content_ids: ['c1'] });
    delReq.flush({ data: { action: 'delete', succeeded: ['c1'], failed: [] }, meta: { request_id: 'r1' } });
    fixture.detectChanges();

    expect(component.items().length).toBe(0);
  });
});
