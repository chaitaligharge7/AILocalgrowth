import { Component, computed, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Asset } from '../../core/assets/asset.models';
import { AssetService } from '../../core/assets/asset.service';
import { BrandKit, BrandKitTemplate } from '../../core/brandkit/brand-kit.models';
import { BrandKitService } from '../../core/brandkit/brand-kit.service';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../shared/icons/icon.component';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * `/app/:tenantId/brand-kit` — M03 Brand Kit Editor + Industry Look-and-Feel
 * Template Picker.
 */
@Component({
  selector: 'app-brand-kit',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, IconComponent],
  template: `
    <section class="brand-kit">
      <app-page-header
        eyebrow="Brand"
        eyebrowLabel="M03 Identity & Templates"
        title="Brand kit"
        subtitle="Colors, logo, voice guidelines, AI brand-safety rules, and industry look-and-feel presets."
      />

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else if (loading()) {
        <div class="card">
          <app-skeleton-loader [rows]="3" />
        </div>
      } @else {
        @if (!canEdit()) {
          <p class="owner-only-note">
            Only the tenant owner or an admin may edit the brand kit. You can view the active settings and browse templates below.
          </p>
        }

        <div class="brand-grid">
          <form class="card editor-card" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <div class="preview-banner" [style.background]="previewGradient()">
              <div class="preview-inner">
                @if (logoPreviewUrl()) {
                  <img [src]="logoPreviewUrl()" alt="Brand logo preview" class="banner-logo" />
                }
                <div>
                  <strong class="preview-name">{{ tenant()!.display_name }}</strong>
                  <p class="preview-tone">{{ form.controls.tone.value || 'Brand voice & visual identity' }}</p>
                </div>
              </div>
            </div>

            <div class="row-2">
              <label class="field">
                <span>Primary color</span>
                <div class="color-field">
                  <span class="swatch" [style.background]="form.controls.primaryHex.value || '#ffffff'"></span>
                  <input type="text" formControlName="primaryHex" placeholder="#RRGGBB" [readonly]="!canEdit()" />
                </div>
                @if (fieldError('primary_hex') || (form.controls.primaryHex.touched && form.controls.primaryHex.invalid)) {
                  <p class="field-error">{{ fieldError('primary_hex') ?? 'Must be a #RRGGBB hex color.' }}</p>
                }
              </label>

              <label class="field">
                <span>Secondary color</span>
                <div class="color-field">
                  <span class="swatch" [style.background]="form.controls.secondaryHex.value || '#ffffff'"></span>
                  <input type="text" formControlName="secondaryHex" placeholder="#RRGGBB" [readonly]="!canEdit()" />
                </div>
                @if (fieldError('secondary_hex') || (form.controls.secondaryHex.touched && form.controls.secondaryHex.invalid)) {
                  <p class="field-error">{{ fieldError('secondary_hex') ?? 'Must be a #RRGGBB hex color.' }}</p>
                }
              </label>
            </div>

            <div class="row-2">
              <label class="field">
                <span>Locale</span>
                <input type="text" formControlName="locale" placeholder="en-IN" [readonly]="!canEdit()" />
              </label>
              <label class="field">
                <span>Brand tone</span>
                <input type="text" formControlName="tone" placeholder="e.g. Warm, appetizing & hospitable" [readonly]="!canEdit()" />
              </label>
            </div>

            <label class="field">
              <span>Voice & style guidelines</span>
              <textarea rows="2" formControlName="guidelines" placeholder="Guidance applied to AI captions and creatives" [readonly]="!canEdit()"></textarea>
            </label>

            <fieldset class="box">
              <legend>Logo</legend>
              @if (logoPreviewUrl()) {
                <img [src]="logoPreviewUrl()" alt="Brand logo preview" class="logo-preview" />
              } @else {
                <p class="placeholder">No logo uploaded yet.</p>
              }
              @if (canEdit()) {
                <div class="logo-actions">
                  <label class="logo-picker-label">
                    <span>Pick from Assets library</span>
                    <select
                      aria-label="Pick logo from Assets"
                      data-testid="brand-kit-logo-picker"
                      [value]="logoAsset()?.id ?? ''"
                      (change)="onPickLogoAsset($any($event.target).value)"
                    >
                      <option value="">None / Upload new below</option>
                      @for (a of libraryAssets(); track a.id) {
                        <option [value]="a.id">{{ a.original_filename || a.id.slice(0, 8) }}{{ a.album ? ' · ' + a.album : '' }}</option>
                      }
                    </select>
                  </label>
                  @if (logoAsset()) {
                    <button type="button" class="btn-secondary action-icon-btn" (click)="clearLogo()" title="Remove logo" aria-label="Remove logo">
                      <ui-icon name="trash" [size]="14" />
                      <span class="sr-only">Remove logo</span>
                    </button>
                  }
                </div>
                <div class="logo-upload-row">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onLogoSelected($event)" [disabled]="uploadingLogo()" />
                </div>
                @if (uploadingLogo()) {
                  <p class="muted small">Uploading logo…</p>
                }
                @if (logoError()) {
                  <p class="field-error">{{ logoError() }}</p>
                }
              }
            </fieldset>

            <fieldset class="box">
              <legend>Prohibited phrases</legend>
              <p class="hint">
                Any AI-generated draft containing one of these phrases is blocked before publishing.
              </p>
              @for (phrase of prohibitedPhrases.controls; track $index) {
                <div class="phrase-row">
                  <input type="text" [formControl]="phrase" />
                  @if (canEdit()) {
                    <button type="button" class="btn-secondary action-icon-btn" (click)="removePhrase($index)" title="Remove phrase" aria-label="Remove phrase">
                      <ui-icon name="trash" [size]="14" />
                      <span class="sr-only">Remove</span>
                    </button>
                  }
                </div>
              }
              @if (canEdit()) {
                <button type="button" class="btn-secondary btn-sm" (click)="addPhrase()">+ Add prohibited phrase</button>
              }
            </fieldset>

            @if (errorMessage() && !hasFieldErrors()) {
              <p class="form-error" role="alert">{{ errorMessage() }}</p>
            }
            @if (saved()) {
              <p class="success" role="status">Brand kit saved.</p>
            }
            @if (appliedNotice()) {
              <p class="applied-note" role="status">{{ appliedNotice() }}</p>
            }

            @if (canEdit()) {
              <div>
                <button type="submit" [disabled]="form.invalid || saving()">
                  {{ saving() ? 'Saving…' : 'Save brand kit' }}
                </button>
              </div>
            }
          </form>

          <section class="card templates-card" aria-label="Industry look-and-feel templates">
            <div class="tpl-head">
              <div>
                <h2>Industry look-and-feel templates</h2>
                <p class="muted small">Pick a preset for your industry to populate colors, tone, and brand safety rules.</p>
              </div>
            </div>

            @if (industries().length > 0) {
              <div class="industry-pills">
                <button
                  type="button"
                  class="pill-btn"
                  [class.pill-btn--active]="selectedIndustry() === ''"
                  (click)="filterIndustry('')"
                >
                  All
                </button>
                @for (ind of industries(); track ind) {
                  <button
                    type="button"
                    class="pill-btn"
                    [class.pill-btn--active]="selectedIndustry() === ind"
                    (click)="filterIndustry(ind)"
                  >
                    {{ formatIndustry(ind) }}
                  </button>
                }
              </div>
            }

            @if (loadingTemplates()) {
              <app-skeleton-loader [rows]="3" />
            } @else if (templates().length === 0) {
              <p class="muted small">No industry templates available.</p>
            } @else {
              <div class="tpl-list">
                @for (tpl of templates(); track tpl.id) {
                  <article class="tpl-item" [attr.data-test]="'brand-template-' + tpl.industry">
                    <div class="tpl-top">
                      <div class="tpl-swatches">
                        <span class="dot-swatch" [style.background]="tpl.primary_hex" [title]="tpl.primary_hex"></span>
                        <span class="dot-swatch" [style.background]="tpl.secondary_hex" [title]="tpl.secondary_hex"></span>
                      </div>
                      <div class="tpl-title-wrap">
                        <strong>{{ tpl.title }}</strong>
                        <span class="badge badge--neutral">{{ formatIndustry(tpl.industry) }}</span>
                      </div>
                      @if (canEdit()) {
                        <button type="button" class="btn-secondary btn-sm" (click)="applyTemplate(tpl)">Apply</button>
                      }
                    </div>
                    <p class="tpl-desc">{{ tpl.description }}</p>
                    <p class="muted small"><strong>Tone:</strong> {{ tpl.tone }} · <strong>Style:</strong> {{ tpl.font_style }}</p>
                  </article>
                }
              </div>
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .brand-kit {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .brand-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, 1fr);
        gap: 12px;
        align-items: start;
      }
      .editor-card,
      .templates-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .preview-banner {
        border-radius: var(--radius-md);
        padding: 14px 16px;
        color: #fff;
      }
      .preview-inner {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .banner-logo {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
        background: #fff;
        padding: 2px;
      }
      .preview-name {
        display: block;
        font-size: 0.96rem;
        color: #fff;
      }
      .preview-tone {
        margin: 2px 0 0;
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.88);
      }
      .row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
      }
      .color-field {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .color-field input {
        flex: 1;
      }
      .swatch {
        width: 28px;
        height: 28px;
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        flex-shrink: 0;
      }
      .box {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      legend {
        font-weight: var(--font-semibold);
        font-size: var(--text-xs);
        padding: 0 4px;
      }
      .logo-preview {
        max-width: 120px;
        max-height: 90px;
        object-fit: contain;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 4px;
      }
      .phrase-row {
        display: flex;
        gap: 6px;
      }
      .phrase-row input {
        flex: 1;
      }
      h2 {
        margin: 0 0 2px;
        font-size: 0.94rem;
        font-weight: var(--font-bold);
      }
      .industry-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .pill-btn {
        padding: 0.24rem 0.6rem;
        border-radius: var(--radius-pill);
        font-size: 0.7rem;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      .pill-btn--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;
      }
      .tpl-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .tpl-item {
        padding: 10px 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 5px;
        transition: border-color 0.14s ease;
      }
      .tpl-item:hover {
        border-color: var(--color-primary);
      }
      .tpl-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tpl-swatches {
        display: inline-flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .dot-swatch {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 1px solid rgba(15, 23, 42, 0.15);
      }
      .tpl-title-wrap {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        font-size: var(--text-xs);
      }
      .tpl-desc {
        margin: 0;
        font-size: 0.74rem;
        color: var(--color-text);
        line-height: 1.38;
      }
      .hint,
      .placeholder,
      .muted {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .small {
        font-size: 0.7rem;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .success {
        color: var(--color-success);
        margin: 0;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
      }
      .applied-note {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-info);
        background: var(--color-info-bg);
        border: 1px solid var(--color-info-border);
        border-radius: var(--radius-sm);
        padding: 6px 8px;
      }
      .owner-only-note {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 8px 12px;
        border-radius: var(--radius-md);
      }
      @media (max-width: 960px) {
        .brand-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 560px) {
        .row-2 {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class BrandKitComponent {
  private readonly fb = new FormBuilder();

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly canEdit = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly appliedNotice = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly uploadingLogo = signal(false);
  readonly logoError = signal<string | null>(null);
  readonly logoAsset = signal<Asset | null>(null);
  readonly logoPreviewUrl = computed(() => this.logoAsset()?.download_url ?? null);

  readonly templates = signal<BrandKitTemplate[]>([]);
  readonly industries = signal<string[]>([]);
  readonly selectedIndustry = signal('');
  readonly loadingTemplates = signal(false);

  private current: BrandKit | null = null;
  private selectedTemplateId: string | undefined;
  private logoCleared = false;
  readonly libraryAssets = signal<Asset[]>([]);

  readonly form = this.fb.nonNullable.group({
    primaryHex: ['', [Validators.pattern(HEX_PATTERN)]],
    secondaryHex: ['', [Validators.pattern(HEX_PATTERN)]],
    locale: ['en-IN', [Validators.required]],
    tone: [''],
    guidelines: [''],
  });

  readonly prohibitedPhrases = new FormArray<FormControl<string>>([]);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly brandKitService: BrandKitService,
    private readonly assetService: AssetService,
  ) {
    const tenantId = this.tenant()?.id;
    if (tenantId) {
      this.brandKitService.get(tenantId).subscribe({
        next: (bk) => this.populate(bk),
        error: (err: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(apiErrorMessage(err));
        },
      });
      this.loadTemplates(tenantId);
      this.assetService.list(tenantId).subscribe({
        next: (assets) => this.libraryAssets.set(assets ?? []),
        error: () => this.libraryAssets.set([]),
      });
    } else {
      this.loading.set(false);
    }
  }

  previewGradient(): string {
    const p = this.form.controls.primaryHex.value || '#078d7e';
    const s = this.form.controls.secondaryHex.value || '#0b1626';
    return `linear-gradient(135deg, ${p} 0%, ${s} 100%)`;
  }

  formatIndustry(code: string): string {
    return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  filterIndustry(industry: string): void {
    this.selectedIndustry.set(industry);
    const tenantId = this.tenant()?.id;
    if (tenantId) {
      this.loadTemplates(tenantId, industry || undefined);
    }
  }

  applyTemplate(tpl: BrandKitTemplate): void {
    this.selectedTemplateId = tpl.id;
    this.form.patchValue({
      primaryHex: tpl.primary_hex,
      secondaryHex: tpl.secondary_hex,
      tone: tpl.tone,
      guidelines: tpl.voice_guidelines,
    });
    const existing = new Set(this.prohibitedPhrases.controls.map((c) => c.value.trim().toLowerCase()));
    for (const phrase of tpl.prohibited_phrases) {
      if (!existing.has(phrase.toLowerCase())) {
        this.prohibitedPhrases.push(new FormControl(phrase, { nonNullable: true }));
      }
    }
    this.saved.set(false);
    this.appliedNotice.set(`Applied "${tpl.title}" look-and-feel preset. Click "Save brand kit" to persist.`);
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  addPhrase(): void {
    this.prohibitedPhrases.push(new FormControl('', { nonNullable: true }));
  }

  removePhrase(index: number): void {
    this.prohibitedPhrases.removeAt(index);
  }

  onPickLogoAsset(assetId: string): void {
    if (!assetId) {
      this.clearLogo();
      return;
    }
    const found = this.libraryAssets().find((a) => a.id === assetId) ?? null;
    this.logoCleared = false;
    this.logoAsset.set(found);
  }

  clearLogo(): void {
    this.logoCleared = true;
    this.logoAsset.set(null);
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const tenantId = this.tenant()?.id;
    if (!file || !tenantId) {
      return;
    }
    this.uploadingLogo.set(true);
    this.logoError.set(null);
    this.assetService.uploadMultipart(tenantId, file, { album: 'Logo', tags: ['logo'] }).subscribe({
      next: (asset) => {
        this.uploadingLogo.set(false);
        this.logoCleared = false;
        this.logoAsset.set(asset);
        this.libraryAssets.update((list) => [asset, ...list.filter((a) => a.id !== asset.id)]);
        input.value = '';
      },
      error: (err: unknown) => {
        this.uploadingLogo.set(false);
        this.logoError.set(apiErrorMessage(err));
        input.value = '';
      },
    });
  }

  save(): void {
    const tenantId = this.tenant()?.id;
    if (this.form.invalid || this.saving() || !tenantId) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.appliedNotice.set(null);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);

    const { primaryHex, secondaryHex, locale, tone, guidelines } = this.form.getRawValue();
    const prohibitedPhrases = this.prohibitedPhrases.controls
      .map((c) => c.value.trim())
      .filter((v) => v !== '');

    this.brandKitService
      .update(tenantId, {
        primary_hex: primaryHex || null,
        secondary_hex: secondaryHex || null,
        locale,
        logo_asset_id: this.logoCleared ? null : (this.logoAsset()?.id ?? this.current?.logo_asset_id ?? null),
        voice_json: {
          ...(this.current?.voice_json ?? {}),
          tone: tone.trim() || undefined,
          guidelines: guidelines.trim() || undefined,
          ...(this.selectedTemplateId ? { template_id: this.selectedTemplateId } : {}),
        },
        restrictions_json: { ...(this.current?.restrictions_json ?? {}), prohibited_phrases: prohibitedPhrases },
      })
      .subscribe({
        next: (bk) => {
          this.saving.set(false);
          this.saved.set(true);
          this.populate(bk);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(apiErrorMessage(err));
          this.fieldErrors.set(apiErrorFields(err));
        },
      });
  }

  private loadTemplates(tenantId: string, industry?: string): void {
    this.loadingTemplates.set(true);
    this.brandKitService.templates(tenantId, industry).subscribe({
      next: (res) => {
        this.loadingTemplates.set(false);
        this.templates.set(res.templates);
        if (!industry) {
          this.industries.set(res.industries);
        }
      },
      error: () => {
        this.loadingTemplates.set(false);
      },
    });
  }

  private populate(bk: BrandKit): void {
    this.current = bk;
    this.loading.set(false);
    this.form.patchValue({
      primaryHex: bk.primary_hex ?? '',
      secondaryHex: bk.secondary_hex ?? '',
      locale: bk.locale,
      tone: typeof bk.voice_json?.tone === 'string' ? bk.voice_json.tone : '',
      guidelines: typeof bk.voice_json?.guidelines === 'string' ? bk.voice_json.guidelines : '',
    });
    this.prohibitedPhrases.clear();
    for (const phrase of bk.restrictions_json?.prohibited_phrases ?? []) {
      this.prohibitedPhrases.push(new FormControl(phrase, { nonNullable: true }));
    }
    if (bk.logo_asset_id) {
      const tenantId = this.tenant()?.id;
      if (tenantId) {
        this.assetService.get(tenantId, bk.logo_asset_id).subscribe({
          next: (asset) => this.logoAsset.set(asset),
          error: () => this.logoAsset.set(null),
        });
      }
    } else {
      this.logoAsset.set(null);
    }
  }
}
