import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorFields, apiErrorMessage } from '../../../core/http/error.util';
import { LocationApiService } from '../../../core/locations/location.service';
import { CurrentTenantService } from '../../../core/tenancy/current-tenant.service';
import { Tenant } from '../../../core/tenancy/tenant.models';
import { TenantService } from '../../../core/tenancy/tenant.service';

/**
 * `/app/choose-tenant` — Balanced SaaS Workspace Launcher for Business Owners,
 * Agency Owners, and Delegated Staff.
 */
@Component({
  selector: 'app-choose-tenant',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="choose-shell">
      <header class="topbar">
        <div class="topbar__inner">
          <div class="topbar__brand">
            <span class="topbar__logo" aria-hidden="true">L</span>
            <span class="topbar__wordmark">LocalGrowth <em>AI</em></span>
          </div>

          <div class="topbar__actions">
            @if (userName()) {
              <span class="topbar__user-pill" [title]="userEmail() ?? ''">
                <span class="topbar__avatar" aria-hidden="true">{{ initials(userName()!) }}</span>
                <span class="topbar__user">{{ userName() }}</span>
              </span>
            }
            <a routerLink="/agency/overview" class="topbar__link">Agency workspace →</a>
            @if (auth) {
              <button type="button" class="topbar__signout" (click)="signOut()">Sign out</button>
            }
          </div>
        </div>
      </header>

      <main class="page">
        <header class="page-hero">
          <div class="page-hero__text">
            <p class="page-hero__eyebrow">Workspace Launcher</p>
            <h1 class="page-hero__title">Choose a business</h1>
            <p class="page-hero__sub">
              Open an active business dashboard, switch to your agency console, or set up a new workspace.
            </p>
          </div>
        </header>

        <div class="workspace-grid">
          <div class="primary-column">
            <section class="card businesses-card">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Your businesses</h2>
                  <p class="card-subtitle">Select a workspace to launch its growth dashboard.</p>
                </div>
                @if (!loading() && !loadError()) {
                  <span class="count-pill">{{ tenants().length }} {{ tenants().length === 1 ? 'workspace' : 'workspaces' }}</span>
                }
              </div>

              @if (loading()) {
                <div class="state-box" aria-live="polite">
                  <div class="skeleton-row"></div>
                  <div class="skeleton-row"></div>
                  <p class="state-text">Loading your businesses…</p>
                </div>
              } @else if (loadError()) {
                <div class="alert alert--error" role="alert">
                  <p class="form-error">{{ loadError() }}</p>
                  <button type="button" class="btn-secondary btn-sm" (click)="loadTenants()">Try again</button>
                </div>
              } @else if (tenants().length === 0) {
                <div class="empty-state">
                  <div class="empty-state__icon" aria-hidden="true">▦</div>
                  <p class="empty-state__title">No businesses yet</p>
                  <p class="empty-state__desc">
                    Create one using the setup panel on the right, or switch to the Invite tab to join a team.
                  </p>
                </div>
              } @else {
                <ul class="tenant-list">
                  @for (tenant of tenants(); track tenant.id) {
                    <li class="tenant-item" (click)="choose(tenant)">
                      <span class="tenant-avatar" [class]="avatarClass(tenant.display_name)" aria-hidden="true">
                        {{ initials(tenant.display_name) }}
                      </span>
                      <div class="tenant-item__info">
                        <div class="tenant-item__title-row">
                          <span class="name">{{ tenant.display_name }}</span>
                          <span class="status-dot" title="Active workspace">Active</span>
                        </div>
                        <span class="tenant-item__meta">
                          @if (tenant.business_type) {
                            {{ tenant.business_type }} ·
                          }
                          {{ tenant.country || 'IN' }} · {{ tenant.currency || 'INR' }}
                        </span>
                      </div>
                      <span class="role badge" [class]="roleBadgeClass(tenant.caller_role)">
                        {{ tenant.caller_role }}
                      </span>
                      <button
                        type="button"
                        class="btn-open"
                        (click)="$event.stopPropagation(); choose(tenant)"
                      >
                        Open <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </section>

            <section class="agency-banner">
              <div class="agency-banner__left">
                <div class="agency-banner__icon" aria-hidden="true">◈</div>
                <div class="agency-banner__body">
                  <h3 class="agency-banner__title">Agency Command Center</h3>
                  <p class="agency-banner__text">
                    Managing multiple client accounts? Open the agency console for cross-client analytics, staff delegation, and pooled quotas.
                  </p>
                </div>
              </div>
              <a routerLink="/agency/overview" class="agency-banner__cta">
                Open agency <span aria-hidden="true">→</span>
              </a>
            </section>
          </div>

          <div class="secondary-column">
            <section class="card action-card">
              @if (!createdTenant()) {
                <div class="tab-bar" role="tablist" aria-label="Workspace setup">
                  <button
                    type="button"
                    role="tab"
                    class="tab-btn"
                    [class.tab-btn--active]="rightTab() === 'create'"
                    [attr.aria-selected]="rightTab() === 'create'"
                    (click)="rightTab.set('create')"
                  >
                    Create business
                  </button>
                  <button
                    type="button"
                    role="tab"
                    class="tab-btn"
                    [class.tab-btn--active]="rightTab() === 'invite'"
                    [attr.aria-selected]="rightTab() === 'invite'"
                    (click)="rightTab.set('invite')"
                  >
                    Join with invite
                  </button>
                </div>
              }

              @if (rightTab() === 'create' || createdTenant()) {
                @if (!createdTenant()) {
                  <div class="card-head card-head--compact">
                    <div class="head-inline">
                      <h2 class="card-title">Create a new business</h2>
                      <span class="step-pill" data-test="wizard-step">Step 1 of 2: your business</span>
                    </div>
                    <p class="card-subtitle">Launch a dedicated workspace with its own locations, brand kit, and analytics.</p>
                  </div>
                  <form [formGroup]="createForm" (ngSubmit)="submitCreate()" novalidate>
                    <label class="field">
                      <span>Business name</span>
                      <input type="text" formControlName="displayName" placeholder="e.g. Glow Salon & Spa" />
                    </label>
                    @if (createFieldError('display_name')) {
                      <p class="field-error">{{ createFieldError('display_name') }}</p>
                    }

                    <label class="field">
                      <span>Type of business <span class="optional">(optional)</span></span>
                      <input type="text" formControlName="businessType" placeholder="e.g. Salon, Clinic, Restaurant" />
                    </label>
                    @if (createFieldError('business_type')) {
                      <p class="field-error">{{ createFieldError('business_type') }}</p>
                    }

                    @if (createError() && !createFieldError('display_name') && !createFieldError('business_type')) {
                      <p class="alert alert--error form-error" role="alert">{{ createError() }}</p>
                    }

                    <button type="submit" class="btn-submit" [disabled]="createForm.invalid || creating()">
                      {{ creating() ? 'Creating…' : 'Create business' }}
                    </button>
                  </form>
                } @else {
                  <div class="card-head card-head--compact">
                    <h2 class="card-title">Add contact details for {{ createdTenant()!.display_name }}</h2>
                    <span class="step-pill step-pill--active" data-test="wizard-step">Step 2 of 2: where customers find you (optional)</span>
                  </div>
                  <p class="alert alert--success success" role="status" data-test="tenant-created">
                    Your business has been created. These details are optional and can be changed later in Business profile.
                  </p>
                  <form [formGroup]="detailsForm" (ngSubmit)="submitDetails()" novalidate>
                    <label class="field">
                      <span>Main category</span>
                      <input type="text" formControlName="category" placeholder="e.g. Hair salon" />
                    </label>
                    @if (detailsFieldError('category')) {
                      <p class="field-error">{{ detailsFieldError('category') }}</p>
                    }

                    <div class="field-row">
                      <div class="field-col">
                        <label class="field">
                          <span>Phone</span>
                          <input type="tel" formControlName="phone" placeholder="+91 98765 43210" />
                        </label>
                        @if (detailsFieldError('phone')) {
                          <p class="field-error">{{ detailsFieldError('phone') }}</p>
                        }
                      </div>
                      <div class="field-col">
                        <label class="field">
                          <span>City</span>
                          <input type="text" formControlName="city" placeholder="e.g. Pune" />
                        </label>
                      </div>
                    </div>

                    <label class="field">
                      <span>Website</span>
                      <input type="url" formControlName="website" placeholder="https://" />
                    </label>
                    @if (detailsFieldError('website')) {
                      <p class="field-error">{{ detailsFieldError('website') }}</p>
                    }

                    @if (detailsError()) {
                      <p class="alert alert--error form-error" role="alert" data-test="details-error">{{ detailsError() }}</p>
                    }

                    <div class="actions">
                      <button type="submit" class="btn-submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save and continue' }}</button>
                      <button type="button" class="btn-skip secondary" data-test="skip-details" [disabled]="saving()" (click)="finish()">
                        {{ detailsError() ? 'Continue without saving' : 'Skip for now' }}
                      </button>
                    </div>
                  </form>
                }
              } @else {
                <div class="card-head card-head--compact">
                  <h2 class="card-title">Have an invite?</h2>
                  <p class="card-subtitle">Paste an invite token from a teammate to join their business workspace.</p>
                </div>
                <form [formGroup]="inviteForm" (ngSubmit)="submitAcceptInvite()" novalidate>
                  <label class="field">
                    <span>Invite token</span>
                    <input type="text" formControlName="token" placeholder="Paste your invite token" />
                  </label>

                  @if (inviteError()) {
                    <p class="alert alert--error form-error" role="alert">{{ inviteError() }}</p>
                  }
                  @if (inviteAccepted()) {
                    <p class="alert alert--success success" role="status">
                      Invite accepted — you can now open that business on the left.
                    </p>
                  }

                  <button type="submit" class="btn-submit" [disabled]="inviteForm.invalid || acceptingInvite()">
                    {{ acceptingInvite() ? 'Accepting…' : 'Accept invite' }}
                  </button>
                </form>
              }
            </section>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .choose-shell {
        min-height: 100vh;
        background:
          radial-gradient(ellipse 80% 40% at 50% 0%, rgba(20, 184, 166, 0.08), transparent 70%),
          var(--color-bg, #f4f6f9);
        display: flex;
        flex-direction: column;
        font-family: var(--font-sans);
      }

      .topbar {
        background: #0c1824;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
      }
      .topbar__inner {
        max-width: 1080px;
        margin: 0 auto;
        padding: 0.7rem 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .topbar__brand {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .topbar__logo {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: 800;
        box-shadow: 0 2px 8px rgba(20, 184, 166, 0.35);
      }
      .topbar__wordmark {
        font-weight: 700;
        font-size: 0.96rem;
        letter-spacing: -0.015em;
        color: #fff;
      }
      .topbar__wordmark em {
        font-style: normal;
        color: #2dd4bf;
      }
      .topbar__actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .topbar__user-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 3px 10px 3px 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .topbar__avatar {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: #0f766e;
        color: #ccfbf1;
        font-size: 0.65rem;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .topbar__user {
        font-size: 0.78rem;
        color: #cbd5e1;
        max-width: 170px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .topbar__link {
        font-size: 0.78rem;
        font-weight: 600;
        color: #5eead4;
        text-decoration: none;
        padding: 0.36rem 0.75rem;
        border-radius: 7px;
        background: rgba(20, 184, 166, 0.14);
        border: 1px solid rgba(45, 212, 191, 0.25);
        transition: all 0.15s ease;
      }
      .topbar__link:hover {
        color: #fff;
        background: rgba(20, 184, 166, 0.24);
        border-color: #2dd4bf;
      }
      .topbar__signout {
        font-size: 0.78rem;
        font-weight: 500;
        padding: 0.36rem 0.75rem;
        border-radius: 7px;
        background: transparent;
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.16);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .topbar__signout:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      .page {
        width: 100%;
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 24px 48px;
        flex: 1;
      }

      .page-hero {
        margin-bottom: 22px;
      }
      .page-hero__eyebrow {
        margin: 0 0 4px;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #0d9488;
      }
      .page-hero__title {
        margin: 0 0 6px;
        font-size: 1.7rem;
        font-weight: 800;
        letter-spacing: -0.025em;
        color: #0f172a;
      }
      .page-hero__sub {
        margin: 0;
        color: #64748b;
        font-size: 0.875rem;
      }

      .workspace-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.95fr);
        gap: 20px;
        align-items: stretch;
      }
      .primary-column,
      .secondary-column {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 6px 20px rgba(15, 23, 42, 0.03);
        padding: 20px 22px;
      }
      .action-card {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 14px;
      }
      .card-head--compact {
        flex-direction: column;
        gap: 4px;
      }
      .head-inline {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .card-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: #0f172a;
      }
      .card-subtitle {
        margin: 3px 0 0;
        font-size: 0.8rem;
        color: #64748b;
      }
      .count-pill {
        font-size: 0.72rem;
        font-weight: 600;
        color: #0f766e;
        background: #f0fdfa;
        border: 1px solid #ccfbf1;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }

      .tenant-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .tenant-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 13px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 11px;
        background: #fcfdff;
        cursor: pointer;
        transition: all 0.16s ease;
      }
      .tenant-item:hover {
        border-color: #0d9488;
        background: #f0fdfa;
        box-shadow: 0 4px 12px rgba(13, 148, 136, 0.08);
        transform: translateY(-1px);
      }
      .tenant-avatar {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        background: #ccfbf1;
        color: #0f766e;
        font-weight: 800;
        font-size: 0.88rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .tenant-item__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .tenant-item__title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tenant-item .name {
        font-weight: 700;
        font-size: 0.94rem;
        color: #0f172a;
      }
      .status-dot {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.7rem;
        font-weight: 600;
        color: #15803d;
      }
      .status-dot::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #22c55e;
      }
      .tenant-item__meta {
        font-size: 0.78rem;
        color: #64748b;
      }
      .role.badge {
        text-transform: capitalize;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 999px;
      }
      .btn-open {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 7px 14px;
        border-radius: 8px;
        border: none;
        background: #0d9488;
        color: #fff;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-open:hover {
        background: #0f766e;
      }

      .agency-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 20px;
        border-radius: 14px;
        background: linear-gradient(135deg, #0c1824 0%, #12263a 100%);
        border: 1px solid rgba(45, 212, 191, 0.2);
        box-shadow: 0 6px 20px rgba(12, 24, 36, 0.14);
        color: #f8fafc;
      }
      .agency-banner__left {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }
      .agency-banner__icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: rgba(20, 184, 166, 0.16);
        border: 1px solid rgba(45, 212, 191, 0.3);
        color: #2dd4bf;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        flex-shrink: 0;
      }
      .agency-banner__title {
        margin: 0 0 3px;
        font-size: 0.94rem;
        font-weight: 700;
        color: #fff;
      }
      .agency-banner__text {
        margin: 0;
        font-size: 0.78rem;
        line-height: 1.45;
        color: #94a3b8;
      }
      .agency-banner__cta {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 8px 14px;
        border-radius: 8px;
        background: #0d9488;
        color: #fff;
        font-size: 0.8rem;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.15s ease;
      }
      .agency-banner__cta:hover {
        background: #14b8a6;
      }

      /* Right card segmented tab bar */
      .tab-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 4px;
        background: #f1f5f9;
        border-radius: 10px;
        margin-bottom: 16px;
      }
      .tab-btn {
        border: none;
        background: transparent;
        color: #475569;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 7px 10px;
        border-radius: 7px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .tab-btn--active {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }

      .step-pill {
        font-size: 0.7rem;
        font-weight: 600;
        color: #475569;
        background: #f1f5f9;
        padding: 3px 9px;
        border-radius: 999px;
      }
      .step-pill--active {
        color: #0f766e;
        background: #f0fdfa;
        border: 1px solid #ccfbf1;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 0.8rem;
        font-weight: 600;
        color: #334155;
      }
      .field .optional {
        font-weight: 400;
        color: #94a3b8;
      }
      .field input {
        width: 100%;
        box-sizing: border-box;
        padding: 9px 11px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 400;
        color: #0f172a;
        background: #fff;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .field input:focus {
        outline: none;
        border-color: #0d9488;
        box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.14);
      }
      .field-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .field-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .btn-submit {
        width: 100%;
        padding: 10px 16px;
        border: none;
        border-radius: 9px;
        background: #0d9488;
        color: #fff;
        font-size: 0.86rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 4px;
        transition: background 0.15s ease;
      }
      .btn-submit:hover:not(:disabled) {
        background: #0f766e;
      }
      .btn-submit:disabled {
        background: #e2e8f0;
        color: #94a3b8;
        cursor: not-allowed;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .btn-skip {
        width: 100%;
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #475569;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-skip:hover:not(:disabled) {
        background: #f8fafc;
      }

      .state-box,
      .empty-state {
        padding: 24px 12px;
        text-align: center;
      }
      .skeleton-row {
        height: 46px;
        border-radius: 9px;
        background: #f1f5f9;
        margin-bottom: 8px;
      }
      .state-text,
      .empty-state__desc {
        margin: 6px 0 0;
        font-size: 0.82rem;
        color: #64748b;
      }
      .empty-state__icon {
        font-size: 1.5rem;
        color: #94a3b8;
        margin-bottom: 6px;
      }
      .empty-state__title {
        margin: 0;
        font-weight: 700;
        color: #0f172a;
      }

      .field-error {
        margin: -6px 0 0;
        font-size: 0.76rem;
        color: #dc2626;
      }
      .alert {
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 0.8rem;
      }
      .alert--error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .alert--success {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #15803d;
        margin-bottom: 8px;
      }
      .form-error {
        margin: 0;
      }

      @media (max-width: 900px) {
        .workspace-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 600px) {
        .page {
          padding: 20px 14px 36px;
        }
        .tenant-item {
          flex-wrap: wrap;
        }
        .btn-open {
          width: 100%;
          justify-content: center;
        }
        .agency-banner {
          flex-direction: column;
          align-items: flex-start;
        }
        .field-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ChooseTenantComponent implements OnInit {
  private readonly fb = new FormBuilder();
  private readonly http = inject(HttpClient, { optional: true });
  readonly auth = this.http ? inject(AuthService) : null;

  readonly rightTab = signal<'create' | 'invite'>('create');

  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    businessType: [''],
  });
  readonly createdTenant = signal<Tenant | null>(null);
  readonly detailsForm = this.fb.nonNullable.group({
    category: [''],
    phone: [''],
    website: [''],
    city: [''],
  });
  readonly saving = signal(false);
  readonly detailsError = signal<string | null>(null);
  readonly detailsFieldErrors = signal<Record<string, string> | null>(null);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createFieldErrors = signal<Record<string, string> | null>(null);

  readonly inviteForm = this.fb.nonNullable.group({
    token: ['', [Validators.required]],
  });
  readonly acceptingInvite = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly inviteAccepted = signal(false);

  constructor(
    private readonly tenantService: TenantService,
    private readonly locations: LocationApiService,
    private readonly currentTenant: CurrentTenantService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.loadTenants();
  }

  userName(): string | null {
    return this.auth?.currentUser()?.name ?? null;
  }

  userEmail(): string | null {
    return this.auth?.currentUser()?.email ?? null;
  }

  signOut(): void {
    if (!this.auth) {
      return;
    }
    this.currentTenant.clear();
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/auth/login']),
      error: () => {
        this.auth?.clearSession();
        void this.router.navigate(['/auth/login']);
      },
    });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return 'B';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  avatarClass(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % 5;
    return idx === 0 ? '' : `avatar-initial--${idx}`;
  }

  roleBadgeClass(role?: string): string {
    switch ((role ?? '').toLowerCase()) {
      case 'owner':
        return 'badge--success';
      case 'admin':
        return 'badge--info';
      case 'editor':
        return 'badge--warning';
      default:
        return 'badge--neutral';
    }
  }

  loadTenants(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.tenantService.list().subscribe({
      next: (tenants) => {
        this.loading.set(false);
        this.tenants.set(tenants);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  choose(tenant: Tenant): void {
    this.currentTenant.select(tenant);
    void this.router.navigate(['/app', tenant.id, 'dashboard']);
  }

  createFieldError(field: string): string | null {
    return this.createFieldErrors()?.[field] ?? null;
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.createFieldErrors.set(null);

    const businessType = this.createForm.controls.businessType.value.trim();
    this.tenantService
      .create({ display_name: this.createForm.controls.displayName.value, ...(businessType ? { business_type: businessType } : {}) })
      .subscribe({
        next: (tenant) => {
          this.creating.set(false);
          this.createForm.reset();
          this.createdTenant.set(tenant);
        },
        error: (err: unknown) => {
          this.creating.set(false);
          this.createError.set(apiErrorMessage(err));
          this.createFieldErrors.set(apiErrorFields(err));
        },
      });
  }

  detailsFieldError(field: string): string | null {
    return this.detailsFieldErrors()?.[field] ?? null;
  }

  submitDetails(): void {
    const tenant = this.createdTenant();
    if (!tenant || this.saving()) {
      return;
    }
    const v = this.detailsForm.getRawValue();
    const category = v.category.trim();
    const phone = v.phone.trim();
    const website = v.website.trim();
    const city = v.city.trim();
    if (!category && !phone && !website && !city) {
      this.finish();
      return;
    }
    const locationId = tenant.default_location_id;
    if (!locationId) {
      this.detailsError.set('Your business was created, but its location could not be found. Add these details later in Business profile.');
      return;
    }
    this.saving.set(true);
    this.detailsError.set(null);
    this.detailsFieldErrors.set(null);
    this.locations
      .update(tenant.id, locationId, {
        ...(category ? { category } : {}),
        ...(phone ? { phone } : {}),
        ...(website ? { website } : {}),
        ...(city ? { address: { city, country: tenant.country } } : {}),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.finish();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.detailsFieldErrors.set(apiErrorFields(err));
          this.detailsError.set(
            'Your business was created, but these details were not saved: ' +
              apiErrorMessage(err) +
              ' You can fix them and try again, or continue and add them later in Business profile.',
          );
        },
      });
  }

  finish(): void {
    const tenant = this.createdTenant();
    if (tenant) {
      this.choose(tenant);
    }
  }

  submitAcceptInvite(): void {
    if (this.inviteForm.invalid || this.acceptingInvite()) {
      return;
    }
    this.acceptingInvite.set(true);
    this.inviteError.set(null);
    this.inviteAccepted.set(false);

    this.tenantService.acceptInvite(this.inviteForm.controls.token.value).subscribe({
      next: () => {
        this.acceptingInvite.set(false);
        this.inviteAccepted.set(true);
        this.inviteForm.reset();
        this.loadTenants();
      },
      error: (err: unknown) => {
        this.acceptingInvite.set(false);
        this.inviteError.set(apiErrorMessage(err));
      },
    });
  }
}
