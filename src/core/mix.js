// Transition clips ("mixes"): a few frames that blend the end of one animation into the start of
// another, baked like any animation. Pixel art cannot be cross-faded (alpha ghosting), so the
// engine interpolates poses instead: every part's x, y, rotation and scale move from where they are
// in the last frame of A (frame 0 for a loop, which is where it ends) to where they are in frame 0
// of B, with an ease. Both poses already include reach constraints and follow-through.
//
//   "mixes": { "walk>idle": {"frames": 3, "ease": "smooth"}, "idle>walk": {"frames": 2} }
import { samplePose } from './animate.js';

const ease = { linear: (k) => k, smooth: (k) => k * k * (3 - 2 * k) };
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const r2 = (v) => Math.round(v * 100) / 100;

/** Add a compiled animation "A>B" for each mix. Returns the names added. */
export function buildMixes(compiled, mixes = {}) {
  const added = [];
  for (const [name, m] of Object.entries(mixes)) {
    const [from, to] = name.split('>');
    const A = compiled.animations[from], B = compiled.animations[to];
    const n = m.frames ?? 2, fn = ease[m.ease ?? 'smooth'];
    const pa = samplePose(compiled, A, A.loop ? 0 : A.frames - 1), pb = samplePose(compiled, B, 0);
    const tracks = {};
    for (const p of compiled.parts) {
      const a = pa.get(p.id), b = pb.get(p.id), base = p.base, t = {};
      const at = (f) => fn((f + 1) / (n + 1));   // frames strictly between A's last and B's first
      const col = (va, vb, k) => va + (vb - va) * k;
      t.x = Array.from({ length: n }, (_, f) => r2(col(a.x, b.x, at(f)) - base.x));
      t.y = Array.from({ length: n }, (_, f) => r2(col(a.y, b.y, at(f)) - base.y));
      t.rot = Array.from({ length: n }, (_, f) => r2(a.rot + wrapDeg(b.rot - a.rot) * at(f) - base.rot));
      t.sx = Array.from({ length: n }, (_, f) => r2(col(a.sx, b.sx, at(f)) / (base.sx || 1)));
      t.sy = Array.from({ length: n }, (_, f) => r2(col(a.sy, b.sy, at(f)) / (base.sy || 1)));
      t.show = Array.from({ length: n }, (_, f) => ((at(f) < 0.5 ? a.show : b.show) ? 1 : 0));
      tracks[p.id] = t;
    }
    // One value per frame: a non-looping animation with n frames samples keyframe f at frame f.
    compiled.animations[name] = { name, frames: n, fps: m.fps ?? B.fps, loop: false, tracks, reach: [], speed: 0, speedY: 0,
      wall: null, events: [], holds: null, follow: false, mix: { from, to } };
    added.push(name);
  }
  return added;
}
