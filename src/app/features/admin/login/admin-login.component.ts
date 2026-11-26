import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/admin/login` — the SEPARATE top-level entry point into the `/admin/*`
 * shell (blueprint §3.3; this is NOT nested under `/app/:tenantId`).
 *
 * Reuses the exact same `POST /auth/login` endpoint (via `AuthService`) as
 * the tenant login screen — there is no separate "admin login" endpoint,
 * because platform-admin-ness is a flag on a normal user account
 * (`users.is_platform_admin`), not a separate credential store.
 *
 * On success this ALWAYS redirects to `/admin/mfa`, never straight into
 * the dashboard: there is no endpoint that tells the frontend up front
 * whether this account is a platform admin at all (`GET /me` does not
 * expose `is_platform_admin`), so the only way to find out is to attempt
 * `POST /admin/auth/mfa/verify` and read its error. See
 * `docs/ADR/0032-admin-session-storage.md` for why that decision lives on
 * `AdminMfaComponent` rather than here.
 */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell
      title="Platform Admin Login"
      subtitle="Separate elevated sign-in with mandatory MFA verification."
    >
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field-group">
          <label class="field-label" for="admin-email">Admin email address</label>
          <input
            id="admin-email"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="admin@company.com"
          />
        </div>

        <div class="field-group">
          <label class="field-label" for="admin-password">Password</label>
          <div class="password-wrap">
            <input
              id="admin-password"
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
        </div>

        @if (errorMessage()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }

        <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Logging in…' : 'Continue to MFA →' }}
        </button>
      </form>

      <p class="switch-line">
        Not a platform admin? <a routerLink="/auth/login">Back to business login</a>
      </p>
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
      .field-label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
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
      .form-error {
        padding: 0.75rem 0.9rem;
        border-radius: var(--radius-sm);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      .switch-line {
        margin: var(--space-5) 0 0;
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        text-align: center;
      }
      .switch-line a {
        font-weight: var(--font-semibold);
        text-decoration: none;
      }
      .switch-line a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class AdminLoginComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

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

    const { email, password } = this.form.getRawValue();
    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/admin/mfa']);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }
}
