import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { ActionItems, DashboardWidgets, GoalsResponse, GrowthScore, RecommendationsResponse } from '../../core/growth/growth.models';
import { GrowthService } from '../../core/growth/growth.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { DashboardComponent } from './dashboard.component';

const comp = (code: string, status: 'scored' | 'insufficient_data', value: number | null) => ({
  code, label: code + ' label', weight: 20, source: 'src of ' + code, status, value,
  effective_weight_pct: status === 'scored' ? 50 : null, detail: 'detail ' + code, evidence: {},
});

const score = (o: Partial<GrowthScore> = {}): GrowthScore => ({
  generated_at: '2026-11-22T00:00:00Z', method: 'transparent-formula', is_ai: false, formula_version: 'v1', min_coverage_pct: 40,
  score: 72.5, band: 'fair', coverage_pct: 70, explanation: 'Weighted average of the components below that have real data.',
  components: [comp('audit', 'scored', 80), comp('posting', 'insufficient_data', null)],
  history: [{ date: '2026-11-21', score: 70, coverage_pct: 70 }, { date: '2026-11-22', score: 72.5, coverage_pct: 70 }],
  history_note: 'Trend points are only the days this score was actually computed for your business; nothing is back-filled.', ...o,
});

const recs = (): RecommendationsResponse => ({
  generated_at: 'x', method: 'rule-based', is_ai: false, note: 'Each recommendation is a fixed rule applied to your own data.',
  recommendations: [{
    code: 'contact_leads', priority: 'high', basis: 'rule-based', title: 'Follow up with new leads', detail: '2 lead(s) are still "new".',
    evidence: [{ label: 'Uncontacted leads', value: '2' }], action: { label: 'Open leads', web_path: 'leads', mobile_route: '/leads' },
  }],
});

const actions = (): ActionItems => ({
  generated_at: 'x', counts: { content_approvals: 1, review_replies: 0, failed_posts: 0, uncontacted_leads: 0 }, total: 1, list_cap: 10,
  items: [{ type: 'content_approval', title: 'Diwali offer', detail: 'Waiting for approval', created_at: null, web_path: 'content', mobile_route: '/content/1' }],
});

const widgets = (isDefault = true): DashboardWidgets => ({
  is_default: isDefault,
  widgets: [
    { code: 'growth_score', label: 'Growth score', visible: true },
    { code: 'goals', label: 'Goals', visible: true },
    { code: 'kpis', label: 'Key numbers', visible: true },
    { code: 'action_items', label: 'Action items', visible: true },
    { code: 'recommendations', label: 'Recommendations', visible: true },
  ],
});

const goalsResponse = (): GoalsResponse => ({
  generated_at: 'x', note: 'Progress is measured from your own data each time you open this page. Nothing is projected or estimated.',
  can_edit: true, max_active_goals: 20,
  metrics: [{ code: 'reviews_total', label: 'Total reviews', unit: 'reviews', kind: 'point', max: null, source: 'Synced Google reviews', current_value: 12 }],
  goals: [],
});

const overview = {
  audit_coverage: { locations_total: 1, locations_audited: 1, percentage: 100 },
  posts: { attempted: 2, succeeded: 1, failed: 1 }, pending_reviews: 3,
  leads: { available: true, count: 4, note: '', by_status: {} },
};

describe('DashboardComponent growth widgets', () => {
  function setup(growth: Partial<Record<keyof GrowthService, unknown>>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: { overview: () => of(overview) } },
        {
          provide: GrowthService,
          useValue: { score: () => of(score()), recommendations: () => of(recs()), actionItems: () => of(actions()), widgets: () => of(widgets()), goals: () => of(goalsResponse()), ...growth },
        },
      ],
    });
    TestBed.inject(CurrentTenantService).select({ id: 't1', display_name: 'Glow', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', caller_role: 'owner' } as never);
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the score with its formula label, component weights and a "left out" note for missing data', () => {
    const el = setup({}).nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="growth-score-value"]')?.textContent).toContain('72.5');
    expect(el.textContent).toContain('Transparent formula');
    expect(el.textContent).toContain('weight 20');
    expect(el.querySelectorAll('[data-test="insufficient"]').length).toBe(1);
    expect(el.textContent).toContain('(left out)');
    expect(el.textContent).toContain('nothing is back-filled');
  });

  it('shows "Not enough data yet" and no number when the server returns a null score', () => {
    const el = setup({ score: () => of(score({ score: null, band: null, coverage_pct: 10, history: [] })) }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="growth-score-value"]')?.textContent?.trim()).toBe('—');
    expect(el.textContent).toContain('Not enough data yet');
  });

  it('labels recommendations rule-based, cites the trigger and links to a real screen', () => {
    const el = setup({}).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Rule-based');
    expect(el.textContent).toContain('Uncontacted leads = 2');
    const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('Open leads'));
    expect(link?.getAttribute('href')).toBe('/app/t1/leads');
  });

  it('lists action items and an honest empty state', () => {
    const el = setup({}).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Diwali offer');
    const empty = setup({ actionItems: () => of({ ...actions(), items: [], total: 0 }) }).nativeElement as HTMLElement;
    expect(empty.querySelector('[data-test="actions-empty"]')?.textContent).toContain('Nothing is waiting');
  });

  it('hides a widget the user turned off and follows the saved order', () => {
    const layout: DashboardWidgets = {
      is_default: false,
      widgets: [
        { code: 'recommendations', label: 'Recommendations', visible: true },
        { code: 'growth_score', label: 'Growth score', visible: false },
        { code: 'action_items', label: 'Action items', visible: true },
        { code: 'kpis', label: 'Key numbers', visible: true },
      ],
    };
    const el = setup({ widgets: () => of(layout) }).nativeElement as HTMLElement;
    expect(el.querySelector('app-growth-score-card')).toBeNull();
    const order = Array.from(el.querySelectorAll('app-recommendations-card, app-action-items-card')).map((n) => n.tagName.toLowerCase());
    expect(order).toEqual(['app-recommendations-card', 'app-action-items-card']);
  });

  it('saves a reordered layout and shows the server message when it is rejected', () => {
    const saved = jasmine.createSpy('saveWidgets').and.returnValue(of({ ...widgets(false), widgets: [...widgets().widgets].reverse() }));
    const fixture = setup({ saveWidgets: saved });
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-test="customize-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-test="save-widgets"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(saved).toHaveBeenCalledOnceWith('t1', [
      { code: 'growth_score', visible: false },
      { code: 'goals', visible: true },
      { code: 'kpis', visible: true },
      { code: 'action_items', visible: true },
      { code: 'recommendations', visible: true },
    ]);

    const failing = setup({ saveWidgets: () => throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'VALIDATION_ERROR', message: 'Widget layout failed validation.' } } })) });
    const el2 = failing.nativeElement as HTMLElement;
    (el2.querySelector('[data-test="customize-toggle"]') as HTMLButtonElement).click();
    failing.detectChanges();
    (el2.querySelector('[data-test="save-widgets"]') as HTMLButtonElement).click();
    failing.detectChanges();
    expect(el2.querySelector('[role="alert"]')?.textContent).toContain('Widget layout failed validation');
  });

  it('shows the server error on a card whose request failed instead of inventing data', () => {
    const el = setup({ score: () => throwError(() => new HttpErrorResponse({ status: 500, error: { error: { code: 'INTERNAL', message: 'Boom' } } })) }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Boom');
    expect(el.querySelector('[data-test="growth-score-value"]')).toBeNull();
  });

  it('hides a recommendation for this user only and can show it again', () => {
    const dismiss = jasmine.createSpy('dismissRecommendation').and.returnValue(of(undefined));
    const restore = jasmine.createSpy('restoreRecommendation').and.returnValue(of(undefined));
    const hiddenRecs = (): RecommendationsResponse => ({
      ...recs(), dismissed_count: 1,
      recommendations: [{ ...recs().recommendations[0], dismissed: true, dismissed_until: null }],
    });
    const fixture = setup({
      dismissRecommendation: dismiss,
      restoreRecommendation: restore,
      recommendations: (_t: string, include?: boolean) => of(include ? hiddenRecs() : { ...recs(), dismissed_count: 1 }),
    });
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('[data-test="rec-snooze"]') as HTMLButtonElement).click();
    expect(dismiss).toHaveBeenCalledWith('t1', 'contact_leads', 7);
    (el.querySelector('[data-test="rec-dismiss"]') as HTMLButtonElement).click();
    expect(dismiss).toHaveBeenCalledWith('t1', 'contact_leads', undefined);

    (el.querySelector('[data-test="rec-toggle-hidden"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="rec-hidden-note"]')?.textContent).toContain('until you restore it');
    expect(el.textContent).toContain('Uncontacted leads = 2');
    const again = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Show again')) as HTMLButtonElement;
    again.click();
    expect(restore).toHaveBeenCalledOnceWith('t1', 'contact_leads');
  });

  it('renders the goals widget between the score and the recommendations', () => {
    const el = setup({}).nativeElement as HTMLElement;
    const tags = Array.from(el.querySelectorAll('app-growth-score-card, app-goals-card, app-recommendations-card')).map((n) => n.tagName.toLowerCase());
    expect(tags).toEqual(['app-growth-score-card', 'app-goals-card', 'app-recommendations-card']);
  });
});
