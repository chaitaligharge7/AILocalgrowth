import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { CurrentTenantService } from '../core/tenancy/current-tenant.service';
import { TenantService } from '../core/tenancy/tenant.service';

/**
 * Guards `/app/:tenantId/*` (blueprint §3.3 "route resolvers; policy
 * guards checked again on server"). Calls `GET /tenants/{tenantId}` so
 * the *server* confirms membership before the shell renders — the
 * backend returns `404` for a tenant the caller is not a member of
 * (never leaking existence per `TenantService::get()` in the PHP API),
 * which this guard turns into a redirect back to the tenant chooser
 * rather than a broken dashboard. This is UX convenience only: every
 * further API call under this route is independently tenant-scoped and
 * membership-checked server-side regardless of whether this guard ran.
 */
export const tenantAccessGuard: CanActivateFn = (route) => {
  const tenants = inject(TenantService);
  const current = inject(CurrentTenantService);
  const router = inject(Router);

  const tenantId = route.paramMap.get('tenantId');
  if (!tenantId) {
    return router.createUrlTree(['/app/choose-tenant']);
  }

  return tenants.get(tenantId).pipe(
    map((tenant) => {
      current.select(tenant);
      return true;
    }),
    catchError(() => of(router.createUrlTree(['/app/choose-tenant']))),
  );
};
