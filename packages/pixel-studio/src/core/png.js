// PNG bytes from RGBA pixels, for any host. Pixel art rarely has more than a few dozen colours, so the
// image is written indexed (a palette, transparency in tRNS, 1/2/4/8 bits per pixel) whenever it has at
// most 256 distinct RGBA values: about 40% smaller than RGBA. Otherwise RGBA8, each row with the filter
// that makes it smallest. The host supplies zlib: `deflate(bytes) → bytes` (node:zlib's deflateSync) or a
// Promise of them (CompressionStream('deflate') in browsers); pngBytes returns the same way.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (out, at, v) => { out[at] = v >>> 24; out[at + 1] = (v >>> 16) & 255; out[at + 2] = (v >>> 8) & 255; out[at + 3] = v & 255; };

function assemble(chunks) {
  const size = 8 + chunks.reduce((s, [, d]) => s + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let at = 8;
  for (const [type, data] of chunks) {
    u32(out, at, data.length);
    for (let i = 0; i < 4; i++) out[at + 4 + i] = type.charCodeAt(i);
    out.set(data, at + 8);
    u32(out, at + 8 + data.length, crc32(out, at + 4, at + 8 + data.length));
    at += 12 + data.length;
  }
  return out;
}

/** The image's colours as a palette (transparent first, then the rest) and each pixel's index; null over 256 colours. */
export function paletteOf(rgba) {
  const view = new DataView(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const index = new Map();
  const n = rgba.length >> 2;
  const idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    const key = a === 0 ? 0 : view.getUint32(i * 4) >>> 0;   // every fully transparent pixel is one colour
    let k = index.get(key);
    if (k === undefined) { if (index.size === 256) return null; k = index.size; index.set(key, k); }
    idx[i] = k;
  }
  // Non-opaque colours first, so tRNS only lists those.
  const colours = [...index.keys()];
  const order = colours.map((_, i) => i).sort((a, b) => ((colours[a] & 255) === 255) - ((colours[b] & 255) === 255) || a - b);
  const remap = new Uint8Array(colours.length);
  order.forEach((old, i) => { remap[old] = i; });
  for (let i = 0; i < n; i++) idx[i] = remap[idx[i]];
  return { colours: order.map((i) => colours[i]), idx };
}

function indexedChunks(w, h, { colours, idx }) {
  const bits = colours.length <= 2 ? 1 : colours.length <= 4 ? 2 : colours.length <= 16 ? 4 : 8;
  const stride = Math.ceil((w * bits) / 8);
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < w; x++) {
      const bit = x * bits;
      raw[row + (bit >> 3)] |= idx[y * w + x] << (8 - bits - (bit & 7));
    }
  }
  const plte = new Uint8Array(colours.length * 3);
  colours.forEach((c, i) => { plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255; });
  const alphas = colours.map((c) => c & 255);
  const nTrns = alphas.findIndex((a) => a === 255);
  const trns = Uint8Array.from(alphas.slice(0, nTrns < 0 ? alphas.length : nTrns));
  return { bits, colourType: 3, raw, extra: [['PLTE', plte], ...(trns.length ? [['tRNS', trns]] : [])] };
}

function rgbaChunks(w, h, rgba) {
  const stride = w * 4, raw = new Uint8Array((stride + 1) * h), line = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = y * stride, prev = cur - stride;
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? rgba[cur + i - 4] : 0, b = y ? rgba[prev + i] : 0, c = y && i >= 4 ? rgba[prev + i - 4] : 0;
        let pred = 0;
        if (f === 1) pred = a; else if (f === 2) pred = b; else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (rgba[cur + i] - pred) & 255;
        line[i] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; raw[y * (stride + 1)] = f; raw.set(line, y * (stride + 1) + 1); }
    }
  }
  return { bits: 8, colourType: 6, raw, extra: [] };
}

/** PNG file bytes (Uint8Array) for w×h RGBA pixels; a Promise of them when `deflate` is asynchronous. */
export function pngBytes(w, h, rgba, deflate) {
  if (typeof deflate !== 'function') throw new Error('pngBytes needs a deflate(bytes) → bytes function (zlib format)');
  const pal = paletteOf(rgba);
  const { bits, colourType, raw, extra } = pal ? indexedChunks(w, h, pal) : rgbaChunks(w, h, rgba);
  const ihdr = new Uint8Array(13);
  u32(ihdr, 0, w); u32(ihdr, 4, h);
  ihdr[8] = bits; ihdr[9] = colourType;
  const finish = (z) => assemble([['IHDR', ihdr], ...extra, ['IDAT', z instanceof Uint8Array ? z : new Uint8Array(z)], ['IEND', new Uint8Array(0)]]);
  const z = deflate(raw);
  return typeof z?.then === 'function' ? z.then(finish) : finish(z);
}
