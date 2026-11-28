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

// ---------- decoding: for importing hand-drawn sheets ----------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };   // colour type → samples per pixel
// Adam7 passes: [x0, y0, dx, dy]
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * RGBA pixels from PNG file bytes: {width, height, rgba}; a Promise of them when `inflate` is asynchronous.
 * Every colour type and bit depth, palettes with tRNS, and interlaced images; 16-bit samples keep their high byte.
 * The host supplies zlib: `inflate(bytes) → bytes` (node:zlib's inflateSync) or a Promise of them
 * (DecompressionStream('deflate') in browsers).
 */
export function pngPixels(bytes, inflate) {
  if (typeof inflate !== 'function') throw new Error('pngPixels needs an inflate(bytes) → bytes function (zlib format)');
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 8 || PNG_SIGNATURE.some((v, i) => b[i] !== v)) throw new Error('not a PNG file');
  const u32at = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  let at = 8, ihdr = null, plte = null, trns = null;
  const idat = [];
  while (at + 8 <= b.length) {
    const len = u32at(at), type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
    const data = b.subarray(at + 8, at + 8 + len);
    if (data.length !== len) throw new Error(`PNG is cut short (in its ${type} chunk)`);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (!ihdr || !idat.length) throw new Error('PNG has no image data');
  const width = u32at(ihdr.byteOffset - b.byteOffset), height = u32at(ihdr.byteOffset - b.byteOffset + 4);
  const [depth, colourType, , , interlace] = ihdr.subarray(8, 13);
  const channels = CHANNELS[colourType];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) throw new Error(`PNG colour type ${colourType} with ${depth}-bit samples is not valid`);
  if (colourType === 3 && !plte) throw new Error('PNG palette image has no PLTE chunk');
  if (!width || !height || width * height > 64 * 1024 * 1024) throw new Error(`PNG is ${width}x${height}: too large to import`);
  const z = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of idat) { z.set(d, o); o += d.length; }
  const finish = (raw) => ({ width, height, rgba: unfilter(raw instanceof Uint8Array ? raw : new Uint8Array(raw), { width, height, depth, colourType, channels, interlace, plte, trns }) });
  const raw = inflate(z);
  return typeof raw?.then === 'function' ? raw.then(finish) : finish(raw);
}

function unfilter(raw, { width, height, depth, colourType, channels, interlace, plte, trns }) {
  const rgba = new Uint8Array(width * height * 4);
  const bpp = Math.max(1, (channels * depth) >> 3);   // bytes to the left pixel, for the filters
  const max = (1 << depth) - 1;
  // Colour key transparency (tRNS for grey and RGB images), in sample values.
  const key = trns && colourType === 0 ? [(trns[0] << 8) | trns[1]] : trns && colourType === 2 ? [0, 2, 4].map((i) => (trns[i] << 8) | trns[i + 1]) : null;
  let at = 0;
  const pass = (x0, y0, dx, dy) => {
    const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
    if (w <= 0 || h <= 0) return;
    const stride = Math.ceil((w * channels * depth) / 8);
    let prev = new Uint8Array(stride), line = new Uint8Array(stride);
    for (let y = 0; y < h; y++) {
      if (at + 1 + stride > raw.length) throw new Error('PNG image data is cut short');
      const filter = raw[at++];
      for (let i = 0; i < stride; i++) {
        const x = raw[at + i], a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v;
        if (filter === 0) v = x;
        else if (filter === 1) v = x + a;
        else if (filter === 2) v = x + up;
        else if (filter === 3) v = x + ((a + up) >> 1);
        else if (filter === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
        else throw new Error(`PNG uses unknown filter ${filter}`);
        line[i] = v & 255;
      }
      at += stride;
      const sample = (n) => {   // the n-th sample of the line
        if (depth === 8) return line[n];
        if (depth === 16) return (line[n * 2] << 8) | line[n * 2 + 1];
        const bit = n * depth;
        return (line[bit >> 3] >> (8 - depth - (bit & 7))) & max;
      };
      for (let x = 0; x < w; x++) {
        const o = (((y0 + y * dy) * width) + x0 + x * dx) * 4, s = x * channels;
        let r, g, bl, al = 255;
        if (colourType === 3) {
          const p = sample(s);
          if (p * 3 + 2 >= plte.length) throw new Error(`PNG pixel uses palette entry ${p}, past the end of the palette`);
          r = plte[p * 3]; g = plte[p * 3 + 1]; bl = plte[p * 3 + 2]; al = trns && p < trns.length ? trns[p] : 255;
        } else {
          const vals = Array.from({ length: channels }, (_, k) => sample(s + k));
          const to8 = (v) => (depth === 16 ? v >> 8 : depth === 8 ? v : Math.round((v * 255) / max));
          if (colourType === 0 || colourType === 4) { r = g = bl = to8(vals[0]); if (colourType === 4) al = to8(vals[1]); }
          else { [r, g, bl] = vals.slice(0, 3).map(to8); if (colourType === 6) al = to8(vals[3]); }
          if (key && (colourType === 0 ? vals[0] === key[0] : vals[0] === key[0] && vals[1] === key[1] && vals[2] === key[2])) al = 0;
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = al;
      }
      [prev, line] = [line, prev];
    }
  };
  if (interlace === 1) for (const p of ADAM7) pass(...p);
  else pass(0, 0, 1, 1);
  return rgba;
}
