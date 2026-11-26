import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Asset, AssetAlbum } from '../../core/assets/asset.models';
import { AssetService } from '../../core/assets/asset.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorCode, apiErrorMessage } from '../../core/http/error.util';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

/**
 * `/app/:tenantId/assets` — M03 Searchable Asset Library with Albums, Tags,
 * and native `multipart/form-data` uploads.
 */
@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, EmptyStateComponent, SkeletonLoaderComponent, IconComponent],
  template: `
    <section class="assets">
      <div class="topbar-row">
        <app-page-header
          eyebrow="Media"
          eyebrowLabel="M03 Asset Library"
          title="Asset library"
          subtitle="Upload via multipart form-data, organize into albums, tag, and search your business media."
        />
        <span class="badge badge--info">{{ assets().length }} {{ assets().length === 1 ? 'asset' : 'assets' }}</span>
      </div>

      @if (!tenant()) {
        <p class="form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        @if (canManage()) {
          <section class="card upload-card">
            <div class="upload-row">
              <label class="field">
                <span>Album <small class="muted">(optional)</small></span>
                <input
                  type="text"
                  list="suggested-albums"
                  [(ngModel)]="uploadAlbum"
                  placeholder="e.g. Menu, Storefront, Promos"
                />
                <datalist id="suggested-albums">
                  <option value="Menu"></option>
                  <option value="Storefront"></option>
                  <option value="Team"></option>
                  <option value="Promos"></option>
                  <option value="Logo"></option>
                  @for (alb of albums(); track alb.name) {
                    <option [value]="alb.name"></option>
                  }
                </datalist>
              </label>

              <label class="field">
                <span>Tags <small class="muted">(comma-separated)</small></span>
                <input type="text" [(ngModel)]="uploadTags" placeholder="e.g. hero, diwali, food" />
              </label>

              <label class="field file-field">
                <span>Select image (PNG, JPG, WebP, GIF)</span>
                <input
                  #fileInput
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  (change)="onFileSelected($event)"
                  [disabled]="uploading()"
                />
              </label>

              <button
                type="button"
                class="btn-primary upload-btn"
                (click)="uploadSelectedFile(fileInput)"
                [disabled]="!selectedFile() || uploading()"
              >
                {{ uploading() ? 'Uploading…' : 'Upload' }}
              </button>
            </div>
            @if (uploading()) {
              <p class="muted small">Uploading via multipart/form-data…</p>
            }
            @if (uploadError()) {
              <p class="field-error" role="alert">{{ uploadError() }}</p>
            }
          </section>
        } @else {
          <p class="owner-only-note">
            Only owner/admin/editor members may upload, organize, or delete assets.
          </p>
        }

        <section class="card library-card">
          <div class="filter-bar">
            <div class="album-pills" role="tablist" aria-label="Filter by album">
              <button
                type="button"
                class="pill-btn"
                [class.pill-btn--active]="selectedAlbum() === ''"
                (click)="selectAlbum('')"
              >
                All albums
              </button>
              @for (alb of albums(); track alb.name) {
                <button
                  type="button"
                  class="pill-btn"
                  [class.pill-btn--active]="selectedAlbum() === alb.name"
                  (click)="selectAlbum(alb.name)"
                >
                  {{ alb.name }} <span class="pill-count">{{ alb.count }}</span>
                </button>
              }
              <button
                type="button"
                class="pill-btn"
                [class.pill-btn--active]="selectedAlbum() === '__unassigned__'"
                (click)="selectAlbum('__unassigned__')"
              >
                Unassigned
              </button>
            </div>

            <div class="search-controls">
              <input
                type="search"
                [(ngModel)]="searchQuery"
                (keyup.enter)="loadAssets()"
                placeholder="Search filename, tag, album…"
              />
              <select [(ngModel)]="selectedTag" (ngModelChange)="loadAssets()" aria-label="Filter by tag">
                <option value="">All tags</option>
                @for (t of allTags(); track t) {
                  <option [value]="t">#{{ t }}</option>
                }
              </select>
              <button type="button" class="btn-secondary btn-sm" (click)="loadAssets()">Search</button>
              @if (searchQuery || selectedAlbum() || selectedTag) {
                <button type="button" class="btn-secondary btn-sm" (click)="clearFilters()">Reset</button>
              }
            </div>
          </div>

          @if (loadError()) {
            <p class="form-error" role="alert">{{ loadError() }}</p>
          } @else if (loading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (assets().length === 0) {
            <app-empty-state
              icon="image"
              title="No assets found"
              message="Upload images above or clear your search/album filters to see your media library."
            />
          } @else {
            <div class="gallery-grid">
              @for (asset of assets(); track asset.id) {
                <article class="asset-tile">
                  <div class="thumb-wrap">
                    <img [src]="asset.download_url" [alt]="asset.original_filename || asset.id" class="thumb" loading="lazy" />
                    @if (asset.album) {
                      <span class="album-badge">{{ asset.album }}</span>
                    }
                  </div>
                  <div class="meta">
                    <strong class="asset-name" [title]="asset.original_filename || asset.id">
                      {{ asset.original_filename || shortId(asset.id) }}
                    </strong>
                    <span class="muted small">
                      {{ formatBytes(asset.bytes) }}
                      @if (asset.width && asset.height) {
                        · {{ asset.width }}×{{ asset.height }}
                      }
                    </span>
                    @if (asset.tags.length > 0) {
                      <div class="tag-list">
                        @for (tg of asset.tags; track tg) {
                          <span class="tag-chip">#{{ tg }}</span>
                        }
                      </div>
                    }
                  </div>

                  @if (editingId() === asset.id) {
                    <div class="edit-box">
                      <input type="text" [(ngModel)]="editAlbum" placeholder="Album name" />
                      <input type="text" [(ngModel)]="editTags" placeholder="tag1, tag2" />
                      <div class="edit-actions">
                        <button type="button" class="btn-primary btn-sm" (click)="saveEdit(asset.id)" [disabled]="savingEdit()">Save</button>
                        <button type="button" class="btn-secondary btn-sm" (click)="editingId.set(null)">Cancel</button>
                      </div>
                    </div>
                  } @else if (canManage()) {
                    <div class="tile-actions">
                      <button type="button" class="btn-secondary action-icon-btn" (click)="startEdit(asset)" title="Edit asset" aria-label="Edit asset">
                        <ui-icon name="edit" [size]="14" />
                        <span class="sr-only">Edit</span>
                      </button>
                      <button
                        type="button"
                        class="btn-danger action-icon-btn"
                        (click)="deleteAsset(asset.id)"
                        [disabled]="deletingId() === asset.id"
                        title="Delete asset"
                        aria-label="Delete asset"
                      >
                        <ui-icon name="trash" [size]="14" />
                        <span class="sr-only">{{ deletingId() === asset.id ? 'Deleting…' : 'Delete' }}</span>
                      </button>
                    </div>
                  }
                </article>
              }
            </div>
          }

          @if (notice()) {
            <p class="notice" [class.error]="noticeIsError()" role="status">{{ notice() }}</p>
          }
        </section>
      }
    </section>
  `,
  styles: [
    `
      .assets {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .topbar-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        width: 100%;
      }
      .topbar-row ::ng-deep .page-header {
        margin-bottom: 0;
      }
      .upload-card,
      .library-card {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .upload-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1.35fr auto;
        gap: 10px;
        align-items: end;
      }
      .upload-btn {
        height: 36px;
        padding: 0 18px;
        white-space: nowrap;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--text-xs);
      }
      .file-field input[type='file'] {
        padding: 0.35rem;
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        font-size: var(--text-xs);
      }
      .filter-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--color-border);
      }
      .album-pills {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .pill-btn {
        padding: 0.28rem 0.65rem;
        border-radius: var(--radius-pill);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      .pill-btn--active {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;
      }
      .pill-btn--active:hover:not(:disabled) {
        background: var(--color-primary-hover);
        color: #fff;
      }
      .pill-count {
        font-size: 0.66rem;
        opacity: 0.85;
      }
      .search-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .search-controls input[type='search'] {
        width: 210px;
      }
      .gallery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 10px;
      }
      .asset-tile {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        transition: border-color 0.14s ease, box-shadow 0.14s ease;
      }
      .asset-tile:hover {
        border-color: var(--color-primary);
        box-shadow: var(--shadow-xs);
      }
      .thumb-wrap {
        position: relative;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
      }
      .thumb {
        width: 100%;
        height: 118px;
        object-fit: cover;
        display: block;
      }
      .album-badge {
        position: absolute;
        top: 6px;
        left: 6px;
        padding: 1px 7px;
        border-radius: var(--radius-pill);
        background: rgba(15, 23, 42, 0.78);
        color: #fff;
        font-size: 0.64rem;
        font-weight: var(--font-semibold);
      }
      .meta {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 0;
      }
      .asset-name {
        font-size: var(--text-xs);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 2px;
      }
      .tag-chip {
        font-size: 0.65rem;
        padding: 1px 6px;
        border-radius: var(--radius-pill);
        background: var(--color-primary-light);
        color: var(--color-primary);
        font-weight: var(--font-medium);
      }
      .tile-actions,
      .edit-actions {
        display: flex;
        gap: 6px;
      }
      .edit-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--color-border);
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.7rem;
        margin: 0;
      }
      .field-error,
      .form-error {
        color: var(--color-danger);
        margin: 0;
        font-size: var(--text-xs);
      }
      .notice {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-success);
      }
      .notice.error {
        color: var(--color-danger);
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
      @media (max-width: 820px) {
        .upload-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AssetsComponent implements OnInit {
  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly canManage = computed(() => {
    const role = this.tenant()?.caller_role;
    return role === 'owner' || role === 'admin' || role === 'editor';
  });

  readonly assets = signal<Asset[]>([]);
  readonly albums = signal<AssetAlbum[]>([]);
  readonly allTags = signal<string[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  searchQuery = '';
  readonly selectedAlbum = signal('');
  selectedTag = '';

  uploadAlbum = '';
  uploadTags = '';
  readonly selectedFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  editAlbum = '';
  editTags = '';
  readonly savingEdit = signal(false);

  readonly deletingId = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly noticeIsError = signal(false);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly assetService: AssetService,
  ) {}

  ngOnInit(): void {
    this.loadAssets();
  }

  loadAssets(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.assetService
      .listWithMeta(tenantId, {
        q: this.searchQuery || undefined,
        album: this.selectedAlbum() || undefined,
        tag: this.selectedTag || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.assets.set(res.assets);
          this.albums.set(res.albums);
          this.allTags.set(res.tags);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.loadError.set(apiErrorMessage(err));
        },
      });
  }

  selectAlbum(album: string): void {
    this.selectedAlbum.set(album);
    this.loadAssets();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedAlbum.set('');
    this.selectedTag = '';
    this.loadAssets();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.uploadError.set(null);
  }

  uploadSelectedFile(fileInput: HTMLInputElement): void {
    const file = this.selectedFile();
    const tenantId = this.tenant()?.id;
    if (!file || !tenantId || this.uploading()) {
      return;
    }
    const tags = this.uploadTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    this.uploading.set(true);
    this.uploadError.set(null);
    this.notice.set(null);

    this.assetService
      .uploadMultipart(tenantId, file, {
        album: this.uploadAlbum.trim() || undefined,
        tags,
      })
      .subscribe({
        next: () => {
          this.uploading.set(false);
          this.selectedFile.set(null);
          fileInput.value = '';
          this.noticeIsError.set(false);
          this.notice.set(`Uploaded ${file.name}.`);
          this.loadAssets();
        },
        error: (err: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(apiErrorMessage(err));
        },
      });
  }

  startEdit(asset: Asset): void {
    this.editingId.set(asset.id);
    this.editAlbum = asset.album ?? '';
    this.editTags = (asset.tags ?? []).join(', ');
  }

  saveEdit(assetId: string): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.savingEdit()) {
      return;
    }
    const tags = this.editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    this.savingEdit.set(true);
    this.assetService
      .update(tenantId, assetId, {
        album: this.editAlbum.trim() || null,
        tags,
      })
      .subscribe({
        next: () => {
          this.savingEdit.set(false);
          this.editingId.set(null);
          this.noticeIsError.set(false);
          this.notice.set('Asset metadata updated.');
          this.loadAssets();
        },
        error: (err: unknown) => {
          this.savingEdit.set(false);
          this.noticeIsError.set(true);
          this.notice.set(apiErrorMessage(err));
        },
      });
  }

  deleteAsset(assetId: string): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || this.deletingId()) {
      return;
    }
    if (!confirmDelete('this asset')) {
      return;
    }
    this.deletingId.set(assetId);
    this.notice.set(null);
    this.assetService.delete(tenantId, assetId).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.noticeIsError.set(false);
        this.notice.set('Asset deleted.');
        this.loadAssets();
      },
      error: (err: unknown) => {
        this.deletingId.set(null);
        this.noticeIsError.set(true);
        const code = apiErrorCode(err);
        this.notice.set(
          code === 'ASSET_IN_USE'
            ? 'This asset is referenced by existing content and cannot be deleted. Detach it from that content first.'
            : apiErrorMessage(err),
        );
      },
    });
  }

  shortId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
