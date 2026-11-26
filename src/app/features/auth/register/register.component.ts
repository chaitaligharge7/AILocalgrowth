import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/auth/register` — blueprint §10.4 AC-01 "New owner can register,
 * verify and create tenant". Reactive form incl. terms checkbox; on
 * success routes to `/auth/verify-otp` with the email prefilled (the
 * backend already issued the first `email_verify` OTP as part of
 * `RegisterService::register()`).
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell title="Business Owner Registration">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Full name
          <input type="text" formControlName="name" autocomplete="name" />
        </label>
        @if (fieldError('name')) {
          <p class="field-error">{{ fieldError('name') }}</p>
        }

        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" />
        </label>
        @if (fieldError('email')) {
          <p class="field-error">{{ fieldError('email') }}</p>
        }

        <label>
          Password
          <input type="password" formControlName="password" autocomplete="new-password" />
        </label>
        @if (fieldError('password')) {
          <p class="field-error">{{ fieldError('password') }}</p>
        }

        <label class="checkbox">
          <input type="checkbox" formControlName="termsAccepted" />
          I accept the terms and conditions
        </label>
        @if (fieldError('terms_accepted')) {
          <p class="field-error">{{ fieldError('terms_accepted') }}</p>
        }

        @if (errorMessage() && !hasFieldErrors()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }

        <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Creating account…' : 'Continue securely →' }}
        </button>
      </form>

      <p class="switch-line">Already have an account? <a routerLink="/auth/login">Log in</a></p>
    </app-auth-shell>
  `,
  styles: [
    `
      .btn-primary-full {
        width: 100%;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      label.checkbox {
        flex-direction: row;
        align-items: center;
        font-weight: 400;
        gap: var(--space-2);
      }
      .field-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .switch-line {
        margin: var(--space-4) 0 0;
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        text-align: center;
      }
    `,
  ],
})
export class RegisterComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
    termsAccepted: [false, [Validators.requiredTrue]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const { name, email, password, termsAccepted } = this.form.getRawValue();
    this.auth
      .register({ name, email, password, terms_accepted: termsAccepted })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          void this.router.navigate(['/auth/verify-otp'], { queryParams: { email } });
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }
}
