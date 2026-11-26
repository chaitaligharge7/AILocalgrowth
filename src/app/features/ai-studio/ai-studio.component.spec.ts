import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { Tenant } from '../../core/tenancy/tenant.models';
import { AiStudioComponent } from './ai-studio.component';

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

describe('AiStudioComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiStudioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(CurrentTenantService).select(sampleTenant);
  });

  afterEach(() => httpMock.verify());

  function createAndFillForm() {
    const fixture = TestBed.createComponent(AiStudioComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      objective: 'Promote weekend offer',
      cta: 'Visit us',
      useCase: 'social_post',
      channel: '',
      tone: 'friendly',
      language: 'en-IN',
      offer: '',
      segment: '',
    });
    return { fixture, component };
  }

  it('shows the MOCK_PROVIDER draft badge and blocked-variant count on a successful generation', () => {
    const { fixture, component } = createAndFillForm();
    component.generate();

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    req.flush({
      data: {
        id: 'gen1',
        status: 'completed',
        provider: 'mock',
        model: 'mock-v1',
        prompt_version: 'v1',
        mock_provider: true,
        variants: [{ text: 'Come visit us this weekend!', draft: true }],
        blocked_variant_count: 2,
        quota: {
          meter_code: 'ai_generations_per_month',
          limit: 60,
          used: 3,
          reserved: 0,
          remaining: 57,
          period_start: '2026-11-01T00:00:00.000Z',
          period_end: '2026-12-01T00:00:00.000Z',
        },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    expect(component.result()?.blocked_variant_count).toBe(2);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('MOCK_PROVIDER');
    expect(text).toContain('2 variant(s) were blocked');
    expect(text).toContain('3/60 used this period');
  });

  // Regression test for a real S4 bug: the AI composer used to read the
  // RETIRED per-tenant quota guard's field names ({quota, used_today}).
  // The real backend 429 (App\Application\Billing\UsageWalletService::reserve())
  // sends {meter_code, limit_qty, used_qty, reserved_qty} instead. This test
  // flushes the ACTUAL shape the live backend sends, not the old mock.
  it('shows a clear message and no variants when the real usage-wallet quota is exceeded (429)', () => {
    const { fixture, component } = createAndFillForm();
    component.generate();

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    req.flush(
      {
        error: {
          code: 'QUOTA_EXCEEDED',
          message: 'Plan quota reached for meter "ai_generations_per_month" (limit 60, used 60, reserved 0, requested 1).',
          fields: { meter_code: 'ai_generations_per_month', limit_qty: '60', used_qty: '60', reserved_qty: '0' },
        },
        request_id: 'r1',
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(component.quotaExceeded()).toBe(true);
    expect(component.result()).toBeNull();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('AI generation quota reached');
    expect(text).toContain('60/60 used this period');
    expect(text).not.toContain('undefined');
  });

  it('renders zero variants with an explanatory message when every variant is blocked', () => {
    const { fixture, component } = createAndFillForm();
    component.generate();

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    req.flush({
      data: {
        id: 'gen2',
        status: 'blocked',
        provider: 'mock',
        model: 'mock-v1',
        prompt_version: 'v1',
        mock_provider: true,
        variants: [],
        blocked_variant_count: 3,
        quota: {
          meter_code: 'ai_generations_per_month',
          limit: 60,
          used: 4,
          reserved: 0,
          remaining: 56,
          period_start: '2026-11-01T00:00:00.000Z',
          period_end: '2026-12-01T00:00:00.000Z',
        },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      meta: { request_id: 'r1' },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('All generated variants were blocked');
  });

  it('renders visual brief & image prompt and per-variant spelling warnings when returned', () => {
    const { fixture, component } = createAndFillForm();
    component.includeVisualBrief.set(true);
    component.generate();

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    expect(req.request.body.include_visual_brief).toBe(true);
    req.flush({
      data: {
        id: 'gen3',
        status: 'completed',
        provider: 'mock',
        model: 'mock-v1',
        prompt_version: 'v1',
        mock_provider: true,
        variants: [{ text: 'Visit teh cafe today!', draft: true, warnings: ['Possible spelling typo "teh" (did you mean "the"?).'] }],
        visual_brief: {
          headline: 'Weekend Cafe Special',
          scene_description: 'Warm espresso pour on wooden counter',
          aspect_ratio: '4:5',
          color_palette: ['#4F46E5', '#F8FAFC'],
          image_prompt: 'Editorial coffee photography, 4:5 framing',
          alt_text: 'Espresso pour promotional image',
          mock_provider: true,
        },
        blocked_variant_count: 0,
        safety_report: { checks_run: ['brand_kit', 'profanity', 'regulated_industry', 'spelling'], regulated_industry: null, blocked_reasons: [] },
        quota: {
          meter_code: 'ai_generations_per_month',
          limit: 60,
          used: 5,
          reserved: 0,
          remaining: 55,
          period_start: '2026-11-01T00:00:00.000Z',
          period_end: '2026-12-01T00:00:00.000Z',
        },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      meta: { request_id: 'r3' },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Visual brief & image prompt');
    expect(text).toContain('Editorial coffee photography, 4:5 framing');
    expect(text).toContain('Possible spelling typo "teh"');
  });
});
