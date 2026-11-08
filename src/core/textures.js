// Procedural textures evaluated in *part-local pixel space*, so texture sticks to
// a moving limb instead of swimming. Each returns a brightness offset roughly in [-1, 1].

export const TEXTURES = ['noise', 'fur', 'scales', 'stripes', 'checker', 'cloth', 'bricks', 'spots', 'metal'];

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

/** x, y: integer local pixel coords; s: texture scale (pixels per feature, >= 1). */
export function sampleTexture(name, x, y, s = 1) {
  s = Math.max(1, Math.round(s));
  switch (name) {
    case 'noise':
      return (hash2(Math.floor(x / s), Math.floor(y / s)) - 0.5) * 2;
    case 'fur': {
      const c = Math.floor(x / s);
      const streak = hash2(c, 7) - 0.5;
      const along = hash2(c, Math.floor(y / (3 * s))) - 0.5;
      return streak * 1.4 + along * 0.8;
    }
    case 'scales': {
      const cs = 3 * s + 1;
      const row = Math.floor(y / cs);
      const fx = mod(x + (row & 1 ? cs / 2 : 0), cs), fy = mod(y, cs);
      const r = Math.hypot(fx - cs / 2 + 0.5, fy + 0.5);
      return r > cs * 0.85 ? -1 : 0.35 * (1 - r / cs);
    }
    case 'stripes':
      return mod(Math.floor(y / (2 * s)), 2) ? -1 : 0.5;
    case 'checker':
      return mod(Math.floor(x / (2 * s)) + Math.floor(y / (2 * s)), 2) ? -0.9 : 0.4;
    case 'cloth':
      return (mod(x + y, 3 * s) === 0 ? -0.8 : 0) + (mod(x - y, 4 * s) === 0 ? 0.4 : 0);
    case 'bricks': {
      const bh = 3 * s, bw = 6 * s;
      const row = Math.floor(y / bh);
      if (mod(y, bh) === 0 || mod(x + (row & 1) * (bw / 2), bw) === 0) return -1;
      return (hash2(Math.floor(x / bw), row) - 0.5) * 0.6;
    }
    case 'spots': {
      const cs = 6 * s;
      const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
      const ox = cx * cs + hash2(cx, cy) * cs, oy = cy * cs + hash2(cy, cx + 31) * cs;
      return Math.hypot(x - ox, y - oy) < 1.3 * s ? -1.2 : 0;
    }
    case 'metal':
      return (hash2(3, Math.floor(y / s)) - 0.5) * 0.5;
    default:
      return 0;
  }
}
