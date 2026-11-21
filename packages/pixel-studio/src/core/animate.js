// Animation tracks → per-part transforms for a frame.
//
// Track value forms (per part, per prop):
//   3                                  constant
//   [0, -2, 0, 2]                      keyframes spread evenly over the cycle (looping), linear
//   {"keys": [0, 10], "ease": "smooth"} keyframes with easing: linear | smooth | step
//   {"wave": 10, "phase": 0.25, "cycles": 1, "offset": 0, "shape": "sin"}   (offset defaults to 1 for sx/sy)
//                                      periodic: sin | tri | square | bounce (= |sin|, 2 bumps/cycle)
// "show" is always stepped (no interpolation): 1 visible, 0 hidden.

import { solveReach, worldMatrices, apply, angleOf } from './rig.js';

const TAU = Math.PI * 2;

function interp(keys, t, loop, ease) {
  const n = keys.length;
  if (n === 1) return keys[0];
  const span = loop ? n : n - 1;
  let pos = t * span;
  if (!loop) pos = Math.min(pos, n - 1);
  const i = Math.floor(pos) % n;
  const j = loop ? (i + 1) % n : Math.min(i + 1, n - 1);
  let f = pos - Math.floor(pos);
  if (ease === 'step') f = 0;
  else if (ease === 'smooth') f = f * f * (3 - 2 * f);
  return keys[i] + (keys[j] - keys[i]) * f;
}

function wave(v, t, defaultOffset = 0) {
  const cycles = v.cycles ?? 1, phase = v.phase ?? 0, amp = v.wave, off = v.offset ?? defaultOffset;
  const x = (((t * cycles + phase) % 1) + 1) % 1; // negative phases wrap too
  let w;
  switch (v.shape ?? 'sin') {
    // Triangle with the same phase as sin: 0 → +1 (x=.25) → 0 → -1 (x=.75) → 0.
    case 'tri': w = x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4; break;
    case 'square': w = x < 0.5 ? 1 : -1; break;
    // |sin| rescaled: two bumps per cycle (walk bob). 0 at contact, -1 = up.
    case 'bounce': w = -Math.abs(Math.sin(x * TAU)); break;
    default: w = Math.sin(x * TAU);
  }
  return off + amp * w;
}

export function sampleValue(v, t, loop, isStep, defaultOffset = 0) {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return interp(v, t, loop, isStep ? 'step' : 'linear');
  if (v && typeof v === 'object') {
    if (typeof v.wave === 'number') return isStep ? (wave(v, t) >= 0 ? 1 : 0) : wave(v, t, defaultOffset);
    if (Array.isArray(v.keys)) return interp(v.keys, t, loop, isStep ? 'step' : v.ease ?? 'linear');
  }
  return 0;
}

/** Normalized time for frame f of an animation. */
export function frameTime(anim, f) {
  if (anim.frames <= 1) return 0;
  return anim.loop ? f / anim.frames : f / (anim.frames - 1);
}

/**
 * Returns Map(partId → {x,y,rot,sx,sy,show}) — base transform composed with track values, reach
 * constraints, and follow-through (parts with "follow" lag behind the motion like a spring).
 */
export function samplePose(compiled, anim, f) {
  const pose = samplePoseAt(compiled, anim, frameTime(anim, f));
  const follow = anim && followOffsets(compiled, anim);
  if (follow) for (const [id, offs] of follow) pose.get(id).rot += offs[f % offs.length];
  return pose;
}

/** Pose at normalized time t (0..1), without follow-through. */
export function samplePoseAt(compiled, anim, t) {
  const pose = new Map();
  for (const p of compiled.parts) {
    const tr = (anim && anim.tracks[p.id]) || {};
    const b = p.base;
    // Scale waves oscillate around 1 unless an explicit offset is given.
    const get = (k) => (tr[k] == null ? null : sampleValue(tr[k], t, anim.loop, k === 'show', k === 'sx' || k === 'sy' ? 1 : 0));
    const gx = get('x'), gy = get('y'), gr = get('rot'), gsx = get('sx'), gsy = get('sy'), gs = get('show');
    pose.set(p.id, {
      x: b.x + (gx ?? 0),
      y: b.y + (gy ?? 0),
      rot: b.rot + (gr ?? 0),
      sx: b.sx * (gsx ?? 1),
      sy: b.sy * (gsy ?? 1),
      show: (gs ?? b.show) >= 0.5,
    });
  }
  // Reach constraints run after the tracks: track rotations are the starting guess, the solver
  // then rotates the chain so the tip lands on the (animatable) target.
  // pose.reachMiss[i] = how far constraint i's tip ended up from its target (units).
  pose.reachMiss = (anim?.reach ?? []).map((r) => {
    const target = [sampleValue(r.target[0], t, anim.loop, false), sampleValue(r.target[1], t, anim.loop, false)];
    const aim = r.aim == null ? null : sampleValue(r.aim, t, anim.loop, false);
    return solveReach(compiled.parts, pose, r, target, aim);
  });
  return pose;
}

// --- follow-through ---------------------------------------------------------------------------
// Each part with `follow` is a damped angular spring hanging from its pivot. It is pushed by the
// acceleration of its pivot and by its parent's angular acceleration, so tails, ears, hoods and
// straps lag behind, overshoot and settle. Simulated once per animation (several loops so looping
// animations are seamless) and cached.

const followCache = new WeakMap();
const SUBSTEPS = 8;

function centerOf(p) {
  const shapes = p.shapes.filter((s) => s.op !== 'cut');
  if (shapes.length) {
    let x = 0, y = 0, w = 0;
    for (const s of shapes) {
      const a = Math.max(1, (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]));
      x += a * (s.bbox[0] + s.bbox[2]) / 2; y += a * (s.bbox[1] + s.bbox[3]) / 2; w += a;
    }
    return [x / w, y / w];
  }
  return p.tip ? [(p.pivot[0] + p.tip[0]) / 2, (p.pivot[1] + p.tip[1]) / 2] : p.pivot;
}

export function followOffsets(compiled, anim) {
  if (anim.follow === false) return null;   // mixes: their poses already include follow-through
  if (followCache.has(anim)) return followCache.get(anim);
  const followers = compiled.parts.filter((p) => p.follow);
  if (!followers.length || anim.frames < 2) { followCache.set(anim, null); return null; }
  const loop = anim.loop;
  const steps = (loop ? anim.frames : anim.frames - 1) * SUBSTEPS;
  const dt = (loop ? anim.frames : anim.frames - 1) / anim.fps / steps;
  const passes = loop ? 4 : 1;
  const st = followers.map((p) => ({
    p, th: 0, om: 0, hist: [], com: centerOf(p),
    k: (2 * Math.PI * p.follow.freq) ** 2, c: 2 * p.follow.damping * 2 * Math.PI * p.follow.freq,
    rec: new Array(anim.frames).fill(0),
  }));
  for (let pass = 0; pass < passes; pass++) {
    for (let k = 0; k <= steps; k++) {
      if (loop && k === steps) break;
      const pose = samplePoseAt(compiled, anim, k / steps);
      for (const s of st) pose.get(s.p.id).rot += s.th;
      const { world } = worldMatrices(compiled.parts, pose);
      for (const s of st) {
        const m = world.get(s.p.id);
        const P = apply(m, s.p.pivot), C = apply(m, s.com);
        const phi = s.p.parent ? angleOf(world.get(s.p.parent)) : 0;
        const h = s.hist;
        if (h.length) { let d = phi - h[h.length - 1].phi; d = ((d + 540) % 360) - 180; h.push({ P, phi: h[h.length - 1].phi + d }); }
        else h.push({ P, phi });
        if (h.length > 3) h.shift();
        let acc = 0;
        if (h.length === 3) {
          const ax = (h[2].P[0] - 2 * h[1].P[0] + h[0].P[0]) / (dt * dt);
          const ay = (h[2].P[1] - 2 * h[1].P[1] + h[0].P[1]) / (dt * dt);
          const alpha = (h[2].phi - 2 * h[1].phi + h[0].phi) / (dt * dt);
          const rx = C[0] - P[0], ry = C[1] - P[1], r2 = Math.max(4, rx * rx + ry * ry);
          // Inertia: the pivot accelerates, the mass lags (torque of -a at the centre); the parent
          // turns, the part resists the turn.
          acc = s.p.follow.amount * (((rx * -ay - ry * -ax) / r2) * (180 / Math.PI) - alpha);
        }
        s.om += (acc - s.k * s.th - s.c * s.om) * dt;
        s.th += s.om * dt;
        const max = s.p.follow.max;
        if (s.th > max) { s.th = max; s.om = Math.min(0, s.om); }
        if (s.th < -max) { s.th = -max; s.om = Math.max(0, s.om); }
        if (pass === passes - 1 && k % SUBSTEPS === 0) s.rec[k / SUBSTEPS] = Math.round(s.th * 100) / 100;
      }
    }
  }
  const out = new Map(st.map((s) => [s.p.id, s.rec]));
  followCache.set(anim, out);
  return out;
}
