import { Component, inject, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { Creative, DiscountType, PromoResponse } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { localTodayDateString } from '../../core/utils/date.util';

/**
 * Promo / offer designer (BW-056): structured offer fields -> a deterministic
 * caption (not AI) saved as an ordinary content DRAFT, plus a poster design
 * pre-filled with the offer. Money values are decimal strings end to end.
 */
@Component({
  selector: 'app-studio-promo',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="wrap">
      @if (!canDraft) {
        <p class="meta">Your role can view studio content but not create drafts.</p>
      } @else if (!locationId) {
        <p class="meta">Pick a location above first.</p>
      } @else {
        <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <h3>Offer details</h3>
          <label>
            Offer title
            <input type="text" formControlName="offer_title" maxlength="80" placeholder="e.g. Diwali glow package" />
            @if (err('offer_title')) { <span class="form-error" role="alert">{{ err('offer_title') }}</span> }
          </label>
          <div class="row">
            <label>
              Discount type
              <select formControlName="discount_type">
                <option value="percent">Percentage off</option>
                <option value="flat">Flat amount off</option>
                <option value="bogo">Buy one, get one</option>
                <option value="freebie">Free extra</option>
              </select>
            </label>
            @if (needsValue()) {
              <label>
                {{ form.controls.discount_type.value === 'percent' ? 'Percent (1-100)' : 'Amount' }}
                <input type="text" inputmode="decimal" formControlName="discount_value" placeholder="20" />
                @if (err('discount_value')) { <span class="form-error" role="alert">{{ err('discount_value') }}</span> }
              </label>
            }
          </div>
          <label>
            Extra detail (optional)
            <input type="text" formControlName="detail" maxlength="120" placeholder="On all facials" />
          </label>
          <div class="row">
            <label>
              Valid from
              <input type="date" formControlName="valid_from" [min]="minToday" />
              @if (err('valid_from')) { <span class="form-error" role="alert">{{ err('valid_from') }}</span> }
            </label>
            <label>
              Valid until
              <input type="date" formControlName="valid_until" [min]="form.controls.valid_from.value || minToday" />
              @if (err('valid_until')) { <span class="form-error" role="alert">{{ err('valid_until') }}</span> }
            </label>
            <label>
              Promo code
              <input type="text" formControlName="promo_code" maxlength="20" placeholder="GLOW20" />
              @if (err('promo_code')) { <span class="form-error" role="alert">{{ err('promo_code') }}</span> }
            </label>
          </div>
          <label>
            Terms (optional)
            <input type="text" formControlName="terms" maxlength="200" placeholder="One use per customer" />
          </label>
          @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
          <div class="actions">
            <button type="submit" [disabled]="busy() || form.controls.offer_title.value.trim() === ''">{{ busy() ? 'Creating…' : 'Create caption + poster draft' }}</button>
          </div>
        </form>
      }

      @if (result(); as r) {
        <article class="card result" data-testid="promo-result">
          <h3>Draft created</h3>
          <pre class="caption">{{ r.caption }}</pre>
          <p class="meta">Saved as a content draft. Review it, then submit it for approval from <a [routerLink]="['/app', tenantId, 'content']">Content</a>.</p>
          @if (r.creative) {
            <button type="button" class="btn-secondary" (click)="openDesigner.emit(r.creative)">Open poster design</button>
          }
        </article>
      }
    </section>
  `,
  styles: [
    `
      .wrap { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
      @media (max-width: 900px) { .wrap { grid-template-columns: 1fr; } }
      .form, .result { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; flex: 1; }
      input, select { padding: 0.5rem; font: inherit; font-weight: 400; }
      .row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .caption { white-space: pre-wrap; font-family: inherit; background: var(--color-surface-muted, #f3f6f8); padding: 0.75rem; border-radius: var(--radius-md, 10px); margin: 0; }
      .form-error { color: #b00020; font-weight: 400; }
    `,
  ],
})
export class StudioPromoComponent {
  readonly minToday = localTodayDateString();
  @Input({ required: true }) tenantId = '';
  @Input() locationId = '';
  @Input() canDraft = false;
  @Output() readonly openDesigner = new EventEmitter<Creative>();

  readonly busy = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly result = signal<PromoResponse | null>(null);

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    offer_title: ['', [Validators.required, Validators.maxLength(80)]],
    discount_type: ['percent' as DiscountType],
    discount_value: [''],
    detail: [''],
    valid_from: [''],
    valid_until: [''],
    promo_code: [''],
    terms: [''],
  });

  constructor(
    private readonly studio: StudioService,
  ) {}

  needsValue(): boolean {
    const t = this.form.controls.discount_type.value;
    return t === 'percent' || t === 'flat';
  }

  err(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  submit(): void {
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);
    this.studio
      .promo(this.tenantId, {
        location_id: this.locationId,
        offer_title: v.offer_title.trim(),
        discount_type: v.discount_type,
        ...(this.needsValue() ? { discount_value: v.discount_value.trim() } : {}),
        ...(v.detail.trim() ? { detail: v.detail.trim() } : {}),
        ...(v.valid_from ? { valid_from: v.valid_from } : {}),
        ...(v.valid_until ? { valid_until: v.valid_until } : {}),
        ...(v.promo_code.trim() ? { promo_code: v.promo_code.trim() } : {}),
        ...(v.terms.trim() ? { terms: v.terms.trim() } : {}),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.result.set(res);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.fieldErrors.set(apiErrorFields(err));
          this.formError.set(apiErrorFields(err) ? null : apiErrorMessage(err));
        },
      });
  }
}
