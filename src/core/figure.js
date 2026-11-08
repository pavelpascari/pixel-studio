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
  return expandFigure(spec, fig, fit, warn);
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
    const { motion, tracks: userTracks, reach, events: userEvents, holds, ...over } = a;
    const params = { ...(preset ?? { model: motion }), ...over };
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
  const { figure: _f, ...restSpec } = spec;
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

