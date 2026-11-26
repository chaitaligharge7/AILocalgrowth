import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/auth/verify-otp` — email verification step of register→verify→login
 * (blueprint §10.4 AC-01). Defaults `purpose=email_verify`; the email is
 * prefilled from the `email` query param set by the register screen but
 * stays editable so a user can land here directly and verify any address.
 */
@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell title="Email / Mobile Verification" subtitle="Enter the 6-digit code we emailed you.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" />
        </label>

        <label>
          Code
          <input type="text" inputmode="numeric" maxlength="6" formControlName="code" autocomplete="one-time-code" />
        </label>

        @if (errorMessage()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }

        @if (verified()) {
          <p class="success" role="status">Email verified. You can now log in.</p>
        }

        <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting() || verified()">
          {{ submitting() ? 'Verifying…' : 'Verify' }}
        </button>

        <button type="button" class="btn-secondary-full" (click)="resend()" [disabled]="resending() || !form.controls.email.valid">
          {{ resending() ? 'Sending…' : 'Resend code' }}
        </button>
        @if (resent()) {
          <p class="success" role="status">A new code was sent.</p>
        }
      </form>

      @if (verified()) {
        <p><a routerLink="/auth/login">Go to login</a></p>
      }
    </app-auth-shell>
  `,
  styles: [
    `
      .btn-primary-full,
      .btn-secondary-full {
        width: 100%;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .success {
        color: var(--color-success, #146c2e);
        margin: 0;
      }
    `,
  ],
})
export class VerifyOtpComponent {
  private readonly fb = new FormBuilder();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly submitting = signal(false);
  readonly resending = signal(false);
  readonly resent = signal(false);
  readonly verified = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
  ) {
    const prefillEmail = this.route.snapshot.queryParamMap.get('email');
    if (prefillEmail) {
      this.form.patchValue({ email: prefillEmail });
    }
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    const { email, code } = this.form.getRawValue();
    this.auth.verifyOtp(email, 'email_verify', code).subscribe({
      next: () => {
        this.submitting.set(false);
        this.verified.set(true);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  resend(): void {
    if (this.resending()) {
      return;
    }
    this.resending.set(true);
    this.resent.set(false);
    this.errorMessage.set(null);

    this.auth.requestOtp(this.form.controls.email.value, 'email_verify').subscribe({
      next: () => {
        this.resending.set(false);
        this.resent.set(true);
      },
      error: (err: unknown) => {
        this.resending.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }
}
