import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/auth/forgot-password` — step 1 ("request") of the two-step reset flow.
 * Reuses `POST /auth/otp/request` with `purpose=password_reset`
 * (`OtpService::request()`), which never reveals whether the email exists
 * (same `{status:'requested'}` response either way) — so this screen
 * always shows the same generic success message, by design.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShellComponent],
  template: `
    <app-auth-shell title="Forgot and Reset Password">
      @if (!requested()) {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>
            Work email address
            <input type="email" formControlName="email" autocomplete="email" />
          </label>

          @if (errorMessage()) {
            <p class="form-error" role="alert">{{ errorMessage() }}</p>
          }

          <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
            {{ submitting() ? 'Sending…' : 'Send reset code' }}
          </button>
        </form>
      } @else {
        <p class="success" role="status">
          If an account exists for that email, a reset code has been sent.
        </p>
        <button type="button" class="btn-primary-full" (click)="goToReset()">Enter code</button>
      }
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
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .success {
        color: var(--color-success, #146c2e);
      }
    `,
  ],
})
export class ForgotPasswordComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly submitting = signal(false);
  readonly requested = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    this.auth.requestPasswordReset(this.form.controls.email.value).subscribe({
      next: () => {
        this.submitting.set(false);
        this.requested.set(true);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  goToReset(): void {
    void this.router.navigate(['/auth/reset-password'], {
      queryParams: { email: this.form.controls.email.value },
    });
  }
}
