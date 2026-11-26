import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Asset } from '../../core/assets/asset.models';
import { AssetService } from '../../core/assets/asset.service';
import { GbpPushJob, PHOTO_CATEGORIES, PUSH_FIELDS, PhotoCategory, PushField } from '../../core/google/gbp.models';
import { GbpService } from '../../core/google/gbp.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * Profile info editor + photos manager (BW-035, BW-037): pushes the
 * Business Profile data you already maintain in LocalGrowth (category,
 * contact, hours, services, areas) — plus a description you write here —
 * and your uploaded photos to the Google location. Values are read from the
 * server-side profile, never taken from this form, so a push always matches
 * what the Business profile screen shows. Every attempt is recorded with its
 * real outcome (MOCK_PROVIDER while Google is mocked) and failures can be
 * retried.
 */
@Component({
  selector: 'app-google-profile-push',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      @if (canPush) {
        <form class="card form" [formGroup]="profileForm" (ngSubmit)="pushProfile()">
          <h3>Push profile details to Google</h3>
          <p class="meta">Tick what to send. Anything not set in your Business profile is refused rather than sent blank.</p>
          <div class="fields">
            @for (f of fields; track f.code) {
              <label class="check">
                <input type="checkbox" [checked]="selected().includes(f.code)" (change)="toggle(f.code, $any($event.target).checked)" />
                {{ f.label }}
              </label>
            }
          </div>
          @if (selected().includes('description')) {
            <label>
              Description (max 750 characters)
              <textarea rows="3" maxlength="750" formControlName="description"></textarea>
              @if (profileFieldErrors()?.['description']) {
                <span class="form-error" role="alert">{{ profileFieldErrors()?.['description'] }}</span>
              }
            </label>
          }
          @if (profileError()) {
            <p class="form-error" role="alert">{{ profileError() }}</p>
          }
          @if (profileFieldErrors()?.['fields']) {
            <p class="form-error" role="alert">{{ profileFieldErrors()?.['fields'] }}</p>
          }
          <div class="actions">
            <button type="submit" [disabled]="busy() || selected().length === 0">{{ busy() ? 'Pushing…' : 'Push to Google' }}</button>
          </div>
        </form>

        <section class="card form">
          <h3>Push a photo to Google</h3>
          <div class="row">
            <label class="grow">
              Choose one of your images
              <select [disabled]="assets().length === 0" (change)="photoAssetId.set($any($event.target).value)">
                <option value="">{{ assets().length === 0 ? 'No images uploaded yet' : 'Select an image…' }}</option>
                @for (a of assets(); track a.id) {
                  <option [value]="a.id">{{ a.mime }} · {{ kb(a.bytes) }} KB · {{ a.created_at | date: 'mediumDate' }}</option>
                }
              </select>
            </label>
            <label>
              Category
              <select (change)="photoCategory.set($any($event.target).value)">
                @for (c of photoCategories; track c) {
                  <option [value]="c" [selected]="c === photoCategory()">{{ c }}</option>
                }
              </select>
            </label>
          </div>
          <label>
            …or upload a new image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="upload($any($event.target).files)" />
          </label>
          @if (photoError()) {
            <p class="form-error" role="alert">{{ photoError() }}</p>
          }
          <div class="actions">
            <button type="button" [disabled]="busy() || !photoAssetId()" (click)="pushPhoto()">{{ busy() ? 'Pushing…' : 'Push photo' }}</button>
          </div>
        </section>
      } @else {
        <p class="meta">Only owner and admin can push profile data or photos to Google (enforced by the server). You can still see the history below.</p>
      }

      @if (notice()) {
        <p class="success" role="status">{{ notice() }}</p>
      }
      @if (actionError()) {
        <p class="form-error" role="alert">{{ actionError() }}</p>
      }

      <h3>Recent pushes for this location</h3>
      @if (loading()) {
        <app-skeleton-loader [rows]="3" />
      } @else if (jobs().length === 0) {
        <app-empty-state icon="integrations" title="No pushes yet" message="Pushes you send to Google are listed here with their real outcome." />
      } @else {
        <table class="data-table" data-testid="push-table">
          <thead><tr><th>What</th><th>Status</th><th>When</th><th>Actions</th></tr></thead>
          <tbody>
            @for (j of jobs(); track j.id) {
              <tr>
                <td>{{ describe(j) }}</td>
                <td>
                  <span class="badge badge--dot" [class]="statusClass(j.status)">{{ j.status }}</span>
                  @if (j.mock_provider) {
                    <span class="badge badge--mock">MOCK_PROVIDER</span>
                  }
                  @if (j.error_hint) {
                    <p class="form-error">{{ j.error_hint }}</p>
                  }
                </td>
                <td class="meta">{{ (j.last_attempt_at ?? j.created_at) | date: 'medium' }} · {{ j.attempt_count }} attempt{{ j.attempt_count === 1 ? '' : 's' }}</td>
                <td>
                  @if (j.status === 'failed' && canPush) {
                    <button type="button" [disabled]="busy()" (click)="retry(j)">Retry</button>
                  }
                </td>
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
      .form { display: grid; gap: 0.75rem; margin-bottom: 1rem; }
      .form h3 { margin: 0; }
      .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.4rem; }
      .check { display: flex; flex-direction: row; gap: 0.5rem; align-items: center; font-weight: 400; }
      .row { display: flex; gap: 1rem; flex-wrap: wrap; }
      .grow { flex: 1; min-width: 14rem; }
      label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; }
      input[type='checkbox'] { width: auto; }
      select, textarea, input[type='file'] { padding: 0.5rem; font: inherit; font-weight: 400; }
      .form-error { color: #b00020; font-size: 0.85rem; }
      .success { color: #047857; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .data-table th, .data-table td { text-align: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    `,
  ],
})
export class GoogleProfilePushComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';
  /** Owner/admin (`integration.manage`); the server is the real gate. */
  @Input() canPush = false;

  private readonly fb = new FormBuilder();
  readonly fields = PUSH_FIELDS;
  readonly photoCategories = PHOTO_CATEGORIES;
  readonly profileForm = this.fb.nonNullable.group({ description: [''] });

  readonly selected = signal<PushField[]>([]);
  readonly assets = signal<Asset[]>([]);
  readonly jobs = signal<GbpPushJob[]>([]);
  readonly photoAssetId = signal('');
  readonly photoCategory = signal<PhotoCategory>('interior');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly notice = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly profileError = signal<string | null>(null);
  readonly profileFieldErrors = signal<Record<string, string> | null>(null);
  readonly photoError = signal<string | null>(null);

  constructor(
    private readonly gbp: GbpService,
    private readonly assetService: AssetService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['tenantId'] || changes['locationId']) && this.tenantId && this.locationId) {
      this.loading.set(true);
      this.loadJobs();
      this.loadAssets();
    }
  }

  toggle(code: PushField, checked: boolean): void {
    this.selected.update((list) => (checked ? [...list.filter((c) => c !== code), code] : list.filter((c) => c !== code)));
  }

  kb(bytes: number): string {
    return (bytes / 1024).toFixed(0);
  }

  statusClass(status: string): string {
    return status === 'succeeded' ? 'badge--success' : status === 'failed' ? 'badge--danger' : 'badge--warning';
  }

  describe(job: GbpPushJob): string {
    return job.kind === 'profile'
      ? `Profile: ${(job.summary.fields ?? []).join(', ')}`
      : `Photo (${job.summary.photo_category ?? 'other'})`;
  }

  pushProfile(): void {
    this.busy.set(true);
    this.profileError.set(null);
    this.profileFieldErrors.set(null);
    this.notice.set(null);
    const description = this.profileForm.getRawValue().description;
    this.gbp
      .pushProfile(this.tenantId, this.locationId, {
        fields: this.selected(),
        ...(this.selected().includes('description') ? { description } : {}),
      })
      .subscribe({
        next: (job) => {
          this.busy.set(false);
          this.notice.set(GoogleProfilePushComponent.acceptedText('Profile push', job));
          this.loadJobs();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.profileError.set(apiErrorMessage(err));
          this.profileFieldErrors.set(apiErrorFields(err));
          this.loadJobs();
        },
      });
  }

  pushPhoto(): void {
    this.busy.set(true);
    this.photoError.set(null);
    this.notice.set(null);
    this.gbp.pushPhoto(this.tenantId, this.locationId, { asset_id: this.photoAssetId(), photo_category: this.photoCategory() }).subscribe({
      next: (job) => {
        this.busy.set(false);
        this.notice.set(GoogleProfilePushComponent.acceptedText('Photo push', job));
        this.loadJobs();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.photoError.set(apiErrorMessage(err));
        this.loadJobs();
      },
    });
  }

  upload(files: FileList | null): void {
    const file = files?.item(0);
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.photoError.set(null);
    this.assetService.uploadFile(this.tenantId, file).subscribe({
      next: (asset) => {
        this.busy.set(false);
        this.photoAssetId.set(asset.id);
        this.loadAssets();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.photoError.set(apiErrorMessage(err));
      },
    });
  }

  retry(job: GbpPushJob): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    this.gbp.retryPushJob(this.tenantId, job.id).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.notice.set(GoogleProfilePushComponent.acceptedText('Retry', result));
        this.loadJobs();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(apiErrorMessage(err));
        this.loadJobs();
      },
    });
  }

  private static acceptedText(what: string, job: GbpPushJob): string {
    return job.mock_provider
      ? `${what} accepted by the mock Google provider — nothing was sent to a real Google profile.`
      : `${what} sent to Google.`;
  }

  private loadJobs(): void {
    this.gbp.listPushJobs(this.tenantId, this.locationId).subscribe({
      next: (res) => {
        this.jobs.set(res.jobs);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.actionError.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  private loadAssets(): void {
    // The picker is a convenience; if the library cannot be listed the upload path still works.
    this.assetService.list(this.tenantId).subscribe({
      next: (list) => this.assets.set(list),
      error: () => this.assets.set([]),
    });
  }
}
