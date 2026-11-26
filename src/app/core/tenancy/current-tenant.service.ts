import { Injectable, signal } from '@angular/core';
import { Tenant } from './tenant.models';

const SELECTED_TENANT_KEY = 'slg.tenancy.selected_tenant_id';

/**
 * Holds which tenant is currently selected in the `/app/:tenantId/*` shell
 * (blueprint §3.1 "tenant/location switch at top"). Not an authorization
 * boundary — it only drives the UI's default selection; every API call
 * still carries the `:tenantId` from the route, and the backend
 * (`App\Security\Policy`) independently verifies membership on every one.
 *
 * The selected id (not a secret) is persisted to `localStorage` purely so
 * a page reload keeps the same tenant selected instead of bouncing back
 * to the chooser screen.
 */
@Injectable({ providedIn: 'root' })
export class CurrentTenantService {
  private readonly selectedIdSignal = signal<string | null>(this.readPersisted());
  private readonly tenantSignal = signal<Tenant | null>(null);

  readonly selectedTenantId = this.selectedIdSignal.asReadonly();
  readonly tenant = this.tenantSignal.asReadonly();

  select(tenant: Tenant): void {
    this.selectedIdSignal.set(tenant.id);
    this.tenantSignal.set(tenant);
    try {
      localStorage.setItem(SELECTED_TENANT_KEY, tenant.id);
    } catch {
      /* non-fatal: just loses the "remembered" selection across reloads */
    }
  }

  clear(): void {
    this.selectedIdSignal.set(null);
    this.tenantSignal.set(null);
    try {
      localStorage.removeItem(SELECTED_TENANT_KEY);
    } catch {
      /* see select() */
    }
  }

  private readPersisted(): string | null {
    try {
      return localStorage.getItem(SELECTED_TENANT_KEY);
    } catch {
      return null;
    }
  }
}
