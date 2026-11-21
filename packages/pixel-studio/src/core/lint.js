// Checks that need a compiled spec (poses), as opposed to the structural checks in spec.js.
import { samplePose } from './animate.js';
import { overflowForPose } from './rig.js';

const ranges = (frames) => {
  const out = [];
  for (const f of frames) {
    const last = out[out.length - 1];
    if (last && f === last[1] + 1) last[1] = f; else out.push([f, f]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
};

/**
 * Find parts that leave the canvas (they would be clipped in the sprite sheet).
 * @param margin units of overflow to tolerate (default 0.5: a sliver of anti-aliasing never matters)
 * @returns warnings [{path, message, anim, part, edge, frames, amount}]
 */
export function checkBounds(compiled, { margin = 0.5 } = {}) {
  const warnings = [];
  for (const [name, anim] of Object.entries(compiled.animations)) {
    const agg = new Map();
    const misses = (anim.reach || []).map(() => ({ frames: [], amount: 0 }));
    for (let f = 0; f < anim.frames; f++) {
      const pose = samplePose(compiled, anim, f);
      pose.reachMiss.forEach((d, i) => { if (d > 1) { misses[i].frames.push(f); misses[i].amount = Math.max(misses[i].amount, d); } });
      for (const o of overflowForPose(compiled, pose, margin)) {
        const key = `${o.part}|${o.edge}`;
        const a = agg.get(key) ?? { part: o.part, edge: o.edge, frames: [], amount: 0 };
        a.frames.push(f);
        a.amount = Math.max(a.amount, o.amount);
        agg.set(key, a);
      }
    }
    for (const a of agg.values()) {
      const when = a.frames.length === anim.frames ? 'every frame' : `frame${a.frames.length > 1 ? 's' : ''} ${ranges(a.frames)}`;
      warnings.push({
        path: `$.animations.${name}`,
        message: `"${a.part}" goes ${a.amount.toFixed(1)} units past the ${a.edge} edge in ${when} (it will be clipped)`,
        anim: name, ...a,
      });
    }
    misses.forEach((m, i) => {
      if (!m.frames.length) return;
      const r = anim.reach[i];
      warnings.push({
        path: `$.animations.${name}.reach[${i}]`,
        message: `tip misses its target by up to ${m.amount.toFixed(1)} units in frame${m.frames.length > 1 ? 's' : ''} ${ranges(m.frames)}: ` +
          `the target is out of reach of the chain [${r.chain.join(', ')}]${r.limits ? ' within its limits' : ''}${r.aim != null ? ' with that aim' : ''}. ` +
          'Move the target closer, relax limits/aim, or add a part to the chain.',
        anim: name, reach: i, frames: m.frames, amount: m.amount,
      });
    });
  }
  return warnings;
}
