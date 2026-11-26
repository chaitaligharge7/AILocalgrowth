import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Verification } from '../../core/admin/platform-console.service';
import { HelpService } from '../../core/help/help.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * `/app/:tenantId/verification` — submit legal details for a platform admin
 * to review. The details are self-declared; nothing is checked against a
 * government registry, and the page says so.
 */
@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent],
  template: `
    <section class="ver">
      <app-page-header eyebrow="Business" eyebrowLabel="Verification" title="Business verification" subtitle="Tell us the legal details of your business so the Scriptlet team can review them." />
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else {
        @if (current(); as v) {
          <div class="card status" [attr.data-status]="v.status" data-testid="verification-status">
            <h2>Status: {{ v.status }}</h2>
            <p class="meta">Submitted {{ v.submitted_at | date: 'medium' }}@if (v.reviewed_at) { · Reviewed {{ v.reviewed_at | date: 'medium' }} }</p>
            @if (v.review_note) { <p>Reviewer note: {{ v.review_note }}</p> }
          </div>
        } @else {
          <p class="meta">You have not submitted anything yet.</p>
        }
        @for (n of notes(); track n) { <p class="meta">{{ n }}</p> }
        @if (current()?.status !== 'verified') {
          <form class="card form" [formGroup]="form" (ngSubmit)="submit()" data-testid="verification-form">
            <h2>{{ current() ? 'Update and resubmit' : 'Submit details' }}</h2>
            <label>Legal name <input formControlName="legal_name" /></label>
            <label>GSTIN (optional) <input formControlName="gstin" maxlength="15" placeholder="27ABCDE1234F1Z5" /></label>
            <label>Website (optional) <input formControlName="website_url" placeholder="https://" /></label>
            <label class="wide">Note for the reviewer (optional) <textarea rows="3" formControlName="note" maxlength="500"></textarea></label>
            @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
            <button type="submit" [disabled]="form.invalid || saving()">Submit for review</button>
          </form>
        }
      }
    </section>
  `,
  styles: [
    `
      .ver { font-family: var(--font-sans); width: 100%; display: flex; flex-direction: column; gap: var(--space-3); }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
      .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem; align-items: end; }
      .form h2, .form button, .form p, .form .wide { grid-column: 1 / -1; margin: 0; }
      label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.85rem; }
      input, textarea { padding: 0.45rem; font: inherit; }
      .meta { color: var(--color-text-muted); font-size: 0.85rem; }
      .form-error { color: #b00020; }
      button { padding: 0.45rem 0.9rem; cursor: pointer; }
    `,
  ],
})
export class VerificationComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(HelpService);
  private readonly currentTenant = inject(CurrentTenantService);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly current = signal<Verification | null>(null);
  readonly notes = signal<string[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    legal_name: ['', Validators.required],
    gstin: [''],
    website_url: [''],
    note: [''],
  });

  ngOnInit(): void {
    const id = this.tenantId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.api.verification(id).subscribe({
      next: (d) => {
        this.current.set(d.verification);
        this.notes.set(d.notes);
        if (d.verification) {
          this.form.patchValue({
            legal_name: d.verification.legal_name,
            gstin: d.verification.gstin ?? '',
            website_url: d.verification.website_url ?? '',
            note: d.verification.note ?? '',
          });
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.formError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .submitVerification(this.tenantId(), {
        legal_name: v.legal_name.trim(),
        gstin: v.gstin.trim(),
        website_url: v.website_url.trim(),
        note: v.note.trim(),
      })
      .subscribe({
        next: (d) => {
          this.saving.set(false);
          this.current.set(d.verification);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err));
        },
      });
  }
}
