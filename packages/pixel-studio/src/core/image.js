// Tiny RGBA image helpers (pure, isomorphic): used for contact sheets and previews.

export function createImage(w, h, fill = null) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (fill) for (let i = 0; i < w * h; i++) rgba.set(fill, i * 4);
  return { w, h, rgba };
}

/** Alpha-composite src onto dst at (dx, dy), scaled by integer k. */
export function blit(dst, src, dx, dy, k = 1) {
  for (let y = 0; y < src.h * k; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w * k; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      const s = ((Math.floor(y / k) * src.w) + Math.floor(x / k)) * 4;
      const a = src.rgba[s + 3] / 255;
      if (a === 0) continue;
      const d = (ty * dst.w + tx) * 4;
      for (let c = 0; c < 3; c++) dst.rgba[d + c] = src.rgba[s + c] * a + dst.rgba[d + c] * (1 - a);
      dst.rgba[d + 3] = Math.max(dst.rgba[d + 3], src.rgba[s + 3]);
    }
  }
}

/** Light checkerboard background (makes transparency visible in previews). */
export function checker(img, x0, y0, w, h, cell = 4, a = [236, 233, 244, 255], b = [222, 218, 234, 255]) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = x0 + x, ty = y0 + y;
    if (tx < 0 || ty < 0 || tx >= img.w || ty >= img.h) continue;
    img.rgba.set(((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? a : b, (ty * img.w + tx) * 4);
  }
}

/**
 * Contact sheet for agent review: one block per resolution; inside, one row per animation,
 * one column per frame. Every frame is upscaled to the same display height so LODs compare.
 */
export function contactSheet(blocks, { cellH = 128, gap = 8, bg = [40, 36, 52, 255] } = {}) {
  // blocks: [{ res, rows: [{ name, frames: [{w,h,rgba}] }] }]
  const layout = blocks.map((b) => {
    const k = Math.max(1, Math.floor(cellH / b.res));
    const fw = b.rows[0].frames[0].w * k, fh = b.rows[0].frames[0].h * k;
    const cols = Math.max(...b.rows.map((r) => r.frames.length));
    return { b, k, fw, fh, w: cols * (fw + gap) - gap, h: b.rows.length * (fh + gap) - gap };
  });
  const W = Math.max(...layout.map((l) => l.w)) + gap * 2;
  const H = layout.reduce((s, l) => s + l.h + gap * 3, gap);
  const img = createImage(W, H, bg);
  let y = gap;
  for (const l of layout) {
    l.b.rows.forEach((r, ri) => r.frames.forEach((fr, ci) => {
      const x = gap + ci * (l.fw + gap), yy = y + ri * (l.fh + gap);
      checker(img, x, yy, l.fw, l.fh, Math.max(2, l.k * 2));
      blit(img, fr, x, yy, l.k);
    }));
    y += l.h + gap * 3;
  }
  return img;
}
