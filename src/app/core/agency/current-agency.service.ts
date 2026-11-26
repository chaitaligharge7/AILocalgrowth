import { Injectable, signal } from '@angular/core';
import { AgencyAccount } from './agency.models';

/**
 * Holds the caller's own resolved agency account for the `/agency/*` shell
 * (populated by `AgencyOverviewComponent` on a successful
 * `GET /agency/clients`). Purely a UI convenience — like
 * `CurrentTenantService` for `/app/:tenantId/*`, it is NOT an
 * authorization boundary; every `/agency/*` call independently resolves
 * the caller's own agency account server-side
 * (`AgencyService::requireCallerAgency()`), so a stale/missing value here
 * can only ever cause a screen to show a "not an agency yet" message, never
 * grant or imply access.
 */
@Injectable({ providedIn: 'root' })
export class CurrentAgencyService {
  private readonly agencySignal = signal<AgencyAccount | null>(null);
  readonly agency = this.agencySignal.asReadonly();

  set(agency: AgencyAccount): void {
    this.agencySignal.set(agency);
  }

  clear(): void {
    this.agencySignal.set(null);
  }
}
