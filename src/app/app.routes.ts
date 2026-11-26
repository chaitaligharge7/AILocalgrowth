import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

/**
 * Top-level shells per blueprint §3.3: `/auth/*` (public), `/app/*`
 * (authenticated business shell), `/admin/*` (platform admin — a SEPARATE
 * shell, NOT nested under `/app/:tenantId`; added S5, see
 * `layouts/admin-shell/admin-area.routes.ts`), `/agency/*` (agency
 * delegation — another SEPARATE top-level shell, added this change, see
 * `layouts/agency-shell/agency-area.routes.ts` and
 * `docs/ADR/0048-angular-agency-tenant-resolution.md`). Each shell is
 * feature-lazy-loaded via `loadChildren`; `/health` is kept from S0 as a
 * standalone diagnostics route.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  {
    path: 'health',
    loadComponent: () => import('./features/health/health.component').then((m) => m.HealthComponent),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadChildren: () => import('./layouts/app-shell/app-area.routes').then((m) => m.APP_AREA_ROUTES),
  },
  {
    path: 'admin',
    loadChildren: () => import('./layouts/admin-shell/admin-area.routes').then((m) => m.ADMIN_AREA_ROUTES),
  },
  {
    path: 'agency',
    canActivate: [authGuard],
    loadChildren: () => import('./layouts/agency-shell/agency-area.routes').then((m) => m.AGENCY_AREA_ROUTES),
  },
  { path: '**', redirectTo: 'auth/login' },
];
