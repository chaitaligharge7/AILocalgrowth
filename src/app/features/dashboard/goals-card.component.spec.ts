import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Goal, GoalsResponse } from '../../core/growth/growth.models';
import { GrowthService } from '../../core/growth/growth.service';
import { GoalsCardComponent } from './goals-card.component';

const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', metric: 'reviews_total', label: 'Total reviews', unit: 'reviews', kind: 'point', source: 'Synced Google reviews',
  target_value: 50, baseline_value: 10, current_value: 25, progress_pct: 50, remaining: 25, status: 'in_progress',
  starts_on: '2026-11-22', deadline_on: '2026-12-31', days_left: 39, created_at: '2026-11-22T00:00:00Z', ...o,
});

const response = (o: Partial<GoalsResponse> = {}): GoalsResponse => ({
  generated_at: 'x', note: 'Progress is measured from your own data each time you open this page. Nothing is projected or estimated.',
  can_edit: true, max_active_goals: 20,
  metrics: [
    { code: 'reviews_total', label: 'Total reviews', unit: 'reviews', kind: 'point', max: null, source: 'Synced Google reviews', current_value: 25 },
    { code: 'leads_in_period', label: 'New leads', unit: 'leads', kind: 'period', max: null, source: 'Leads in the window', current_value: null },
  ],
  goals: [goal()], ...o,
});

describe('GoalsCardComponent', () => {
  function setup(growth: Partial<Record<keyof GrowthService, unknown>>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GoalsCardComponent], providers: [{ provide: GrowthService, useValue: { goals: () => of(response()), ...growth } }] });
    const fixture = TestBed.createComponent(GoalsCardComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    return fixture;
  }

  it('shows measured progress, the source and the deadline for a goal', () => {
    const el = setup({}).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Measured, not predicted');
    expect(el.textContent).toContain('25 of 50 reviews (50%)');
    expect(el.textContent).toContain('25 to go, 39 day(s) left');
    expect(el.textContent).toContain('Started at 10');
    expect(el.textContent).toContain('Source: Synced Google reviews');
    expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('says "No data yet" instead of showing 0 when the metric has nothing to measure', () => {
    const el = setup({ goals: () => of(response({ goals: [goal({ current_value: null, progress_pct: null, remaining: null, status: 'no_data' })] })) }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="goal-no-data"]')?.textContent).toContain('No data yet for this metric');
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('hides every write control from members without edit rights', () => {
    const el = setup({ goals: () => of(response({ can_edit: false })) }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="goal-add"]')).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Remove'))).toBeFalse();
    expect(el.textContent).toContain('25 of 50');
  });

  it('shows an honest empty state', () => {
    const el = setup({ goals: () => of(response({ goals: [] })) }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="goals-empty"]')?.textContent).toContain('No goals yet');
  });

  it('creates a goal, and shows the server message when it is rejected', () => {
    const create = jasmine.createSpy('createGoal').and.returnValue(of(goal()));
    const fixture = setup({ createGoal: create });
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-test="goal-add"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.metric = 'reviews_total';
    cmp.target = '60';
    cmp.deadline = '2026-12-31';
    cmp.create();
    expect(create).toHaveBeenCalledOnceWith('t1', { metric: 'reviews_total', target_value: '60', deadline_on: '2026-12-31' });

    const failing = setup({
      createGoal: () => throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'VALIDATION_ERROR', message: 'Goal failed validation.' } } })),
    });
    (failing.nativeElement.querySelector('[data-test="goal-add"]') as HTMLButtonElement).click();
    failing.detectChanges();
    failing.componentInstance.create();
    failing.detectChanges();
    expect(failing.nativeElement.querySelector('[data-test="goal-form"] [role="alert"]')?.textContent).toContain('Goal failed validation');
  });

  it('only sends the start date for period metrics', () => {
    const create = jasmine.createSpy('createGoal').and.returnValue(of(goal()));
    const fixture = setup({ createGoal: create });
    const cmp = fixture.componentInstance;
    cmp.metric = 'leads_in_period';
    cmp.target = '5';
    cmp.deadline = '2026-12-31';
    cmp.startsOn = '2026-12-01';
    cmp.create();
    expect(create).toHaveBeenCalledWith('t1', { metric: 'leads_in_period', target_value: '5', deadline_on: '2026-12-31', starts_on: '2026-12-01' });
  });

  it('removes a goal through the API', () => {
    const del = jasmine.createSpy('deleteGoal').and.returnValue(of(undefined));
    const fixture = setup({ deleteGoal: del });
    fixture.componentInstance.remove(goal());
    expect(del).toHaveBeenCalledOnceWith('t1', 'g1');
  });

  it('shows the server error when goals cannot be loaded', () => {
    const el = setup({ goals: () => throwError(() => new HttpErrorResponse({ status: 500, error: { error: { code: 'INTERNAL', message: 'Boom' } } })) }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Boom');
  });
});
