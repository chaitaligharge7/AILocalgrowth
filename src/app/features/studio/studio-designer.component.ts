import { AfterViewInit, Component, inject, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Asset } from '../../core/assets/asset.models';
import { AssetService } from '../../core/assets/asset.service';
import { ContentItem } from '../../core/content/content.models';
import { ContentService } from '../../core/content/content.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { Creative, CreativeLayout, CreativeListResponse, CreativeSize, CreativeSpec } from '../../core/studio/studio.models';
import { StudioService } from '../../core/studio/studio.service';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { DEFAULT_SPEC, renderCreative } from './creative-render';

const LAYOUT_LABEL: Record<CreativeLayout, string> = {
  offer_banner: 'Offer banner',
  festival_greeting: 'Festival greeting',
  announcement: 'Announcement',
  quote: 'Quote',
};
const SIZE_LABEL: Record<CreativeSize, string> = { square: 'Square 1080x1080', portrait: 'Portrait 1080x1350', story: 'Story 1080x1920', landscape: 'Landscape 1200x628' };

/**
 * Poster / creative designer (BW-054, BW-058). A real editor: layout, size,
 * text, colours, your own logo/photo from the asset library — composed on a
 * canvas from the saved spec (deterministic, no AI image generation, which
 * the API reports as unavailable). "Export to library" renders the PNG,
 * uploads it through the normal asset flow (content-sniffed server side) and
 * links it to the design; "Attach to draft" adds it to a content draft.
 */
@Component({
  selector: 'app-studio-designer',
  standalone: true,
  imports: [ReactiveFormsModule, EmptyStateComponent, IconComponent],
  template: `
    <section class="designer">
      <div class="editor card">
        @if (config() && !config()!.capabilities.ai_image_generation.available) {
          <p class="meta" data-testid="ai-note">{{ config()!.capabilities.ai_image_generation.reason }}</p>
        }
        <form [formGroup]="form" class="form" (ngSubmit)="save()" novalidate>
          <label>Design name<input type="text" formControlName="name" maxlength="120" />
            @if (err('name')) { <span class="form-error" role="alert">{{ err('name') }}</span> }
          </label>
          <div class="row">
            <label>Layout
              <select formControlName="layout">
                @for (l of layouts(); track l) { <option [value]="l">{{ layoutLabel(l) }}</option> }
              </select>
            </label>
            <label>Size
              <select formControlName="size">
                @for (s of sizes; track s) { <option [value]="s">{{ sizeLabel(s) }}</option> }
              </select>
            </label>
          </div>
          <label>Headline<input type="text" formControlName="headline" maxlength="80" />
            @if (err('spec.headline')) { <span class="form-error" role="alert">{{ err('spec.headline') }}</span> }
          </label>
          <label>Supporting line<input type="text" formControlName="subline" maxlength="140" /></label>
          <div class="row">
            <label>Button text<input type="text" formControlName="cta_text" maxlength="40" /></label>
            <label>Badge (optional)<input type="text" formControlName="badge_text" maxlength="24" /></label>
          </div>
          <div class="row">
            <label>Background
              <select formControlName="background_type"><option value="gradient">Gradient</option><option value="solid">Solid</option></select>
            </label>
            <label>Align
              <select formControlName="align"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select>
            </label>
            <label>Text size
              <input type="range" min="0.8" max="1.4" step="0.05" formControlName="font_scale" />
            </label>
          </div>
          <div class="row colors">
            <label>Colour 1<input type="color" formControlName="color1" /></label>
            <label>Colour 2<input type="color" formControlName="color2" /></label>
            <label>Text<input type="color" formControlName="text_color" /></label>
            <label>Accent<input type="color" formControlName="accent_color" /></label>
          </div>
          @if (brandHint()) { <p class="meta">Colours start from your brand kit.</p> }
          <div class="row">
            <label>Logo
              <select formControlName="logo_asset_id">
                <option value="">None</option>
                @for (a of assets(); track a.id) { <option [value]="a.id">{{ assetLabel(a) }}</option> }
              </select>
            </label>
            <label>Photo background
              <select formControlName="image_asset_id">
                <option value="">None</option>
                @for (a of assets(); track a.id) { <option [value]="a.id">{{ assetLabel(a) }}</option> }
              </select>
            </label>
          </div>
          @if (assets().length === 0) { <p class="meta">Upload a logo or photo on the Assets screen to use it here.</p> }
          @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
          @if (notice()) { <p class="success" role="status">{{ notice() }}</p> }
          @if (canEdit) {
            <div class="actions">
              <button type="submit" [disabled]="busy() || form.invalid">{{ currentId() ? 'Save changes' : 'Save design' }}</button>
              <button type="button" class="btn-secondary" [disabled]="busy()" (click)="exportToLibrary()">Export PNG to library</button>
              <button type="button" class="btn-secondary" (click)="sendToContent()" data-testid="send-to-content">Send to Content →</button>
              <button type="button" class="btn-secondary" (click)="download()">Download PNG</button>
              @if (currentId()) { <button type="button" class="btn-secondary" (click)="reset()">New design</button> }
            </div>
            @if (attachableAsset()) {
              <div class="attach">
                <label>Attach exported image to a draft
                  <select #draftSel>
                    <option value="">Choose a draft…</option>
                    @for (d of drafts(); track d.id) { <option [value]="d.id">{{ d.title || d.objective }}</option> }
                  </select>
                </label>
                <button type="button" class="btn-secondary" [disabled]="busy()" (click)="attachToDraft(draftSel.value)">Attach</button>
              </div>
            }
          }
        </form>
      </div>

      <div class="preview">
        <div class="frame"><canvas #canvas data-testid="design-canvas"></canvas></div>
        <p class="meta">{{ dims() }} · composed from your text, colours and images — not AI-generated.</p>
        <h3>Saved designs</h3>
        @if (saved().length === 0) {
          <app-empty-state icon="content" title="No saved designs yet" message="Save a design to reuse it later." />
        } @else {
          <ul class="saved">
            @for (c of saved(); track c.id) {
              <li [class.current]="c.id === currentId()">
                <button type="button" class="link" (click)="load(c)">{{ c.name }}</button>
                <span class="meta">{{ layoutLabel(c.layout) }}{{ c.asset_id ? ' · exported' : '' }}</span>
                <button type="button" class="btn-secondary btn-sm" (click)="sendToContent(c)">Use in Content →</button>
                @if (canEdit) { <button type="button" class="btn-danger action-icon-btn" (click)="remove(c)" title="Delete design" aria-label="Delete design"><ui-icon name="trash" [size]="14" /> <span class="sr-only">Delete</span></button> }
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .designer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
      @media (max-width: 900px) { .designer { grid-template-columns: 1fr; } }
      .editor { padding: 1rem; }
      .form { display: flex; flex-direction: column; gap: 0.65rem; }
      label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.82rem; flex: 1; }
      input[type='text'], select { padding: 0.45rem; font: inherit; font-weight: 400; }
      input[type='color'] { width: 100%; height: 2.2rem; padding: 0; border: 1px solid var(--color-border); border-radius: 6px; }
      .row { display: flex; flex-wrap: wrap; gap: 0.6rem; }
      .actions, .attach { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; margin-top: 0.4rem; }
      .meta { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
      .form-error { color: #b00020; font-weight: 400; }
      .success { color: #1b6b3a; }
      .frame { background: var(--color-surface-muted, #eef2f5); border-radius: var(--radius-md, 12px); padding: 0.75rem; display: flex; justify-content: center; }
      canvas { max-width: 100%; max-height: 520px; width: auto; height: auto; border-radius: 6px; box-shadow: 0 2px 12px rgba(11, 31, 56, 0.18); }
      .saved { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
      .saved li { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; padding: 0.4rem 0.6rem; border: 1px solid var(--color-border); border-radius: 8px; }
      .saved li.current { border-color: var(--color-primary); }
      .link { background: none; border: none; color: var(--color-primary); font-weight: 600; cursor: pointer; padding: 0; }
    `,
  ],
})
export class StudioDesignerComponent implements OnInit, OnChanges, AfterViewInit {
  @Input({ required: true }) tenantId = '';
  @Input() locationId = '';
  @Input() canEdit = false;
  /** Text to start from (a template overlay); applied when it changes. */
  @Input() prefill: Partial<CreativeSpec> | null = null;
  /** A saved design to open (e.g. the one the promo designer just made). */
  @Input() open: Creative | null = null;
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly sizes: CreativeSize[] = ['square', 'portrait', 'story', 'landscape'];
  readonly config = signal<CreativeListResponse | null>(null);
  readonly layouts = signal<CreativeLayout[]>(['offer_banner', 'festival_greeting', 'announcement', 'quote']);
  readonly saved = signal<Creative[]>([]);
  readonly assets = signal<Asset[]>([]);
  readonly drafts = signal<ContentItem[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly attachableAsset = signal<string | null>(null);
  readonly busy = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly notice = signal<string | null>(null);
  readonly brandHint = signal(false);
  readonly dims = signal('1080 x 1080');

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['Untitled design', [Validators.required, Validators.maxLength(120)]],
    layout: ['offer_banner' as CreativeLayout],
    size: ['square' as CreativeSize],
    headline: [DEFAULT_SPEC.headline, [Validators.required, Validators.maxLength(80)]],
    subline: [DEFAULT_SPEC.subline ?? ''],
    cta_text: [DEFAULT_SPEC.cta_text ?? ''],
    badge_text: [''],
    background_type: ['gradient' as CreativeSpec['background_type']],
    align: ['left' as CreativeSpec['align']],
    font_scale: [1],
    color1: [DEFAULT_SPEC.color1],
    color2: [DEFAULT_SPEC.color2],
    text_color: [DEFAULT_SPEC.text_color],
    accent_color: [DEFAULT_SPEC.accent_color],
    logo_asset_id: [''],
    image_asset_id: [''],
  });

  private images: { logo: HTMLImageElement | null; photo: HTMLImageElement | null } = { logo: null, photo: null };
  private viewReady = false;

  constructor(
    private readonly studio: StudioService,
    private readonly assetApi: AssetService,
    private readonly contentApi: ContentService,
  ) {
    this.form.valueChanges.subscribe(() => this.redraw());
    this.form.controls.logo_asset_id.valueChanges.subscribe((id) => this.loadImage('logo', id));
    this.form.controls.image_asset_id.valueChanges.subscribe((id) => this.loadImage('photo', id));
  }

  ngOnInit(): void {
    this.studio.creatives(this.tenantId).subscribe({
      next: (res) => {
        this.config.set(res);
        this.saved.set(res.creatives);
        this.layouts.set(res.layouts);
        if (res.brand.from_brand_kit && !this.currentId()) {
          this.form.patchValue({ color1: res.brand.secondary_hex, color2: res.brand.primary_hex });
          this.brandHint.set(true);
        }
      },
      error: (err: unknown) => this.formError.set(apiErrorMessage(err)),
    });
    this.assetApi.list(this.tenantId).subscribe({
      next: (list) => this.assets.set(list.filter((a) => a.mime.startsWith('image/'))),
      error: () => this.assets.set([]),
    });
    this.contentApi.list(this.tenantId).subscribe({
      next: (list) => this.drafts.set(list.filter((c) => c.status === 'draft')),
      error: () => this.drafts.set([]),
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.redraw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['prefill'] && this.prefill) {
      this.form.patchValue({
        headline: this.prefill.headline ?? this.form.controls.headline.value,
        subline: this.prefill.subline ?? '',
        cta_text: this.prefill.cta_text ?? '',
      });
    }
    if (changes['open'] && this.open) {
      this.load(this.open);
    }
  }

  layoutLabel(l: CreativeLayout): string {
    return LAYOUT_LABEL[l] ?? l;
  }

  sizeLabel(s: CreativeSize): string {
    return SIZE_LABEL[s];
  }

  assetLabel(a: Asset): string {
    return `${a.tags[0] ?? a.mime.replace('image/', '')} · ${a.width ?? '?'}x${a.height ?? '?'} · ${a.id.slice(0, 6)}`;
  }

  err(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  load(c: Creative): void {
    this.currentId.set(c.id);
    this.attachableAsset.set(c.asset_id);
    const size = (Object.entries(this.config()?.sizes ?? {}).find(([, wh]) => wh.width === c.width && wh.height === c.height)?.[0] ?? 'square') as CreativeSize;
    this.form.patchValue(
      {
        name: c.name,
        layout: c.layout,
        size,
        headline: c.spec.headline,
        subline: c.spec.subline ?? '',
        cta_text: c.spec.cta_text ?? '',
        badge_text: c.spec.badge_text ?? '',
        background_type: c.spec.background_type,
        align: c.spec.align,
        font_scale: c.spec.font_scale,
        color1: c.spec.color1,
        color2: c.spec.color2,
        text_color: c.spec.text_color,
        accent_color: c.spec.accent_color,
        logo_asset_id: c.spec.logo_asset_id ?? '',
        image_asset_id: c.spec.image_asset_id ?? '',
      },
      { emitEvent: true },
    );
    this.loadImage('logo', c.spec.logo_asset_id ?? '');
    this.loadImage('photo', c.spec.image_asset_id ?? '');
  }

  reset(): void {
    this.currentId.set(null);
    this.attachableAsset.set(null);
    this.notice.set(null);
    this.form.patchValue({ name: 'Untitled design', headline: DEFAULT_SPEC.headline, subline: DEFAULT_SPEC.subline ?? '', logo_asset_id: '', image_asset_id: '' });
  }

  save(): void {
    this.persist().subscribe();
  }

  private persist() {
    const v = this.form.getRawValue();
    const payload = {
      name: v.name.trim(),
      layout: v.layout,
      size: v.size,
      location_id: this.locationId || null,
      spec: {
        headline: v.headline.trim(),
        subline: v.subline.trim() || null,
        cta_text: v.cta_text.trim() || null,
        badge_text: v.badge_text.trim() || null,
        background_type: v.background_type,
        align: v.align,
        font_scale: Number(v.font_scale),
        color1: v.color1,
        color2: v.color2,
        text_color: v.text_color,
        accent_color: v.accent_color,
        logo_asset_id: v.logo_asset_id || null,
        image_asset_id: v.image_asset_id || null,
      },
    };
    this.busy.set(true);
    this.formError.set(null);
    this.fieldErrors.set(null);
    const id = this.currentId();
    const call = id ? this.studio.updateCreative(this.tenantId, id, payload) : this.studio.createCreative(this.tenantId, payload);
    return {
      subscribe: (done?: (c: Creative) => void) =>
        call.subscribe({
          next: (c) => {
            this.busy.set(false);
            this.currentId.set(c.id);
            this.upsertSaved(c);
            this.notice.set('Design saved.');
            done?.(c);
          },
          error: (err: unknown) => {
            this.busy.set(false);
            this.fieldErrors.set(apiErrorFields(err));
            this.formError.set(apiErrorFields(err) ? null : apiErrorMessage(err));
          },
        }),
    };
  }

  exportToLibrary(): void {
    this.persist().subscribe((c) => {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) {
        return;
      }
      this.busy.set(true);
      canvas.toBlob((blob) => {
        if (!blob) {
          this.busy.set(false);
          this.formError.set('Could not render the image in this browser.');
          return;
        }
        const file = new File([blob], `${c.name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'design'}.png`, { type: 'image/png' });
        this.assetApi.uploadFile(this.tenantId, file, ['creative']).subscribe({
          next: (asset) =>
            this.studio.attachAsset(this.tenantId, c.id, asset.id).subscribe({
              next: (updated) => {
                this.busy.set(false);
                this.upsertSaved(updated);
                this.attachableAsset.set(asset.id);
                this.notice.set('Exported to your asset library.');
              },
              error: (err: unknown) => {
                this.busy.set(false);
                this.formError.set(apiErrorMessage(err));
              },
            }),
          error: (err: unknown) => {
            this.busy.set(false);
            this.formError.set(apiErrorMessage(err));
          },
        });
      }, 'image/png');
    });
  }

  attachToDraft(contentId: string): void {
    const assetId = this.attachableAsset();
    if (!contentId || !assetId) {
      return;
    }
    this.busy.set(true);
    this.studio.revisions(this.tenantId, contentId).subscribe({
      next: (rev) => {
        const current = rev.revisions.find((r) => r.is_current);
        const merged = Array.from(new Set([...(current?.assets ?? []), assetId]));
        this.contentApi.update(this.tenantId, contentId, { assets_json: merged }).subscribe({
          next: () => {
            this.busy.set(false);
            this.notice.set('Image attached to the draft.');
          },
          error: (err: unknown) => {
            this.busy.set(false);
            this.formError.set(apiErrorMessage(err));
          },
        });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.formError.set(apiErrorMessage(err));
      },
    });
  }

  private readonly router = inject(Router, { optional: true });

  sendToContent(creative?: Creative): void {
    if (!this.router || !this.tenantId) {
      return;
    }
    const spec = creative?.spec;
    const title = (creative?.name ?? this.form.controls.name.value).trim();
    const headline = (spec?.headline ?? this.form.controls.headline.value).trim();
    const subline = (spec?.subline ?? this.form.controls.subline.value ?? '').trim();
    const cta = (spec?.cta_text ?? this.form.controls.cta_text.value ?? '').trim();
    const bodyParts = [headline, subline, cta].filter((p) => p.length > 0);
    const assetId = creative?.asset_id ?? this.attachableAsset() ?? null;

    void this.router.navigate(['/app', this.tenantId, 'content'], {
      state: {
        prefillTitle: title || headline,
        prefillObjective: title || headline || 'Creative campaign post',
        prefillBody: bodyParts.join('\n\n'),
        prefillAssetId: assetId,
      },
    });
  }

  download(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.form.controls.name.value.replace(/[^\w-]+/g, '-') || 'design'}.png`;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }

  remove(c: Creative): void {
    if (!confirmDelete(c.name || 'this design')) {
      return;
    }
    this.studio.deleteCreative(this.tenantId, c.id).subscribe({
      next: () => {
        this.saved.update((list) => list.filter((x) => x.id !== c.id));
        if (this.currentId() === c.id) {
          this.reset();
        }
      },
      error: (err: unknown) => this.formError.set(apiErrorMessage(err)),
    });
  }

  private upsertSaved(c: Creative): void {
    this.saved.update((list) => [c, ...list.filter((x) => x.id !== c.id)]);
  }

  private loadImage(slot: 'logo' | 'photo', assetId: string): void {
    const asset = this.assets().find((a) => a.id === assetId);
    if (!assetId || !asset) {
      this.images[slot] = null;
      this.redraw();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.images[slot] = img;
      this.redraw();
    };
    img.onerror = () => {
      this.images[slot] = null;
      this.formError.set('Could not load one of the selected images.');
    };
    img.src = asset.download_url;
  }

  private redraw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.viewReady) {
      return;
    }
    const v = this.form.getRawValue();
    const size = this.config()?.sizes?.[v.size] ?? { width: 1080, height: 1080 };
    canvas.width = size.width;
    canvas.height = size.height;
    this.dims.set(`${size.width} x ${size.height}`);
    renderCreative(
      canvas,
      v.layout,
      {
        headline: v.headline,
        subline: v.subline || null,
        cta_text: v.cta_text || null,
        badge_text: v.badge_text || null,
        background_type: v.background_type,
        color1: v.color1,
        color2: v.color2,
        text_color: v.text_color,
        accent_color: v.accent_color,
        align: v.align,
        font_scale: Number(v.font_scale),
        logo_asset_id: v.logo_asset_id || null,
        image_asset_id: v.image_asset_id || null,
      },
      { logo: this.images.logo, photo: this.images.photo },
    );
  }
}
