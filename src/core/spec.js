// Character spec: validation (agent-friendly errors with JSON paths) and compilation.
import { parseHex } from './color.js';
import { SHAPE_TYPES, SHAPE_REQUIRED, SHAPE_KEYS, compileShape } from './shapes.js';
import { TEXTURES } from './textures.js';
import { mergeVariant } from './extend.js';
import { buildMixes } from './mix.js';

export const TRACK_PROPS = Object.freeze(['x', 'y', 'rot', 'sx', 'sy', 'show']);
const PROFILES = ['dome', 'flat', 'none'];
const WAVE_SHAPES = ['sin', 'tri', 'square', 'bounce'];
const EASES = ['linear', 'smooth', 'step'];
const OUTLINES = ['none', 'dark', 'selective'];

/** Names that would reach Object.prototype when used as keys. */
// Names that collide with built-in object keys (`{}.toString`, `__proto__`): a material or node called that
// would look up the wrong thing. Every name-keyed map in a spec rejects them.
const UNSAFE_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
const unsafe = (name) => UNSAFE_NAMES.has(name);
/** How far outside the canvas a coordinate may be, in canvas sizes (keeps sampling and rendering bounded). */
const REACH = 4;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPt = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const isTrackValue = (v) => isNum(v) || (Array.isArray(v) && v.length > 0 && v.every(isNum)) ||
  (!!v && typeof v === 'object' && !Array.isArray(v) && (isNum(v.wave) || (Array.isArray(v.keys) && v.keys.length > 0 && v.keys.every(isNum))));
const TRACK_HINT = 'a number, an array of keyframes, {"keys":[...]} or {"wave":amp,...}';

function didYouMean(word, options) {
  let best = null, bestD = 3;
  for (const o of options) {
    const d = lev(String(word), o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? ` — did you mean "${best}"?` : '';
}
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}


const KNOWN = {
  top: ['name', 'size', 'materials', 'parts', 'animations', 'style', 'description', '$schema', 'figure', 'points', 'ground', 'skins', 'states', 'mixes'],
  material: ['color', 'texture', 'textureStrength', 'textureScale', 'shine', 'flat', 'outline', 'tones'],
  part: ['id', 'parent', 'pivot', 'z', 'shade', 'x', 'y', 'rot', 'sx', 'sy', 'show', 'shapes', 'tip', 'follow'],
  shape: SHAPE_KEYS,   // shared with plug-in shapes
  animation: ['frames', 'fps', 'loop', 'tracks', 'reach', 'speed', 'motion', 'events', 'holds', 'speedY', 'wall'],
  point: ['part', 'at'],
  event: ['frame', 'name', 'data'],
  follow: ['freq', 'damping', 'amount', 'max'],
  reach: ['chain', 'end', 'tip', 'target', 'aim', 'limits'],
  style: ['outline', 'outlineColor', 'light', 'elevation', 'ambient', 'curvature', 'tones', 'texture', 'dither',
    'innerLines', 'contactShadow', 'hueShift', 'snap', 'flip'],
  wave: ['wave', 'phase', 'cycles', 'offset', 'shape'],
  keys: ['keys', 'ease'],
};
function unknownKeys(obj, kind, path, warn) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const k of Object.keys(obj)) {
    if (!KNOWN[kind].includes(k)) warn(`${path}.${k}`, `unknown ${kind} property (ignored)${didYouMean(k, KNOWN[kind])}`);
  }
}

/**
 * Validate a spec object. Returns { errors: [{path, message}], warnings: [{path, message}] }.
 * Errors block rendering; warnings are hints (unused material, off-canvas shape, ...).
 */
export function validate(spec) {
  const errors = [], warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    err('$', 'spec must be a JSON object');
    return { errors, warnings };
  }
  unknownKeys(spec, 'top', '$', warn);
  if (spec.figure != null) err('$.figure', '"figure" must be resolved before validating (resolveSpec in the API; the CLI and studio do it for you)');
  unknownKeys(spec.style, 'style', '$.style', warn);
  const size = spec.size ?? [100, 100];
  if (!isPt(size) || size[0] <= 0 || size[1] <= 0 || size[0] > 1000 || size[1] > 1000) err('$.size', 'size must be [width, height] in units (each 1..1000), e.g. [100, 100]');

  const mats = spec.materials;
  if (!mats || typeof mats !== 'object' || Array.isArray(mats) || !Object.keys(mats).length) {
    err('$.materials', 'materials must be a non-empty object: { "skin": { "color": "#f1c27d" } }');
  } else {
    for (const [name, m] of Object.entries(mats)) {
      const p = `$.materials.${name}`;
      if (unsafe(name)) { err(p, `"${name}" cannot be used as a material name`); continue; }
      if (typeof m === 'string') { if (!parseHex(m)) err(p, `"${m}" is not a hex colour`); continue; }
      if (!m || typeof m !== 'object') { err(p, 'material must be an object or a hex string'); continue; }
      unknownKeys(m, 'material', p, warn);
      if (!parseHex(m.color)) err(`${p}.color`, `"${m.color}" is not a hex colour like "#a0522d"`);
      if (m.texture != null && !TEXTURES.includes(m.texture))
        err(`${p}.texture`, `unknown texture "${m.texture}" (one of ${TEXTURES.join(', ')})${didYouMean(m.texture, TEXTURES)}`);
      if (m.shine != null && !(isNum(m.shine) && m.shine >= 0 && m.shine <= 1)) err(`${p}.shine`, 'shine must be 0..1');
      for (const k of ['textureStrength', 'textureScale']) if (m[k] != null && !isNum(m[k])) err(`${p}.${k}`, `${k} must be a number`);
      if (m.tones != null && !(Number.isInteger(m.tones) && m.tones >= 2 && m.tones <= 6)) err(`${p}.tones`, 'tones must be a whole number 2..6');
    }
  }
  const matNames = new Set(mats && typeof mats === 'object' ? Object.keys(mats) : []);
  const usedMats = new Set();

  const parts = spec.parts;
  const partIds = new Set();
  if (!Array.isArray(parts) || !parts.length) {
    err('$.parts', 'parts must be a non-empty array');
  } else {
    parts.forEach((part, i) => {
      const p = `$.parts[${i}]`;
      if (!part || typeof part !== 'object') return err(p, 'part must be an object');
      unknownKeys(part, 'part', p, warn);
      if (typeof part.id !== 'string' || !part.id) err(`${p}.id`, 'part needs a string id');
      else if (UNSAFE_NAMES.has(part.id)) err(`${p}.id`, `"${part.id}" cannot be used as an id`);
      else if (partIds.has(part.id)) err(`${p}.id`, `duplicate part id "${part.id}"`);
      else partIds.add(part.id);
      if (part.pivot != null && !isPt(part.pivot)) err(`${p}.pivot`, 'pivot must be [x, y]');
      if (part.z != null && !isNum(part.z)) err(`${p}.z`, 'z must be a number');
      if (part.tip != null && !isPt(part.tip)) err(`${p}.tip`, 'tip must be [x, y] (the end of a bone)');
      for (const k of ['x', 'y', 'rot', 'shade']) if (part[k] != null && !isNum(part[k])) err(`${p}.${k}`, `${k} must be a number (got ${JSON.stringify(part[k])})`);
      for (const k of ['sx', 'sy']) if (part[k] != null && !(isNum(part[k]) && Math.abs(part[k]) <= 16)) err(`${p}.${k}`, `${k} must be a scale between -16 and 16 (got ${JSON.stringify(part[k])})`);
      if (part.show != null && !(isNum(part.show) || typeof part.show === 'boolean')) err(`${p}.show`, 'show must be true/false or a number (shown at >= 0.5)');
      if (part.follow != null) {
        if (isNum(part.follow)) { if (part.follow < 0) err(`${p}.follow`, 'follow amount must be >= 0'); }
        else if (!part.follow || typeof part.follow !== 'object' || Array.isArray(part.follow)) err(`${p}.follow`, 'follow must be an amount (e.g. 1) or {"freq": 3, "damping": 0.3, "amount": 1, "max": 40}');
        else {
          unknownKeys(part.follow, 'follow', `${p}.follow`, warn);
          for (const k of KNOWN.follow) if (part.follow[k] != null && !(isNum(part.follow[k]) && part.follow[k] >= 0)) err(`${p}.follow.${k}`, `${k} must be a number >= 0`);
        }
      }
      // Bones (parts with a "tip", from a figure) may carry no shapes.
      if (part.tip != null && Array.isArray(part.shapes) && !part.shapes.length) return;
      if (!Array.isArray(part.shapes) || !part.shapes.length) return err(`${p}.shapes`, 'part needs a non-empty shapes array');
      part.shapes.forEach((s, j) => {
        const sp = `${p}.shapes[${j}]`;
        if (!s || typeof s !== 'object') return err(sp, 'shape must be an object');
        unknownKeys(s, 'shape', sp, warn);
        if (!SHAPE_TYPES.includes(s.type))
          return err(`${sp}.type`, `unknown shape type "${s.type}" (one of ${SHAPE_TYPES.join(', ')})${didYouMean(s.type, SHAPE_TYPES)}`);
        for (const k of SHAPE_REQUIRED[s.type] ?? []) if (!isNum(s[k])) err(`${sp}.${k}`, `${s.type} needs numeric "${k}"`);
        // sizes are positive; every coordinate stays within a few canvas sizes (a typo like 1e7 would hang the renderer)
        for (const k of ['w', 'h', 'r', 'rx', 'ry', 'r2']) if (s[k] != null && !(isNum(s[k]) && s[k] >= 0)) err(`${sp}.${k}`, `${k} must be a number >= 0 (got ${JSON.stringify(s[k])})`);
        const lim = REACH * Math.max(...(isPt(size) ? size : [100, 100]));
        const coords = [...['x', 'y', 'w', 'h', 'r', 'cx', 'cy', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'r2'].map((k) => [k, s[k]]),
          ...(Array.isArray(s.points) ? s.points.flatMap((pt, k) => (Array.isArray(pt) ? pt.map((v) => [`points[${k}]`, v]) : [])) : [])];
        const far = coords.find(([, v]) => isNum(v) && Math.abs(v) > lim);
        if (far) err(`${sp}.${far[0]}`, `${far[1]} is far outside the canvas (keep shapes within ±${lim} units)`);
        for (const k of ['minDetail', 'maxDetail']) if (s[k] != null && ![1, 2, 3].includes(s[k])) err(`${sp}.${k}`, `${k} must be 1, 2 or 3 (got ${JSON.stringify(s[k])})`);
        if (s.shade != null && !isNum(s.shade)) err(`${sp}.shade`, `shade must be a number (got ${JSON.stringify(s.shade)})`);
        if (s.type === 'ellipse' && !isNum(s.r) && !(isNum(s.rx) && isNum(s.ry))) err(sp, 'ellipse needs "rx" and "ry" (or "r")');
        if (s.type === 'capsule' && !isNum(s.r) && !isNum(s.w)) err(sp, 'capsule needs a radius "r" (or width "w")');
        if (s.type === 'polygon') {
          if (!Array.isArray(s.points) || s.points.length < 3 || !s.points.every(isPt))
            err(`${sp}.points`, 'polygon needs at least 3 points as [[x,y], ...]');
        }
        if (s.op === 'cut') { /* cuts need no material */ }
        else if (s.op != null && s.op !== 'add') err(`${sp}.op`, 'op must be "add" or "cut"');
        else if (typeof s.material !== 'string') err(`${sp}.material`, 'shape needs a "material" name');
        else if (!matNames.has(s.material))
          err(`${sp}.material`, `unknown material "${s.material}"${didYouMean(s.material, [...matNames])}`);
        else usedMats.add(s.material);
        if (s.profile != null && !PROFILES.includes(s.profile)) err(`${sp}.profile`, `profile must be one of ${PROFILES.join(', ')}`);
        if (errors.length === 0 && size && isPt(size)) {
          try {
            const { bbox } = compileShape(s);
            if (bbox[2] < 0 || bbox[3] < 0 || bbox[0] > size[0] || bbox[1] > size[1])
              warn(sp, 'shape lies entirely outside the canvas (before part transforms)');
          } catch { /* reported above */ }
        }
      });
    });
    parts.forEach((part, i) => {
      if (part && part.parent != null && !partIds.has(part.parent))
        err(`$.parts[${i}].parent`, `unknown parent "${part.parent}"${didYouMean(part.parent, [...partIds])}`);
    });
    // Parent cycles.
    const byId = Object.fromEntries((parts || []).filter((p) => p && p.id).map((p) => [p.id, p]));
    for (const id of partIds) {
      const seen = new Set();
      let cur = byId[id];
      while (cur && cur.parent) {
        if (seen.has(cur.id)) { err(`$.parts`, `parent cycle involving "${id}"`); break; }
        seen.add(cur.id);
        cur = byId[cur.parent];
      }
    }
  }
  for (const m of matNames) if (!usedMats.has(m)) warn(`$.materials.${m}`, 'material is never used');

  const anims = spec.animations ?? {};
  if (typeof anims !== 'object' || Array.isArray(anims)) err('$.animations', 'animations must be an object keyed by name');
  else for (const [name, a] of Object.entries(anims)) {
    const p = `$.animations.${name}`;
    if (UNSAFE_NAMES.has(name)) { err(p, `"${name}" cannot be used as an animation name`); continue; }
    if (!a || typeof a !== 'object') { err(p, 'animation must be an object'); continue; }
    unknownKeys(a, 'animation', p, warn);
    if (!Number.isInteger(a.frames) || a.frames < 1 || a.frames > 64) err(`${p}.frames`, 'frames must be an integer 1..64');
    if (a.fps != null && !(isNum(a.fps) && a.fps >= 1 && a.fps <= 60)) err(`${p}.fps`, 'fps must be 1..60');
    if (a.speed != null && !isNum(a.speed)) err(`${p}.speed`, 'speed must be a number (units per second the sprite should travel)');
    if (a.motion != null) err(`${p}.motion`, '"motion" needs a "figure" at the top level of the spec (e.g. "figure": "goose")');
    const tracks = a.tracks ?? {};
    for (const [pid, props] of Object.entries(tracks)) {
      const tp = `${p}.tracks.${pid}`;
      if (!partIds.has(pid)) { err(tp, `unknown part "${pid}"${didYouMean(pid, [...partIds])}`); continue; }
      for (const [prop, v] of Object.entries(props || {})) {
        if (!TRACK_PROPS.includes(prop)) { err(`${tp}.${prop}`, `unknown track property (one of ${TRACK_PROPS.join(', ')})${didYouMean(prop, TRACK_PROPS)}`); continue; }
        if (!isTrackValue(v)) {
          const hint = v && typeof v === 'object' && 'wave' in v ? ` ("wave" must be a number, got ${JSON.stringify(v.wave)})` : '';
          err(`${tp}.${prop}`, `track value must be a number, an array of keyframes, {"keys":[...],"ease":"..."} or {"wave":amp,...}${hint}`);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          unknownKeys(v, 'wave' in v ? 'wave' : 'keys', `${tp}.${prop}`, warn);
          if (v.shape != null && !WAVE_SHAPES.includes(v.shape)) err(`${tp}.${prop}.shape`, `unknown wave shape "${v.shape}" (one of ${WAVE_SHAPES.join(', ')})${didYouMean(String(v.shape), WAVE_SHAPES)}`);
          if (v.ease != null && !EASES.includes(v.ease)) err(`${tp}.${prop}.ease`, `unknown ease "${v.ease}" (one of ${EASES.join(', ')})${didYouMean(String(v.ease), EASES)}`);
        }
      }
    }
    if (a.reach != null) validateReach(a.reach, `${p}.reach`, spec.parts, partIds, err, warn);
    if (a.wall != null && !isNum(a.wall)) err(`${p}.wall`, 'wall must be the x of the climbed wall in units');
    if (a.speedY != null && !isNum(a.speedY)) err(`${p}.speedY`, 'speedY must be a number (units per second the sprite should climb; positive is up)');
    if (a.events != null) {
      if (!Array.isArray(a.events)) err(`${p}.events`, 'events must be an array: [{"frame": 3, "name": "honk"}]');
      else a.events.forEach((e, j) => {
        const ep = `${p}.events[${j}]`;
        if (!e || typeof e !== 'object' || Array.isArray(e)) return err(ep, 'event must be {"frame": n, "name": "..."}');
        unknownKeys(e, 'event', ep, warn);
        if (!(Number.isInteger(e.frame) && e.frame >= 0 && (!Number.isInteger(a.frames) || e.frame < a.frames))) err(`${ep}.frame`, `frame must be a whole number 0..${(a.frames ?? 1) - 1}`);
        if (typeof e.name !== 'string' || !e.name) err(`${ep}.name`, 'event needs a "name" string');
      });
    }
    if (a.holds != null) {
      if (!a.holds || typeof a.holds !== 'object' || Array.isArray(a.holds)) err(`${p}.holds`, 'holds must be {"frameIndex": multiple}, e.g. {"3": 2} shows frame 3 twice as long');
      else for (const [f, k] of Object.entries(a.holds)) {
        const n = Number(f);
        if (!(Number.isInteger(n) && n >= 0 && (!Number.isInteger(a.frames) || n < a.frames))) err(`${p}.holds.${f}`, `"${f}" is not a frame index 0..${(a.frames ?? 1) - 1}`);
        if (!(isNum(k) && k > 0 && k <= 16)) err(`${p}.holds.${f}`, 'a hold is a multiple of the frame time, > 0 and <= 16');
      }
    }
  }

  if (spec.points != null) {
    if (!spec.points || typeof spec.points !== 'object' || Array.isArray(spec.points)) err('$.points', 'points must be {"name": {"part": "head", "at": [x, y]}}');
    else for (const [name, pt] of Object.entries(spec.points)) {
      const pp = `$.points.${name}`;
      if (unsafe(name)) { err(pp, `"${name}" cannot be used as a point name`); continue; }
      if (!pt || typeof pt !== 'object' || Array.isArray(pt)) { err(pp, 'point must be {"part": "head", "at": [x, y] | "tip" | "pivot"}'); continue; }
      unknownKeys(pt, 'point', pp, warn);
      if (!partIds.has(pt.part)) err(`${pp}.part`, `unknown part "${pt.part}"${didYouMean(String(pt.part), [...partIds])}`);
      const byIdPt = Array.isArray(parts) ? parts.find((q) => q && q.id === pt.part) : null;
      if (!(isPt(pt.at) || pt.at === 'pivot' || (pt.at === 'tip' && (!byIdPt || byIdPt.tip)))) err(`${pp}.at`, pt.at === 'tip' ? `part "${pt.part}" has no tip (only bones do); use [x, y] or "pivot"` : 'at must be [x, y] in rest-pose canvas units, "pivot" or "tip"');
    }
  }
  if (spec.mixes != null) {
    if (!spec.mixes || typeof spec.mixes !== 'object' || Array.isArray(spec.mixes)) err('$.mixes', 'mixes must be {"walk>idle": {"frames": 3}}');
    else for (const [name, m] of Object.entries(spec.mixes)) {
      const mp = `$.mixes.${name}`, names = Object.keys(spec.animations ?? {});
      const [from, to, extra] = name.split('>');
      if (extra != null || !from || !to) { err(mp, 'a mix is named "from>to", e.g. "walk>idle"'); continue; }
      for (const n of [from, to]) if (!names.includes(n)) err(mp, `unknown animation "${n}"${didYouMean(n, names)}`);
      if (from === to) err(mp, 'a mix needs two different animations');
      if (!m || typeof m !== 'object' || Array.isArray(m)) { err(mp, 'a mix is {"frames": 2, "ease": "smooth"}'); continue; }
      if (m.frames != null && !(Number.isInteger(m.frames) && m.frames >= 1 && m.frames <= 8)) err(`${mp}.frames`, 'frames must be a whole number 1..8');
      if (m.ease != null && !['linear', 'smooth'].includes(m.ease)) err(`${mp}.ease`, 'ease must be "linear" or "smooth"');
      if (m.fps != null && !(isNum(m.fps) && m.fps >= 1 && m.fps <= 60)) err(`${mp}.fps`, 'fps must be 1..60');
    }
  }
  if (spec.states != null) validateStates(spec.states, spec.animations ?? {}, err, warn);
  if (spec.skins != null) {
    if (!spec.skins || typeof spec.skins !== 'object' || Array.isArray(spec.skins)) err('$.skins', 'skins must be {"name": {"parts": [...], "materials": {...}}}');
    else for (const [name, patch] of Object.entries(spec.skins)) {
      const sp = `$.skins.${name}`;
      if (unsafe(name)) { err(sp, `"${name}" cannot be used as a skin name`); continue; }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { err(sp, 'a skin is a patch like a variant: {"parts": [...], "materials": {...}, "materialMap": {...}}'); continue; }
      for (const k of Object.keys(patch)) if (!SKIN_KEYS.includes(k)) err(`${sp}.${k}`, `skins can change ${SKIN_KEYS.join(', ')} (not "${k}"): every skin plays the same animations`);
      if (errors.length) continue;
      try {
        const r = validate(skinSpec(spec, patch));
        for (const e of r.errors) err(`${sp}${e.path.slice(1)}`, e.message);
      } catch (e) { err(sp, e.message); }
    }
  }
  if (spec.ground != null && !(isNum(spec.ground) && isPt(size) && spec.ground >= 0 && spec.ground <= size[1])) err('$.ground', `ground must be the y of the foot line in units, 0..${isPt(size) ? size[1] : 100}`);

  const style = spec.style ?? {};
  if (style.outline != null && !OUTLINES.includes(style.outline)) err('$.style.outline', `outline must be one of ${OUTLINES.join(', ')}`);
  for (const k of ['light', 'elevation', 'ambient', 'curvature', 'texture', 'hueShift']) {
    if (style[k] != null && !isNum(style[k])) err(`$.style.${k}`, `${k} must be a number (got ${JSON.stringify(style[k])})`);
  }
  for (const k of ['dither', 'innerLines', 'contactShadow', 'snap', 'flip']) {
    if (style[k] != null && typeof style[k] !== 'boolean') err(`$.style.${k}`, `${k} must be true or false`);
  }
  if (style.tones != null && !(Number.isInteger(style.tones) && style.tones >= 2 && style.tones <= 6)) err('$.style.tones', 'tones must be a whole number 2..6');
  if (style.outlineColor != null && !parseHex(style.outlineColor)) err('$.style.outlineColor', `"${style.outlineColor}" is not a hex colour`);
  return { errors, warnings };
}

const SKIN_KEYS = ['parts', 'materials', 'materialMap', 'style'];
/** The spec a skin produces: the base without its skins, patched like a variant. */
export function skinSpec(spec, patch) {
  const { skins: _s, states: _st, ...base } = spec;
  return mergeVariant(base, patch);
}

const CONDITION_TERM = /^(!?)([A-Za-z_][\w-]*)(?:\s*(==|!=|>=|<=|>|<)\s*(.+))?$/;
function validateStates(st, anims, err, warn) {
  const P = '$.states';
  if (!st || typeof st !== 'object' || Array.isArray(st)) return err(P, 'states must be {"initial", "inputs", "nodes", "transitions", "interactions"}');
  for (const k of Object.keys(st)) if (!['initial', 'inputs', 'nodes', 'transitions', 'interactions'].includes(k)) warn(`${P}.${k}`, 'unknown states property (ignored)');
  const nodes = st.nodes && typeof st.nodes === 'object' && !Array.isArray(st.nodes) ? st.nodes : null;
  if (!nodes || !Object.keys(nodes).length) return err(`${P}.nodes`, 'nodes must name at least one node: {"idle": {"anim": "idle"}}');
  const names = Object.keys(nodes), animNames = Object.keys(anims);
  const inputs = st.inputs ?? {};
  const isInput = (k) => typeof k === 'string' && Object.hasOwn(inputs, k);
  for (const k of [...names, ...Object.keys(inputs)]) if (unsafe(k)) err(`${P}`, `"${k}" cannot be used as a node or input name`);
  for (const [k, v] of Object.entries(inputs)) if (!(isNum(v) || typeof v === 'boolean' || v === 'trigger' || typeof v === 'string')) err(`${P}.inputs.${k}`, 'an input starts as a number, true/false, a word, or "trigger"');
  if (st.initial != null && !names.includes(st.initial)) err(`${P}.initial`, `unknown node "${st.initial}"${didYouMean(st.initial, names)}`);
  for (const [n, node] of Object.entries(nodes)) {
    const np = `${P}.nodes.${n}`;
    if (!node || typeof node !== 'object') { err(np, 'a node is {"anim": "walk"}'); continue; }
    if (!animNames.includes(node.anim)) err(`${np}.anim`, `unknown animation "${node.anim}"${didYouMean(String(node.anim), animNames)}`);
    if (node.rate != null && !((isNum(node.rate) && node.rate > 0 && node.rate <= 4) || isInput(node.rate)))
      err(`${np}.rate`, `rate is a playback speed 0..4 or the name of an input${typeof node.rate === 'string' ? didYouMean(node.rate, Object.keys(inputs)) : ''}`);
    if (node.then != null && node.then !== 'previous' && !names.includes(node.then)) err(`${np}.then`, `then must be a node or "previous"${didYouMean(String(node.then), names)}`);
    if (node.random != null) {
      if (!Array.isArray(node.random)) err(`${np}.random`, 'random must be [{"anim": "preen", "every": [4, 9]}]');
      else node.random.forEach((f, i) => { if (!animNames.includes(f?.anim)) err(`${np}.random[${i}].anim`, `unknown animation "${f?.anim}"${didYouMean(String(f?.anim), animNames)}`); });
    }
  }
  const checkWhen = (w, path) => {
    if (w == null) return;
    for (const t of String(w).split(/\s*(?:&&|\band\b)\s*/)) {
      const m = t.trim().match(CONDITION_TERM);
      if (!m) err(path, `cannot read "${t}": use name, !name, or name > 3 (joined with &&)`);
      else if (!isInput(m[2])) err(path, `"${m[2]}" is not an input${didYouMean(m[2], Object.keys(inputs))}`);
    }
  };
  if (st.transitions != null && !Array.isArray(st.transitions)) err(`${P}.transitions`, 'transitions must be an array');
  (Array.isArray(st.transitions) ? st.transitions : []).forEach((t, i) => {
    const tp = `${P}.transitions[${i}]`;
    for (const f of [].concat(t?.from ?? '*')) if (f !== '*' && !names.includes(f)) err(`${tp}.from`, `unknown node "${f}"${didYouMean(String(f), names)}`);
    if (!names.includes(t?.to)) err(`${tp}.to`, `unknown node "${t?.to}"${didYouMean(String(t?.to), names)}`);
    checkWhen(t?.when, `${tp}.when`);
    if (t?.at != null && typeof t.at !== 'string') err(`${tp}.at`, 'at is "now", "end", "sync" or an event name like "footstep"');
  });
  (Array.isArray(st.interactions) ? st.interactions : []).forEach((it, i) => {
    const ip = `${P}.interactions[${i}]`;
    if (!['click', 'enter', 'leave', 'burst', 'calm'].includes(it?.on)) err(`${ip}.on`, 'on must be "click", "enter", "leave", "burst" (a quick run of clicks) or "calm" (the run is over)');
    if (it?.fire != null && !isInput(it.fire)) err(`${ip}.fire`, `"${it.fire}" is not an input`);
    for (const k of Object.keys(it?.set ?? {})) if (!isInput(k)) err(`${ip}.set.${k}`, `"${k}" is not an input`);
  });
}

function validateReach(reach, path, parts, partIds, err, warn) {
  if (!Array.isArray(reach)) return err(path, 'reach must be an array of constraints: [{"chain": [...], "tip": [x,y], "target": [x,y]}]');
  const parentOf = Object.fromEntries((Array.isArray(parts) ? parts : []).filter((p) => p && p.id).map((p) => [p.id, p.parent]));
  reach.forEach((r, i) => {
    const rp = `${path}[${i}]`;
    if (!r || typeof r !== 'object') return err(rp, 'reach constraint must be an object');
    unknownKeys(r, 'reach', rp, warn);
    if (!Array.isArray(r.chain) || !r.chain.length) return err(`${rp}.chain`, 'chain must be a non-empty array of part ids, root first (e.g. ["neck", "head"])');
    const bad = r.chain.find((id) => !partIds.has(id));
    if (bad) return err(`${rp}.chain`, `unknown part "${bad}"${didYouMean(bad, [...partIds])}`);
    const end = r.end ?? r.chain[r.chain.length - 1];
    if (!partIds.has(end)) return err(`${rp}.end`, `unknown part "${end}"${didYouMean(end, [...partIds])}`);
    const ancestors = new Set([end]);
    for (let c = parentOf[end]; c; c = parentOf[c]) ancestors.add(c);
    for (const id of r.chain)
      if (!ancestors.has(id)) err(`${rp}.chain`, `"${id}" is not "${end}" or one of its ancestors, so rotating it cannot move the tip`);
    if (!isPt(r.tip)) err(`${rp}.tip`, 'tip must be [x, y]: the point on the end part that should reach the target, in rest-pose canvas units');
    if (!Array.isArray(r.target) || r.target.length !== 2 || !r.target.every(isTrackValue))
      err(`${rp}.target`, `target must be [x, y]; each coordinate is ${TRACK_HINT}`);
    if (r.aim != null && !isTrackValue(r.aim)) err(`${rp}.aim`, `aim must be ${TRACK_HINT}`);
    if (r.aim != null && r.chain.length < 2 && r.chain[0] === end) err(`${rp}.chain`, 'with "aim", the chain needs at least one part besides the end part');
    if (r.limits != null) {
      if (typeof r.limits !== 'object' || Array.isArray(r.limits)) err(`${rp}.limits`, 'limits must be {"partId": [minRot, maxRot]}');
      else for (const [id, lim] of Object.entries(r.limits)) {
        if (!r.chain.includes(id)) err(`${rp}.limits.${id}`, `"${id}" is not in the chain`);
        else if (!isPt(lim) || lim[0] > lim[1]) err(`${rp}.limits.${id}`, 'limit must be [minRot, maxRot] in degrees');
      }
    }
  });
}

function compileFollow(f) {
  if (f == null || f === 0) return null;
  const o = typeof f === 'number' ? { amount: f } : f;
  return { freq: o.freq ?? 3, damping: o.damping ?? 0.3, amount: o.amount ?? 1, max: o.max ?? 40 };
}

/** Normalize a validated spec into the structure the renderer consumes. */
export function compile(spec) {
  const { errors } = validate(spec);
  if (errors.length) {
    const e = new Error('invalid spec:\n' + errors.map((x) => `  ${x.path}: ${x.message}`).join('\n'));
    e.errors = errors;
    throw e;
  }
  const size = spec.size ?? [100, 100];
  const materials = {};
  for (const [name, m] of Object.entries(spec.materials)) {
    const mm = typeof m === 'string' ? { color: m } : m;
    materials[name] = {
      name,
      color: mm.color,
      texture: mm.texture || null,
      textureScale: mm.textureScale ?? 1,
      textureStrength: mm.textureStrength ?? 0.35,
      shine: mm.shine ?? 0,
      flat: !!mm.flat,
      outline: mm.outline !== false,
      tones: mm.tones ?? null,
    };
  }
  const parts = spec.parts.map((p, index) => ({
    id: p.id,
    index,
    parent: p.parent ?? null,
    pivot: p.pivot ?? [size[0] / 2, size[1] / 2],
    z: p.z ?? index,
    tip: p.tip ?? null,
    follow: compileFollow(p.follow),
    base: { x: p.x ?? 0, y: p.y ?? 0, rot: p.rot ?? 0, sx: p.sx ?? 1, sy: p.sy ?? 1, show: p.show ?? 1 },
    shade: p.shade ?? 0,
    shapes: p.shapes.map((s) => ({
      ...compileShape(s),
      type: s.type,
      op: s.op === 'cut' ? 'cut' : 'add',
      material: s.material ?? null,
      minDetail: s.minDetail ?? 1,
      maxDetail: s.maxDetail ?? 3,
      profile: s.profile ?? 'dome',
      shade: s.shade ?? 0,
    })),
  }));
  const animations = {};
  for (const [name, a] of Object.entries(spec.animations ?? {})) {
    const events = (a.events ?? []).map((e) => ({ frame: e.frame, name: e.name, ...(e.data !== undefined ? { data: e.data } : {}) }))
      .sort((x, y) => x.frame - y.frame);
    const holds = a.holds ? Object.fromEntries(Object.entries(a.holds).map(([f, k]) => [Number(f), k])) : null;
    animations[name] = { name, frames: a.frames, fps: a.fps ?? 8, loop: a.loop !== false, tracks: a.tracks ?? {}, reach: a.reach ?? [],
      speed: a.speed ?? 0, speedY: a.speedY ?? 0, wall: a.wall ?? null, events, holds };
  }
  if (!Object.keys(animations).length) animations.still = { name: 'still', frames: 1, fps: 1, loop: true, tracks: {}, reach: [], speed: 0, speedY: 0, events: [], holds: null };
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const points = {};
  for (const [name, pt] of Object.entries(spec.points ?? {})) {
    const part = byId[pt.part];
    points[name] = { part: pt.part, at: pt.at === 'tip' ? part.tip : pt.at === 'pivot' ? part.pivot : pt.at };
  }
  // Skins compile to whole characters of their own (same animations, different parts and colours).
  const skins = spec.skins ? Object.fromEntries(Object.entries(spec.skins).map(([n, patch]) => [n, compile(skinSpec(spec, patch))])) : null;
  const out = { name: spec.name ?? 'character', size, materials, parts, animations, style: spec.style ?? {}, points, ground: spec.ground ?? null, skins, states: spec.states ?? null };
  if (spec.mixes) buildMixes(out, spec.mixes);   // after the animations they blend
  return out;
}
