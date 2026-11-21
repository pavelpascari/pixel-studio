// Rasterizer + pixel-art shader.
//
//   spec (compiled) + pose ──▶ per-pixel {part, shape, local point}   (SDF coverage at pixel centres)
//                         ──▶ normal from SDF gradient, lambert light, part/shape shade, texture
//                         ──▶ quantize into a hue-shifted tone ramp (+ ordered dither)
//                         ──▶ contact shadows, inner lines, outline
import { buildRamp, baseIndex, parseHex, darken } from './color.js';
import { sampleTexture } from './textures.js';
import { samplePose } from './animate.js';
import { worldMatrices, invert } from './rig.js';

// Frozen: they are read by everyone and never change.
export const DETAIL_PRESETS = Object.freeze({
  1: { tones: 2, texture: 0, dither: false, outline: 'dark', innerLines: false, contactShadow: false, ambientBoost: 0.25 },
  2: { tones: 3, texture: 0.6, dither: false, outline: 'selective', innerLines: false, contactShadow: true, ambientBoost: 0 },
  3: { tones: 5, texture: 1, dither: true, outline: 'selective', innerLines: true, contactShadow: true, ambientBoost: 0 },
});
for (const p of Object.values(DETAIL_PRESETS)) Object.freeze(p);
export const DETAIL_NAMES = Object.freeze({ 1: 'icon', 2: 'sprite', 3: 'portrait' });

export const lodForRes = (res) => (res <= 20 ? 1 : res <= 40 ? 2 : 3);

const defined = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/** Resolve shader settings: detail preset < spec.style < explicit overrides. */
export function resolveStyle(compiled, res, overrides = {}) {
  const lod = Number(overrides.lod) || lodForRes(res);
  if (!DETAIL_PRESETS[lod]) throw new Error(`lod must be 1, 2 or 3 (got ${overrides.lod})`);
  checkOverrides(overrides);
  return {
    light: -45, // azimuth in degrees, 0 = from top, negative = from the left
    elevation: 50,
    outlineColor: '#1b1424',
    snap: true,
    hueShift: 1,
    ambient: 0.15, // lifts everything toward the base tone; higher = flatter, friendlier shading
    curvature: 0.8, // 0 = flat shapes, 1 = full spheres/cylinders
    flip: false,
    ...DETAIL_PRESETS[lod],
    ...defined(compiled.style),
    ...defined(overrides),
    lod,
  };
}

/** Style overrides follow the same rules as a spec's "style"; a bad one throws a readable error. */
function checkOverrides(o) {
  const bad = (k, rule) => { throw new Error(`${k} ${rule} (got ${JSON.stringify(o[k])})`); };
  if (o.tones != null && !(Number.isInteger(o.tones) && o.tones >= 2 && o.tones <= 6)) bad('tones', 'must be a whole number 2..6');
  for (const k of ['light', 'elevation', 'ambient', 'curvature', 'texture', 'hueShift'])
    if (o[k] != null && !(typeof o[k] === 'number' && Number.isFinite(o[k]))) bad(k, 'must be a number');
  if (o.outline != null && !['none', 'dark', 'selective'].includes(o.outline)) bad('outline', 'must be dark, selective or none');
  for (const k of ['dither', 'innerLines', 'contactShadow', 'snap', 'flip'])
    if (o[k] != null && typeof o[k] !== 'boolean') bad(k, 'must be true or false');
}

/** The largest frame we render: bigger is never pixel art, and a typo like 3000 would take minutes. */
export const MAX_RES = 512;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function snapUnits(v, scale) {
  const px = v * scale, a = Math.abs(px);
  if (a < 0.35) return 0;
  return (Math.sign(px) * Math.max(1, Math.round(a))) / scale;
}

const rampCache = new Map();
function getRamp(hex, tones, hueShift) {
  const key = `${hex}|${tones}|${hueShift}`;
  let r = rampCache.get(key);
  if (!r) { r = buildRamp(hex, tones, { hueShift }); rampCache.set(key, r); }
  return r;
}

/**
 * Render one frame.
 * @returns {{w:number,h:number,rgba:Uint8ClampedArray,ids:Int16Array,materials:string[]}}
 *   ids: material index per pixel, -1 empty, -2 outline
 */
export function renderFrame(compiled, { res = 32, anim, frame = 0, style } = {}) {
  const st = style || resolveStyle(compiled, res);
  const [uw, uh] = compiled.size;
  const H = Math.max(1, Math.round(res)), W = Math.max(1, Math.round((res * uw) / uh));
  const scale = H / uh; // pixels per unit
  const animation = typeof anim === 'string' ? compiled.animations[anim] : anim || Object.values(compiled.animations)[0];
  if (!animation) throw new Error(`unknown animation "${anim}" (have: ${Object.keys(compiled.animations).join(', ')})`);
  const pose = samplePose(compiled, animation, frame % Math.max(1, animation.frames));

  // World matrices (parents first). Part motion is pixel-snapped so tiny wobbles do not shimmer.
  const { world, visible } = worldMatrices(compiled.parts, pose,
    st.snap ? (t) => { t.x = snapUnits(t.x, scale); t.y = snapUnits(t.y, scale); } : null);

  const lod = st.lod;
  const parts = compiled.parts
    .filter((p) => visible.get(p.id))
    .map((p) => ({
      p,
      inv: invert(world.get(p.id)),
      shapes: p.shapes.filter((s) => lod >= s.minDetail && lod <= s.maxDetail),
    }))
    .filter((e) => e.shapes.length)
    .sort((a, b) => a.p.z - b.p.z || a.p.index - b.p.index);
  // Shapes of the same material inside one part form one surface for lighting (no seams where
  // they overlap): the normal comes from the union (min) of their distance fields.
  for (const e of parts) {
    e.surface = Object.create(null);
    for (const sh of e.shapes) {
      if (sh.op === 'cut') continue;
      const g = (e.surface[sh.material] ??= { shapes: [], R: 0 });
      g.shapes.push(sh);
      g.R = Math.max(g.R, sh.R);
    }
    for (const g of Object.values(e.surface)) {
      const list = g.shapes;
      g.sdf = list.length === 1 ? list[0].sdf : (x, y) => {
        let d = Infinity;
        for (let j = 0; j < list.length; j++) { const v = list[j].sdf(x, y); if (v < d) d = v; }
        return d;
      };
    }
  }

  const N = W * H;
  const hitPart = new Int16Array(N).fill(-1);
  const hitShape = new Array(N);
  const hitD = new Float32Array(N);
  const hitLX = new Float32Array(N), hitLY = new Float32Array(N);

  const half = 0.5 / scale, diag = 0.75 / scale;
  for (let py = 0; py < H; py++) {
    const wy = (py + 0.5) / scale;
    for (let px = 0; px < W; px++) {
      const wx = ((st.flip ? W - 1 - px : px) + 0.5) / scale;
      const i = py * W + px;
      for (let k = 0; k < parts.length; k++) {
        const { inv, shapes } = parts[k];
        const lx = inv[0] * wx + inv[2] * wy + inv[4];
        const ly = inv[1] * wx + inv[3] * wy + inv[5];
        let got = null, gd = 0;
        for (let s = 0; s < shapes.length; s++) {
          const sh = shapes[s];
          const b = sh.bbox;
          const pad = sh.R + diag;
          if (lx < b[0] - pad || lx > b[2] + pad || ly < b[1] - pad || ly > b[3] + pad) continue;
          const d = sh.sdf(lx, ly);
          // Thin-feature preservation: anything thinner than a pixel still claims the nearest pixel.
          // Lines use half a pixel (so they stay 1px wide); dots use the half-diagonal, because a
          // dot between four pixel centres is up to 0.71px from each of them.
          const reach = (b[2] - b[0] < 3 / scale && b[3] - b[1] < 3 / scale) ? diag : half;
          const thr = sh.R < reach ? reach - sh.R : 0;
          if (d <= thr) {
            if (sh.op === 'cut') got = null;
            else { got = sh; gd = d; }
          }
        }
        if (got) { hitPart[i] = k; hitShape[i] = got; hitD[i] = gd; hitLX[i] = lx; hitLY[i] = ly; }
      }
    }
  }

  // Lighting setup.
  const az = (st.light * Math.PI) / 180, el = (st.elevation * Math.PI) / 180;
  const L = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
  const Hv = (() => { const v = [L[0], L[1], L[2] + 1]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
  const flatB = L[2];
  // Neighbour pixel in the direction of the light: if a front part sits there, we're in its shadow.
  const shadowDX = Math.sign(Math.round(L[0] * 1.4)), shadowDY = Math.sign(Math.round(L[1] * 1.4));

  const matNames = Object.keys(compiled.materials);
  const matIndex = Object.fromEntries(matNames.map((n, i) => [n, i]));
  const rgba = new Uint8ClampedArray(N * 4);
  const ids = new Int16Array(N).fill(-1);
  const toneIdx = new Int8Array(N).fill(-1);
  const eps = 0.35 / scale;

  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px;
    const k = hitPart[i];
    if (k < 0) continue;
    const sh = hitShape[i];
    const { p, inv, surface } = parts[k];
    const surf = surface[sh.material];
    const mat = compiled.materials[sh.material];
    const tones = mat.tones ?? st.tones;
    const ramp = getRamp(mat.color, tones, st.hueShift);
    const bi = baseIndex(tones);
    let f = bi;
    if (!mat.flat) {
      const wx = ((st.flip ? W - 1 - px : px) + 0.5) / scale, wy = (py + 0.5) / scale;
      const sdfW = (x, y) => surf.sdf(inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]);
      let gx = sdfW(wx + eps, wy) - sdfW(wx - eps, wy);
      let gy = sdfW(wx, wy + eps) - sdfW(wx, wy - eps);
      if (st.flip) gx = -gx;
      const gl = Math.hypot(gx, gy);
      if (gl > 1e-9) { gx /= gl; gy /= gl; } else { gx = 0; gy = 0; }
      const u = Math.min(1, Math.max(0, -surf.sdf(hitLX[i], hitLY[i]) / surf.R));
      let rho = sh.profile === 'dome' ? 1 - u : sh.profile === 'flat' ? (u < 0.3 ? (1 - u / 0.3) * 0.6 : 0) : 0;
      rho = Math.min(rho * st.curvature, 0.85);
      const nz = Math.sqrt(1 - rho * rho), nx = gx * rho, ny = gy * rho;
      const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let v = diff >= flatB ? (diff - flatB) / (1 - flatB) : (diff - flatB) / flatB;
      v += st.ambient + (st.ambientBoost || 0) + p.shade + sh.shade;
      if (st.contactShadow) {
        const qx = px + shadowDX, qy = py + shadowDY;
        if (qx >= 0 && qy >= 0 && qx < W && qy < H) {
          const q = qy * W + qx, kq = hitPart[q];
          if (kq > k && parts[kq].p.z > p.z) {
            const caster = compiled.materials[hitShape[q].material];
            if (!caster.flat && caster.outline) v -= 0.7; // eyes, glints, blush don't cast shadows
          }
        }
      }
      f = v < 0 ? bi + v * bi : bi + v * (tones - 1 - bi);
      if (mat.texture && st.texture > 0) {
        const tx = Math.floor(hitLX[i] * scale), ty = Math.floor(hitLY[i] * scale);
        f += sampleTexture(mat.texture, tx, ty, mat.textureScale) * mat.textureStrength * st.texture * 1.3;
      }
      if (mat.shine > 0) {
        const sp = Math.pow(Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]), 40);
        if (sp * (0.5 + mat.shine) > 0.55) f = tones - 1;
      }
      if (st.dither) {
        const fl = Math.floor(f), fr = f - fl;
        const tx = Math.floor(hitLX[i] * scale) & 3, ty = Math.floor(hitLY[i] * scale) & 3;
        if (fr > 0.3 && fr < 0.7) f = (fr - 0.3) / 0.4 > BAYER4[(ty << 2) | tx] ? fl + 1 : fl;
        else f = Math.round(f);
      } else f = Math.round(f);
    }
    const ti = Math.max(0, Math.min(tones - 1, f));
    toneIdx[i] = ti;
    ids[i] = matIndex[sh.material];
    const c = ramp[ti];
    rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
  }

  // Inner lines: darken the back part where a front part overlaps it.
  if (st.innerLines) {
    const paint = [];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px, k = hitPart[i];
      if (k < 0) continue;
      const z = parts[k].p.z;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const kq = hitPart[qy * W + qx];
        if (kq < 0 || kq === k || parts[kq].p.z <= z) continue;
        const front = compiled.materials[hitShape[qy * W + qx].material];
        if (front.flat || !front.outline) continue; // details (eyes, glints) don't get inner lines
        paint.push(i); break;
      }
    }
    for (const i of paint) {
      const sh = hitShape[i], mat = compiled.materials[sh.material];
      if (mat.flat || !mat.outline) continue;
      const ramp = getRamp(mat.color, mat.tones ?? st.tones, st.hueShift);
      const c = darken(ramp[0], 0.15);
      rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2];
    }
  }

  // Outline around the silhouette.
  if (st.outline !== 'none') {
    const dark = parseHex(st.outlineColor) || [27, 20, 36];
    const out = [];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (hitPart[i] >= 0) continue;
      let src = -1;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const j = qy * W + qx;
        if (hitPart[j] >= 0 && compiled.materials[hitShape[j].material].outline) { src = j; break; }
      }
      if (src >= 0) out.push([i, src]);
    }
    for (const [i, src] of out) {
      let c = dark;
      if (st.outline === 'selective') {
        const mat = compiled.materials[hitShape[src].material];
        c = darken(getRamp(mat.color, mat.tones ?? st.tones, st.hueShift)[0], 0.45);
      }
      rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
      ids[i] = -2;
    }
  }
  return { w: W, h: H, rgba, ids, materials: matNames };
}

/**
 * Playback metadata for one animation (shared by sheets and bundles): frames, fps, loop, and when
 * present speed / speedY (units per second), events [{frame, name, data?}] and durations (ms per
 * frame, only when the animation has holds).
 */
export function animationMeta(anim) {
  const m = { frames: anim.frames, fps: anim.fps, loop: anim.loop };
  if (anim.speed) m.speed = anim.speed;
  if (anim.speedY) m.speedY = anim.speedY;
  if (anim.wall != null) m.wall = anim.wall;
  if (anim.mix) m.mix = { ...anim.mix };
  if (anim.events?.length) m.events = anim.events.map((e) => ({ ...e }));
  if (anim.holds && Object.keys(anim.holds).length) {
    const base = 1000 / anim.fps;
    m.durations = Array.from({ length: anim.frames }, (_, f) => Math.round(base * (anim.holds[f] ?? 1) * 100) / 100);
  }
  return m;
}

/** Render all frames of one animation. */
export function renderAnimation(compiled, animName, res, overrides = {}) {
  if (!(res > 0 && res <= MAX_RES)) throw new Error(`res must be 1..${MAX_RES} pixels (got ${res})`);
  const style = resolveStyle(compiled, res, overrides);
  const anim = compiled.animations[animName];
  if (!anim) throw new Error(`unknown animation "${animName}" (have: ${Object.keys(compiled.animations).join(', ')})`);
  const frames = [];
  for (let f = 0; f < anim.frames; f++) frames.push(renderFrame(compiled, { res, anim, frame: f, style }));
  return { anim, style, frames };
}

/**
 * Sprite sheet: one row per animation, one column per frame.
 * @returns {{width,height,rgba,meta}} meta = {res, lod, frameW, frameH, animations:{name:{row, ...animationMeta}}}
 */
export function renderSheet(compiled, res, overrides = {}, animNames = Object.keys(compiled.animations)) {
  if (!animNames.length) throw new Error('renderSheet needs at least one animation');
  const rows = animNames.map((n) => renderAnimation(compiled, n, res, overrides));
  const frameW = rows[0].frames[0].w, frameH = rows[0].frames[0].h;
  const cols = Math.max(...rows.map((r) => r.frames.length));
  const width = cols * frameW, height = rows.length * frameH;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const animations = {};
  rows.forEach((r, row) => {
    animations[r.anim.name] = { row, ...animationMeta(r.anim) };
    r.frames.forEach((fr, col) => {
      for (let y = 0; y < frameH; y++) {
        const src = y * frameW * 4;
        const dst = ((row * frameH + y) * width + col * frameW) * 4;
        rgba.set(fr.rgba.subarray(src, src + frameW * 4), dst);
      }
    });
  });
  return { width, height, rgba, meta: { res, lod: rows[0].style.lod, frameW, frameH, animations } };
}
