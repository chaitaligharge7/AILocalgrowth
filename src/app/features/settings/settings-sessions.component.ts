import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountService, UserSession } from '../../core/account/account.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Settings → Security: the caller's active login sessions
 * (`GET /me/sessions`), with per-device sign-out and "sign out everywhere
 * else". Shows only what identifies a device (browser string + sign-in
 * time) — the API never returns token material or an IP. Signing out the
 * session you are using ends your own login, so it routes back to /auth/login.
 */
@Component({
  selector: 'app-settings-sessions',
  standalone: true,
  imports: [SkeletonLoaderComponent],
  template: `
    <section class="block">
      <h2>Where you are signed in</h2>
      <p class="meta">
        Sessions rotate each time your login refreshes, so each device normally shows once. Sign out any device you do not
        recognise. Two-factor sign-in is currently available to platform administrators only.
      </p>
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else {
        <ul class="session-list" data-testid="session-list">
          @for (session of sessions(); track session.id) {
            <li class="session-row">
              <span class="session-main">
                <span class="session-device">{{ deviceLabel(session) }}</span>
                <span class="meta">Signed in {{ session.signed_in_at }}</span>
              </span>
              @if (session.current) {
                <span class="badge badge--dot badge--success">This device</span>
              }
              <button type="button" class="btn-danger" [disabled]="busyId() === session.id" (click)="revoke(session)">
                {{ session.current ? 'Sign out' : 'Sign out device' }}
              </button>
            </li>
          }
        </ul>
        @if (otherCount() > 0) {
          <button type="button" (click)="revokeOthers()" [disabled]="busyId() === 'others'">Sign out all other devices</button>
        }
        @if (actionError()) {
          <p class="form-error" role="alert">{{ actionError() }}</p>
        }
        @if (notice()) {
          <p class="success" role="status">{{ notice() }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.8rem; color: var(--color-text-muted); }
      .session-list { list-style: none; padding: 0; margin: 1rem 0; }
      .session-row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--color-border);
      }
      .session-main { display: flex; flex-direction: column; min-width: 0; }
      .session-device { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .form-error { color: #b00020; font-size: 0.875rem; }
      .success { color: #146c2e; font-size: 0.875rem; }
      button { padding: 0.5rem 1rem; cursor: pointer; }
      @media (max-width: 640px) {
        .session-row { grid-template-columns: 1fr; }
        .session-row > button { justify-self: start; }
      }
    `,
  ],
})
export class SettingsSessionsComponent implements OnInit {
  readonly sessions = signal<UserSession[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  otherCount(): number {
    return this.sessions().filter((s) => !s.current).length;
  }

  deviceLabel(session: UserSession): string {
    return session.device ? session.device : 'Unknown device';
  }

  revoke(session: UserSession): void {
    this.busyId.set(session.id);
    this.actionError.set(null);
    this.notice.set(null);
    this.account.revokeSession(session.id).subscribe({
      next: (res) => {
        this.busyId.set(null);
        if (res.was_current) {
          this.auth.clearSession();
          void this.router.navigate(['/auth/login']);
          return;
        }
        this.notice.set('Device signed out.');
        this.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  revokeOthers(): void {
    this.busyId.set('others');
    this.actionError.set(null);
    this.notice.set(null);
    this.account.revokeOtherSessions().subscribe({
      next: (res) => {
        this.busyId.set(null);
        this.notice.set(res.revoked === 0 ? 'No other devices were signed in.' : `${res.revoked} device${res.revoked === 1 ? '' : 's'} signed out.`);
        this.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.account.sessions().subscribe({
      next: (sessions) => {
        this.loading.set(false);
        this.sessions.set(sessions);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }
}
