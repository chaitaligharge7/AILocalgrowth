import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LocationApiService } from '../../core/locations/location.service';
import { ReviewInsights } from '../../core/reviews/review-insights.models';
import { ReviewInsightsService } from '../../core/reviews/review-insights.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { ReviewInsightsComponent } from './review-insights.component';

const insights = (o: Partial<ReviewInsights> = {}): ReviewInsights => ({
  location_id: null, from: null, to: null,
  summary: { total: 4, avg_rating: 3.25, replied: 1, unreplied: 3, reply_rate_pct: 25, avg_hours_to_reply: 6.5 },
  distribution: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: r === 2 ? 0 : 1, pct: r === 2 ? 0 : 25 })),
  trend: [{ month: '2026-09', count: 2, avg_rating: 4.5 }, { month: '2026-10', count: 2, avg_rating: 2 }],
  sentiment: {
    method: 'rating_bands', is_ai: false, note: 'A simple heuristic: 4-5 stars = positive.', positive: 2, neutral: 1, negative: 1,
    themes: { positive: [{ word: 'friendly', count: 2 }], negative: [{ word: 'rude', count: 1 }] }, themes_note: 'Counts of how many reviews mention each word.',
  },
  automation: { auto_draft_enabled: false, max_rating: 5, updated_at: null, behaviour: 'Nothing is ever approved or sent automatically.' },
  mock_provider: true, ...o,
});

describe('ReviewInsightsComponent', () => {
  function setup(role: string, api: Partial<Record<keyof ReviewInsightsService, unknown>>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReviewInsightsComponent],
      providers: [
        provideRouter([]),
        { provide: ReviewInsightsService, useValue: api },
        { provide: LocationApiService, useValue: { list: () => of([{ id: 'l1', name: 'Glow Salon' }]) } },
      ],
    });
    TestBed.inject(CurrentTenantService).select({ id: 't1', caller_role: role } as never);
    const fixture = TestBed.createComponent(ReviewInsightsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the summary, distribution, trend, heuristic sentiment and a mock badge', () => {
    const el = setup('viewer', { insights: () => of(insights()) }).nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('Reply rate');
    expect(text).toContain('25%');
    expect(text).toContain('6.5 h');
    expect(el.querySelectorAll('[data-testid="distribution"] li').length).toBe(5);
    expect(el.querySelectorAll('[data-testid="trend"] tbody tr').length).toBe(2);
    expect(el.querySelector('[data-testid="sentiment"]')?.textContent).toContain('Positive 2');
    expect(text).toContain('A simple heuristic');
    expect(text).toContain('friendly');
    expect(text).toContain('MOCK_PROVIDER');
  });

  it('shows an empty state when there are no reviews', () => {
    const el = setup('viewer', { insights: () => of(insights({ summary: { total: 0, avg_rating: null, replied: 0, unreplied: 0, reply_rate_pct: null, avg_hours_to_reply: null } })) }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('No reviews in this view');
  });

  it('only lets an owner/admin change the auto-draft setting and saves it', () => {
    const saveSettings = jasmine.createSpy('saveSettings').and.returnValue(of({ auto_draft_enabled: true, max_rating: 3, updated_at: 'x', behaviour: 'b' }));
    const fixture = setup('owner', { insights: () => of(insights()), saveSettings });
    fixture.componentInstance.autoOn.set(true);
    fixture.componentInstance.autoMax.set(3);
    fixture.componentInstance.saveAuto();
    fixture.detectChanges();
    expect(saveSettings).toHaveBeenCalledWith('t1', { auto_draft_enabled: true, max_rating: 3 });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('new reviews up to 3 stars get a draft reply');

    const viewer = setup('viewer', { insights: () => of(insights()) }).nativeElement as HTMLElement;
    expect(viewer.querySelector('[data-testid="automation"] input[type="checkbox"]')).toBeNull();
    expect(viewer.querySelector('[data-testid="automation"]')?.textContent).toContain('Only an owner or admin can change this');
  });

  it('passes the chosen filters to the API and downloads the CSV', () => {
    const insightsSpy = jasmine.createSpy('insights').and.returnValue(of(insights()));
    const exportCsv = jasmine.createSpy('exportCsv').and.returnValue(of({ blob: new Blob(['a']), filename: 'review-report.csv' }));
    const fixture = setup('owner', { insights: insightsSpy, exportCsv });
    fixture.componentInstance.locationId.set('l1');
    fixture.componentInstance.from.set('2026-10-01');
    fixture.componentInstance.load();
    expect(insightsSpy.calls.mostRecent().args).toEqual(['t1', { location_id: 'l1', from: '2026-10-01', to: undefined }]);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(URL, 'revokeObjectURL');
    fixture.componentInstance.exportCsv();
    expect(exportCsv).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('shows the server message when the analytics cannot load', () => {
    const el = setup('viewer', {
      insights: () => throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'NOT_FOUND', message: 'Location not found.' }, request_id: 'r' } })),
    }).nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Location not found.');
  });
});
