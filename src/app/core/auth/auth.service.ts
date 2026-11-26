import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';
import {
  AuthUser,
  LoginRequest,
  LogoutResponse,
  MeResponse,
  OtpPurpose,
  OtpRequestRequest,
  OtpRequestResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  TokenPairResponse,
} from './auth.models';
import { TokenStorageService } from './token-storage.service';

/**
 * Wraps the 8 identity endpoints under `/api/v1/auth/*` + `/api/v1/me`
 * (blueprint §4.5/§07, verified against `AuthHandler.php`/`MeHandler.php`
 * and their tests). Persists the token pair via {@see TokenStorageService}
 * and exposes the current user as a signal for guards/UI.
 *
 * Request urls are built relative to `API_BASE_URL` so the interceptor can
 * recognize "is this an /auth/* call" by path, not by an absolute origin.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly tokens = inject(TokenStorageService);

  private readonly currentUserSignal = signal<AuthUser | null>(this.tokens.readUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null && this.tokens.isAuthenticated());

  register(payload: RegisterRequest): Observable<RegisterResponse> {
    return this.http
      .post<ApiSuccess<RegisterResponse>>(`${this.base}/auth/register`, payload)
      .pipe(map((res) => res.data));
  }

  requestOtp(destination: string, purpose: OtpPurpose): Observable<OtpRequestResponse> {
    const body: OtpRequestRequest = { destination, purpose };
    return this.http
      .post<ApiSuccess<OtpRequestResponse>>(`${this.base}/auth/otp/request`, body)
      .pipe(map((res) => res.data));
  }

  verifyOtp(destination: string, purpose: OtpPurpose, code: string): Observable<OtpVerifyResponse> {
    const body: OtpVerifyRequest = { destination, purpose, code };
    return this.http
      .post<ApiSuccess<OtpVerifyResponse>>(`${this.base}/auth/otp/verify`, body)
      .pipe(map((res) => res.data));
  }

  login(payload: LoginRequest): Observable<TokenPairResponse> {
    return this.http.post<ApiSuccess<TokenPairResponse>>(`${this.base}/auth/login`, payload).pipe(
      map((res) => res.data),
      tap((tokenPair) => this.persist(tokenPair)),
    );
  }

  /** Called by the auth interceptor (and may be called directly) to rotate the pair. */
  refresh(): Observable<TokenPairResponse> {
    const refreshToken = this.tokens.readRefreshToken();
    const body: RefreshRequest = { refresh_token: refreshToken ?? '' };
    return this.http.post<ApiSuccess<TokenPairResponse>>(`${this.base}/auth/refresh`, body).pipe(
      map((res) => res.data),
      tap((tokenPair) => this.persist(tokenPair)),
    );
  }

  logout(): Observable<LogoutResponse> {
    return this.http.post<ApiSuccess<LogoutResponse>>(`${this.base}/auth/logout`, {}).pipe(
      map((res) => res.data),
      tap(() => this.clearSession()),
    );
  }

  /** Clears local session state without calling the backend — used when a
   *  refresh attempt fails and the server-side session is already dead. */
  clearSession(): void {
    this.tokens.clear();
    this.currentUserSignal.set(null);
  }

  requestPasswordReset(email: string): Observable<OtpRequestResponse> {
    return this.requestOtp(email, 'password_reset');
  }

  confirmPasswordReset(email: string, code: string, newPassword: string): Observable<PasswordResetConfirmResponse> {
    const body: PasswordResetConfirmRequest = { email, code, new_password: newPassword };
    return this.http
      .post<ApiSuccess<PasswordResetConfirmResponse>>(`${this.base}/auth/password/reset`, body)
      .pipe(map((res) => res.data));
  }

  me(): Observable<MeResponse> {
    return this.http.get<ApiSuccess<MeResponse>>(`${this.base}/me`).pipe(map((res) => res.data));
  }

  /** Mirrors a successful `PATCH /me` into the cached user so the header avatar/name update without a re-login. */
  applyProfile(profile: { name: string }): void {
    const current = this.currentUserSignal();
    if (current === null) {
      return;
    }
    const next: AuthUser = { ...current, name: profile.name };
    this.tokens.saveUser(next);
    this.currentUserSignal.set(next);
  }

  hasValidAccessToken(): boolean {
    return this.tokens.readAccessToken() !== null && !this.tokens.isAccessTokenExpired();
  }

  hasRefreshToken(): boolean {
    return this.tokens.readRefreshToken() !== null;
  }

  private persist(tokenPair: TokenPairResponse): void {
    this.tokens.save({
      accessToken: tokenPair.access_token,
      refreshToken: tokenPair.refresh_token,
      expiresAt: Date.now() + tokenPair.expires_in * 1000,
      user: tokenPair.user,
    });
    this.currentUserSignal.set(tokenPair.user);
  }
}
