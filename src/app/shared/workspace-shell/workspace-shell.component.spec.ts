import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WorkspaceShellComponent } from './workspace-shell.component';

@Component({ standalone: true, template: 'stub' })
class StubComponent {}

describe('WorkspaceShellComponent — shared chrome used by all three shells (app/agency/admin)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: [
        provideRouter([
          { path: 'a', component: StubComponent, title: 'Alpha — Scriptlet LocalGrowth' },
          { path: 'b', component: StubComponent, title: 'Beta — Scriptlet LocalGrowth' },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.componentRef.setInput('navItems', [
      { label: 'Alpha', icon: 'grid', link: '/a' },
      { label: 'Beta', icon: 'overview', link: '/b' },
    ]);
    fixture.componentRef.setInput('sectionLabel', 'Business');
    fixture.componentRef.setInput('avatarInitial', 'J');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('renders every nav item label and the breadcrumb section', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Business');
    expect(text).toContain('LocalGrowth');
  });

  it('renders the avatar initial from the real signed-in user, not a fabricated value', () => {
    const { fixture } = setup();
    const avatar = (fixture.nativeElement as HTMLElement).querySelector('.avatar');
    expect(avatar?.textContent?.trim()).toBe('J');
  });

  it('filters nav items by the search box without calling any API (client-side only)', () => {
    const { component } = setup();
    component.onSearch({ target: { value: 'alp' } } as unknown as Event);
    expect(component.matches().map((m) => m.label)).toEqual(['Alpha']);
  });

  it('emits (logout) when the logout button is clicked', () => {
    const { fixture, component } = setup();
    const spy = jasmine.createSpy('logout');
    component.logout.subscribe(spy);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.logout-btn')!.click();
    expect(spy).toHaveBeenCalled();
  });

  it('derives the breadcrumb third segment from the active route\'s real title, not a fabricated page name', async () => {
    const { fixture, component } = setup();
    await TestBed.inject(Router).navigateByUrl('/a');
    fixture.detectChanges();
    expect(component.pageTitle()).toBe('Alpha');
  });
});
