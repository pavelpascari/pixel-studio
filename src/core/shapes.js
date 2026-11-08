// Shape primitives as signed distance functions (negative = inside), in part-local units.
// Distances let us (a) rasterize at any resolution, (b) keep sub-pixel features alive,
// and (c) derive a surface normal for lighting from the distance gradient.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const SHAPE_TYPES = ['rect', 'ellipse', 'circle', 'capsule', 'polygon'];
/** Numeric keys each shape type requires (plug-ins add theirs). */
export const SHAPE_REQUIRED = {
  rect: ['x', 'y', 'w', 'h'],
  ellipse: ['cx', 'cy'],
  circle: ['cx', 'cy', 'r'],
  capsule: ['x1', 'y1', 'x2', 'y2'],
  polygon: [],
};
/** Keys a shape may have (plug-ins add theirs). */
export const SHAPE_KEYS = ['type', 'material', 'op', 'minDetail', 'maxDetail', 'profile', 'shade', 'x', 'y', 'w', 'h', 'r', 'rot',
  'cx', 'cy', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'r2', 'points'];
/** Plug-in shapes: type → compile(shape) → {sdf, R, bbox}. */
export const customShapes = new Map();

function rotateInto(px, py, cx, cy, deg) {
  const dx = px - cx, dy = py - cy;
  if (!deg) return [dx, dy];
  const r = (-deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}

export function sdEllipse(px, py, rx, ry) {
  if (Math.abs(rx - ry) < 1e-6) return Math.hypot(px, py) - rx;
  const k0 = Math.hypot(px / rx, py / ry);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry));
  if (k1 === 0) return -Math.min(rx, ry);
  return (k0 * (k0 - 1)) / k1;
}

export function sdRoundRect(px, py, bx, by, r) {
  r = clamp(r, 0, Math.min(bx, by));
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export function sdCapsule(px, py, x1, y1, x2, y2, r1, r2) {
  const pax = px - x1, pay = py - y1, bax = x2 - x1, bay = y2 - y1;
  const bb = bax * bax + bay * bay;
  const h = bb === 0 ? 0 : clamp((pax * bax + pay * bay) / bb, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - (r1 + (r2 - r1) * h);
}

export function sdPolygon(px, py, pts) {
  let d = (px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1];
    const wx = px - pts[i][0], wy = py - pts[i][1];
    const ee = ex * ex + ey * ey;
    const h = ee === 0 ? 0 : clamp((wx * ex + wy * ey) / ee, 0, 1);
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= pts[i][1], c2 = py < pts[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/**
 * Compile a (validated) shape into { sdf(x,y), R, bbox } where R is the shape's
 * "thickness" (largest inner distance) used to normalize lighting and keep thin shapes visible.
 */
export function compileShape(s) {
  let sdf, R, bbox;
  switch (s.type) {
    case 'circle':
    case 'ellipse': {
      const rx = s.rx ?? s.r, ry = s.ry ?? s.r, rot = s.rot || 0;
      sdf = (x, y) => { const [dx, dy] = rotateInto(x, y, s.cx, s.cy, rot); return sdEllipse(dx, dy, rx, ry); };
      R = Math.min(rx, ry);
      const m = Math.max(rx, ry);
      bbox = [s.cx - m, s.cy - m, s.cx + m, s.cy + m];
      break;
    }
    case 'rect': {
      const bx = s.w / 2, by = s.h / 2, cx = s.x + bx, cy = s.y + by, r = s.r || 0, rot = s.rot || 0;
      sdf = (x, y) => { const [dx, dy] = rotateInto(x, y, cx, cy, rot); return sdRoundRect(dx, dy, bx, by, r); };
      R = Math.min(bx, by);
      const m = Math.hypot(bx, by);
      bbox = rot ? [cx - m, cy - m, cx + m, cy + m] : [s.x, s.y, s.x + s.w, s.y + s.h];
      break;
    }
    case 'capsule': {
      const r1 = s.r ?? (s.w != null ? s.w / 2 : 1), r2 = s.r2 ?? r1;
      sdf = (x, y) => sdCapsule(x, y, s.x1, s.y1, s.x2, s.y2, r1, r2);
      R = Math.max(r1, r2);
      const m = R;
      bbox = [Math.min(s.x1, s.x2) - m, Math.min(s.y1, s.y2) - m, Math.max(s.x1, s.x2) + m, Math.max(s.y1, s.y2) + m];
      break;
    }
    case 'polygon': {
      const pts = s.points, r = s.r || 0;
      sdf = r ? (x, y) => sdPolygon(x, y, pts) - r : (x, y) => sdPolygon(x, y, pts);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      bbox = [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
      // Estimate thickness by sampling.
      R = 0.01;
      const N = 12;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = bbox[0] + ((bbox[2] - bbox[0]) * i) / N, y = bbox[1] + ((bbox[3] - bbox[1]) * j) / N;
        R = Math.max(R, -sdf(x, y));
      }
      break;
    }
    default: {
      const custom = customShapes.get(s.type);
      if (!custom) throw new Error(`unknown shape type ${s.type}`);
      ({ sdf, R, bbox } = custom(s));
    }
  }
  return { sdf, R: Math.max(R, 0.01), bbox };
}
