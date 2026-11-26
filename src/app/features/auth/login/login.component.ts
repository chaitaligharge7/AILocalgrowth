import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorCode, apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/auth/login` — blueprint §3 Flutter/Angular AUTH inventory, §10.4 AC-01.
 * Reactive form; on success stores the token pair (via `AuthService`) and
 * routes to the tenant chooser, which itself redirects straight to the
 * dashboard when the user has exactly one tenant.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell title="Welcome back" subtitle="Sign in to access your business or agency workspace.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field-group">
          <label class="field-label" for="login-email">Work email address</label>
          <input
            id="login-email"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="name@company.com"
          />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <p class="field-error">A valid email is required.</p>
          }
        </div>

        <div class="field-group">
          <div class="field-label-row">
            <label class="field-label" for="login-password">Password</label>
            <a routerLink="/auth/forgot-password" class="forgot-link">Forgot password?</a>
          </div>
          <div class="password-wrap">
            <input
              id="login-password"
              [type]="showPassword() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              placeholder="Enter your password"
            />
            <button
              type="button"
              class="password-toggle"
              (click)="togglePassword()"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              {{ showPassword() ? 'Hide' : 'Show' }}
            </button>
          </div>
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <p class="field-error">Password is required.</p>
          }
        </div>

        @if (errorMessage()) {
          <div class="form-error" role="alert">
            <span>{{ errorMessage() }}</span>
            @if (needsVerification()) {
              <a [routerLink]="['/auth/verify-otp']" [queryParams]="{ email: form.value.email }">Verify your email →</a>
            }
          </div>
        }

        <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Logging in…' : 'Continue securely →' }}
        </button>
      </form>

      <div class="switch-links">
        <p class="switch-line">
          Don't have an account? <a routerLink="/auth/register">Create an account</a>
        </p>
        <p class="switch-line switch-line--sub">
          Platform administrator? <a routerLink="/admin/login">Sign in to admin portal</a>
        </p>
      </div>
    </app-auth-shell>
  `,
  styles: [
    `
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .field-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .field-label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .forgot-link {
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        text-decoration: none;
      }
      .forgot-link:hover {
        text-decoration: underline;
      }
      input {
        width: 100%;
        padding: 0.65rem 0.85rem;
        font-size: var(--text-base);
        border-radius: var(--radius-sm);
      }
      .password-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .password-wrap input {
        padding-right: 4rem;
      }
      .password-toggle {
        position: absolute;
        right: 0.4rem;
        padding: 0.25rem 0.55rem;
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        color: var(--color-text-muted);
        background: transparent;
        border: none;
      }
      .password-toggle:hover:not(:disabled) {
        color: var(--color-primary);
        background: var(--color-primary-light);
      }
      .btn-primary-full {
        width: 100%;
        padding: 0.7rem 1rem;
        font-size: var(--text-base);
        margin-top: var(--space-1);
      }
      .field-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
      }
      .form-error {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem 0.9rem;
        border-radius: var(--radius-sm);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
        font-size: var(--text-sm);
      }
      .form-error a {
        color: var(--color-danger);
        font-weight: var(--font-semibold);
      }
      .switch-links {
        margin-top: var(--space-5);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        text-align: center;
      }
      .switch-line {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }
      .switch-line a {
        font-weight: var(--font-semibold);
        text-decoration: none;
      }
      .switch-line a:hover {
        text-decoration: underline;
      }
      .switch-line--sub {
        font-size: var(--text-xs);
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly needsVerification = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.needsVerification.set(false);

    const { email, password } = this.form.getRawValue();
    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/app/choose-tenant']);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.needsVerification.set(apiErrorCode(err) === 'EMAIL_NOT_VERIFIED');
      },
    });
  }
}
