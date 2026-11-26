import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ContentRevision } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { ContentHistoryComponent } from './content-history.component';

const rev = (o: Partial<ContentRevision>): ContentRevision => ({
  id: 'r1', version: 1, body: 'First body', assets: [], editor_id: 'u1', editor_name: 'Asha', created_at: '2026-11-20T10:00:00.000Z',
  is_current: false, length: 10, length_delta: null, ...o,
});

describe('ContentHistoryComponent', () => {
  const revisions = [rev({ id: 'r2', version: 2, body: 'Second body, longer', is_current: true, length_delta: 9 }), rev({})];

  function setup(studio: Partial<Record<keyof StudioService, unknown>>, canRestore = true) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ContentHistoryComponent], providers: [{ provide: StudioService, useValue: studio }] });
    const fixture = TestBed.createComponent(ContentHistoryComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('contentId', 'c1');
    fixture.componentRef.setInput('canRestore', canRestore);
    fixture.detectChanges();
    return fixture;
  }

  const base = (restorable = true) => ({
    revisions: () => of({ content_id: 'c1', status: 'draft', restorable, revisions }),
    timeline: () =>
      of({
        content_id: 'c1', status: 'draft',
        events: [
          { type: 'created', at: '2026-11-20T10:00:00.000Z', actor_name: 'Asha', title: 'Draft created', detail: null, status: null },
          { type: 'approval_rejected', at: '2026-11-20T11:00:00.000Z', actor_name: 'Ravi', title: 'Rejected', detail: 'Fix the price', status: 'rejected' },
        ],
      }),
  });

  it('lists versions newest first, marks the current one and offers restore only on older versions', () => {
    const fixture = setup(base());
    const el = fixture.nativeElement as HTMLElement;
    const items = el.querySelectorAll('.versions li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Version 2');
    expect(items[0].textContent).toContain('Current');
    expect(items[0].textContent).toContain('+9 characters');
    expect(items[0].querySelector('button')).toBeNull();
    expect(items[1].querySelector('button')?.textContent).toContain('Restore this version');
  });

  it('hides restore when the content is no longer editable or the viewer cannot edit', () => {
    expect((setup(base(false)).nativeElement as HTMLElement).querySelector('.versions button')).toBeNull();
    expect((setup(base(true), false).nativeElement as HTMLElement).querySelector('.versions button')).toBeNull();
    expect((setup(base(false)).nativeElement as HTMLElement).textContent).toContain('Restore is available while the content is a draft');
  });

  it('restores a version, refreshes the list and tells the parent', () => {
    const restoreRevision = jasmine.createSpy('restoreRevision').and.returnValue(
      of({ content_id: 'c1', status: 'draft', restorable: true, revisions: [rev({ id: 'r3', version: 3, body: 'First body', is_current: true }), ...revisions] }),
    );
    const fixture = setup({ ...base(), restoreRevision });
    let emitted = 0;
    fixture.componentInstance.restored.subscribe(() => emitted++);
    ((fixture.nativeElement as HTMLElement).querySelectorAll('.versions li')[1].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(restoreRevision).toHaveBeenCalledWith('t1', 'c1', 'r1');
    expect(emitted).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.versions li').length).toBe(3);
  });

  it('shows the approval timeline with reviewer comments', () => {
    const fixture = setup(base());
    fixture.componentInstance.view.set('timeline');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="content-timeline"]')?.textContent ?? '';
    expect(text).toContain('Draft created');
    expect(text).toContain('Rejected');
    expect(text).toContain('Fix the price');
    expect((fixture.nativeElement as HTMLElement).querySelector('.dot.bad')).not.toBeNull();
  });

  it('shows the server message when history cannot be loaded', () => {
    const fixture = setup({
      revisions: () => throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'NOT_FOUND', message: 'Content not found.' }, request_id: 'r' } })),
      timeline: () => of({ events: [] }),
    });
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('Content not found.');
  });
});
