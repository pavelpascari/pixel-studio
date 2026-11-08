// Colour helpers + hue-shifted tone ramps (the classic pixel-art shading trick:
// shadows drift toward cool blue/purple, highlights toward warm yellow).

export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb([h, s, v]) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Move hue `from` toward `to` by fraction t along the shortest arc. */
function hueToward(from, to, t, maxDeg = 360) {
  const d = ((to - from + 540) % 360) - 180;
  return from + Math.sign(d) * Math.min(Math.abs(d) * t, maxDeg * t);
}

/** Index of the base colour inside a ramp of `n` tones. */
export const baseIndex = (n) => (n <= 2 ? 1 : Math.ceil((n - 1) / 2));

/**
 * Build a ramp of `n` tones (dark → light) around `hex`.
 * The base colour sits at baseIndex(n), so 2 tones = [shadow, base].
 */
export function buildRamp(hex, n, { hueShift = 1 } = {}) {
  const rgb = parseHex(hex) || [255, 0, 255];
  if (n <= 1) return [rgb.map(Math.round)];
  // HSV ramp: shadows lose value and gain saturation, highlights gain value and lose saturation,
  // both with a capped hue drift (cool shadows, warm highlights).
  const [h, sat, val] = rgbToHsv(rgb);
  const bi = baseIndex(n);
  const below = bi, above = n - 1 - bi;
  const grey = sat < 0.08; // keep greys grey-ish (only a hint of hue shift)
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === bi) { out.push(rgb.map(Math.round)); continue; }
    let t, nh, ns, nv;
    if (i < bi) {
      t = (bi - i) / below; // 0..1 into the shadows
      nh = grey ? 250 : hueToward(h, 250, 0.2 * t * hueShift, 60);
      ns = grey ? Math.min(0.18, sat + 0.1 * t) : clamp01(sat + 0.14 * t * (1 - sat));
      nv = val * (1 - 0.42 * t);
    } else {
      t = (i - bi) / above; // 0..1 into the highlights
      nh = grey ? h : hueToward(h, 55, 0.14 * t * hueShift, 50);
      ns = clamp01(sat * (1 - 0.35 * t));
      nv = val + (1 - val) * 0.65 * t;
    }
    out.push(hsvToRgb([nh, ns, nv]).map(Math.round));
  }
  return out;
}

/** Darken a colour (used for selective outlines). */
export function darken(rgb, amount = 0.45) {
  const [h, s, v] = rgbToHsv(rgb);
  return hsvToRgb([hueToward(h, 250, 0.2, 60), clamp01(s + 0.1), v * (1 - amount)]).map(Math.round);
}
