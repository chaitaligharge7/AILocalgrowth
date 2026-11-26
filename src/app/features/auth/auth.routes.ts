import { Routes } from '@angular/router';

/**
 * Lazy-loaded `/auth/*` routes (blueprint §3.3 "feature-lazy-loaded
 * routes"). Each screen is its own `loadComponent` chunk rather than one
 * eagerly-loaded feature module.
 */
export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
    title: 'Log in — Scriptlet LocalGrowth',
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.component').then((m) => m.RegisterComponent),
    title: 'Register — Scriptlet LocalGrowth',
  },
  {
    path: 'verify-otp',
    loadComponent: () => import('./verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent),
    title: 'Verify email — Scriptlet LocalGrowth',
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
    title: 'Forgot password — Scriptlet LocalGrowth',
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./reset-password/reset-password.component').then((m) => m.ResetPasswordComponent),
    title: 'Reset password — Scriptlet LocalGrowth',
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
