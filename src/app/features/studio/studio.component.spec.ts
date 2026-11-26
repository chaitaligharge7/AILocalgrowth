import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AssetService } from '../../core/assets/asset.service';
import { ContentService } from '../../core/content/content.service';
import { LocationApiService } from '../../core/locations/location.service';
import { ContentTemplate } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { StudioPromoComponent } from './studio-promo.component';
import { StudioTemplatesComponent } from './studio-templates.component';
import { StudioComponent } from './studio.component';

function tpl(o: Partial<ContentTemplate> = {}): ContentTemplate {
  return {
    id: 'tp1', title: 'Republic Day greeting', category: 'festival', scope: 'platform', channel: 'any',
    caption: 'Proud to celebrate Republic Day. {business_name}', hashtags: ['#RepublicDay'],
    overlay: { headline: 'Happy Republic Day', subline: '{business_name}' }, cta: 'Visit us today',
    date_note: 'Fixed date: 26 January', month: 1, day: 26, next_date: '2027-01-26', days_until: 66, ...o,
  };
}

const apiError = (status: number, body: unknown) => throwError(() => new HttpErrorResponse({ status, error: body }));

describe('StudioTemplatesComponent', () => {
  function setup(studio: Partial<Record<keyof StudioService, unknown>>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StudioTemplatesComponent],
      providers: [provideRouter([]), { provide: StudioService, useValue: studio }],
    });
    const fixture = TestBed.createComponent(StudioTemplatesComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', 'l1');
    fixture.componentRef.setInput('canDraft', true);
    fixture.detectChanges();
    return fixture;
  }

  it('shows a date only for fixed festivals and a "date varies" label for lunar ones', () => {
    const fixture = setup({
      templates: () =>
        of({ templates: [tpl(), tpl({ id: 'tp2', title: 'Diwali greeting', next_date: null, days_until: null, month: null, day: null, date_note: 'Lunar festival - date changes every year' })], categories: ['festival'], today: '2026-11-21' }),
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Republic Day greeting');
    expect(text).toContain('in 66 days');
    expect(text).toContain('Date varies');
    expect(text).toContain('Lunar festival - date changes every year');
  });

  it('creates a draft for the chosen location and reports success', () => {
    const draft = jasmine.createSpy('draftFromTemplate').and.returnValue(of({ content: { id: 'c1' }, creative_spec: { headline: 'H', subline: '', cta_text: null } }));
    const fixture = setup({ templates: () => of({ templates: [tpl()], categories: [], today: '2026-11-21' }), draftFromTemplate: draft });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('.actions button') as HTMLButtonElement;
    expect(btn.textContent).toContain('Create draft');
    btn.click();
    fixture.detectChanges();
    expect(draft).toHaveBeenCalledWith('t1', 'tp1', 'l1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Draft created from "Republic Day greeting"');
  });

  it('shows the server error when a draft cannot be created', () => {
    const fixture = setup({
      templates: () => of({ templates: [tpl()], categories: [], today: '2026-11-21' }),
      draftFromTemplate: () => apiError(403, { error: { code: 'FORBIDDEN', message: 'You do not have permission to create or edit content for this tenant/location.' }, request_id: 'r' }),
    });
    ((fixture.nativeElement as HTMLElement).querySelector('.actions button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('permission');
  });

  it('emits the overlay text when "Design poster" is chosen and hides drafting without permission', () => {
    const fixture = setup({ templates: () => of({ templates: [tpl()], categories: [], today: '2026-11-21' }) });
    let emitted: unknown;
    fixture.componentInstance.design.subscribe((s) => (emitted = s));
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('.actions button');
    (buttons[1] as HTMLButtonElement).click();
    expect(emitted).toEqual({ headline: 'Happy Republic Day', subline: 'your business', cta_text: 'Visit us today' });

    fixture.componentRef.setInput('locationName', 'Glow Salon');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelectorAll('.actions button')[1].dispatchEvent(new Event('click'));
    expect(emitted).toEqual({ headline: 'Happy Republic Day', subline: 'Glow Salon', cta_text: 'Visit us today' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Proud to celebrate Republic Day. Glow Salon');

    fixture.componentRef.setInput('canDraft', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.actions button').length).toBe(1);
  });
});

describe('StudioPromoComponent', () => {
  function setup(promo: unknown, canDraft = true, locationId = 'l1') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StudioPromoComponent],
      providers: [provideRouter([]), { provide: StudioService, useValue: { promo } }],
    });
    const fixture = TestBed.createComponent(StudioPromoComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('locationId', locationId);
    fixture.componentRef.setInput('canDraft', canDraft);
    fixture.detectChanges();
    return fixture;
  }

  it('submits only the fields that apply and shows the composed caption', () => {
    const promo = jasmine.createSpy('promo').and.returnValue(of({ caption: 'Spa day at Glow!\nSave Rs. 499.5.', content: { id: 'c1' }, creative: null }));
    const fixture = setup(promo);
    const form = fixture.componentInstance.form;
    form.patchValue({ offer_title: 'Spa day', discount_type: 'flat', discount_value: '499.50', promo_code: '' });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(promo).toHaveBeenCalledWith('t1', { location_id: 'l1', offer_title: 'Spa day', discount_type: 'flat', discount_value: '499.50' });
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="promo-result"]')?.textContent).toContain('Save Rs. 499.5.');
  });

  it('does not send a discount value for buy-one-get-one and surfaces field errors from the API', () => {
    const promo = jasmine.createSpy('promo').and.returnValue(apiError(422, { error: { code: 'VALIDATION_ERROR', message: 'Promo draft failed validation.', fields: { promo_code: 'promo_code must be 3-20 letters or digits.' } }, request_id: 'r' }));
    const fixture = setup(promo);
    fixture.componentInstance.form.patchValue({ offer_title: 'BOGO', discount_type: 'bogo', discount_value: '10' });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(promo.calls.mostRecent().args[1].discount_value).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('promo_code must be 3-20 letters or digits.');
  });

  it('explains why the form is unavailable without permission or a location', () => {
    expect((setup(jasmine.createSpy(), false).nativeElement as HTMLElement).textContent).toContain('not create drafts');
    expect((setup(jasmine.createSpy(), true, '').nativeElement as HTMLElement).textContent).toContain('Pick a location');
  });
});

describe('StudioComponent', () => {
  function setup(role: string, locations: unknown[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: LocationApiService, useValue: { list: () => of(locations) } },
        { provide: AssetService, useValue: { list: () => of([]) } },
        { provide: ContentService, useValue: { list: () => of([]) } },
        { provide: StudioService, useValue: { templates: () => of({ templates: [], categories: [], today: '2026-11-21' }), creatives: () => of({ creatives: [], layouts: ['offer_banner'], sizes: {}, brand: { primary_hex: '#078d7e', secondary_hex: '#0b1f38', logo_asset_id: null, from_brand_kit: false }, capabilities: { ai_image_generation: { available: false, reason: 'No image-generation provider is configured.' } } }) } },
      ],
    });
    const current = TestBed.inject(CurrentTenantService);
    current.select({ id: 't1', caller_role: role } as never);
    const fixture = TestBed.createComponent(StudioComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('lists the three studio tabs and the location picker', () => {
    const fixture = setup('owner', [{ id: 'l1', name: 'Glow Salon' }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim())).toEqual(['Festival & seasonal templates', 'Promo designer', 'Poster designer']);
    expect(el.querySelector('select')?.textContent).toContain('Glow Salon');
    expect(fixture.componentInstance.canEdit()).toBeTrue();
  });

  it('opens the designer pre-filled when a template asks for a poster, and says AI images are unavailable', () => {
    const fixture = setup('editor', [{ id: 'l1', name: 'Glow Salon' }]);
    fixture.componentInstance.openDesigner({ headline: 'Happy Diwali', subline: 'Light and joy' });
    fixture.detectChanges();
    expect(fixture.componentInstance.tab()).toBe('designer');
    const el = fixture.nativeElement as HTMLElement;
    expect((el.querySelector('input[formControlName="headline"]') as HTMLInputElement).value).toBe('Happy Diwali');
    expect(el.querySelector('[data-testid="ai-note"]')?.textContent).toContain('No image-generation provider');
    expect(el.querySelector('[data-testid="design-canvas"]')).not.toBeNull();
  });

  it('treats a viewer as read-only', () => {
    expect(setup('viewer', []).componentInstance.canEdit()).toBeFalse();
  });
});
