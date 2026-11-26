import { CreativeLayout, CreativeSpec } from '../../core/studio/studio.models';

/**
 * Deterministic poster composition on a 2D canvas: the same spec always
 * produces the same picture (no AI, no network). Called by the creative
 * designer for the live preview and for the PNG export that is uploaded to
 * the asset library.
 */
export interface RenderImages {
  logo?: CanvasImageSource | null;
  photo?: CanvasImageSource | null;
}

export const DEFAULT_SPEC: CreativeSpec = {
  headline: 'Your headline here',
  subline: 'A short supporting line',
  cta_text: 'Visit us today',
  badge_text: null,
  background_type: 'gradient',
  color1: '#0b1f38',
  color2: '#078d7e',
  text_color: '#ffffff',
  accent_color: '#d6a354',
  align: 'left',
  font_scale: 1,
  logo_asset_id: null,
  image_asset_id: null,
};

const FONT = '"Inter", "Segoe UI", Arial, sans-serif';

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number): void {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || w;
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the creative at its real pixel size (`canvas.width` x `canvas.height`). */
export function renderCreative(canvas: HTMLCanvasElement, layout: CreativeLayout, spec: CreativeSpec, images: RenderImages = {}): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const W = canvas.width;
  const H = canvas.height;
  const unit = Math.min(W, H) / 1080;
  const scale = spec.font_scale || 1;
  const pad = 80 * unit;
  const align = layout === 'festival_greeting' || layout === 'quote' ? 'center' : spec.align;

  // Background
  if (spec.background_type === 'solid') {
    ctx.fillStyle = spec.color1;
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, spec.color1);
    g.addColorStop(1, spec.color2);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  if (images.photo) {
    drawCover(ctx, images.photo, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
  }

  const textX = align === 'left' ? pad : align === 'right' ? W - pad : W / 2;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const maxWidth = W - pad * 2;

  // Badge (offer banner: pill, top-left of the text column)
  let y = pad + 40 * unit;
  if (spec.badge_text) {
    const badgeSize = 34 * unit * scale;
    ctx.font = `700 ${badgeSize}px ${FONT}`;
    const bw = ctx.measureText(spec.badge_text.toUpperCase()).width + 48 * unit;
    const bh = badgeSize * 1.9;
    const bx = align === 'left' ? pad : align === 'right' ? W - pad - bw : (W - bw) / 2;
    ctx.fillStyle = spec.accent_color;
    roundRect(ctx, bx, y - badgeSize * 1.2, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#0b1f38';
    ctx.textAlign = 'center';
    ctx.fillText(spec.badge_text.toUpperCase(), bx + bw / 2, y + badgeSize * 0.15);
    ctx.textAlign = align;
    y += bh + 40 * unit;
  }

  if (layout === 'quote') {
    ctx.fillStyle = spec.accent_color;
    ctx.font = `700 ${260 * unit}px Georgia, serif`;
    ctx.fillText('“', textX, y + 160 * unit);
    y += 200 * unit;
  } else if (layout === 'announcement') {
    ctx.fillStyle = spec.accent_color;
    ctx.fillRect(align === 'right' ? W - pad - 120 * unit : align === 'center' ? W / 2 - 60 * unit : pad, y, 120 * unit, 10 * unit);
    y += 50 * unit;
  }

  // Headline
  const headSize = (layout === 'offer_banner' ? 150 : layout === 'quote' ? 76 : 110) * unit * scale;
  ctx.fillStyle = spec.text_color;
  ctx.font = `800 ${headSize}px ${FONT}`;
  y += headSize;
  for (const line of wrapLines(ctx, spec.headline, maxWidth)) {
    ctx.fillText(line, textX, y);
    y += headSize * 1.08;
  }

  if (layout === 'festival_greeting') {
    ctx.fillStyle = spec.accent_color;
    ctx.fillRect(W / 2 - 90 * unit, y - headSize * 0.4, 180 * unit, 8 * unit);
    y += 50 * unit;
  }

  // Subline
  if (spec.subline) {
    const subSize = 52 * unit * scale;
    ctx.fillStyle = spec.text_color;
    ctx.globalAlpha = 0.9;
    ctx.font = `500 ${subSize}px ${FONT}`;
    y += subSize * 0.5;
    for (const line of wrapLines(ctx, spec.subline, maxWidth)) {
      ctx.fillText(line, textX, y);
      y += subSize * 1.3;
    }
    ctx.globalAlpha = 1;
  }

  // CTA pill pinned to the bottom
  if (spec.cta_text) {
    const ctaSize = 44 * unit * scale;
    ctx.font = `700 ${ctaSize}px ${FONT}`;
    const cw = ctx.measureText(spec.cta_text).width + 90 * unit;
    const ch = ctaSize * 2.1;
    const cx = align === 'left' ? pad : align === 'right' ? W - pad - cw : (W - cw) / 2;
    const cy = H - pad - ch;
    ctx.fillStyle = spec.accent_color;
    roundRect(ctx, cx, cy, cw, ch, ch / 2);
    ctx.fill();
    ctx.fillStyle = '#0b1f38';
    ctx.textAlign = 'center';
    ctx.fillText(spec.cta_text, cx + cw / 2, cy + ch / 2 + ctaSize * 0.34);
    ctx.textAlign = align;
  }

  // Logo (top-right, contained)
  if (images.logo) {
    const box = 150 * unit;
    const iw = (images.logo as HTMLImageElement).naturalWidth || box;
    const ih = (images.logo as HTMLImageElement).naturalHeight || box;
    const s = Math.min(box / iw, box / ih);
    ctx.drawImage(images.logo, W - pad - iw * s, pad * 0.6, iw * s, ih * s);
  }
}
