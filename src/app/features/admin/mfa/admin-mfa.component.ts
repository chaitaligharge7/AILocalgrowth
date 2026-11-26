import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthService } from '../../../core/admin/admin-auth.service';
import { apiErrorCode, apiErrorMessage } from '../../../core/http/error.util';
import { AuthShellComponent } from '../../../shared/auth-shell/auth-shell.component';

/**
 * `/admin/mfa` — 6-digit TOTP code entry (blueprint §07 "Admin MFA
 * mandatory"). Calls `POST /admin/auth/mfa/verify`; on success stores the
 * `admin_session_token` via `AdminAuthService`/`AdminSessionService` and
 * redirects into the dashboard (or the originally requested `/admin/*`
 * URL, via `?redirectTo=`, the same convention `authGuard` uses).
 *
 * Distinct, non-generic messages per backend error code — this is the
 * one place in the whole admin flow that has to explain "why can't I get
 * in" clearly, since there is no self-service recovery for any of these:
 * - 401 `MFA_INVALID_CODE` — wrong/expired code, try again.
 * - 403 `PLATFORM_ADMIN_REQUIRED` — this account isn't a platform admin at
 *   all (see `AdminLoginComponent` docblock for why this can only be
 *   discovered here, not before).
 * - 409 `MFA_NOT_ENROLLED` — account is a platform admin but has never run
 *   `bin/create-platform-admin.php`'s enrollment step; there is
 *   deliberately no self-service "enroll" UI (no HTTP endpoint for it —
 *   see task brief), so this message says who to contact instead of
 *   offering a dead-end button.
 */
@Component({
  selector: 'app-admin-mfa',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShellComponent],
  template: `
    <app-auth-shell title="Verify your identity" subtitle="Enter the 6-digit code from your authenticator app.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Code
          <input type="text" inputmode="numeric" maxlength="6" formControlName="code" autocomplete="one-time-code" />
        </label>

        @if (errorCode() === 'MFA_INVALID_CODE') {
          <p class="form-error" role="alert">That code is invalid or has expired. Enter the current code and try again.</p>
        } @else if (errorCode() === 'PLATFORM_ADMIN_REQUIRED') {
          <p class="form-error" role="alert">
            This account is not a platform admin account. Platform admin access is granted separately from a tenant's
            owner/admin role.
          </p>
        } @else if (errorCode() === 'MFA_NOT_ENROLLED') {
          <p class="form-error" role="alert">
            MFA has not been enrolled for this admin account yet. Ask an operator to run
            <code>bin/create-platform-admin.php</code> to enroll it — there is no self-service enrollment.
          </p>
        } @else if (errorMessage()) {
          <p class="form-error" role="alert">{{ errorMessage() }}</p>
        }

        <button type="submit" class="btn-primary-full" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Verifying…' : 'Verify →' }}
        </button>
      </form>
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
      label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
      }
      input {
        padding: 0.5rem;
        font: inherit;
        letter-spacing: 0.2em;
      }
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-sm);
      }
      button[type='submit'] {
        margin-top: var(--space-2);
        cursor: pointer;
      }
    `,
  ],
})
export class AdminMfaComponent {
  private readonly fb = new FormBuilder();
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);

  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.errorCode.set(null);

    const { code } = this.form.getRawValue();
    this.adminAuth.verifyMfa(code).subscribe({
      next: () => {
        this.submitting.set(false);
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
        void this.router.navigateByUrl(redirectTo && redirectTo.startsWith('/admin') ? redirectTo : '/admin/dashboard');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.errorCode.set(apiErrorCode(err));
      },
    });
  }
}
