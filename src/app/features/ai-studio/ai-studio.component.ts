import { Component, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AiGenerationResponse } from '../../core/ai/ai-generation.models';
import { AiGenerationService } from '../../core/ai/ai-generation.service';
import { apiErrorCode, apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';

/**
 * `/app/:tenantId/ai-studio` — blueprint §3.1 "AI composer" spec: purpose
 * (objective)/channel/location(segment)/tone/language/brief(objective)/offer
 * dates(offer)/CTA, output variations, editable content, brand check
 * results (blocked_variant_count), estimated quota usage, Save/Submit.
 *
 * Wraps `POST /tenants/{tenantId}/ai/generations`
 * (`App\Application\Content\AiGenerationService::generate()`). Every
 * response is `mock_provider: true` — CLAUDE.md requires a visible
 * `MOCK_PROVIDER` badge on every variant, never hidden.
 *
 * "Use this variant" navigates to the content editor
 * (`/app/:tenantId/content`) with the edited variant text + objective +
 * language passed as router navigation `state` (read via `history.state`
 * in `ContentComponent`) so the create-content form arrives pre-filled —
 * a real handoff, not a stub link.
 */
@Component({
  selector: 'app-ai-studio',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent],
  template: `
    <section class="ai-studio">
      <app-page-header
        eyebrow="CONTENT STUDIO"
        eyebrowLabel="AI composer"
        title="AI composer"
        subtitle="Generate on-brand captions and creative, reviewed before it ever publishes."
      />

      @if (!tenant()) {
        <div class="alert-box alert-box--danger" role="alert">
          <span class="alert-icon">⚠️</span>
          <p class="form-error">No business selected. Go back to "Choose a business".</p>
        </div>
      } @else {
        <!-- Main Composer Form Card -->
        <div class="card composer-card">
          <div class="composer-card__head">
            <div class="composer-card__title-group">
              <span class="studio-pill">
                <svg class="sparkle-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                AI Creative Studio
              </span>
              <h2>Compose Content Brief</h2>
            </div>
            <p class="composer-card__subtitle">
              Fill in your campaign goals, target audience, and brand voice to generate multi-variant copies.
            </p>
          </div>

          <form [formGroup]="form" (ngSubmit)="generate()" novalidate class="composer-form">
            <!-- Section 1: Objective & Core Message -->
            <fieldset class="form-section">
              <legend class="form-section__legend">
                <span class="legend-num">1</span>
                <span>Core Message &amp; Brief</span>
              </legend>

              <div class="field-group">
                <label for="field-objective" class="form-label">
                  <span>Objective / brief <span class="required">*</span></span>
                  <span class="field-hint">What do you want to announce or promote?</span>
                </label>
                <textarea
                  id="field-objective"
                  formControlName="objective"
                  rows="3"
                  placeholder="e.g. Promote our Diwali weekend offer with 20% discount on family dine-in"
                  class="form-control"
                  [class.has-error]="fieldError('objective')"
                ></textarea>
                @if (fieldError('objective')) {
                  <p class="field-error" role="alert">{{ fieldError('objective') }}</p>
                }
              </div>

              <div class="form-row two-cols">
                <div class="field-group">
                  <label for="field-offer" class="form-label">
                    <span>Offer / dates</span>
                    <span class="field-hint">Discounts, dates, promo codes</span>
                  </label>
                  <input
                    id="field-offer"
                    type="text"
                    formControlName="offer"
                    placeholder="e.g. 20% off, 1–3 Nov"
                    class="form-control"
                  />
                </div>

                <div class="field-group">
                  <label for="field-cta" class="form-label">
                    <span>Call to action <span class="required">*</span></span>
                    <span class="field-hint">Desired action from reader</span>
                  </label>
                  <input
                    id="field-cta"
                    type="text"
                    formControlName="cta"
                    placeholder="e.g. Visit us this weekend / Book now"
                    class="form-control"
                    [class.has-error]="fieldError('cta')"
                  />
                  @if (fieldError('cta')) {
                    <p class="field-error" role="alert">{{ fieldError('cta') }}</p>
                  }
                </div>
              </div>
            </fieldset>

            <!-- Section 2: Channel & Audience -->
            <fieldset class="form-section">
              <legend class="form-section__legend">
                <span class="legend-num">2</span>
                <span>Placement &amp; Audience</span>
              </legend>

              <div class="form-row three-cols">
                <div class="field-group">
                  <label for="field-use-case" class="form-label">Use case / channel</label>
                  <div class="select-wrapper">
                    <select id="field-use-case" formControlName="useCase" class="form-control">
                      <option value="social_post">Social post</option>
                      <option value="google_post">Google post</option>
                      <option value="visual_brief">Visual brief &amp; copy</option>
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                </div>

                <div class="field-group">
                  <label for="field-channel" class="form-label">Channel</label>
                  <input
                    id="field-channel"
                    type="text"
                    formControlName="channel"
                    placeholder="e.g. google, instagram, facebook"
                    class="form-control"
                  />
                </div>

                <div class="field-group">
                  <label for="field-segment" class="form-label">Target segment / location</label>
                  <input
                    id="field-segment"
                    type="text"
                    formControlName="segment"
                    placeholder="e.g. Koramangala regulars"
                    class="form-control"
                  />
                </div>
              </div>
            </fieldset>

            <!-- Section 3: Tone & Language -->
            <fieldset class="form-section">
              <legend class="form-section__legend">
                <span class="legend-num">3</span>
                <span>Brand Tone &amp; Localization</span>
              </legend>

              <div class="form-row two-cols">
                <div class="field-group">
                  <label for="field-tone" class="form-label">Tone</label>
                  <div class="select-wrapper">
                    <select id="field-tone" formControlName="tone" class="form-control">
                      <option value="friendly">Friendly</option>
                      <option value="professional">Professional</option>
                      <option value="playful">Playful</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div class="field-group">
                  <label for="field-language" class="form-label">Language</label>
                  <input
                    id="field-language"
                    type="text"
                    formControlName="language"
                    placeholder="en-IN"
                    class="form-control"
                  />
                </div>
              </div>
            </fieldset>

            <!-- Section 4: Add-ons & Visual Brief Option -->
            <div class="visual-toggle-card">
              <label class="visual-toggle">
                <input
                  type="checkbox"
                  [checked]="includeVisualBrief()"
                  (change)="onVisualBriefToggle($event)"
                  class="toggle-checkbox"
                />
                <div class="toggle-text">
                  <span class="toggle-title">Also generate a visual brief &amp; AI image prompt (headline, scene, palette, aspect ratio)</span>
                  <span class="toggle-desc">Provides creative art direction, color swatches, aspect ratio, and prompt for image generation tools.</span>
                </div>
              </label>
            </div>

            @if (errorMessage() && !hasFieldErrors()) {
              <div class="alert-box alert-box--danger" role="alert">
                <span class="alert-icon">⚠️</span>
                <p class="form-error">{{ errorMessage() }}</p>
              </div>
            }

            @if (quotaExceeded()) {
              <div class="alert-box alert-box--warning quota-exceeded" role="alert">
                <span class="alert-icon">⚠️</span>
                <p class="form-error">
                  AI generation quota reached for this billing period ({{ quotaExceededDetail() }}). It resets next billing
                  period, or an owner/admin can upgrade the plan on the Billing screen.
                </p>
              </div>
            }

            <!-- Form Actions -->
            <div class="form-actions">
              <button
                type="submit"
                class="btn-generate"
                [disabled]="form.invalid || generating()"
              >
                @if (generating()) {
                  <span class="spinner" aria-hidden="true"></span>
                  <span>Generating…</span>
                } @else {
                  <svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <span>Generate variants</span>
                }
              </button>
            </div>
          </form>
        </div>

        <!-- Generation Results Section -->
        @if (result()) {
          <section class="result">
            <div class="result-header card">
              <div class="provenance">
                @if (result()!.mock_provider) {
                  <span class="badge badge--mock">
                    <span class="badge-dot"></span>
                    DRAFT — MOCK_PROVIDER ({{ result()!.provider }}/{{ result()!.model }})
                  </span>
                } @else {
                  <span class="badge badge--success">
                    <span class="badge-dot"></span>
                    DRAFT — LIVE_LLM ({{ result()!.provider }}/{{ result()!.model }})
                  </span>
                }
                <span class="quota-pill">
                  <svg class="quota-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span class="quota">
                    Quota: {{ result()!.quota.used }}/{{ result()!.quota.limit }} used this period ·
                    {{ result()!.quota.remaining }} remaining
                  </span>
                </span>
              </div>
            </div>

            @if (result()!.blocked_variant_count > 0) {
              <div class="blocked-notice card" role="alert">
                <span class="notice-icon">⚠️</span>
                <div>
                  <strong>Safety check notice:</strong> {{ result()!.blocked_variant_count }} variant(s) were blocked by safety checks
                  @if ((result()!.safety_report?.blocked_reasons?.length ?? 0) > 0) {
                    ({{ result()!.safety_report!.blocked_reasons.join(', ') }})
                  } @else {
                    (prohibited phrase / compliance)
                  }
                  and are not shown.
                </div>
              </div>
            }

            @if (result()!.visual_brief; as vb) {
              <article class="visual-brief card">
                <div class="visual-brief__head">
                  <div class="visual-brief__title-wrap">
                    <span class="visual-badge">Visual Brief</span>
                    <h3>Visual brief &amp; image prompt</h3>
                  </div>
                  <span class="badge badge--ratio">Aspect Ratio: {{ vb.aspect_ratio }}</span>
                </div>

                <div class="visual-grid">
                  <div class="visual-item">
                    <span class="visual-label">Headline</span>
                    <p class="visual-value"><strong>{{ vb.headline }}</strong></p>
                  </div>

                  <div class="visual-item">
                    <span class="visual-label">Scene Description</span>
                    <p class="visual-value">{{ vb.scene_description }}</p>
                  </div>

                  <div class="visual-item visual-item--full">
                    <span class="visual-label">AI Image Prompt</span>
                    <div class="prompt-box">
                      <code>{{ vb.image_prompt }}</code>
                    </div>
                  </div>

                  <div class="visual-item visual-item--full">
                    <span class="visual-label">Alt Text</span>
                    <p class="visual-value visual-value--alt">{{ vb.alt_text }}</p>
                  </div>

                  @if (vb.color_palette.length > 0) {
                    <div class="visual-item visual-item--full">
                      <span class="visual-label">Color Palette</span>
                      <div class="palette-row">
                        @for (hex of vb.color_palette; track hex) {
                          <span class="swatch">
                            <span class="swatch__dot" [style.background]="hex"></span>
                            <code>{{ hex }}</code>
                          </span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </article>
            }

            @if (result()!.variants.length === 0) {
              <div class="placeholder-card card">
                <p class="placeholder">
                  All generated variants were blocked. Try a different brief, or review the brand kit's prohibited
                  phrases.
                </p>
              </div>
            } @else {
              <div class="variants-section">
                <div class="variants-section__head">
                  <h3>Generated Copy Variants</h3>
                  <span class="variants-count">{{ editableVariants().length }} variant(s) available</span>
                </div>

                <div class="variants">
                  @for (variant of editableVariants(); track $index) {
                    <article class="variant card">
                      <div class="variant__head">
                        <div class="variant__title-badge">
                          <span class="variant-idx">#{{ $index + 1 }}</span>
                          <span class="badge badge--mock small">DRAFT</span>
                        </div>
                        <span class="char-count">{{ variant.length }} chars</span>
                      </div>

                      <div class="variant__editor">
                        <textarea
                          rows="4"
                          [value]="variant"
                          (input)="updateVariant($index, $event)"
                          class="variant-textarea"
                          placeholder="Variant copy…"
                        ></textarea>
                      </div>

                      @if ((result()!.variants[$index].warnings?.length ?? 0) > 0) {
                        <div class="variant-warnings">
                          <ul class="lint-warnings">
                            @for (warn of result()!.variants[$index].warnings!; track warn) {
                              <li>⚠ {{ warn }}</li>
                            }
                          </ul>
                        </div>
                      }

                      <div class="variant__footer">
                        <button type="button" class="btn-use-variant" (click)="useVariant($index)">
                          <span>Use this variant to create content</span>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                          </svg>
                        </button>
                      </div>
                    </article>
                  }
                </div>
              </div>
            }
          </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .ai-studio {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      /* Alert Boxes */
      .alert-box {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
      }
      .alert-box--danger {
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
      }
      .alert-box--warning {
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        color: var(--color-warning);
      }
      .alert-icon {
        font-size: 1.1rem;
        line-height: 1;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
        font-weight: 500;
      }
      .quota-exceeded {
        padding: var(--space-3) var(--space-4);
      }

      /* Main Composer Card */
      .composer-card {
        padding: var(--space-6);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
      }
      .composer-card__head {
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-4);
        margin-bottom: var(--space-5);
      }
      .composer-card__title-group {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-1);
      }
      .composer-card h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .studio-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--color-primary-light);
        color: var(--color-primary);
        padding: 0.2rem 0.55rem;
        border-radius: var(--radius-pill);
      }
      .sparkle-icon {
        color: var(--color-primary);
      }
      .composer-card__subtitle {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }

      /* Form Structure */
      .composer-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }
      .form-section {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-4) var(--space-5) var(--space-5);
        margin: 0;
        background: var(--color-bg-subtle);
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .form-section__legend {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px;
        font-size: 0.825rem;
        font-weight: 700;
        color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .legend-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        background: var(--color-primary);
        color: #fff;
        border-radius: 50%;
        font-size: 0.7rem;
        font-weight: 700;
      }

      /* Field Groups & Labels */
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-label {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        font-size: var(--text-sm);
        font-weight: 600;
        color: var(--color-text);
      }
      .required {
        color: var(--color-danger);
      }
      .field-hint {
        font-size: var(--text-xs);
        font-weight: 400;
        color: var(--color-text-subtle);
      }

      /* Form Controls */
      .form-control {
        width: 100%;
        font-family: inherit;
        font-size: var(--text-sm);
        padding: 0.55rem 0.8rem;
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        color: var(--color-text);
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      textarea.form-control {
        resize: vertical;
        min-height: 80px;
        line-height: 1.5;
      }
      .form-control:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-ring);
      }
      .form-control.has-error {
        border-color: var(--color-danger);
        background: #fffafa;
      }
      .select-wrapper {
        position: relative;
      }
      select.form-control {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        padding-right: 2rem;
      }

      /* Row Grids */
      .form-row {
        display: grid;
        gap: var(--space-4);
      }
      .form-row.two-cols {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .form-row.three-cols {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      @media (max-width: 768px) {
        .form-row.two-cols,
        .form-row.three-cols {
          grid-template-columns: 1fr;
        }
      }

      /* Visual Toggle Card */
      .visual-toggle-card {
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-3) var(--space-4);
        transition: border-color 0.15s ease;
      }
      .visual-toggle-card:hover {
        border-color: var(--color-primary);
      }
      .visual-toggle {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
      }
      .toggle-checkbox {
        width: 17px;
        height: 17px;
        margin-top: 3px;
        accent-color: var(--color-primary);
        cursor: pointer;
      }
      .toggle-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .toggle-title {
        font-size: var(--text-sm);
        font-weight: 600;
        color: var(--color-text);
      }
      .toggle-desc {
        font-size: var(--text-xs);
        color: var(--color-text-subtle);
      }

      /* Form Actions */
      .form-actions {
        display: flex;
        justify-content: flex-end;
        padding-top: var(--space-2);
      }
      .btn-generate {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: var(--color-primary);
        border: 1px solid var(--color-primary);
        color: var(--color-primary-contrast);
        font-size: var(--text-sm);
        font-weight: 600;
        padding: 0.65rem 1.4rem;
        border-radius: var(--radius-sm);
        box-shadow: 0 1px 3px rgba(7, 141, 126, 0.25);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-generate:hover:not(:disabled) {
        background: var(--color-primary-hover);
        box-shadow: 0 3px 8px rgba(7, 141, 126, 0.35);
        transform: translateY(-1px);
      }
      .btn-generate:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
      }
      .btn-icon {
        color: #fff;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Result Section */
      .result {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        margin-top: var(--space-2);
      }
      .result-header {
        padding: var(--space-3) var(--space-4);
      }
      .provenance {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      .badge--mock {
        background: #fef3c7;
        color: #92400e;
        border-color: #fde68a;
        font-weight: 600;
        font-size: 0.75rem;
        padding: 0.3rem 0.65rem;
      }
      .badge--success {
        background: var(--color-success-bg);
        color: var(--color-success);
        border-color: var(--color-success-border);
        font-weight: 600;
        font-size: 0.75rem;
        padding: 0.3rem 0.65rem;
      }
      .badge-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        display: inline-block;
      }
      .quota-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        background: var(--color-bg-subtle);
        padding: 0.3rem 0.75rem;
        border-radius: var(--radius-pill);
        border: 1px solid var(--color-border);
      }
      .quota-icon {
        color: var(--color-primary);
      }

      .blocked-notice {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        color: var(--color-warning);
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-md);
        padding: var(--space-3) var(--space-4);
        font-size: var(--text-sm);
      }
      .notice-icon {
        font-size: 1.1rem;
      }

      /* Visual Brief Card */
      .visual-brief {
        padding: var(--space-5);
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        background: var(--color-surface);
        border-radius: var(--radius-lg);
      }
      .visual-brief__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-3);
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .visual-brief__title-wrap {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .visual-badge {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: #e0e7ff;
        color: #4338ca;
        padding: 0.2rem 0.5rem;
        border-radius: var(--radius-sm);
      }
      .visual-brief h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .badge--ratio {
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border-strong);
        color: var(--color-text);
        font-weight: 600;
        font-size: 0.75rem;
        padding: 0.25rem 0.6rem;
      }
      .visual-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }
      .visual-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .visual-item--full {
        grid-column: 1 / -1;
      }
      .visual-label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-subtle);
      }
      .visual-value {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--color-text);
      }
      .visual-value--alt {
        font-style: italic;
        color: var(--color-text-muted);
      }
      .prompt-box {
        background: #0f172a;
        color: #e2e8f0;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-sm);
        overflow-x: auto;
      }
      .prompt-box code {
        background: transparent;
        border: none;
        color: #38bdf8;
        font-size: 0.85rem;
        white-space: pre-wrap;
      }
      .palette-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .swatch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 4px 8px;
      }
      .swatch__dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 1px solid rgba(15, 23, 42, 0.15);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      }
      .swatch code {
        border: none;
        background: transparent;
        font-size: 11px;
        font-weight: 600;
      }

      /* Variants Grid */
      .placeholder-card {
        padding: var(--space-5);
        text-align: center;
      }
      .placeholder {
        color: var(--color-text-subtle);
        margin: 0;
      }
      .variants-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .variants-section__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .variants-section__head h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .variants-count {
        font-size: var(--text-xs);
        color: var(--color-text-subtle);
        font-weight: 500;
      }
      .variants {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: var(--space-4);
      }
      .variant {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-xs);
        transition: box-shadow 0.15s ease, border-color 0.15s ease;
      }
      .variant:hover {
        border-color: var(--color-primary-ring);
        box-shadow: var(--shadow-sm);
      }
      .variant__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-3);
      }
      .variant__title-badge {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .variant-idx {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-muted);
      }
      .badge--mock.small {
        font-size: 0.65rem;
        padding: 0.15rem 0.45rem;
      }
      .char-count {
        font-size: 0.72rem;
        color: var(--color-text-subtle);
      }
      .variant__editor {
        margin-bottom: var(--space-3);
        flex: 1;
      }
      .variant-textarea {
        width: 100%;
        box-sizing: border-box;
        font-family: inherit;
        font-size: var(--text-sm);
        line-height: 1.55;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        color: var(--color-text);
        resize: vertical;
        min-height: 110px;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .variant-textarea:focus {
        background: var(--color-surface);
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-ring);
        outline: none;
      }
      .variant-warnings {
        background: var(--color-warning-bg);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        margin-bottom: var(--space-3);
      }
      .lint-warnings {
        margin: 0;
        padding-left: 18px;
        font-size: 12px;
        color: var(--color-warning);
      }
      .variant__footer {
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border);
      }
      .btn-use-variant {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0.5rem 1rem;
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-primary);
        background: var(--color-primary-light);
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-use-variant:hover {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
      .btn-use-variant svg {
        transition: transform 0.15s ease;
      }
      .btn-use-variant:hover svg {
        transform: translateX(3px);
      }
    `,
  ],
})
export class AiStudioComponent {
  private readonly fb = new FormBuilder();

  readonly tenant = computed(() => this.currentTenant.tenant());

  readonly form = this.fb.nonNullable.group({
    objective: ['', [Validators.required]],
    cta: ['', [Validators.required]],
    useCase: ['social_post'],
    channel: [''],
    tone: ['friendly'],
    language: ['en-IN'],
    offer: [''],
    segment: [''],
  });

  readonly generating = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly quotaExceeded = signal(false);
  readonly quotaExceededDetail = signal<string | null>(null);
  readonly result = signal<AiGenerationResponse | null>(null);
  readonly editableVariants = signal<string[]>([]);
  readonly includeVisualBrief = signal(false);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly aiGenerationService: AiGenerationService,
    private readonly router: Router,
  ) {}

  onVisualBriefToggle(event: Event): void {
    this.includeVisualBrief.set((event.target as HTMLInputElement).checked);
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  generate(): void {
    const tenantId = this.tenant()?.id;
    if (this.form.invalid || this.generating() || !tenantId) {
      return;
    }
    this.generating.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.quotaExceeded.set(false);
    this.quotaExceededDetail.set(null);
    this.result.set(null);
    this.editableVariants.set([]);

    const raw = this.form.getRawValue();
    this.aiGenerationService
      .generate(tenantId, {
        objective: raw.objective,
        cta: raw.cta,
        use_case: raw.useCase,
        channel: raw.channel || undefined,
        tone: raw.tone,
        language: raw.language || undefined,
        offer: raw.offer || undefined,
        segment: raw.segment || undefined,
        include_visual_brief: this.includeVisualBrief() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.generating.set(false);
          this.result.set(res);
          this.editableVariants.set(res.variants.map((v) => v.text));
        },
        error: (err: unknown) => {
          this.generating.set(false);
          if (apiErrorCode(err) === 'QUOTA_EXCEEDED') {
            this.quotaExceeded.set(true);
            const fields = apiErrorFields(err);
            this.quotaExceededDetail.set(
              fields && fields['used_qty'] !== undefined && fields['limit_qty'] !== undefined
                ? `${fields['used_qty']}/${fields['limit_qty']} used this period`
                : apiErrorMessage(err),
            );
          } else {
            this.errorMessage.set(apiErrorMessage(err));
            this.fieldErrors.set(apiErrorFields(err));
          }
        },
      });
  }

  updateVariant(index: number, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.editableVariants.update((list) => {
      const next = [...list];
      next[index] = value;
      return next;
    });
  }

  useVariant(index: number): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    const raw = this.form.getRawValue();
    void this.router.navigate(['/app', tenantId, 'content'], {
      state: {
        prefillObjective: raw.objective,
        prefillBody: this.editableVariants()[index] ?? '',
        prefillLanguage: raw.language || 'en-IN',
      },
    });
  }
}
