import { DEFAULT_SPEC, renderCreative, wrapLines } from './creative-render';

describe('creative-render', () => {
  function canvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  const pixel = (c: HTMLCanvasElement, x: number, y: number): number[] => Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data);

  it('paints a solid background in the chosen colour', () => {
    const c = canvas(540, 540);
    renderCreative(c, 'announcement', { ...DEFAULT_SPEC, background_type: 'solid', color1: '#ff0000', text_color: '#ffffff', headline: 'Hi', subline: null, cta_text: null }, {});
    expect(pixel(c, 270, 520)).toEqual([255, 0, 0, 255]);
  });

  it('paints a gradient that moves from colour 1 to colour 2', () => {
    const c = canvas(400, 400);
    renderCreative(c, 'quote', { ...DEFAULT_SPEC, background_type: 'gradient', color1: '#000000', color2: '#ffffff', headline: '', subline: null, cta_text: null }, {});
    const start = pixel(c, 1, 399)[0];
    const end = pixel(c, 398, 399)[0];
    expect(end).toBeGreaterThan(start);
  });

  it('draws the call-to-action pill in the accent colour near the bottom', () => {
    const c = canvas(600, 600);
    renderCreative(c, 'offer_banner', { ...DEFAULT_SPEC, background_type: 'solid', color1: '#000000', accent_color: '#00ff00', cta_text: 'Book now', headline: 'X', subline: null }, {});
    let found = false;
    // 600px canvas => unit 0.556: the pill is ~51px tall, bottom padding ~44px, so its upper band sits around y=510.
    for (let x = 70; x < 200 && !found; x += 4) {
      const [r, g, b] = pixel(c, x, 510);
      found = g > 200 && r < 60 && b < 60;
    }
    expect(found).toBeTrue();
  });

  it('is deterministic: the same spec renders identical pixels', () => {
    const a = canvas(300, 300);
    const b = canvas(300, 300);
    renderCreative(a, 'festival_greeting', DEFAULT_SPEC, {});
    renderCreative(b, 'festival_greeting', DEFAULT_SPEC, {});
    expect(a.toDataURL()).toBe(b.toDataURL());
  });

  it('wraps long text onto several lines within the width', () => {
    const ctx = canvas(10, 10).getContext('2d')!;
    ctx.font = '20px Arial';
    const lines = wrapLines(ctx, 'one two three four five six seven eight nine ten', 120);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) {
      expect(ctx.measureText(l).width).toBeLessThanOrEqual(130);
    }
    expect(wrapLines(ctx, '   ', 100)).toEqual([]);
  });
});
