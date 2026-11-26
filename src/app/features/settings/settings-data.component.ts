import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { DataRequest, DataRequestType } from '../../core/settings/settings.models';
import { SettingsService } from '../../core/settings/settings.service';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Settings → Data & privacy (owner only): record a request to export this
 * business's data or to erase it (`GET|POST .../data-requests`). Requests
 * are RECORDED and fulfilled by the Scriptlet team manually — there is no
 * automated export or erasure job, and nothing is deleted by filing one.
 */
@Component({
  selector: 'app-settings-data',
  standalone: true,
  imports: [SkeletonLoaderComponent],
  template: `
    <section class="block">
      <h2>Data &amp; privacy</h2>
      <p class="meta" data-testid="data-note">{{ note() }}</p>
      <div class="actions">
        <button
          type="button"
          class="btn-primary"
          data-testid="download-data-export"
          (click)="downloadJsonExport()"
          [disabled]="downloading() || busy() !== null"
        >
          {{ downloading() ? 'Preparing JSON…' : 'Download JSON export' }}
        </button>
        <button type="button" (click)="create('export')" [disabled]="busy() !== null">Request data export</button>
        <button type="button" class="btn-danger" (click)="create('erasure')" [disabled]="busy() !== null">Request data erasure</button>
      </div>
      @if (actionError()) {
        <p class="form-error" role="alert">{{ actionError() }}</p>
      }
      @if (notice()) {
        <p class="success" role="status">{{ notice() }}</p>
      }
      @if (loading()) {
        <app-skeleton-loader [rows]="2" />
      } @else if (loadError()) {
        <p class="form-error" role="alert">{{ loadError() }}</p>
      } @else if (requests().length === 0) {
        <p class="meta">No requests have been filed.</p>
      } @else {
        <table class="data-table" data-testid="data-requests">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Requested by</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            @for (request of requests(); track request.id) {
              <tr>
                <td>{{ request.type }}</td>
                <td><span class="badge badge--dot" [class]="request.status === 'pending' ? 'badge--warning' : 'badge--success'">{{ request.status }}</span></td>
                <td>{{ request.requested_by ?? '—' }}</td>
                <td class="meta">{{ request.requested_at }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
      button { padding: 0.5rem 1rem; cursor: pointer; }
      .form-error { color: #b00020; font-size: 0.875rem; }
      .success { color: #146c2e; font-size: 0.875rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 1rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    `,
  ],
})
export class SettingsDataComponent implements OnInit {
  readonly requests = signal<DataRequest[]>([]);
  readonly note = signal('Requests are recorded for the Scriptlet team to fulfil manually.');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<DataRequestType | null>(null);
  readonly downloading = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly settings: SettingsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  downloadJsonExport(): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    this.settings.downloadDataExport(tenantId).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `business-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.notice.set('Business data export downloaded as JSON.');
      },
      error: (err: unknown) => {
        this.downloading.set(false);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  create(type: DataRequestType): void {
    this.busy.set(type);
    this.actionError.set(null);
    this.notice.set(null);
    this.settings.createDataRequest(this.tenantId(), type).subscribe({
      next: () => {
        this.busy.set(null);
        this.notice.set(`Your ${type} request was recorded. Nothing has been changed or deleted.`);
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.settings.dataRequests(tenantId).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.requests.set(res.requests);
        this.note.set(res.note);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }
}
