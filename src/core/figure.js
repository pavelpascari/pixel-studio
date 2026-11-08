// Figures: a library of skeletons ("dots and lines") with realistic motion models.
//
//   figures/goose.json = { name, size, bones: [{id, parent, from, to, z, side, limits, follow}],
//                          rig: {root, legs, neck, head, arms, tail}, motions: {walk: {model:"gait", ...}} }
//
// A character spec picks a figure and dresses its bones:
//
//   { "figure": "goose",                         // or {"use": "goose", "bones": {"neck": {"to": [61, 46]}}}
//     "parts": [
//       {"id": "head", "shapes": [...]},          // same id as a bone: the shapes ride on that bone
//       {"id": "hat", "bone": "head", "shapes": [...]}   // a layer attached to a bone
//     ],
//     "animations": {
//       "walk": {"motion": "walk"},               // a motion from the figure's library
//       "sneak": {"motion": "walk", "stride": 8, "crouch": 4, "tracks": {"tail": {"rot": 5}}}
//     } }                                         // params override the preset; tracks add on top
//
// With no "parts", the skeleton itself is drawn (dots and lines). With no "animations", every
// motion in the figure's library is included. Expansion produces a plain spec: bones become parts
// with empty shapes (and a "tip"), motions become tracks.
import { generateMotion, MOTION_MODELS, LEGGED_MODELS, OVERSAMPLE } from './motion.js';
import { sampleValue } from './animate.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Keys that must never be used to index a plain object built from spec data. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeTracks(base, over) {
  const out = clone(base);
  for (const [id, props] of Object.entries(over ?? {})) {
    if (UNSAFE_KEYS.has(id) || !isObj(props)) continue;
    out[id] = { ...(isObj(out[id]) ? out[id] : {}), ...clone(props) };
  }
  return out;
}

function figureError(errors) {
  const e = new Error(errors.map((x) => `${x.path}: ${x.message}`).join('; '));
  e.errors = errors;
  return e;
}

/**
 * Resolve a spec's "figure" (after "extends"). `loadFigure(name)` returns the figure JSON.
 * `warn(path, message)` receives notes (e.g. a stride too long for the legs).
 */
export async function resolveFigure(spec, loadFigure, { warn = () => {} } = {}) {
  if (!isObj(spec) || spec.figure == null) return spec;
  let fig = spec.figure, fit = {};
  if (typeof fig === 'string' || (isObj(fig) && typeof fig.use === 'string')) {
    const name = typeof fig === 'string' ? fig : fig.use;
    fit = typeof fig === 'string' ? {} : fig;
    try { fig = await loadFigure(name); } catch (e) { throw figureError([{ path: '$.figure', message: `cannot load figure "${name}": ${e.message}` }]); }
  }
  if (!isObj(fig) || !Array.isArray(fig.bones)) throw figureError([{ path: '$.figure', message: 'figure must be a name like "goose", {"use": "goose", ...} or an object with "bones"' }]);
  const out = expandFigure(spec, fig, fit, warn);
  if (spec.views != null) await addViews(out, spec.views, loadFigure, warn);
  return out;
}

// --- views: the same character seen from other angles ------------------------------------------------
//
//   "views": {
//     "front": {"figure": "goose-front", "parts": [...], "animations": {...}, "look": {"part": "head", "replaces": "head"}},
//     "back":  {"figure": "goose-front", "parts": [...]}
//   }
//
// Each view dresses its own figure (same size and materials). Its parts join the spec with the view's
// name in front ("front.body"), hidden except in that view's animations, which are named
// "<animation>@<view>" ("idle@front"). Generated for every view: "turn@<view>" (from the side to that
// view, a one-shot) and "unturn@<view>" (back to the side). "look" puts the view's part (a head turned
// toward the viewer, with its children) in place of a side part: "look@<view>" is the side idle with
// the head turned, a three-quarter view, and the turns pass through it.

const VIEW_NAME = /^[a-z][a-zA-Z0-9_-]*$/;
const TURN_FPS = 12;

async function addViews(out, views, loadFigure, warn) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!isObj(views)) throw figureError([{ path: '$.views', message: 'views must be an object like {"front": {"figure": "goose-front", "parts": [...]}}' }]);
  // Top-level parts; those hidden by default (props like a server rack) stay hidden in turns too.
  const sideRoots = out.parts.filter((p) => isObj(p) && !p.parent).map((p) => p.id);
  const sideShown = out.parts.filter((p) => isObj(p) && !p.parent && p.show !== 0).map((p) => p.id);
  const byId = Object.fromEntries(out.parts.filter(isObj).map((p) => [p.id, p]));
  const built = [];
  for (const [view, v] of Object.entries(views)) {
    const path = `$.views.${view}`;
    if (!VIEW_NAME.test(view) || view === 'side' || UNSAFE_KEYS.has(view)) { err(path, 'a view name is a word like "front" or "back" ("side" is the main view)'); continue; }
    if (!isObj(v) || v.figure == null) { err(path, 'a view needs a "figure", e.g. {"figure": "goose-front", "parts": [...]}'); continue; }
    let fig = v.figure, fit = {};
    if (typeof fig === 'string' || (isObj(fig) && typeof fig.use === 'string')) {
      const name = typeof fig === 'string' ? fig : fig.use;
      fit = typeof fig === 'string' ? {} : fig;
      try { fig = await loadFigure(name); } catch (e) { err(`${path}.figure`, `cannot load figure "${name}": ${e.message}`); continue; }
    }
    if (!isObj(fig) || !Array.isArray(fig.bones)) { err(`${path}.figure`, 'figure must be a name like "goose-front" or an object with "bones"'); continue; }
    // A view with no parts of its own is drawn as its skeleton; that is a mistake in a dressed character.
    if (!Array.isArray(v.parts) || !v.parts.length) { err(`${path}.parts`, 'a view needs parts that dress its figure (like the main spec\'s "parts")'); continue; }
    let sub;
    try {
      sub = expandFigure({ size: out.size, parts: v.parts, ...(v.animations ? { animations: v.animations } : {}) }, fig, fit,
        (p, m) => warn(p.replace(/^\$/, path), m));
    } catch (e) {
      for (const x of e.errors ?? [{ path: '$', message: e.message }]) err(x.path.replace(/^\$/, path), x.message);
      continue;
    }
    const pre = (id) => `${view}.${id}`;
    const parts = sub.parts.map((p) => ({ ...p, id: pre(p.id), ...(p.parent ? { parent: pre(p.parent) } : {}) }));
    const roots = parts.filter((p) => !p.parent).map((p) => p.id);
    const shown = parts.filter((p) => !p.parent && p.show !== 0).map((p) => p.id);
    for (const p of parts) if (!p.parent) p.show = 0;
    out.parts.push(...parts);
    for (const [n, pt] of Object.entries(sub.points ?? {})) (out.points ??= {})[`${n}@${view}`] = { part: pre(pt.part), at: pt.at };
    const look = v.look == null ? null : lookPart(v.look, `${path}.look`, view, parts, byId, err);
    if (look) out.parts.push(...look.parts);
    built.push({ view, roots, shown, prefix: pre, sub, look });
  }
  if (errors.length) throw figureError(errors);

  const allRoots = [...sideRoots, ...built.flatMap((b) => b.roots), ...built.filter((b) => b.look).map((b) => b.look.root)];
  const showOnly = (visible) => Object.fromEntries(allRoots.map((id) => [id, { show: visible.includes(id) ? 1 : 0 }]));
  // In a view's own animation its hidden props keep whatever the animation says (a track can show them).
  const viewTracks = (b, tracks) => {
    const t = { ...tracks, ...showOnly(b.shown) };
    for (const id of b.roots) if (!b.shown.includes(id)) t[id] = tracks[id] ?? { show: 0 };
    return t;
  };
  const idleName = out.animations.idle ? 'idle' : Object.keys(out.animations)[0];
  for (const b of built) {
    for (const [name, a] of Object.entries(b.sub.animations)) {
      if (!isObj(a)) continue;
      const tracks = {};
      for (const [id, t] of Object.entries(a.tracks ?? {})) tracks[b.prefix(id)] = t;
      out.animations[`${name}@${b.view}`] = { ...a, tracks: viewTracks(b, tracks) };
    }
    // The turn: side (or the three-quarter look) → squeezed → the view squeezed → the view.
    const from = b.look ? [...sideShown, b.look.root] : sideShown;
    const turn = { frames: 4, fps: TURN_FPS, loop: false, tracks: {} };
    for (const id of allRoots) turn.tracks[id] = { show: [0, 0, 0, 0] };
    for (const id of from) turn.tracks[id] = { show: [1, 1, 0, 0], sx: [1, 0.86, 1, 1] };
    for (const id of b.shown) turn.tracks[id] = { show: [0, 0, 1, 1], sx: [1, 1, 0.86, 1] };
    if (b.look) turn.tracks[b.look.replaces] = { show: 0 };
    const rev = (t) => Object.fromEntries(Object.entries(t).map(([id, props]) => [id, Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.isArray(v) ? [...v].reverse() : v]))]));
    out.animations[`turn@${b.view}`] = turn;
    out.animations[`unturn@${b.view}`] = { ...turn, tracks: rev(turn.tracks) };
    if (b.look && idleName && isObj(out.animations[idleName])) {
      const idle = clone(out.animations[idleName]);
      const head = idle.tracks?.[b.look.replaces];
      idle.tracks = { ...(idle.tracks ?? {}), [b.look.replaces]: { show: 0 }, [b.look.root]: { ...(head ? clone(head) : {}), show: 1 } };
      out.animations[`look@${b.view}`] = idle;
    }
  }
}

/** The view's part (with its children) copied onto the side figure in place of a side part. */
function lookPart(look, path, view, parts, sideById, err) {
  if (!isObj(look) || typeof look.part !== 'string' || typeof look.replaces !== 'string') {
    err(path, 'look must be {"part": "head", "replaces": "head"}: a part of this view shown in place of a side part'); return null;
  }
  const src = parts.find((p) => p.id === `${view}.${look.part}`);
  if (!src) { err(`${path}.part`, `this view has no part "${look.part}"`); return null; }
  const side = sideById[look.replaces];
  if (!side) { err(`${path}.replaces`, `the main view has no part "${look.replaces}"`); return null; }
  const ids = new Set([src.id]);
  for (let grew = true; grew;) { grew = false; for (const p of parts) if (p.parent && ids.has(p.parent) && !ids.has(p.id)) { ids.add(p.id); grew = true; } }
  const pre = (id) => `${view}-look.${id.slice(view.length + 1)}`;
  const sp = side.pivot ?? [0, 0], vp = src.pivot ?? [0, 0];
  const copied = parts.filter((p) => ids.has(p.id)).map((p) => {
    const c = clone(p);
    c.id = pre(p.id);
    if (p.id === src.id) {
      c.parent = side.parent; c.x = (c.x ?? 0) + sp[0] - vp[0]; c.y = (c.y ?? 0) + sp[1] - vp[1]; c.show = 0;
      c.z = side.z ?? c.z;
      if (!side.parent) delete c.parent;
    } else c.parent = pre(p.parent);
    return c;
  });
  return { parts: copied, root: pre(src.id), replaces: look.replaces };
}

export function expandFigure(spec, figure, fit = {}, warn = () => {}) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const fig = clone(figure);
  const size = spec.size ?? fig.size ?? [100, 100];

  // --- bones (fitted to this character) ---------------------------------------------------------
  const s = fit.scale ?? 1, o = fit.offset ?? [0, 0];
  const origin = fit.origin ?? [size[0] / 2, size[1]];
  const tf = (p) => [origin[0] + (p[0] - origin[0]) * s + o[0], origin[1] + (p[1] - origin[1]) * s + o[1]];
  const bones = fig.bones.map((b) => ({ ...b, from: tf(b.from), to: tf(b.to) }));
  const boneById = Object.fromEntries(bones.map((b) => [b.id, b]));
  for (const [id, patch] of Object.entries(fit.bones ?? {})) {
    if (!Object.hasOwn(boneById, id)) { err(`$.figure.bones.${id}`, `the figure has no bone "${id}" (bones: ${bones.map((b) => b.id).join(', ')})`); continue; }
    Object.assign(boneById[id], clone(patch));
  }

  // --- parts: bones first (in figure order), dressed by spec parts with the same id -----------------
  const stick = !Array.isArray(spec.parts) || !spec.parts.length;
  const parts = bones.map((b, i) => {
    const far = b.side === 'far';
    const part = { id: b.id, pivot: b.from, tip: b.to, z: b.z ?? i, shapes: [] };
    if (b.parent) part.parent = b.parent;
    if (far) part.shade = -0.3;
    if (b.follow != null) part.follow = b.follow;
    if (stick) {
      part.shapes.push({ type: 'capsule', x1: b.from[0], y1: b.from[1], x2: b.to[0], y2: b.to[1], r: 1.4, material: 'bone' });
      part.shapes.push({ type: 'circle', cx: b.from[0], cy: b.from[1], r: 2.4, material: 'joint' });
      if (!bones.some((c) => c.parent === b.id)) part.shapes.push({ type: 'circle', cx: b.to[0], cy: b.to[1], r: 1.8, material: 'joint' });
    }
    return part;
  });
  const partById = Object.fromEntries(parts.map((p) => [p.id, p]));
  for (const [i, p] of (stick ? [] : spec.parts).entries()) {
    if (!isObj(p)) { parts.push(p); continue; }
    if (Object.hasOwn(partById, p.id) && partById[p.id].tip) {
      // Dress the bone: shapes and fields (z, shade, x, y, sx, sy, show, follow, even pivot) apply to it.
      const { bone, ...fields } = p;
      Object.assign(partById[p.id], clone(fields));
      continue;
    }
    const { bone, ...rest } = p;
    if (bone != null) {
      const b = Object.hasOwn(boneById, bone) ? boneById[bone] : null;
      if (!b) { err(`$.parts[${i}].bone`, `unknown bone "${bone}" (bones: ${bones.map((x) => x.id).join(', ')})`); continue; }
      parts.push(clone({ parent: bone, pivot: b.from, z: (b.z ?? 0) + 0.5, ...rest }));
    } else parts.push(clone(rest));
  }

  // --- animations: motions → tracks -------------------------------------------------------------------
  const motions = fig.motions ?? {};
  const animsIn = spec.animations ?? Object.fromEntries(Object.keys(motions).map((k) => [k, { motion: k }]));
  const animations = {};
  const motionParts = parts.filter(isObj).map((p) => ({
    id: p.id, parent: p.parent ?? null, pivot: p.pivot ?? [size[0] / 2, size[1] / 2], tip: p.tip, limits: boneById[p.id]?.limits,
    base: { x: p.x ?? 0, y: p.y ?? 0, rot: p.rot ?? 0, sx: p.sx ?? 1, sy: p.sy ?? 1, show: p.show ?? 1 },
  }));
  for (const [name, a] of Object.entries(animsIn)) {
    if (!isObj(a) || a.motion == null) { animations[name] = a; continue; }
    const path = `$.animations.${name}`;
    const preset = typeof a.motion === 'string' ? motions[a.motion] : null;
    if (!preset && !MOTION_MODELS.includes(a.motion)) {
      err(`${path}.motion`, `unknown motion "${a.motion}" (this figure has: ${Object.keys(motions).join(', ') || 'none'}; models: ${MOTION_MODELS.join(', ')})`);
      continue;
    }
    const { motion, tracks: specTracks, reach, events: specEvents, holds: specHolds, ...over } = a;
    // A library motion may carry its own tracks (a pose layered on the model: wings beating on a run);
    // the spec's tracks override them part by part, property by property.
    const { tracks: presetTracks, events: presetEvents, holds: presetHolds, ...presetParams } = preset ?? {};
    const userEvents = specEvents ?? presetEvents, holds = specHolds ?? presetHolds;
    const userTracks = presetTracks ? mergeTracks(presetTracks, specTracks) : specTracks;
    const params = { ...(preset ? presetParams : { model: motion }), ...over };
    if (!MOTION_MODELS.includes(params.model ?? 'gait')) { err(`${path}`, `unknown motion model "${params.model}"`); continue; }
    const missing = ['root', ...(LEGGED_MODELS.includes(params.model ?? 'gait') ? ['legs'] : [])].filter((k) => !fig.rig?.[k]);
    if (missing.length) { err(path, `figure "${fig.name}" has no rig.${missing.join('/rig.')}, which motion "${a.motion}" needs`); continue; }
    const frames = params.frames ?? 8, fps = params.fps ?? 8;
    const loop = params.loop !== false;
    const gen = generateMotion(motionParts, fig.rig, { ...params, frames, fps, input: userTracks ?? {} });
    for (const n of gen.notes) warn(path, `${n}: shorten the stride or lower "reach"`);
    // Root tracks were applied inside the motion (before the feet were solved); layer the rest.
    const rest = clone(userTracks ?? {});
    if (rest[fig.rig.root]) for (const k of ['x', 'y', 'rot']) delete rest[fig.rig.root][k];
    const M = loop ? frames * OVERSAMPLE : (frames - 1) * OVERSAMPLE + 1;
    const tracks = layerTracks(gen.tracks, rest, M, loop);
    const out = { frames, fps, tracks };
    if (!loop) out.loop = false;
    if (gen.speed) out.speed = gen.speed;
    if (gen.speedY) out.speedY = gen.speedY;
    if (gen.wall != null) out.wall = gen.wall;   // climb: x of the wall the feet hold, in units
    if (reach) out.reach = reach;
    // Model events (footstep, takeoff, land, launch) become frame numbers: an event fires when the
    // first frame at or after its time is shown. Author events are added as written.
    const evs = gen.events.map((e) => {
      const f = Math.max(0, loop ? Math.ceil(e.u * frames - 1e-6) % frames : Math.min(frames - 1, Math.ceil(e.u * (frames - 1) - 1e-6)));
      return { frame: f, name: e.name, ...(e.data ? { data: e.data } : {}) };
    });
    if (Array.isArray(userEvents)) evs.push(...clone(userEvents));
    else if (userEvents === false) evs.length = 0;   // "events": false turns the model's events off
    if (evs.length) out.events = evs.sort((x, y) => x.frame - y.frame);
    if (holds) out.holds = clone(holds);
    animations[name] = out;
  }

  if (errors.length) throw figureError(errors);
  const { figure: _f, views: _v, ...restSpec } = spec;
  const out = { ...clone(restSpec), size, parts, animations };
  // The foot line (where the sprite stands on a page) and attachment points come from the figure;
  // the spec's own values win.
  if (out.ground == null) {
    const g = fig.ground != null ? tf([0, fig.ground])[1] : groundOf(fig.rig ?? {}, boneById);
    if (g != null) out.ground = Math.round(g * 100) / 100;
  }
  const figPoints = fig.points ?? {};
  if (Object.keys(figPoints).length || out.points) {
    const pts = {};
    for (const [name, pt] of Object.entries(figPoints)) if (Object.hasOwn(partById, pt.part)) pts[name] = { part: pt.part, at: Array.isArray(pt.at) ? tf(pt.at) : pt.at };
    out.points = { ...pts, ...(out.points ?? {}) };
    for (const [k, v] of Object.entries(out.points)) if (v === null) delete out.points[k];
  }
  if (stick) {
    out.name ??= `${fig.name ?? 'figure'} skeleton`;
    out.materials = { bone: { color: '#e9e6f2', flat: true }, joint: { color: '#ffcf4a', flat: true, outline: false } };
    out.style ??= { outline: 'dark' };
  }
  return out;
}

/** Rest-pose foot line: the lowest toe of the legs, else the shadow's line, else the root's pivot. */
function groundOf(rig, boneById) {
  const toes = (rig.legs ?? []).map((l) => boneById[l.chain[l.chain.length - 1]]?.to?.[1]).filter((v) => v != null);
  if (toes.length) return Math.max(...toes);
  if (rig.shadow && boneById[rig.shadow]) return boneById[rig.shadow].from[1];
  if (rig.root && boneById[rig.root]) return Math.max(boneById[rig.root].from[1], boneById[rig.root].to[1]);
  return null;
}

/** Author tracks layer on top of generated ones: x/y/rot add, sx/sy multiply, show replaces. */
function layerTracks(gen, user, M, loop = true) {
  const out = clone(gen);
  for (const [pid, props] of Object.entries(user)) {
    if (!isObj(props) || UNSAFE_KEYS.has(pid)) continue;
    for (const [prop, v] of Object.entries(props)) {
      if (UNSAFE_KEYS.has(prop)) continue;
      const g = out[pid]?.[prop];
      out[pid] ??= {};
      if (g == null || prop === 'show') { out[pid][prop] = clone(v); continue; }
      const mul = prop === 'sx' || prop === 'sy';
      out[pid][prop] = Array.from({ length: M }, (_, i) => {
        const gv = typeof g === 'number' ? g : g[i];
        const uv = sampleValue(v, loop ? i / M : i / (M - 1), loop, false, mul ? 1 : 0);
        return Math.round((mul ? gv * uv : gv + uv) * 100) / 100;
      });
    }
  }
  return out;
}

