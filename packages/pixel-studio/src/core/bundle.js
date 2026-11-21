// Web bundle = everything a page needs to play a character, in one JSON file:
// { format, name, size, ground, animations: {name:{row,frames,fps,loop,speed?,speedY?,events?,durations?}},
//   points?: {name: {anim: [[x, y, rot], ...per frame]}}, skinPoints?: {skin: points}, skins?: [name], states?: {...state machine},
//   variants: [{res,lod,frameW,frameH,image,skin?}] }
// A skin variant may instead be a change to the default variant of the same res: no `image`, but
// `recolor: [["rrggbbaa", "rrggbbaa"], ...]` (colours swapped) and/or `overlay` (an image of the pixels
// drawn over the result).
// `size` is the spec canvas in units ([w, h]) and `ground` the y of the foot line in units; points
// are in units too, so one table serves every resolution. `image` is a PNG data URL (or a URL).
import { renderSheet } from './render.js';
import { samplePose } from './animate.js';
import { worldMatrices, apply, angleOf } from './rig.js';

export const BUNDLE_FORMAT = 'pixel-sprite/1';
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * encode(w, h, rgba) → PNG data URL. Supplied by the host (canvas in browsers, zlib in Node).
 * views: which extra views to ship (["front"]; [] or false: the side view only; default all): each
 *   view roughly adds a full set of animations to the sheets.
 * deltas: store a skin as a change to the default sheet when smaller (default true).
 */
export async function buildBundle(compiled, { resolutions = [16, 32, 64], overrides = {}, encode, views, deltas = true } = {}) {
  compiled = keepViews(compiled, views);
  if (typeof encode !== 'function') throw new Error('buildBundle needs an encode(w, h, rgba) function that returns an image URL (see encodePNG for Node)');
  const variants = [];
  let animations = null, top = null;
  const sheets = new Map();
  for (const res of [...resolutions].sort((a, b) => a - b)) {
    const sheet = renderSheet(compiled, res, overrides);
    animations ??= Object.fromEntries(Object.entries(sheet.meta.animations));
    top = sheet;
    sheets.set(res, sheet);
    variants.push({ res, lod: sheet.meta.lod, frameW: sheet.meta.frameW, frameH: sheet.meta.frameH,
      image: await encode(sheet.width, sheet.height, sheet.rgba) });
  }
  // Skins: the same sheet layout per skin, as extra variants tagged with the skin's name. Most skins
  // recolour the character or add a few parts, so a skin is stored as a change to the default sheet
  // (colours swapped, an overlay of the pixels that still differ) when that is smaller than its own sheet.
  for (const [skin, sc] of Object.entries(compiled.skins ?? {})) {
    for (const res of [...resolutions].sort((a, b) => a - b)) {
      const sheet = renderSheet(sc, res, overrides);
      const v = { res, lod: sheet.meta.lod, frameW: sheet.meta.frameW, frameH: sheet.meta.frameH, skin };
      const full = await encode(sheet.width, sheet.height, sheet.rgba);
      const delta = deltas && skinDelta(sheets.get(res), sheet);
      if (delta) {
        const overlay = delta.overlay && await encode(sheet.width, sheet.height, delta.overlay);
        const size = JSON.stringify(delta.recolor).length + (overlay?.length ?? 0);
        if (size < full.length) {
          if (delta.recolor.length) v.recolor = delta.recolor;
          if (overlay) v.overlay = overlay;
          variants.push(v);
          continue;
        }
      }
      variants.push({ ...v, image: full });
    }
  }
  const bundle = { format: BUNDLE_FORMAT, name: compiled.name, size: compiled.size,
    ground: compiled.ground ?? groundFromPixels(top, compiled.size), animations };
  if (compiled.skins) bundle.skins = Object.keys(compiled.skins);
  if (compiled.states) bundle.states = compiled.states;
  const points = bakePoints(compiled);
  if (points) bundle.points = points;
  // A skin that moves the parts points ride on gets its own table (only when it differs).
  for (const [skin, sc] of Object.entries(compiled.skins ?? {})) {
    const sp = bakePoints(sc);
    if (sp && JSON.stringify(sp) !== JSON.stringify(points)) (bundle.skinPoints ??= {})[skin] = sp;
  }
  bundle.variants = variants;
  return bundle;
}

/**
 * World position and angle of every attachment point, per animation and frame, in spec units:
 * { name: { anim: [[x, y, rotDeg], ...] } }. null when the spec has no points.
 */
export function bakePoints(compiled) {
  // "beak@front" is where the point "beak" is in the front view's animations ("idle@front").
  const names = Object.keys(compiled.points ?? {}).filter((n) => !n.includes('@'));
  if (!names.length) return null;
  const out = Object.fromEntries(names.map((n) => [n, {}]));
  for (const [animName, anim] of Object.entries(compiled.animations)) {
    const view = animName.includes('@') && !/^((un)?turn|look)@/.test(animName) ? animName.slice(animName.indexOf('@')) : '';
    for (const n of names) out[n][animName] = [];
    for (let f = 0; f < anim.frames; f++) {
      const { world } = worldMatrices(compiled.parts, samplePose(compiled, anim, f));
      for (const n of names) {
        const { part, at } = (view && compiled.points[n + view]) || compiled.points[n];
        const m = world.get(part), [x, y] = apply(m, at);
        out[n][animName].push([r2(x), r2(y), r2(angleOf(m))]);
      }
    }
  }
  return out;
}

/** The compiled spec without the views not asked for ("idle@back", "turn@back", … gone). */
export function keepViews(compiled, views) {
  if (views == null || views === true) return compiled;
  const keep = new Set(views === false ? [] : views);
  const viewOf = (name) => (name.includes('@') ? name.slice(name.indexOf('@') + 1) : null);
  const drop = (name) => { const v = viewOf(name); return v != null && !keep.has(v); };
  const filter = (c) => ({ ...c, animations: Object.fromEntries(Object.entries(c.animations).filter(([n]) => !drop(n))) });
  const out = filter(compiled);
  if (compiled.skins) out.skins = Object.fromEntries(Object.entries(compiled.skins).map(([k, sc]) => [k, filter(sc)]));
  return out;
}

/**
 * A skin sheet as a change to the default one: { recolor: [[from, to], ...] as "rrggbbaa" hex, overlay?: rgba }.
 * Each default colour is swapped for the skin colour it most often becomes; the overlay holds the pixels
 * that still differ. null when that cannot express the skin (it erases pixels, or the layout differs).
 */
export function skinDelta(base, skin) {
  if (!base || base.width !== skin.width || base.height !== skin.height) return null;
  const a = base.rgba, b = skin.rgba, n = a.length >> 2;
  const key = (px, i) => (px[i + 3] === 0 ? 0 : ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0);
  const votes = new Map();
  for (let i = 0; i < n * 4; i += 4) {
    const from = key(a, i), to = key(b, i);
    if (from === 0 || to === 0) continue;
    let m = votes.get(from); if (!m) votes.set(from, (m = new Map()));
    m.set(to, (m.get(to) ?? 0) + 1);
  }
  const map = new Map();
  for (const [from, m] of votes) {
    let best = from, bestN = -1;
    for (const [to, c] of m) if (c > bestN || (c === bestN && to === from)) { best = to; bestN = c; }
    if (best !== from) map.set(from, best);
  }
  let overlay = null;
  for (let i = 0; i < n * 4; i += 4) {
    const from = key(a, i), want = key(b, i);
    const got = from === 0 ? 0 : (map.get(from) ?? from);
    if (got === want) continue;
    if (want === 0) return null;   // the skin removes a pixel: an overlay cannot
    overlay ??= new Uint8Array(a.length);
    overlay.set(b.subarray(i, i + 4), i);
  }
  const hex = (k) => k.toString(16).padStart(8, '0');
  return { recolor: [...map].map(([f, t]) => [hex(f), hex(t)]), overlay };
}

/** Fallback foot line: the lowest opaque row of the first frame of the first animation, in units. */
export function groundFromPixels(sheet, size) {
  if (!sheet) return size[1];
  const { frameW, frameH } = sheet.meta;
  for (let y = frameH - 1; y >= 0; y--) for (let x = 0; x < frameW; x++)
    if (sheet.rgba[(y * sheet.width + x) * 4 + 3] > 0) return r2(((y + 1) / frameH) * size[1]);
  return size[1];
}
