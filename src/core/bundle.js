// Web bundle = everything a page needs to play a character, in one JSON file:
// { format, name, size, ground, animations: {name:{row,frames,fps,loop,speed?,speedY?,events?,durations?}},
//   points?: {name: {anim: [[x, y, rot], ...per frame]}}, skinPoints?: {skin: points}, skins?: [name], states?: {...state machine},
//   variants: [{res,lod,frameW,frameH,image,skin?}] }
// `size` is the spec canvas in units ([w, h]) and `ground` the y of the foot line in units; points
// are in units too, so one table serves every resolution. `image` is a PNG data URL (or a URL).
import { renderSheet } from './render.js';
import { samplePose } from './animate.js';
import { worldMatrices, apply, angleOf } from './rig.js';

export const BUNDLE_FORMAT = 'pixel-sprite/1';
const r2 = (v) => Math.round(v * 100) / 100;

/** encode(w, h, rgba) → PNG data URL. Supplied by the host (canvas in browsers, zlib in Node). */
export async function buildBundle(compiled, { resolutions = [16, 32, 64], overrides = {}, encode } = {}) {
  if (typeof encode !== 'function') throw new Error('buildBundle needs an encode(w, h, rgba) function that returns an image URL (see encodePNG for Node)');
  const variants = [];
  let animations = null, top = null;
  for (const res of [...resolutions].sort((a, b) => a - b)) {
    const sheet = renderSheet(compiled, res, overrides);
    animations ??= Object.fromEntries(Object.entries(sheet.meta.animations));
    top = sheet;
    variants.push({ res, lod: sheet.meta.lod, frameW: sheet.meta.frameW, frameH: sheet.meta.frameH,
      image: await encode(sheet.width, sheet.height, sheet.rgba) });
  }
  // Skins: the same sheet layout per skin, as extra variants tagged with the skin's name.
  for (const [skin, sc] of Object.entries(compiled.skins ?? {})) {
    for (const res of [...resolutions].sort((a, b) => a - b)) {
      const sheet = renderSheet(sc, res, overrides);
      variants.push({ res, lod: sheet.meta.lod, frameW: sheet.meta.frameW, frameH: sheet.meta.frameH, skin,
        image: await encode(sheet.width, sheet.height, sheet.rgba) });
    }
  }
  const bundle = { format: BUNDLE_FORMAT, name: compiled.name, size: compiled.size,
    ground: compiled.ground ?? groundFromPixels(top, compiled.size), animations };
  if (compiled.skins) bundle.skins = Object.keys(compiled.skins);
  if (compiled.states) bundle.states = compiled.states;
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

/** Fallback foot line: the lowest opaque row of the first frame of the first animation, in units. */
export function groundFromPixels(sheet, size) {
  if (!sheet) return size[1];
  const { frameW, frameH } = sheet.meta;
  for (let y = frameH - 1; y >= 0; y--) for (let x = 0; x < frameW; x++)
    if (sheet.rgba[(y * sheet.width + x) * 4 + 3] > 0) return r2(((y + 1) / frameH) * size[1]);
  return size[1];
}
