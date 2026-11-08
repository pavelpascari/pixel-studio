// Rig maths shared by the renderer, the animation sampler and the linter:
//   - 2D affine matrices and per-part world transforms
//   - "reach" constraints: rotate a chain of parts so a point on the end part lands on a target (CCD IK)
//   - bounds checking: which parts leave the canvas in which frames

// --- 2D affine matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
export const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export function invert(m) {
  let det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-9) det = 1e-9;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
export function localMatrix(pivot, t) {
  const r = (t.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  // T(pivot + offset) · R · S · T(-pivot)
  const a = c * t.sx, b = s * t.sx, cc = -s * t.sy, d = c * t.sy;
  const px = pivot[0], py = pivot[1];
  return [a, b, cc, d, px + t.x - (a * px + cc * py), py + t.y - (b * px + d * py)];
}
export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** World rotation of a matrix in degrees (clockwise on screen, like `rot`). */
export const angleOf = (m) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

/**
 * World matrices for every part. `adjust(t)` may modify a copy of each part's transform first
 * (the renderer uses it for pixel snapping).
 * @returns {{world: Map<string, number[]>, visible: Map<string, boolean>}}
 */
export function worldMatrices(parts, pose, adjust) {
  const byId = parts.byId ?? Object.fromEntries(parts.map((p) => [p.id, p]));
  const world = new Map(), visible = new Map();
  const resolve = (p) => {
    if (world.has(p.id)) return world.get(p.id);
    let t = pose.get(p.id);
    if (adjust) { t = { ...t }; adjust(t); }
    let m = localMatrix(p.pivot, t), vis = t.show;
    if (p.parent) { m = mul(resolve(byId[p.parent]), m); vis = vis && visible.get(p.parent); }
    world.set(p.id, m); visible.set(p.id, vis);
    return m;
  };
  parts.forEach(resolve);
  return { world, visible };
}

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Solve one reach constraint in place (mutates pose rotations).
 *   r.chain  part ids, root first; their `rot` is adjusted (track values are the starting guess)
 *   r.end    part that carries the tip (default: last of chain)
 *   r.tip    [x, y] point on `end`, in rest-pose canvas units (e.g. the beak tip)
 *   target   [x, y] world point the tip should reach
 *   aim      optional world rotation (deg) for `end`: it keeps that orientation, the rest of the chain moves
 *   r.limits optional { partId: [minRot, maxRot] }
 * Returns the remaining distance between tip and target (units).
 */
export function solveReach(parts, pose, r, target, aim) {
  const ids = [...new Set([...r.chain, r.end ?? r.chain[r.chain.length - 1]])];
  const start = ids.map((id) => pose.get(id).rot);
  const restore = (rots) => ids.forEach((id, i) => { pose.get(id).rot = rots[i]; });
  // CCD can settle into a local minimum (e.g. bending the wrong way), so if the first attempt
  // misses, retry from a few perturbed starting poses and keep the best result.
  let best = ccd(parts, pose, r, target, aim), bestRots = ids.map((id) => pose.get(id).rot);
  const seeds = [[60, -60], [-60, 60], [120, -120], [-120, 120]];
  for (let k = 0; k < seeds.length && best > 0.05; k++) {
    restore(start);
    const [a, b] = seeds[k];
    pose.get(r.chain[0]).rot += a;
    if (r.chain.length > 1) pose.get(r.chain[1]).rot += b;
    const d = ccd(parts, pose, r, target, aim);
    if (d < best - 1e-6) { best = d; bestRots = ids.map((id) => pose.get(id).rot); }
  }
  restore(bestRots);
  return best;
}

/**
 * One cyclic-coordinate-descent solve, starting from the current rotations (no restarts, so a
 * warm start from the previous frame gives temporally coherent results). Limits are absolute rots.
 */
export function ccd(parts, pose, r, target, aim, iters = 32) {
  const byId = parts.byId ?? Object.fromEntries(parts.map((p) => [p.id, p]));
  const end = r.end ?? r.chain[r.chain.length - 1];
  const joints = aim == null ? r.chain : r.chain.filter((id) => id !== end);
  const limits = r.limits || {};
  const setRot = (id, v) => {
    const lim = limits[id];
    pose.get(id).rot = lim ? Math.min(lim[1], Math.max(lim[0], v)) : v;
  };
  const orientEnd = (world) => {
    if (aim == null) return;
    const parent = byId[end].parent;
    const parentAngle = parent ? angleOf(world.get(parent)) : 0;
    setRot(end, aim - parentAngle);
  };
  let dist = Infinity;
  for (let it = 0; it < iters; it++) {
    for (let j = joints.length - 1; j >= 0; j--) {
      let { world } = worldMatrices(parts, pose);
      orientEnd(world);
      ({ world } = worldMatrices(parts, pose));
      const id = joints[j];
      const P = apply(world.get(id), byId[id].pivot);
      const E = apply(world.get(end), r.tip);
      const a1 = Math.atan2(target[1] - P[1], target[0] - P[0]);
      const a2 = Math.atan2(E[1] - P[1], E[0] - P[0]);
      if (Math.hypot(E[0] - P[0], E[1] - P[1]) < 1e-6) continue;
      setRot(id, pose.get(id).rot + wrap(((a1 - a2) * 180) / Math.PI));
    }
    let { world } = worldMatrices(parts, pose);
    orientEnd(world);
    ({ world } = worldMatrices(parts, pose));
    const E = apply(world.get(end), r.tip);
    dist = Math.hypot(E[0] - target[0], E[1] - target[1]);
    if (dist < 0.05) break;
  }
  return dist;
}

// --- bounds -----------------------------------------------------------------------------------

const edgeSamples = new WeakMap();
/** Points on (just inside) a compiled shape's outline, in rest-pose units. Cached per shape. */
function samplesFor(sh) {
  let pts = edgeSamples.get(sh);
  if (pts) return pts;
  pts = [];
  const [x0, y0, x1, y1] = sh.bbox, step = 0.75;
  for (let y = y0; y <= y1 + 1e-9; y += step) for (let x = x0; x <= x1 + 1e-9; x += step) {
    const d = sh.sdf(x, y);
    if (d <= 0 && d > -1.5) pts.push([x, y]);
  }
  if (!pts.length) pts.push([(x0 + x1) / 2, (y0 + y1) / 2]);
  edgeSamples.set(sh, pts);
  return pts;
}

/**
 * How far each visible part sticks out of the canvas in one pose.
 * @returns {Array<{part:string, edge:'left'|'right'|'top'|'bottom', amount:number}>}
 */
export function overflowForPose(compiled, pose, margin = 0) {
  const [W, H] = compiled.size;
  const { world, visible } = worldMatrices(compiled.parts, pose);
  const out = [];
  for (const p of compiled.parts) {
    if (!visible.get(p.id)) continue;
    const m = world.get(p.id);
    const worst = { left: 0, right: 0, top: 0, bottom: 0 };
    for (const sh of p.shapes) {
      if (sh.op === 'cut') continue;
      for (const pt of samplesFor(sh)) {
        const [x, y] = apply(m, pt);
        if (-x > worst.left) worst.left = -x;
        if (x - W > worst.right) worst.right = x - W;
        if (-y > worst.top) worst.top = -y;
        if (y - H > worst.bottom) worst.bottom = y - H;
      }
    }
    for (const [edge, amount] of Object.entries(worst)) if (amount > margin) out.push({ part: p.id, edge, amount });
  }
  return out;
}
