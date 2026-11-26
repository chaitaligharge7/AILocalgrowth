import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { API_BASE_URL } from '../../core/http/api-base-url.token';
import { ApiSuccess } from '../../core/http/api-envelope.model';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { LocationApiService } from '../../core/locations/location.service';
import {
  BulkImportLocationsResult,
  LocationHistoryEvent,
  LocationHoliday,
  LocationHoursRequestDay,
  LocationProfile,
  LocationService as ServiceItem,
  LocationServiceArea,
  LocationSummary,
  WEEKDAY_LABELS,
} from '../../core/locations/location.models';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { localTodayDateString } from '../../core/utils/date.util';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

type ProfileTab = 'details' | 'hours' | 'categories' | 'areas' | 'services' | 'locations' | 'history';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'details', label: 'Business details' },
  { id: 'hours', label: 'Hours & holidays' },
  { id: 'categories', label: 'Categories & attributes' },
  { id: 'areas', label: 'Service areas' },
  { id: 'services', label: 'Services & prices' },
  { id: 'locations', label: 'Locations' },
  { id: 'history', label: 'Change history' },
];

/** Human wording for the audit actions `LocationService` records. */
const ACTION_LABELS: Record<string, string> = {
  'location.created': 'Location created',
  'location.updated': 'Details updated',
  'location.archived': 'Location archived',
  'location.hours_updated': 'Business hours updated',
  'location.holidays_updated': 'Holiday schedule updated',
  'location.categories_updated': 'Categories/attributes updated',
  'location.service_areas_updated': 'Service areas updated',
  'location.service_added': 'Service added',
  'location.service_updated': 'Service updated',
  'location.service_removed': 'Service removed',
  'location.media_updated': 'Logo / cover photos updated',
};

/**
 * `/app/:tenantId/business-profile` — Business Profile & Locations (redesign
 * backlog BW-021..030): details, weekly hours + holidays, categories and
 * attributes, service areas, the services/price catalogue, multi-location
 * management and the audit-log-backed change history. Every number and row
 * comes from `/tenants/{t}/locations*`.
 *
 * Reads are open to every active member; every write needs `location.manage`
 * (owner/admin) server-side — the editors are hidden for other roles as UX
 * polish only, the backend independently 403s.
 */
@Component({
  selector: 'app-business-profile',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent, IconComponent, SkeletonLoaderComponent, EmptyStateComponent, PaginationComponent, SortHeaderComponent],
  template: `
    <section class="bp">
      <app-page-header
        eyebrow="Business"
        eyebrowLabel="Profile"
        title="Business profile"
        subtitle="Details, opening hours, services and locations — the facts customers see."
      />

      @if (!tenantId()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else if (loadingLocations()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (locations().length === 0) {
        <app-empty-state icon="business" title="No locations yet" message="Create your first location to start building the profile." />
      } @else {
        <div class="loc-picker">
          <label>
            Location
            <select [value]="selectedId()" (change)="selectLocation($any($event.target).value)" data-testid="location-picker">
              @for (loc of locations(); track loc.id) {
                <option [value]="loc.id" [selected]="loc.id === selectedId()">{{ loc.name }}</option>
              }
            </select>
          </label>
          @if (!canManage()) {
            <span class="meta">View only — an owner or admin can edit the profile.</span>
          }
        </div>

        <nav class="tabs" role="tablist" aria-label="Business profile sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="openTab(t.id)">
              {{ t.label }}
            </button>
          }
        </nav>

        @if (loadError()) {
          <p class="alert alert--error form-error" role="alert">{{ loadError() }}</p>
        }
        @if (message()) {
          <p class="alert alert--success" role="status">{{ message() }}</p>
        }
        @if (errorMessage()) {
          <p class="alert alert--error form-error" role="alert">{{ errorMessage() }}</p>
        }

        @if (tab() === 'locations') {
          <div class="card" data-testid="tab-locations">
            @if (canManage()) {
              <div class="add-section" data-testid="locations-add-section">
                <h2>Add a location</h2>
                <form class="inline-form" (submit)="addLocation($event)" data-testid="add-location">
                  <strong>New location</strong>
                  <input type="text" placeholder="Location name" aria-label="New location name" [value]="newLocationName()" (input)="newLocationName.set($any($event.target).value)" />
                  <input type="text" placeholder="Category (optional)" aria-label="New location category" [value]="newLocationCategory()" (input)="newLocationCategory.set($any($event.target).value)" />
                  <button type="submit" class="btn-primary" [disabled]="busy() || !newLocationName().trim()">Add location</button>
                </form>

                <div class="bulk-import" data-testid="bulk-import-locations">
                  <div class="bulk-import__head">
                    <div>
                      <strong>Bulk import locations (CSV)</strong>
                      <p class="meta">Upload a .csv file or paste rows with headers: <code>name,category,phone,website,line1,city,state,postal_code,country</code></p>
                    </div>
                    <div class="bulk-import__tools">
                      <label class="file-btn">
                        Upload CSV
                        <input type="file" accept=".csv,text/csv" (change)="onCsvFileSelected($event)" />
                      </label>
                      <button type="button" class="btn-secondary" (click)="loadSampleCsv()">Load sample CSV</button>
                    </div>
                  </div>
                  <textarea
                    rows="5"
                    placeholder="name,category,phone,city,state,postal_code,country"
                    aria-label="Locations CSV"
                    [value]="bulkCsvText()"
                    (input)="bulkCsvText.set($any($event.target).value)"
                  ></textarea>
                  <div class="actions">
                    <button type="button" class="btn-primary" [disabled]="busy() || !bulkCsvText().trim()" (click)="submitBulkImport()">
                      {{ busy() ? 'Importing…' : 'Import CSV' }}
                    </button>
                    @if (bulkCsvText()) {
                      <button type="button" class="btn-secondary" [disabled]="busy()" (click)="bulkCsvText.set(''); bulkResult.set(null)">Clear</button>
                    }
                  </div>
                  @if (bulkResult(); as res) {
                    <div class="bulk-result" role="status">
                      <p><strong>Import summary:</strong> {{ res.created_count }} created, {{ res.failed_count }} failed.</p>
                      @if (res.failed.length > 0) {
                        <ul class="bulk-errors">
                          @for (f of res.failed; track f.row) {
                            <li>Row {{ f.row }} ({{ f.name }}): {{ f.error }}</li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            <div class="section-head spaced">
              <h2>All locations</h2>
              <span class="meta">{{ locations().length }} location(s)</span>
            </div>
            @for (loc of locations(); track loc.id) {
              <div class="row">
                <div class="grow">
                  <strong>{{ loc.name }}</strong>
                  <span class="meta">{{ loc.category || 'No category' }} · {{ loc.address?.city || 'No address' }} · {{ loc.timezone }}</span>
                </div>
                <button type="button" class="btn-secondary action-icon-btn" (click)="selectLocation(loc.id); openTab('details')" [attr.aria-label]="'Edit ' + loc.name" title="Edit location">
                  <ui-icon name="edit" [size]="15" />
                  <span class="sr-only">Edit</span>
                </button>
                @if (canManage() && locations().length > 1) {
                  <button type="button" class="btn-danger action-icon-btn danger" (click)="archiveLocation(loc)" [disabled]="busy()" [attr.aria-label]="'Archive ' + loc.name" title="Archive location">
                    <ui-icon name="trash" [size]="15" />
                    <span class="sr-only">Archive</span>
                  </button>
                }
              </div>
            }
          </div>
        } @else if (profileLoading()) {
          <app-skeleton-loader [rows]="5" />
        } @else if (profile()) {
          @let p = profile()!;
          @switch (tab()) {
            @case ('details') {
              <form class="card" [formGroup]="detailsForm" (ngSubmit)="saveDetails()" data-testid="tab-details" novalidate>
                <h2>Business details</h2>
                <div class="grid-2">
                  <label>Business name <input type="text" formControlName="name" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Primary category <input type="text" formControlName="category" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Phone <input type="text" formControlName="phone" placeholder="+91 …" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Website <input type="url" formControlName="website" placeholder="https://" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Address line 1 <input type="text" formControlName="line1" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Address line 2 <input type="text" formControlName="line2" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>City <input type="text" formControlName="city" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>State <input type="text" formControlName="state" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Postal code <input type="text" formControlName="postal_code" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Country <input type="text" formControlName="country" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Timezone <input type="text" formControlName="timezone" placeholder="Asia/Kolkata" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Latitude <input type="text" formControlName="lat" [attr.readonly]="canManage() ? null : true" /></label>
                  <label>Longitude <input type="text" formControlName="lng" [attr.readonly]="canManage() ? null : true" /></label>
                </div>
                @for (entry of fieldErrorEntries(); track entry[0]) {
                  <p class="field-error">{{ entry[0] }}: {{ entry[1] }}</p>
                }
                @if (canManage()) {
                  <div class="actions">
                    <button type="submit" class="btn-primary" [disabled]="busy() || detailsForm.invalid || detailsForm.pristine">Save details</button>
                    <button type="button" (click)="resetDetails()" [disabled]="busy() || detailsForm.pristine">Reset</button>
                  </div>
                }
              </form>

              <div class="card media-card" data-testid="location-media-picker">
                <div class="media-card__head">
                  <div>
                    <h2>Location logo &amp; cover photo</h2>
                    <p class="meta">Pick images from your Assets library to attach as this location's logo and cover banner.</p>
                  </div>
                </div>

                <div class="media-grid">
                  <div class="media-slot">
                    <span class="media-slot__label">Logo photo</span>
                    <div class="media-preview media-preview--logo">
                      @if (selectedLogoPreviewUrl()) {
                        <img [src]="selectedLogoPreviewUrl()!" alt="Location logo preview" />
                      } @else {
                        <span class="meta">No logo selected</span>
                      }
                    </div>
                    <div class="media-controls">
                      <select
                        aria-label="Select logo asset"
                        data-testid="logo-asset-select"
                        [value]="logoAssetDraft()"
                        [disabled]="!canManage()"
                        (change)="logoAssetDraft.set($any($event.target).value)"
                      >
                        <option value="">None</option>
                        @for (a of assetOptions(); track a.id) {
                          <option [value]="a.id">{{ a.original_filename || a.id.slice(0, 8) }}{{ a.album ? ' · ' + a.album : '' }}</option>
                        }
                      </select>
                      @if (canManage() && logoAssetDraft()) {
                        <button type="button" class="btn-secondary btn-sm" (click)="logoAssetDraft.set('')">Clear</button>
                      }
                    </div>
                  </div>

                  <div class="media-slot">
                    <span class="media-slot__label">Cover photo</span>
                    <div class="media-preview media-preview--cover">
                      @if (selectedCoverPreviewUrl()) {
                        <img [src]="selectedCoverPreviewUrl()!" alt="Location cover preview" />
                      } @else {
                        <span class="meta">No cover photo selected</span>
                      }
                    </div>
                    <div class="media-controls">
                      <select
                        aria-label="Select cover asset"
                        data-testid="cover-asset-select"
                        [value]="coverAssetDraft()"
                        [disabled]="!canManage()"
                        (change)="coverAssetDraft.set($any($event.target).value)"
                      >
                        <option value="">None</option>
                        @for (a of assetOptions(); track a.id) {
                          <option [value]="a.id">{{ a.original_filename || a.id.slice(0, 8) }}{{ a.album ? ' · ' + a.album : '' }}</option>
                        }
                      </select>
                      @if (canManage() && coverAssetDraft()) {
                        <button type="button" class="btn-secondary btn-sm" (click)="coverAssetDraft.set('')">Clear</button>
                      }
                    </div>
                  </div>
                </div>

                @if (canManage()) {
                  <div class="actions">
                    <button type="button" class="btn-primary" data-testid="save-location-media" (click)="saveMedia()" [disabled]="busy()">
                      Save photos
                    </button>
                  </div>
                }
              </div>
            }
            @case ('hours') {
              <div class="card" data-testid="tab-hours">
                <h2>Weekly opening hours</h2>
                <p class="meta">Times are local to {{ p.timezone }}. Saving sets all seven days.</p>
                @for (day of hoursDraft(); track day.weekday) {
                  <div class="row hours-row">
                    <strong class="day">{{ weekdayLabels[day.weekday] }}</strong>
                    @if (!hoursConfigured(day.weekday)) {
                      <span class="badge badge--neutral">not set</span>
                    }
                    <label class="inline"><input type="checkbox" [checked]="day.is_closed" [disabled]="!canManage()" (change)="setHour(day.weekday, 'is_closed', $any($event.target).checked)" /> Closed</label>
                    @if (!day.is_closed) {
                      <input type="time" aria-label="Opens" [value]="day.opens_at ?? ''" [disabled]="!canManage()" (input)="setHour(day.weekday, 'opens_at', $any($event.target).value)" />
                      <span>to</span>
                      <input type="time" aria-label="Closes" [value]="day.closes_at ?? ''" [disabled]="!canManage()" (input)="setHour(day.weekday, 'closes_at', $any($event.target).value)" />
                    }
                  </div>
                }
                @if (canManage()) {
                  <div class="actions"><button type="button" class="btn-primary" (click)="saveHours()" [disabled]="busy()">Save hours</button></div>
                }

                <div class="section-head spaced">
                  <h2>Holidays &amp; special hours</h2>
                  @if (canManage()) {
                    <div class="section-head__actions">
                      <button type="button" class="btn-primary btn-sm" (click)="addHoliday()">+ Add holiday</button>
                      <button type="button" class="btn-primary btn-sm" (click)="saveHolidays()" [disabled]="busy()">Save holidays</button>
                    </div>
                  }
                </div>
                @if (holidaysDraft().length === 0) {
                  <p class="meta">No holidays scheduled.</p>
                }
                @for (h of holidaysDraft(); track $index) {
                  <div class="row">
                    <input type="date" aria-label="Holiday date" [min]="minToday" [value]="h.date" [disabled]="!canManage()" (input)="setHoliday($index, 'date', $any($event.target).value)" />
                    <input type="text" aria-label="Holiday label" placeholder="Label" [value]="h.label" [disabled]="!canManage()" (input)="setHoliday($index, 'label', $any($event.target).value)" />
                    <label class="inline"><input type="checkbox" [checked]="h.is_closed" [disabled]="!canManage()" (change)="setHoliday($index, 'is_closed', $any($event.target).checked)" /> Closed</label>
                    @if (!h.is_closed) {
                      <input type="time" aria-label="Special opens" [value]="h.opens_at ?? ''" [disabled]="!canManage()" (input)="setHoliday($index, 'opens_at', $any($event.target).value)" />
                      <input type="time" aria-label="Special closes" [value]="h.closes_at ?? ''" [disabled]="!canManage()" (input)="setHoliday($index, 'closes_at', $any($event.target).value)" />
                    }
                    @if (canManage()) {
                      <button type="button" class="btn-danger action-icon-btn danger" (click)="removeHoliday($index)" aria-label="Remove holiday" title="Remove holiday">
                        <ui-icon name="trash" [size]="15" />
                        <span class="sr-only">Remove</span>
                      </button>
                    }
                  </div>
                }
              </div>
            }
            @case ('categories') {
              <div class="card cat-tab" data-testid="tab-categories">
                <div class="cat-block">
                  <div class="section-head">
                    <div>
                      <h2>Categories</h2>
                      <p class="meta">Set your primary business category and up to 9 secondary categories.</p>
                    </div>
                    @if (canManage()) {
                      <button type="button" class="btn-primary btn-sm" (click)="saveCategories()" [disabled]="busy()">Save categories</button>
                    }
                  </div>
                  <div class="cat-grid">
                    <label class="cat-field">
                      <span>Primary category</span>
                      <input type="text" placeholder="e.g. Restaurant" [value]="primaryDraft()" [disabled]="!canManage()" (input)="primaryDraft.set($any($event.target).value)" />
                    </label>

                    <div class="cat-field">
                      <span class="cat-field__label">Secondary categories</span>
                      @if (canManage()) {
                        <form class="cat-secondary-form" (submit)="addSecondary($event)">
                          <input type="text" placeholder="Add a secondary category" aria-label="Secondary category" [value]="secondaryInput()" (input)="secondaryInput.set($any($event.target).value)" />
                          <button type="submit" class="btn-primary btn-sm" [disabled]="!secondaryInput().trim() || secondaryDraft().length >= 9">+ Add</button>
                        </form>
                      }
                      <div class="chips">
                        @for (c of secondaryDraft(); track c) {
                          <span class="chip">{{ c }} @if (canManage()) {<button type="button" [attr.aria-label]="'Remove ' + c" (click)="removeSecondary(c)">×</button>}</span>
                        }
                        @if (secondaryDraft().length === 0) {
                          <span class="meta">No secondary categories.</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <div class="add-section attr-block">
                  <div class="section-head">
                    <div>
                      <h2>Attributes</h2>
                      <p class="meta">Highlight key business features (e.g. wifi: yes, parking: available).</p>
                    </div>
                    @if (canManage()) {
                      <div class="section-head__actions">
                        <button type="button" class="btn-primary btn-sm" (click)="addAttribute()" [disabled]="attributesDraft().length >= 30">+ Add attribute</button>
                        @if (showSaveAttributes()) {
                          <button type="button" class="btn-primary btn-sm" (click)="saveCategories()" [disabled]="busy()">Save attributes</button>
                        }
                      </div>
                    }
                  </div>
                  @if (attributesDraft().length === 0) {
                    <p class="meta">No attributes yet. Click "+ Add attribute" to add one.</p>
                  } @else {
                    <div class="attr-list">
                      @for (a of attributesDraft(); track $index) {
                        <div class="attr-row">
                          <input type="text" aria-label="Attribute key" placeholder="Key (e.g. wifi)" [value]="a.key" [disabled]="!canManage()" (input)="setAttribute($index, 'key', $any($event.target).value)" />
                          <input type="text" aria-label="Attribute value" placeholder="Value (e.g. yes)" [value]="a.value" [disabled]="!canManage()" (input)="setAttribute($index, 'value', $any($event.target).value)" />
                          @if (canManage()) {
                            <button type="button" class="btn-danger action-icon-btn danger" (click)="removeAttribute($index)" aria-label="Remove attribute" title="Remove attribute">
                              <ui-icon name="trash" [size]="15" />
                              <span class="sr-only">Remove</span>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
            @case ('areas') {
              <div class="card" data-testid="tab-areas">
                <div class="section-head">
                  <div>
                    <h2>Service areas</h2>
                    <p class="meta">Where you serve customers — pincodes (6 digits), localities or cities.</p>
                  </div>
                  @if (canManage()) {
                    <button type="button" class="btn-primary btn-sm" (click)="addArea()" [disabled]="areasDraft().length >= 100">+ Add area</button>
                  }
                </div>
                @for (a of areasDraft(); track $index) {
                  <div class="row">
                    <select aria-label="Area type" [value]="a.area_type" [disabled]="!canManage()" (change)="setArea($index, 'area_type', $any($event.target).value)">
                      <option value="pincode">Pincode</option>
                      <option value="locality">Locality</option>
                      <option value="city">City</option>
                    </select>
                    <input type="text" aria-label="Area name" [value]="a.area_name" [disabled]="!canManage()" (input)="setArea($index, 'area_name', $any($event.target).value)" />
                    @if (canManage()) {
                      <div class="row-actions">
                        <button type="button" class="btn-danger action-icon-btn danger" (click)="removeArea($index)" aria-label="Remove service area" title="Remove service area">
                          <ui-icon name="trash" [size]="15" />
                          <span class="sr-only">Remove</span>
                        </button>
                        <button type="button" class="btn-primary btn-sm" (click)="saveAreas()" [disabled]="busy()">Save service areas</button>
                      </div>
                    }
                  </div>
                }
                @if (areasDraft().length === 0) {
                  <p class="meta">No service areas yet.</p>
                }
              </div>
            }
            @case ('services') {
              <div class="card" data-testid="tab-services">
                @if (canManage()) {
                  <div class="add-section" data-testid="services-add-section">
                    <h2>{{ editingServiceId() ? 'Edit service' : 'Add a service' }}</h2>
                    <form class="svc-form" [formGroup]="serviceForm" (ngSubmit)="saveService()" novalidate data-testid="service-form">
                      <div class="svc-form__head">
                        <strong class="svc-form__title">{{ editingServiceId() ? 'Edit service details' : 'New service details' }}</strong>
                        <label class="inline"><input type="checkbox" formControlName="is_active" /> Visible</label>
                      </div>
                      <div class="svc-form__grid">
                        <label class="svc-field">
                          <span>Name</span>
                          <input type="text" formControlName="name" placeholder="e.g. Chettinad Thali" aria-label="Service name" />
                        </label>
                        <label class="svc-field">
                          <span>Description</span>
                          <input type="text" formControlName="description" placeholder="Short description (optional)" aria-label="Service description" />
                        </label>
                        <label class="svc-field">
                          <span>Price</span>
                          <input type="text" formControlName="price" placeholder="499.00" aria-label="Service price" inputmode="decimal" />
                        </label>
                        <label class="svc-field">
                          <span>Minutes</span>
                          <input type="text" formControlName="duration_minutes" placeholder="30" aria-label="Duration in minutes" inputmode="numeric" />
                        </label>
                      </div>
                      <div class="svc-form__footer">
                        <div class="svc-form__btns">
                          @if (editingServiceId()) {
                            <button type="button" class="btn-secondary btn-sm" (click)="cancelServiceEdit()">Cancel</button>
                          }
                          <button type="submit" class="btn-primary btn-sm" [disabled]="busy() || serviceForm.invalid">{{ editingServiceId() ? 'Save service' : '+ Add service' }}</button>
                        </div>
                      </div>
                    </form>
                  </div>
                }

                <div class="section-head spaced">
                  <h2>Services catalog &amp; prices</h2>
                  <span class="meta">{{ services().length }} service(s)</span>
                </div>

                @if (servicesLoading()) {
                  <app-skeleton-loader [rows]="3" />
                } @else if (services().length === 0) {
                  <app-empty-state icon="content" title="No services listed" message="Add what you offer, with prices, so it can be used in posts and replies." />
                } @else {
                  <div class="table-wrap">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th><ui-sort-header label="Service" [active]="servicesSortCol() === 'name'" [direction]="servicesSortDir()" (sort)="toggleServicesSort('name')" /></th>
                          <th class="col-nowrap"><ui-sort-header label="Duration" [active]="servicesSortCol() === 'duration'" [direction]="servicesSortDir()" (sort)="toggleServicesSort('duration')" /></th>
                          <th class="col-nowrap"><ui-sort-header label="Price" [active]="servicesSortCol() === 'price'" [direction]="servicesSortDir()" (sort)="toggleServicesSort('price')" /></th>
                          <th class="col-nowrap"><ui-sort-header label="Status" [active]="servicesSortCol() === 'is_active'" [direction]="servicesSortDir()" (sort)="toggleServicesSort('is_active')" /></th>
                          <th class="col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (s of pagedServices(); track s.id) {
                          <tr>
                            <td class="cell-service">
                              <strong>{{ s.name }}</strong>
                              @if (s.description) {
                                <div class="meta cell-desc">{{ s.description }}</div>
                              }
                            </td>
                            <td class="col-nowrap">{{ s.duration_minutes ? s.duration_minutes + ' min' : '—' }}</td>
                            <td class="col-nowrap cell-price">{{ s.price ? s.currency + ' ' + s.price : '—' }}</td>
                            <td class="col-nowrap">
                              <span class="badge badge--dot" [class]="s.is_active ? 'badge--success' : 'badge--neutral'">
                                {{ s.is_active ? 'active' : 'hidden' }}
                              </span>
                            </td>
                            <td class="col-actions">
                              @if (canManage()) {
                                <div class="row-actions">
                                  <button type="button" class="btn-secondary action-icon-btn" (click)="editService(s)" [attr.aria-label]="'Edit ' + s.name" title="Edit service">
                                    <ui-icon name="edit" [size]="15" />
                                    <span class="sr-only">Edit</span>
                                  </button>
                                  <button type="button" class="btn-danger action-icon-btn danger" (click)="deleteService(s)" [disabled]="busy()" [attr.aria-label]="'Delete ' + s.name" title="Delete service">
                                    <ui-icon name="trash" [size]="15" />
                                    <span class="sr-only">Delete</span>
                                  </button>
                                </div>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <app-pagination
                    [totalItems]="services().length"
                    [currentPage]="servicesPage()"
                    [pageSize]="servicesPageSize()"
                    (pageChange)="servicesPage.set($event)"
                    (pageSizeChange)="servicesPageSize.set($event)"
                  />
                }
              </div>
            }
            @case ('history') {
              <div class="card" data-testid="tab-history">
                <h2>Change history</h2>
                @if (historyLoading()) {
                  <app-skeleton-loader [rows]="4" />
                } @else if (history().length === 0) {
                  <app-empty-state icon="business" title="No changes recorded yet" message="Edits to this location will appear here with who made them." />
                } @else {
                  <div class="table-wrap">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th class="col-nowrap"><ui-sort-header label="When" [active]="historySortCol() === 'created_at'" [direction]="historySortDir()" (sort)="toggleHistorySort('created_at')" /></th>
                          <th class="col-nowrap"><ui-sort-header label="Who" [active]="historySortCol() === 'actor_name'" [direction]="historySortDir()" (sort)="toggleHistorySort('actor_name')" /></th>
                          <th><ui-sort-header label="Change" [active]="historySortCol() === 'action'" [direction]="historySortDir()" (sort)="toggleHistorySort('action')" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (e of pagedHistory(); track e.id) {
                          <tr>
                            <td class="col-nowrap meta">{{ e.created_at | date: 'medium' }}</td>
                            <td class="col-nowrap"><strong>{{ e.actor_name || 'System' }}</strong></td>
                            <td>{{ actionLabel(e) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <app-pagination
                    [totalItems]="history().length"
                    [currentPage]="historyPage()"
                    [pageSize]="historyPageSize()"
                    (pageChange)="historyPage.set($event)"
                    (pageSizeChange)="historyPageSize.set($event)"
                  />
                  <app-pagination
                    [totalItems]="services().length"
                    [currentPage]="servicesPage()"
                    [pageSize]="servicesPageSize()"
                    (pageChange)="servicesPage.set($event)"
                    (pageSizeChange)="servicesPageSize.set($event)"
                  />
                }
              </div>
            }
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .bp {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .bp input[type='text'],
      .bp input[type='url'],
      .bp input[type='date'],
      .bp input[type='time'],
      .bp select {
        height: 36px;
        padding: 0.35rem 0.65rem;
        font-size: var(--text-sm);
        box-sizing: border-box;
      }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        margin-bottom: var(--space-3);
      }
      .section-head.spaced {
        margin-top: var(--space-6);
      }
      .section-head h2 {
        margin: 0;
      }
      .actions--end {
        justify-content: flex-end;
      }
      .action-icon-btn {
        width: 30px;
        height: 30px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .loc-picker {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
      }
      .loc-picker select {
        min-width: 240px;
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-3);
      }
      .tabs button {
        border-radius: 999px;
      }
      .tabs button.active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .section-head__actions {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .cat-tab {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .cat-block {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .cat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
        align-items: start;
      }
      @media (max-width: 720px) {
        .cat-grid {
          grid-template-columns: 1fr;
        }
      }
      .cat-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .cat-field__label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .cat-field input {
        width: 100%;
        height: 36px;
        box-sizing: border-box;
      }
      .cat-secondary-form {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .cat-secondary-form input {
        flex: 1;
        min-width: 0;
        height: 36px;
      }
      .cat-secondary-form button {
        height: 36px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .attr-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .attr-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 30px;
        gap: var(--space-2);
        align-items: center;
      }
      @media (max-width: 560px) {
        .attr-row {
          grid-template-columns: 1fr 1fr 30px;
        }
      }
      .alert {
        margin: 0 0 var(--space-4);
        padding: 0.7rem 0.95rem;
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
      }
      .alert--success {
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        color: var(--color-success);
      }
      .alert--error {
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        font-size: var(--text-sm);
      }
      .card h2 {
        margin: 0 0 var(--space-3);
        font-size: var(--text-lg);
      }
      .card h2.spaced {
        margin-top: var(--space-6);
      }
      .grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .grid-2 label,
      .loc-picker label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
      }
      .grid-2 input {
        width: 100%;
        box-sizing: border-box;
      }
      @media (max-width: 700px) {
        .grid-2 {
          grid-template-columns: 1fr;
        }
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--color-border);
      }
      .row .grow {
        flex: 1 1 220px;
        display: flex;
        flex-direction: column;
      }
      .hours-row .day {
        width: 96px;
      }
      .inline {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: normal;
      }
      .actions,
      .inline-form,
      .svc-form {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-3);
      }
      .btn-primary {
        background: var(--color-primary);
        border: 1px solid var(--color-primary);
        color: var(--color-primary-contrast, #ffffff);
        box-shadow: 0 1px 2px rgba(7, 141, 126, 0.2);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.38rem;
        font-weight: var(--font-semibold);
      }
      .btn-primary:hover:not(:disabled) {
        background: var(--color-primary-hover);
        border-color: var(--color-primary-hover);
        color: var(--color-primary-contrast, #ffffff);
        box-shadow: 0 2px 6px rgba(7, 141, 126, 0.28);
      }
      .btn-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .add-section {
        margin-bottom: var(--space-4);
      }
      .add-section h2 {
        margin: 0 0 var(--space-2);
      }
      .add-section .svc-form {
        margin-top: var(--space-2);
      }
      .inline-form {
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .inline-form input {
        flex: 1 1 180px;
      }
      .svc-form {
        margin-top: var(--space-4);
        padding: 0.9rem 1rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.65rem;
      }
      .svc-form__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .svc-form__title {
        font-size: var(--text-sm);
        color: var(--color-text);
      }
      .svc-form__grid {
        display: grid;
        grid-template-columns: minmax(160px, 1.4fr) minmax(180px, 2fr) 115px 95px;
        gap: 0.6rem;
        align-items: end;
      }
      @media (max-width: 760px) {
        .svc-form__grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      .svc-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text-muted);
      }
      .svc-field input {
        width: 100%;
      }
      .svc-form__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .svc-form__btns {
        display: flex;
        gap: var(--space-2);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: var(--space-3) 0;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 999px;
        padding: 2px 10px;
        background: var(--color-primary-light);
        font-size: var(--text-sm);
      }
      .chip button {
        border: 0;
        background: transparent;
        padding: 0 2px;
        cursor: pointer;
        line-height: 1;
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      .data-table thead th {
        background: var(--color-surface-alt);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0.65rem 0.9rem;
        border-bottom: 1px solid var(--color-border);
        text-align: center;
      }
      .data-table tbody td {
        padding: 0.75rem 0.9rem;
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
        color: var(--color-text);
        text-align: center;
      }
      .data-table tbody tr:last-child td {
        border-bottom: none;
      }
      .data-table tbody tr:hover {
        background: var(--color-surface-alt);
      }
      .col-nowrap {
        white-space: nowrap;
      }
      .col-actions {
        width: 1%;
        white-space: nowrap;
        text-align: center !important;
      }
      .cell-service strong {
        color: var(--color-text);
      }
      .cell-desc {
        margin-top: 2px;
        font-size: var(--text-xs);
      }
      .cell-price {
        font-weight: var(--font-semibold);
        font-variant-numeric: tabular-nums;
      }
      .row-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }
      .danger {
        color: var(--color-danger, #b42318);
      }
      .meta {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }
      .bulk-import {
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .bulk-import__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .bulk-import__tools {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .file-btn {
        display: inline-flex;
        align-items: center;
        padding: 0.45rem 0.85rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border-strong);
        background: var(--color-surface);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        cursor: pointer;
      }
      .file-btn input[type='file'] {
        display: none;
      }
      .bulk-import textarea {
        width: 100%;
        font-family: var(--font-mono);
        font-size: var(--text-xs);
      }
      .bulk-result {
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        font-size: var(--text-sm);
      }
      .bulk-result p {
        margin: 0;
      }
      .bulk-errors {
        margin: var(--space-2) 0 0;
        padding-left: 1.2rem;
        color: var(--color-danger);
      }
      .media-card {
        margin-top: var(--space-4);
      }
      .media-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--space-4);
        margin-top: var(--space-3);
      }
      .media-slot {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .media-slot__label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--color-text);
      }
      .media-preview {
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .media-preview--logo {
        width: 112px;
        height: 112px;
      }
      .media-preview--cover {
        width: 100%;
        height: 112px;
      }
      .media-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .media-controls {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .media-controls select {
        flex: 1;
        min-width: 0;
      }
    `,
  ],
})
export class BusinessProfileComponent implements OnInit {
  readonly minToday = localTodayDateString();
  readonly tabs = TABS;
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly tenantId = computed(() => this.currentTenant.selectedTenantId() ?? '');
  readonly canManage = computed(() => {
    const role = this.currentTenant.tenant()?.caller_role;
    return role === 'owner' || role === 'admin';
  });

  readonly tab = signal<ProfileTab>('details');
  readonly locations = signal<LocationSummary[]>([]);
  readonly loadingLocations = signal(true);
  readonly selectedId = signal('');
  readonly profile = signal<LocationProfile | null>(null);
  readonly profileLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly fieldErrorEntries = computed(() => Object.entries(this.fieldErrors() ?? {}));

  // details
  private readonly fb = new FormBuilder();
  readonly detailsForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    category: [''],
    phone: [''],
    website: [''],
    line1: [''],
    line2: [''],
    city: [''],
    state: [''],
    postal_code: [''],
    country: [''],
    timezone: ['Asia/Kolkata', [Validators.required]],
    lat: [''],
    lng: [''],
  });

  // hours / holidays
  readonly hoursDraft = signal<LocationHoursRequestDay[]>([]);
  readonly holidaysDraft = signal<LocationHoliday[]>([]);

  // categories / attributes
  readonly primaryDraft = signal('');
  readonly secondaryDraft = signal<string[]>([]);
  readonly secondaryInput = signal('');
  readonly attributesDraft = signal<{ key: string; value: string }[]>([]);

  // service areas
  readonly areasDraft = signal<LocationServiceArea[]>([]);

  // services
  readonly services = signal<ServiceItem[]>([]);
  readonly servicesPage = signal(1);
  readonly servicesPageSize = signal(10);
  readonly servicesSortCol = signal<string>('');
  readonly servicesSortDir = signal<SortDirection>('asc');

  toggleServicesSort(col: string): void {
    if (this.servicesSortCol() === col) {
      this.servicesSortDir.set(this.servicesSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.servicesSortCol.set(col);
      this.servicesSortDir.set('asc');
    }
  }

  readonly sortedServices = computed(() =>
    sortTableRows(this.services(), this.servicesSortCol(), this.servicesSortDir(), (s, col) => {
      switch (col) {
        case 'name':
          return s.name;
        case 'duration':
          return s.duration_minutes ?? 0;
        case 'price':
          return s.price ? Number(s.price) : 0;
        case 'is_active':
          return s.is_active;
        default:
          return '';
      }
    }),
  );

  readonly pagedServices = computed(() => paginateItems(this.sortedServices(), this.servicesPage(), this.servicesPageSize()));
  readonly servicesLoading = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    price: ['', [Validators.pattern(/^\d{0,10}(\.\d{1,2})?$/)]],
    duration_minutes: ['', [Validators.pattern(/^\d{0,4}$/)]],
    is_active: [true],
  });

  // history
  readonly history = signal<LocationHistoryEvent[]>([]);
  readonly historyPage = signal(1);
  readonly historyPageSize = signal(10);
  readonly historySortCol = signal<string>('');
  readonly historySortDir = signal<SortDirection>('asc');

  toggleHistorySort(col: string): void {
    if (this.historySortCol() === col) {
      this.historySortDir.set(this.historySortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.historySortCol.set(col);
      this.historySortDir.set('asc');
    }
  }

  readonly sortedHistory = computed(() =>
    sortTableRows(this.history(), this.historySortCol(), this.historySortDir(), (e, col) => {
      switch (col) {
        case 'created_at':
          return e.created_at;
        case 'actor_name':
          return e.actor_name || 'System';
        case 'action':
          return this.actionLabel(e);
        default:
          return '';
      }
    }),
  );

  readonly pagedHistory = computed(() => paginateItems(this.sortedHistory(), this.historyPage(), this.historyPageSize()));
  readonly historyLoading = signal(false);

  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBase = inject(API_BASE_URL);

  // media picker (logo & cover from Assets library)
  readonly assetOptions = signal<{ id: string; original_filename?: string | null; album?: string | null; download_url?: string | null }[]>([]);
  readonly logoAssetDraft = signal('');
  readonly coverAssetDraft = signal('');
  readonly selectedLogoPreviewUrl = computed(() => {
    const id = this.logoAssetDraft();
    if (!id) return null;
    const match = this.assetOptions().find((a) => a.id === id);
    return match?.download_url ?? (this.profile()?.logo_asset_id === id ? this.profile()?.logo_url ?? null : null);
  });
  readonly selectedCoverPreviewUrl = computed(() => {
    const id = this.coverAssetDraft();
    if (!id) return null;
    const match = this.assetOptions().find((a) => a.id === id);
    return match?.download_url ?? (this.profile()?.cover_asset_id === id ? this.profile()?.cover_url ?? null : null);
  });

  // locations tab
  readonly newLocationName = signal('');
  readonly newLocationCategory = signal('');
  readonly bulkCsvText = signal('');
  readonly bulkResult = signal<BulkImportLocationsResult | null>(null);

  private configuredDays = new Set<number>();

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly api: LocationApiService,
  ) {}

  ngOnInit(): void {
    this.loadLocations();
    this.loadAssetOptions();
  }

  private loadAssetOptions(): void {
    const tenantId = this.tenantId();
    if (!tenantId || !this.http) {
      return;
    }
    this.http
      .get<ApiSuccess<{ assets: { id: string; original_filename?: string | null; album?: string | null; download_url?: string | null }[] }>>(
        `${this.apiBase}/tenants/${encodeURIComponent(tenantId)}/assets?limit=100`,
      )
      .subscribe({
        next: (res) => this.assetOptions.set(res.data?.assets ?? []),
        error: () => this.assetOptions.set([]),
      });
  }

  saveMedia(): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api
      .setMedia(tenantId, locationId, {
        logo_asset_id: this.logoAssetDraft() || null,
        cover_asset_id: this.coverAssetDraft() || null,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.applyProfile(updated);
          this.message.set('Location photos updated.');
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.errorMessage.set(apiErrorMessage(err));
        },
      });
  }

  // --- loading -------------------------------------------------------------

  private loadLocations(selectId?: string): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      this.loadingLocations.set(false);
      return;
    }
    this.loadingLocations.set(true);
    this.api.list(tenantId).subscribe({
      next: (locations) => {
        this.loadingLocations.set(false);
        this.locations.set(locations);
        const keep = selectId ?? (locations.some((l) => l.id === this.selectedId()) ? this.selectedId() : locations[0]?.id ?? '');
        if (keep) {
          this.selectLocation(keep);
        } else {
          this.selectedId.set('');
          this.profile.set(null);
        }
      },
      error: (err: unknown) => {
        this.loadingLocations.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  selectLocation(locationId: string): void {
    this.selectedId.set(locationId);
    this.loadProfile();
  }

  openTab(tab: ProfileTab): void {
    this.tab.set(tab);
    this.clearMessages();
    if (tab === 'services') {
      this.loadServices();
    } else if (tab === 'history') {
      this.loadHistory();
    }
  }

  private loadProfile(): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId) {
      return;
    }
    this.profileLoading.set(true);
    this.loadError.set(null);
    this.api.get(tenantId, locationId).subscribe({
      next: (profile) => {
        this.profileLoading.set(false);
        this.applyProfile(profile);
        if (this.tab() === 'services') {
          this.loadServices();
        } else if (this.tab() === 'history') {
          this.loadHistory();
        }
      },
      error: (err: unknown) => {
        this.profileLoading.set(false);
        this.loadError.set(apiErrorMessage(err));
      },
    });
  }

  private applyProfile(profile: LocationProfile): void {
    this.profile.set(profile);
    this.resetDetailsFrom(profile);

    this.configuredDays = new Set(profile.hours.filter((h) => h.configured).map((h) => h.weekday));
    this.hoursDraft.set(
      profile.hours.map((h) => ({
        weekday: h.weekday,
        is_closed: h.configured ? h.is_closed : false,
        opens_at: h.configured ? h.opens_at : '09:00',
        closes_at: h.configured ? h.closes_at : '18:00',
      })),
    );
    this.holidaysDraft.set(profile.holidays.map((h) => ({ ...h })));
    this.primaryDraft.set(profile.category ?? '');
    this.secondaryDraft.set([...profile.secondary_categories]);
    this.attributesDraft.set(Object.entries(profile.attributes).map(([key, value]) => ({ key, value })));
    this.areasDraft.set(profile.service_areas.map((a) => ({ ...a })));
    this.logoAssetDraft.set(profile.logo_asset_id ?? '');
    this.coverAssetDraft.set(profile.cover_asset_id ?? '');
  }

  private loadServices(): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId) {
      return;
    }
    this.servicesLoading.set(true);
    this.api.listServices(tenantId, locationId).subscribe({
      next: (services) => {
        this.servicesLoading.set(false);
        this.services.set(services);
      },
      error: (err: unknown) => {
        this.servicesLoading.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  private loadHistory(): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId) {
      return;
    }
    this.historyLoading.set(true);
    this.api.history(tenantId, locationId).subscribe({
      next: (events) => {
        this.historyLoading.set(false);
        this.history.set(events);
      },
      error: (err: unknown) => {
        this.historyLoading.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  // --- shared write plumbing -----------------------------------------------

  private clearMessages(): void {
    this.message.set(null);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
  }

  /** Runs a write, applying the returned profile and surfacing the real server error on failure. */
  private write(call: (tenantId: string, locationId: string) => import('rxjs').Observable<LocationProfile>, success: string): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    call(tenantId, locationId).subscribe({
      next: (profile) => {
        this.busy.set(false);
        this.applyProfile(profile);
        this.message.set(success);
        this.locations.set(this.locations().map((l) => (l.id === profile.id ? { ...l, name: profile.name, category: profile.category } : l)));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }

  // --- details -------------------------------------------------------------

  private resetDetailsFrom(p: LocationProfile): void {
    this.detailsForm.reset({
      name: p.name,
      category: p.category ?? '',
      phone: p.phone ?? '',
      website: p.website ?? '',
      line1: p.address?.line1 ?? '',
      line2: p.address?.line2 ?? '',
      city: p.address?.city ?? '',
      state: p.address?.state ?? '',
      postal_code: p.address?.postal_code ?? '',
      country: p.address?.country ?? '',
      timezone: p.timezone,
      lat: p.lat ?? '',
      lng: p.lng ?? '',
    });
  }

  resetDetails(): void {
    const p = this.profile();
    if (p) {
      this.resetDetailsFrom(p);
    }
  }

  saveDetails(): void {
    if (this.detailsForm.invalid) {
      return;
    }
    const v = this.detailsForm.getRawValue();
    const address = {
      line1: v.line1,
      line2: v.line2,
      city: v.city,
      state: v.state,
      postal_code: v.postal_code,
      country: v.country,
    };
    const hasAddress = Object.values(address).some((x) => x.trim() !== '');
    this.write(
      (t, l) =>
        this.api.update(t, l, {
          name: v.name.trim(),
          category: v.category.trim() || null,
          phone: v.phone.trim() || null,
          website: v.website.trim() || null,
          timezone: v.timezone.trim(),
          lat: v.lat.trim() || null,
          lng: v.lng.trim() || null,
          address: hasAddress ? address : null,
        }),
      'Business details saved.',
    );
  }

  // --- hours & holidays ----------------------------------------------------

  hoursConfigured(weekday: number): boolean {
    return this.configuredDays.has(weekday);
  }

  setHour(weekday: number, field: 'is_closed' | 'opens_at' | 'closes_at', value: boolean | string): void {
    this.hoursDraft.set(this.hoursDraft().map((d) => (d.weekday === weekday ? { ...d, [field]: value } : d)));
  }

  saveHours(): void {
    const hours = this.hoursDraft().map((d) =>
      d.is_closed ? { weekday: d.weekday, is_closed: true } : { weekday: d.weekday, is_closed: false, opens_at: d.opens_at, closes_at: d.closes_at },
    );
    this.write((t, l) => this.api.setHours(t, l, hours), 'Business hours saved.');
  }

  addHoliday(): void {
    this.holidaysDraft.set([{ date: '', label: '', is_closed: true, opens_at: null, closes_at: null }, ...this.holidaysDraft()]);
  }

  setHoliday(index: number, field: keyof LocationHoliday, value: boolean | string): void {
    this.holidaysDraft.set(this.holidaysDraft().map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  removeHoliday(index: number): void {
    const current = this.holidaysDraft();
    const removed = current[index];
    const next = current.filter((_, i) => i !== index);
    this.holidaysDraft.set(next);
    if (removed?.date && next.every((h) => h.date.trim() !== '')) {
      const holidays = next.map((h) => ({
        ...h,
        opens_at: h.is_closed ? null : h.opens_at,
        closes_at: h.is_closed ? null : h.closes_at,
      }));
      this.write((t, l) => this.api.setHolidays(t, l, holidays), 'Holiday deleted.');
    } else {
      this.message.set('Holiday removed.');
    }
  }

  saveHolidays(): void {
    const holidays = this.holidaysDraft().map((h) => ({
      ...h,
      opens_at: h.is_closed ? null : h.opens_at,
      closes_at: h.is_closed ? null : h.closes_at,
    }));
    this.write((t, l) => this.api.setHolidays(t, l, holidays), 'Holiday schedule saved.');
  }

  // --- categories & attributes --------------------------------------------

  addSecondary(event: Event): void {
    event.preventDefault();
    const value = this.secondaryInput().trim();
    if (value && !this.secondaryDraft().includes(value)) {
      this.secondaryDraft.set([...this.secondaryDraft(), value]);
    }
    this.secondaryInput.set('');
  }

  removeSecondary(category: string): void {
    this.secondaryDraft.set(this.secondaryDraft().filter((c) => c !== category));
  }

  readonly showSaveAttributes = signal(false);

  addAttribute(): void {
    this.attributesDraft.set([{ key: '', value: '' }, ...this.attributesDraft()]);
    this.showSaveAttributes.set(true);
  }

  setAttribute(index: number, field: 'key' | 'value', value: string): void {
    this.attributesDraft.set(this.attributesDraft().map((a, i) => (i === index ? { ...a, [field]: value } : a)));
    this.showSaveAttributes.set(true);
  }

  removeAttribute(index: number): void {
    const current = this.attributesDraft();
    const removed = current[index];
    const next = current.filter((_, i) => i !== index);
    this.attributesDraft.set(next);
    if (removed?.key.trim()) {
      const attributes: Record<string, string> = {};
      for (const a of next) {
        if (a.key.trim() || a.value.trim()) {
          attributes[a.key.trim()] = a.value.trim();
        }
      }
      const primary = this.primaryDraft().trim();
      this.write(
        (t, l) =>
          this.api.setCategories(t, l, {
            ...(primary ? { primary_category: primary } : {}),
            categories: this.secondaryDraft(),
            attributes,
          }),
        'Attribute deleted.',
      );
    } else {
      this.message.set('Attribute removed.');
    }
  }

  saveCategories(): void {
    this.showSaveAttributes.set(false);
    const attributes: Record<string, string> = {};
    for (const a of this.attributesDraft()) {
      if (a.key.trim() || a.value.trim()) {
        attributes[a.key.trim()] = a.value.trim();
      }
    }
    const primary = this.primaryDraft().trim();
    this.write(
      (t, l) =>
        this.api.setCategories(t, l, {
          ...(primary ? { primary_category: primary } : {}),
          categories: this.secondaryDraft(),
          attributes,
        }),
      'Categories and attributes saved.',
    );
  }

  // --- service areas -------------------------------------------------------

  addArea(): void {
    this.areasDraft.set([{ area_type: 'locality', area_name: '' }, ...this.areasDraft()]);
  }

  setArea(index: number, field: 'area_type' | 'area_name', value: string): void {
    this.areasDraft.set(this.areasDraft().map((a, i) => (i === index ? ({ ...a, [field]: value } as LocationServiceArea) : a)));
  }

  removeArea(index: number): void {
    const current = this.areasDraft();
    const removed = current[index];
    const next = current.filter((_, i) => i !== index);
    this.areasDraft.set(next);
    if (removed?.area_name.trim() && next.every((a) => a.area_name.trim() !== '')) {
      this.write((t, l) => this.api.setServiceAreas(t, l, next), 'Service area deleted.');
    } else {
      this.message.set('Service area removed.');
    }
  }

  saveAreas(): void {
    this.write((t, l) => this.api.setServiceAreas(t, l, this.areasDraft()), 'Service areas saved.');
  }

  // --- services ------------------------------------------------------------

  editService(service: ServiceItem): void {
    this.editingServiceId.set(service.id);
    this.serviceForm.reset({
      name: service.name,
      description: service.description ?? '',
      price: service.price ?? '',
      duration_minutes: service.duration_minutes ? String(service.duration_minutes) : '',
      is_active: service.is_active,
    });
  }

  cancelServiceEdit(): void {
    this.editingServiceId.set(null);
    this.serviceForm.reset({ name: '', description: '', price: '', duration_minutes: '', is_active: true });
  }

  saveService(): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId || this.busy() || this.serviceForm.invalid) {
      return;
    }
    const v = this.serviceForm.getRawValue();
    const payload = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      price: v.price.trim() || null,
      duration_minutes: v.duration_minutes.trim() ? Number(v.duration_minutes) : null,
      is_active: v.is_active,
    };
    const editing = this.editingServiceId();
    this.busy.set(true);
    this.clearMessages();
    const request = editing
      ? this.api.updateService(tenantId, locationId, editing, payload)
      : this.api.createService(tenantId, locationId, payload);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set(editing ? 'Service updated.' : 'Service added.');
        this.cancelServiceEdit();
        this.loadServices();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  deleteService(service: ServiceItem): void {
    const tenantId = this.tenantId();
    const locationId = this.selectedId();
    if (!tenantId || !locationId || this.busy()) {
      return;
    }
    if (!confirmDelete(service.name || 'this service')) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api.deleteService(tenantId, locationId, service.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('Service removed.');
        this.loadServices();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  // --- locations -----------------------------------------------------------

  addLocation(event: Event): void {
    event.preventDefault();
    const tenantId = this.tenantId();
    const name = this.newLocationName().trim();
    if (!tenantId || !name || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    const category = this.newLocationCategory().trim();
    this.api.create(tenantId, { name, ...(category ? { category } : {}) }).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.newLocationName.set('');
        this.newLocationCategory.set('');
        this.message.set(`Location "${created.name}" added.`);
        this.loadLocations(created.id);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  archiveLocation(location: LocationSummary): void {
    const tenantId = this.tenantId();
    if (!tenantId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api.archive(tenantId, location.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set(`Location "${location.name}" archived.`);
        this.loadLocations();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  loadSampleCsv(): void {
    this.bulkCsvText.set(
      [
        'name,category,phone,city,state,postal_code,country',
        'Anna Nagar Branch,South Indian Restaurant,+91 98400 11223,Chennai,Tamil Nadu,600040,IN',
        'Velachery Express,South Indian Restaurant,+91 98400 44556,Chennai,Tamil Nadu,600042,IN',
      ].join('\n'),
    );
    this.bulkResult.set(null);
  }

  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.bulkCsvText.set(typeof reader.result === 'string' ? reader.result : '');
      this.bulkResult.set(null);
    };
    reader.readAsText(file);
    input.value = '';
  }

  submitBulkImport(): void {
    const tenantId = this.tenantId();
    const csv = this.bulkCsvText().trim();
    if (!tenantId || !csv || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.bulkResult.set(null);
    this.api.bulkImport(tenantId, csv).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.bulkResult.set(result);
        this.message.set(`Imported ${result.created_count} location${result.created_count === 1 ? '' : 's'}.`);
        if (result.created_count > 0) {
          this.loadLocations();
        }
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(apiErrorMessage(err));
      },
    });
  }

  // --- history -------------------------------------------------------------

  actionLabel(event: LocationHistoryEvent): string {
    const base = ACTION_LABELS[event.action] ?? event.action;
    const detail = event.after?.['service'] ?? event.before?.['service'] ?? event.after?.['name'];
    return typeof detail === 'string' && detail ? `${base}: ${detail}` : base;
  }
}
