import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Asset } from '../../core/assets/asset.models';
import { AssetService } from '../../core/assets/asset.service';
import { ContentItem } from '../../core/content/content.models';
import { ContentService } from '../../core/content/content.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { ContentHistoryComponent } from './content-history.component';

/**
 * `/app/:tenantId/content/new` & `/app/:tenantId/content/:contentId/edit`
 * Unified page for creating a new content draft or editing/reviewing an existing one.
 */
@Component({
  selector: 'app-content-form',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    SkeletonLoaderComponent,
    ContentHistoryComponent,
  ],
  template: `
    <section class="content-form-page">
      <app-page-header
        eyebrow="Content Studio"
        [eyebrowLabel]="isEditMode() ? 'Edit draft' : 'New draft'"
        [title]="isEditMode() ? 'Edit content' : 'Create new draft'"
        [subtitle]="isEditMode() ? 'Update copy, attach media, submit for approval, or review.' : 'Draft a new post with location, objective, copy, and media.'"
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else if (loadingItem()) {
        <div class="card form-card"><app-skeleton-loader [rows]="5" /></div>
      } @else if (loadError()) {
        <div class="card form-card">
          <p class="form-error" role="alert">{{ loadError() }}</p>
          <a class="btn btn--secondary" [routerLink]="['/app', tenantId(), 'content']">Back to content</a>
        </div>
      } @else if (!isEditMode() && !canCreate()) {
        <div class="card form-card">
          <p class="form-error" role="alert">Only owner, admin, or editor members may create drafts.</p>
          <a class="btn btn--secondary" [routerLink]="['/app', tenantId(), 'content']">Back to content</a>
        </div>
      } @else {
        <div class="card form-card">
          @if (isEditMode() && item()) {
            <div class="form-top-meta">
              <span class="badge" [class]="statusBadgeClass(item()!.status)">{{ formatStatus(item()!.status) }}</span>
              @if (!isEditable()) {
                <span class="lock-banner">
                  <strong>Read-only:</strong> Content in status "{{ item()!.status }}" cannot be edited directly (409 CONTENT_NOT_EDITABLE).
                </span>
              }
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field-row">
              <div class="field">
                <div class="field__label-row">
                  <label for="content-loc">Location</label>
                  @if (!isEditMode() && locations().length === 0) {
                    <button type="button" class="link-btn" (click)="loadLocations()" [disabled]="loadingLocations()">
                      {{ loadingLocations() ? 'Loading…' : 'Load locations' }}
                    </button>
                  }
                </div>
                @if (isEditMode()) {
                  <input id="content-loc" type="text" [value]="locationLabel()" readonly />
                } @else if (locations().length > 0) {
                  <select id="content-loc" formControlName="locationId">
                    <option value="">Select a location…</option>
                    @for (loc of locations(); track loc.id) {
                      <option [value]="loc.id">{{ loc.name }}</option>
                    }
                  </select>
                } @else {
                  <input id="content-loc" type="text" formControlName="locationId" placeholder="Select or enter location ID" />
                }
                @if (fieldError('location_id')) {
                  <p class="field-error">{{ fieldError('location_id') }}</p>
                }
              </div>

              <div class="field">
                <label for="content-obj">Objective</label>
                <input
                  id="content-obj"
                  type="text"
                  formControlName="objective"
                  placeholder="e.g. Promote weekend family combo"
                  [readonly]="isEditMode()"
                />
                @if (fieldError('objective')) {
                  <p class="field-error">{{ fieldError('objective') }}</p>
                }
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="content-title">Title (optional)</label>
                <input id="content-title" type="text" formControlName="title" placeholder="Short headline" [readonly]="isEditMode() && !isEditable()" />
              </div>
              <div class="field field--narrow">
                <label for="content-lang">Language</label>
                <input id="content-lang" type="text" formControlName="language" [readonly]="isEditMode() && !isEditable()" />
              </div>
            </div>

            <div class="field">
              <label for="content-body">Post copy</label>
              <textarea
                id="content-body"
                rows="6"
                formControlName="body"
                placeholder="Write your post copy…"
                [readonly]="isEditMode() && !isEditable()"
              ></textarea>
              @if (fieldError('body')) {
                <p class="field-error">{{ fieldError('body') }}</p>
              }
            </div>

            @if (!isEditMode() || isEditable()) {
              <div class="field">
                <div class="field__label-row">
                  <label for="content-media">Media attachment (optional)</label>
                  @if (assetOptions().length === 0) {
                    <button type="button" class="link-btn" (click)="loadAssets()" [disabled]="loadingAssets()">
                      {{ loadingAssets() ? 'Loading…' : 'Load assets' }}
                    </button>
                  }
                </div>
                <div class="media-picker-row">
                  <select
                    id="content-media"
                    data-testid="content-media-select"
                    [ngModel]="selectedAssetId()"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="selectedAssetId.set($event)"
                  >
                    <option value="">{{ isEditMode() ? 'Keep current / none' : 'No image attached' }}</option>
                    @for (a of assetOptions(); track a.id) {
                      <option [value]="a.id">{{ a.original_filename || a.id.slice(0, 8) }}{{ a.album ? ' · ' + a.album : '' }}</option>
                    }
                  </select>
                  @if (selectedAssetId()) {
                    <button type="button" class="btn btn--sm btn--ghost" (click)="selectedAssetId.set('')">Clear</button>
                  }
                </div>
                @if (assetPreviewUrl(selectedAssetId())) {
                  <img [src]="assetPreviewUrl(selectedAssetId())!" alt="Attached media preview" class="media-thumb" />
                }
              </div>
            }

            @if (formError() && !hasFieldErrors()) {
              <p class="form-error" role="alert">{{ formError() }}</p>
            }
            @if (actionNotice()) {
              <p class="notice" role="status">{{ actionNotice() }}</p>
            }

            <div class="actions">
              @if (!isEditMode()) {
                <button type="submit" class="btn btn--primary" [disabled]="form.invalid || saving()">
                  {{ saving() ? 'Creating…' : 'Create draft' }}
                </button>
                <a class="btn btn--ghost" [routerLink]="['/app', tenantId(), 'content']">Cancel</a>
              } @else {
                @if (isEditable()) {
                  <button type="submit" class="btn btn--primary" [disabled]="form.invalid || saving()">
                    {{ saving() ? 'Saving…' : 'Save changes' }}
                  </button>
                  <button type="button" class="btn btn--secondary" (click)="submitForApproval()" [disabled]="submitting()">
                    {{ submitting() ? 'Submitting…' : 'Submit for approval' }}
                  </button>
                }
                @if (item()?.status === 'pending_approval' && canApprove()) {
                  <button type="button" class="btn btn--primary" (click)="approve('approve')" [disabled]="approving()">
                    Approve
                  </button>
                  <button type="button" class="btn btn--danger" (click)="approve('reject')" [disabled]="approving()">
                    Reject
                  </button>
                }
                @if (item()?.status === 'approved') {
                  <button type="button" class="btn btn--accent" (click)="scheduleItem()">
                    Schedule
                  </button>
                }
                <a class="btn btn--ghost" [routerLink]="['/app', tenantId(), 'content']">Back to list</a>
              }
            </div>
          </form>

          @if (isEditMode() && item()) {
            <app-content-history [tenantId]="tenantId()" [contentId]="item()!.id" />
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .content-form-page {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .form-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .form-top-meta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .lock-banner {
        font-size: var(--text-xs);
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-sm);
        padding: 6px 10px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .field-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--space-3);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .field__label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--color-primary);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        cursor: pointer;
      }
      .media-picker-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .media-picker-row select {
        flex: 1;
      }
      .media-thumb {
        max-width: 180px;
        max-height: 120px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        object-fit: cover;
        margin-top: 4px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        margin-top: var(--space-2);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0.45rem 0.95rem;
        border-radius: var(--radius-sm);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
      }
      .btn--primary {
        background: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .btn--secondary {
        background: var(--color-surface);
        border-color: var(--color-border-strong);
        color: var(--color-text);
      }
      .btn--accent {
        background: var(--color-accent-gold);
        color: #fff;
      }
      .btn--danger {
        background: var(--color-danger);
        color: #fff;
      }
      .btn--ghost {
        background: transparent;
        border-color: var(--color-border);
        color: var(--color-text-muted);
      }
      .btn--sm {
        padding: 0.3rem 0.65rem;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        font-size: var(--text-xs);
        margin: 0;
      }
      .notice {
        color: var(--color-success);
        font-size: var(--text-xs);
        margin: 0;
      }
      @media (max-width: 720px) {
        .field-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ContentFormComponent implements OnInit {
  private readonly fb = new FormBuilder();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);
  private readonly currentTenant = inject(CurrentTenantService);
  private readonly locationsApi = inject(LocationApiService);
  private readonly assetService = inject(AssetService);

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly contentId = signal<string | null>(null);
  readonly isEditMode = computed(() => Boolean(this.contentId()));

  readonly canCreate = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });
  readonly canApprove = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly item = signal<ContentItem | null>(null);
  readonly loadingItem = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly locations = signal<LocationSummary[]>([]);
  readonly loadingLocations = signal(false);
  readonly assetOptions = signal<Asset[]>([]);
  readonly loadingAssets = signal(false);
  readonly selectedAssetId = signal<string>('');

  readonly saving = signal(false);
  readonly submitting = signal(false);
  readonly approving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly isEditable = computed(() => {
    const current = this.item();
    return Boolean(current && current.status === 'draft');
  });

  readonly locationLabel = computed(() => {
    const current = this.item();
    if (!current) return '';
    const match = this.locations().find((l) => l.id === current.location_id);
    return match ? match.name : current.location_id;
  });

  readonly form = this.fb.nonNullable.group({
    locationId: ['', [Validators.required]],
    objective: ['', [Validators.required]],
    title: [''],
    language: ['en-IN', [Validators.required]],
    body: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('contentId');
    this.contentId.set(id);
    this.loadLocations();
    this.loadAssets();

    if (id && this.tenantId()) {
      this.fetchItem(id);
    }
  }

  private fetchItem(id: string): void {
    const tid = this.tenantId();
    if (!tid) return;
    this.loadingItem.set(true);
    this.loadError.set(null);
    this.content.get(tid, id).subscribe({
      next: (loaded) => {
        this.loadingItem.set(false);
        this.item.set(loaded);
        this.form.patchValue({
          locationId: loaded.location_id,
          objective: loaded.objective,
          title: loaded.title ?? '',
          language: loaded.language,
          body: loaded.body,
        });
      },
      error: (err: unknown) => {
        this.loadingItem.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  loadLocations(): void {
    const tid = this.tenantId();
    if (!tid || this.loadingLocations()) return;
    this.loadingLocations.set(true);
    this.locationsApi.list(tid).subscribe({
      next: (locs) => {
        this.loadingLocations.set(false);
        this.locations.set(locs);
      },
      error: () => {
        this.loadingLocations.set(false);
      },
    });
  }

  loadAssets(): void {
    const tid = this.tenantId();
    if (!tid || this.loadingAssets()) return;
    this.loadingAssets.set(true);
    this.assetService.list(tid).subscribe({
      next: (assets) => {
        this.loadingAssets.set(false);
        this.assetOptions.set(assets);
      },
      error: () => {
        this.loadingAssets.set(false);
      },
    });
  }

  assetPreviewUrl(assetId: string): string | null {
    if (!assetId) return null;
    const found = this.assetOptions().find((a) => a.id === assetId);
    return found?.download_url ?? null;
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ');
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'approved':
        return 'badge--success';
      case 'pending_approval':
        return 'badge--warning';
      case 'rejected':
        return 'badge--danger';
      case 'published':
        return 'badge--info';
      default:
        return 'badge--neutral';
    }
  }

  submit(): void {
    if (this.isEditMode()) {
      this.saveEdit();
    } else {
      this.createDraft();
    }
  }

  private createDraft(): void {
    const tid = this.tenantId();
    if (!tid || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);

    const v = this.form.getRawValue();
    const assetId = this.selectedAssetId().trim();
    this.content
      .create(tid, {
        location_id: v.locationId.trim(),
        objective: v.objective.trim(),
        title: v.title.trim() || undefined,
        language: v.language.trim() || 'en-IN',
        body: v.body.trim(),
        ...(assetId ? { assets_json: [assetId] } : {}),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigate(['/app', tid, 'content']);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  private saveEdit(): void {
    const tid = this.tenantId();
    const current = this.item();
    if (!tid || !current || !this.isEditable() || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);
    this.actionNotice.set(null);

    const v = this.form.getRawValue();
    const assetId = this.selectedAssetId().trim();
    this.content
      .update(tid, current.id, {
        title: v.title.trim() || undefined,
        language: v.language.trim() || 'en-IN',
        body: v.body.trim(),
        ...(assetId ? { assets_json: [assetId] } : {}),
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.item.set(updated);
          this.actionNotice.set('Changes saved.');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  submitForApproval(): void {
    const tid = this.tenantId();
    const current = this.item();
    if (!tid || !current || this.submitting()) return;
    this.submitting.set(true);
    this.formError.set(null);
    this.actionNotice.set(null);
    this.content.submit(tid, current.id).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.item.set(updated);
        this.actionNotice.set('Submitted for approval.');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.formError.set(apiErrorMessage(err));
      },
    });
  }

  approve(decision: 'approve' | 'reject'): void {
    const tid = this.tenantId();
    const current = this.item();
    if (!tid || !current || this.approving()) return;
    this.approving.set(true);
    this.formError.set(null);
    this.actionNotice.set(null);
    this.content.approve(tid, current.id, { decision }).subscribe({
      next: (updated) => {
        this.approving.set(false);
        this.item.set(updated);
        this.actionNotice.set(decision === 'approve' ? 'Content approved.' : 'Content rejected back to draft.');
      },
      error: (err: unknown) => {
        this.approving.set(false);
        this.formError.set(apiErrorMessage(err));
      },
    });
  }

  scheduleItem(): void {
    const tid = this.tenantId();
    const current = this.item();
    if (!tid || !current) return;
    void this.router.navigate(['/app', tid, 'calendar'], {
      state: {
        scheduleContentId: current.id,
        scheduleContentTitle: current.title ?? '',
        scheduleContentObjective: current.objective,
      },
    });
  }
}
