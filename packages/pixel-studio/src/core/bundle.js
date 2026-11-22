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
 * animations: which animations to ship (["idle", "waddle"], or "stage" for what <pixel-stage> uses; default all),
 *   with what they need (see selectAnimations). States nodes that play a dropped animation are pruned.
 * deltas: store a skin as a change to the default sheet when smaller (default true).
 */
export async function buildBundle(compiled, { resolutions = [16, 32, 64], overrides = {}, encode, views, animations: only, deltas = true } = {}) {
  if (typeof encode !== 'function') throw new Error('buildBundle needs an encode(w, h, rgba) function that returns an image URL (see encodePNG for Node)');
  if (only != null) compiled = keepAnimations(compiled, selectAnimations(compiled, only));
  compiled = keepViews(compiled, views);
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
  // Fewer animations (or views) can leave state nodes with nothing to play: those go, with the transitions to them.
  const states = compiled.states && pruneStates(compiled.states, animations);
  if (states) bundle.states = states;
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
 * What <pixel-stage> looks up for each role, in order: the first one a character has is the one it plays.
 * Keep in step with ROLES in packages/runtime/src/pixel-stage.js (a test compares them).
 */
export const STAGE_ROLES = Object.freeze({
  idle: ['idle'], walk: ['walk', 'waddle', 'trot', 'travel'], run: ['run', 'trot', 'travel', 'walk', 'waddle'],
  rush: ['rush'], jump: ['jump'], fall: ['fall'], sit: ['sit'], duck: ['duck', 'sneak'], peek: ['peek'], climb: ['climb'],
  react: ['honk', 'wave', 'hop'],
});

// Generated per view: the turns and the ¾ look. Every other "x@view" is the view's version of "x".
const VIEW_CLIP = /^((un)?turn|look)@/;

/**
 * The names of the animations to ship for `wanted` (names, and/or "stage": the one <pixel-stage> plays for each
 * role the character has), in spec order, with what they need to stay playable: each one's views ("idle@front"),
 * the turns and look of every view that keeps an animation ("turn@front", "unturn@front", "look@front"), and the
 * transitions between two kept animations ("waddle>idle"). Throws on a name the character does not have.
 */
export function selectAnimations(compiled, wanted) {
  const all = Object.keys(compiled.animations);
  const own = all.filter((n) => !n.includes('@') && !n.includes('>'));
  const list = typeof wanted === 'string' ? wanted.split(',') : wanted;
  if (!Array.isArray(list)) throw new Error('animations must be a list of names, e.g. ["idle", "walk"] or ["stage"]');
  const keep = new Set();
  for (const raw of list) {
    const w = String(raw).trim();
    if (!w) continue;
    if (w === 'stage' && !compiled.animations.stage) {
      for (const names of Object.values(STAGE_ROLES)) { const n = names.find((x) => compiled.animations[x]); if (n) keep.add(n); }
      // A stage without an idle stands in the first animation.
      if (!STAGE_ROLES.idle.some((x) => compiled.animations[x]) && own.length) keep.add(own[0]);
      continue;
    }
    if (!Object.hasOwn(compiled.animations, w)) throw new Error(`no animation "${w}" in ${compiled.name ?? 'this character'} (have: ${own.join(', ')}; or "stage" for what <pixel-stage> uses)`);
    keep.add(w);
  }
  if (!keep.size) throw new Error(`no animations to keep (have: ${own.join(', ')})`);
  const at = (n) => n.indexOf('@');
  for (const n of all) if (at(n) > 0 && !n.includes('>') && !VIEW_CLIP.test(n) && keep.has(n.slice(0, at(n)))) keep.add(n);
  const views = new Set([...keep].filter((n) => at(n) > 0 && !n.includes('>')).map((n) => n.slice(at(n) + 1)));
  for (const n of all) if (VIEW_CLIP.test(n) && views.has(n.slice(at(n) + 1))) keep.add(n);
  for (const n of all) if (n.includes('>')) { const [a, b] = n.split('>'); if (keep.has(a) && keep.has(b)) keep.add(n); }
  return all.filter((n) => keep.has(n));
}

/** The compiled spec (and its skins) with only the named animations. */
export function keepAnimations(compiled, names) {
  const keep = new Set(names);
  const filter = (c) => ({ ...c, animations: Object.fromEntries(Object.entries(c.animations).filter(([n]) => keep.has(n))) });
  const out = filter(compiled);
  if (compiled.skins) out.skins = Object.fromEntries(Object.entries(compiled.skins).map(([k, sc]) => [k, filter(sc)]));
  return out;
}

/**
 * The state machine without the nodes whose animation is not in `animations` (and the transitions to or from only
 * those, and random fidgets that play one). A node whose `then` was dropped goes back to the previous node instead;
 * a dropped `initial` becomes the first node left. null when no node is left. Unchanged when nothing is dropped.
 */
export function pruneStates(states, animations) {
  const has = (n) => typeof n === 'string' && Object.hasOwn(animations, n);
  const entries = Object.entries(states.nodes ?? {});
  const kept = entries.filter(([, node]) => has(node?.anim));
  const fidgetsOk = kept.every(([, node]) => !Array.isArray(node.random) || node.random.every((f) => has(f?.anim)));
  if (kept.length === entries.length && fidgetsOk) return states;
  if (!kept.length) return null;
  const names = new Set(kept.map(([n]) => n));
  const nodes = Object.fromEntries(kept.map(([n, node]) => {
    const out = { ...node };
    if (Array.isArray(node.random)) {
      out.random = node.random.filter((f) => has(f?.anim));
      if (!out.random.length) delete out.random;
    }
    if (out.then != null && out.then !== 'previous' && !names.has(out.then)) out.then = 'previous';
    return [n, out];
  }));
  const out = { ...states, nodes };
  if (states.initial != null && !names.has(states.initial)) out.initial = kept[0][0];
  if (Array.isArray(states.transitions)) {
    out.transitions = states.transitions.flatMap((t) => {
      if (!names.has(t?.to)) return [];
      if (t.from == null || t.from === '*') return [t];
      const from = [].concat(t.from).filter((f) => f === '*' || names.has(f));
      return from.length ? [{ ...t, from: Array.isArray(t.from) ? from : from[0] }] : [];
    });
  }
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
