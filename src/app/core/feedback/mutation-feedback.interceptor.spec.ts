import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  MUTATION_ERROR_MESSAGE,
  MUTATION_SUCCESS_MESSAGE,
  SKIP_MUTATION_TOAST,
  mutationFeedbackInterceptor,
} from './mutation-feedback.interceptor';
import { ToastService } from './toast.service';
import { ToastContainerComponent } from '../../shared/toast/toast-container.component';

describe('Global mutation feedback (ToastService + mutationFeedbackInterceptor)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [
        provideHttpClient(withInterceptors([mutationFeedbackInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    toast.clear();
  });

  afterEach(() => {
    httpMock.verify();
    toast.clear();
  });

  it('does not show a toast for GET requests', () => {
    http.get('/api/v1/tenants/t1/locations').subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/locations').flush({ data: [] });
    expect(toast.toasts().length).toBe(0);
  });

  it('shows a contextual success toast after POST (create)', () => {
    http.post('/api/v1/tenants/t1/locations/l1/services', { name: 'Haircut' }).subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/locations/l1/services').flush({ data: { id: 's1' } });

    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].type).toBe('success');
    expect(toast.toasts()[0].message).toBe('Service created successfully.');
  });

  it('shows a contextual success toast after PATCH/PUT (edit)', () => {
    http.patch('/api/v1/tenants/t1/leads/ld1', { stage: 'won' }).subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/leads/ld1').flush({ data: { id: 'ld1' } });

    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].type).toBe('success');
    expect(toast.toasts()[0].title).toBe('Saved');
    expect(toast.toasts()[0].message).toBe('Lead updated successfully.');
  });

  it('shows a contextual success toast after DELETE', () => {
    http.delete('/api/v1/tenants/t1/contents/c1').subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/contents/c1').flush({ data: { deleted: true } });

    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].type).toBe('success');
    expect(toast.toasts()[0].title).toBe('Deleted');
    expect(toast.toasts()[0].message).toBe('Content deleted successfully.');
  });

  it('shows an error toast with API message and validation detail on failure', () => {
    let errored = false;
    http.delete('/api/v1/tenants/t1/locations/l1').subscribe({
      error: () => {
        errored = true;
      },
    });
    httpMock.expectOne('/api/v1/tenants/t1/locations/l1').flush(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete location.',
          fields: { id: 'Location has active schedules.' },
        },
        request_id: 'req-1',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(errored).toBeTrue();
    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].type).toBe('error');
    expect(toast.toasts()[0].title).toBe('Delete failed');
    expect(toast.toasts()[0].message).toBe('Cannot delete location. Location has active schedules.');
  });

  it('skips auth endpoints and respects SKIP_MUTATION_TOAST', () => {
    http.post('/api/v1/auth/login', {}).subscribe();
    httpMock.expectOne('/api/v1/auth/login').flush({ data: {} });
    expect(toast.toasts().length).toBe(0);

    http
      .post('/api/v1/tenants/t1/leads', {}, { context: new HttpContext().set(SKIP_MUTATION_TOAST, true) })
      .subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/leads').flush({ data: {} });
    expect(toast.toasts().length).toBe(0);
  });

  it('supports custom success and error messages via HttpContext', () => {
    http
      .patch(
        '/api/v1/tenants/t1/leads/ld1',
        {},
        { context: new HttpContext().set(MUTATION_SUCCESS_MESSAGE, 'Custom saved!') },
      )
      .subscribe();
    httpMock.expectOne('/api/v1/tenants/t1/leads/ld1').flush({ data: {} });
    expect(toast.toasts()[0].message).toBe('Custom saved!');

    toast.clear();
    http
      .delete('/api/v1/tenants/t1/leads/ld1', {
        context: new HttpContext().set(MUTATION_ERROR_MESSAGE, 'Custom delete error!'),
      })
      .subscribe({ error: () => {} });
    httpMock.expectOne('/api/v1/tenants/t1/leads/ld1').flush({}, { status: 500, statusText: 'Server Error' });
    expect(toast.toasts()[0].message).toBe('Custom delete error!');
  });

  it('renders and dismisses toasts in ToastContainerComponent', () => {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    toast.success('Business hours updated successfully.', 'Saved');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="toast-success"]')?.textContent).toContain('Business hours updated successfully.');

    const closeBtn = el.querySelector('.toast-close') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="toast-success"]')).toBeNull();
  });
});
