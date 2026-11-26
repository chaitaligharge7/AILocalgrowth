import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AiGenerationService } from './ai-generation.service';
import { AiGenerationResponse } from './ai-generation.models';

const sampleResponse: AiGenerationResponse = {
  id: 'gen1',
  status: 'completed',
  provider: 'mock',
  model: 'mock-v1',
  prompt_version: 'v1',
  mock_provider: true,
  variants: [{ text: 'Visit us today!', draft: true }],
  blocked_variant_count: 0,
  quota: {
    meter_code: 'ai_generations_per_month',
    limit: 60,
    used: 1,
    reserved: 0,
    remaining: 59,
    period_start: '2026-11-01T00:00:00.000Z',
    period_end: '2026-12-01T00:00:00.000Z',
  },
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('AiGenerationService', () => {
  let service: AiGenerationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AiGenerationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts the generation request and returns the unwrapped response', () => {
    let result: AiGenerationResponse | undefined;
    service.generate('t1', { objective: 'Promote diwali offer', cta: 'Visit now' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ objective: 'Promote diwali offer', cta: 'Visit now' });
    req.flush({ data: sampleResponse, meta: { request_id: 'r1' } });

    expect(result).toEqual(sampleResponse);
  });

  it('surfaces a 429 QUOTA_EXCEEDED error unchanged for the caller to handle', () => {
    let error: unknown;
    service.generate('t1', { objective: 'x', cta: 'y' }).subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne('/api/v1/tenants/t1/ai/generations');
    req.flush(
      { error: { code: 'QUOTA_EXCEEDED', message: 'Plan quota reached for meter "ai_generations_per_month".', fields: { meter_code: 'ai_generations_per_month', limit_qty: '60', used_qty: '60', reserved_qty: '0' } }, request_id: 'r1' },
      { status: 429, statusText: 'Too Many Requests' },
    );

    expect((error as { status: number }).status).toBe(429);
  });
});
