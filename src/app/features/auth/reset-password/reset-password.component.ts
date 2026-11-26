import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/auth/reset-password` — step 2 ("confirm") of the two-step reset flow,
 * `POST /auth/password/reset` (`PasswordResetService::confirm()`). On
 * success the backend revokes every existing session for the account, so
 * this screen always sends the user back to `/auth/login` to sign in
 * with the new password rather than attempting to keep them signed in.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell title="Forgot and Reset Password">
      @if (!resetDone()) {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>
            Email
            <input type="email" formControlName="email" autocomplete="email" />
          </label>

          <label>
            Code
            <input type="text" inputmode="numeric" maxlength="6" formControlName="code" autocomplete="one-time-code" />
          </label>

          <label>
            New password
            <input type="password" formControlName="newPassword" autocomplete="new-password" />
          </label>

          @if (errorMessage()) {
            <p class="form-error" role="alert">{{ errorMessage() }}</p>
          }

          <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
            {{ submitting() ? 'Resetting…' : 'Reset password' }}
          </button>
        </form>
      } @else {
        <p class="success" role="status">
          Password reset. All previous sessions were signed out — log in with your new password.
        </p>
        <p><a routerLink="/auth/login">Go to login</a></p>
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
export class ResetPasswordComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(10)]],
  });

  readonly submitting = signal(false);
  readonly resetDone = signal(false);
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

    const { email, code, newPassword } = this.form.getRawValue();
    this.auth.confirmPasswordReset(email, code, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.resetDone.set(true);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }
}
