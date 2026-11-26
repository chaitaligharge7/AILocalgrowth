import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountService } from '../../core/account/account.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';

/**
 * Settings → Account: the signed-in user's own profile (`PATCH /me`) and
 * password change (`POST /me/password`). The email address is read-only —
 * it is the login identity and there is no verified change-email flow.
 * Changing the password signs out every OTHER session (server side).
 */
@Component({
  selector: 'app-settings-account',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="block">
      <h2>Profile</h2>
      <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
        <label>
          Email
          <input type="email" [value]="email()" disabled />
        </label>
        <label>
          Name
          <input type="text" formControlName="name" autocomplete="name" />
        </label>
        @if (profileFields()?.['name']) {
          <p class="field-error">{{ profileFields()?.['name'] }}</p>
        }
        <label>
          Mobile number (optional)
          <input type="tel" formControlName="phone" placeholder="+919812345678" autocomplete="tel" />
        </label>
        @if (profileFields()?.['phone_e164']) {
          <p class="field-error">{{ profileFields()?.['phone_e164'] }}</p>
        }
        @if (profileError() && !profileFields()) {
          <p class="form-error" role="alert">{{ profileError() }}</p>
        }
        @if (profileNotice()) {
          <p class="success" role="status">{{ profileNotice() }}</p>
        }
        <button type="submit" [disabled]="profileForm.invalid || savingProfile()">
          {{ savingProfile() ? 'Saving…' : 'Save profile' }}
        </button>
      </form>

      <h2>Change password</h2>
      <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" novalidate>
        <label>
          Current password
          <input type="password" formControlName="current" autocomplete="current-password" />
        </label>
        @if (passwordFields()?.['current_password']) {
          <p class="field-error">{{ passwordFields()?.['current_password'] }}</p>
        }
        <label>
          New password
          <input type="password" formControlName="next" autocomplete="new-password" />
        </label>
        @if (passwordFields()?.['new_password']) {
          <p class="field-error">{{ passwordFields()?.['new_password'] }}</p>
        }
        <p class="meta">At least 10 characters with a letter and a digit. Every other device is signed out when you change it.</p>
        @if (passwordError() && !passwordFields()) {
          <p class="form-error" role="alert">{{ passwordError() }}</p>
        }
        @if (passwordNotice()) {
          <p class="success" role="status">{{ passwordNotice() }}</p>
        }
        <button type="submit" [disabled]="passwordForm.invalid || changingPassword()">
          {{ changingPassword() ? 'Changing…' : 'Change password' }}
        </button>
      </form>
    </section>
  `,
  styles: [
    `
      h2 { margin: 1.5rem 0 0.75rem; font-size: var(--text-lg); }
      form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 420px; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; }
      input { padding: 0.5rem; font: inherit; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
      .field-error, .form-error { color: #b00020; margin: 0; font-size: 0.875rem; }
      .success { color: #146c2e; margin: 0; }
      button { padding: 0.5rem 1rem; cursor: pointer; align-self: flex-start; }
    `,
  ],
})
export class SettingsAccountComponent implements OnInit {
  private readonly fb = new FormBuilder();

  readonly email = signal('');
  readonly profileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    phone: [''],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.minLength(10)]],
  });

  readonly savingProfile = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly profileFields = signal<Record<string, string> | null>(null);
  readonly profileNotice = signal<string | null>(null);

  readonly changingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordFields = signal<Record<string, string> | null>(null);
  readonly passwordNotice = signal<string | null>(null);

  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const user = this.auth.currentUser();
    this.email.set(user?.email ?? '');
    this.profileForm.patchValue({ name: user?.name ?? '' });
    // The cached user has no phone; load the authoritative profile.
    this.auth.me().subscribe({
      next: (me) => {
        this.email.set(me.email);
        this.profileForm.patchValue({ name: me.name, phone: me.phone_e164 ?? '' });
      },
      error: () => {
        /* keep the cached name; saving still works */
      },
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) {
      return;
    }
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.profileFields.set(null);
    this.profileNotice.set(null);
    const { name, phone } = this.profileForm.getRawValue();
    this.account.updateProfile({ name: name.trim(), phone_e164: phone.trim() }).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profileNotice.set('Profile saved.');
      },
      error: (err: unknown) => {
        this.savingProfile.set(false);
        this.profileError.set(apiErrorMessage(err));
        this.profileFields.set(apiErrorFields(err));
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid || this.changingPassword()) {
      return;
    }
    this.changingPassword.set(true);
    this.passwordError.set(null);
    this.passwordFields.set(null);
    this.passwordNotice.set(null);
    const { current, next } = this.passwordForm.getRawValue();
    this.account.changePassword(current, next).subscribe({
      next: (res) => {
        this.changingPassword.set(false);
        this.passwordForm.reset({ current: '', next: '' });
        this.passwordNotice.set(
          res.other_sessions_revoked > 0
            ? `Password changed. ${res.other_sessions_revoked} other device${res.other_sessions_revoked === 1 ? ' was' : 's were'} signed out.`
            : 'Password changed.',
        );
      },
      error: (err: unknown) => {
        this.changingPassword.set(false);
        this.passwordError.set(apiErrorMessage(err));
        this.passwordFields.set(apiErrorFields(err));
      },
    });
  }
}
