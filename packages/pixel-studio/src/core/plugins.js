// Extension points: add shapes, textures and motion models without forking the engine.
// Registrations are build-time JavaScript (CLI, studio, Node); bundles stay pure data, so the
// web runtime needs nothing. Registered names validate like built-in ones (JSON paths,
// did-you-mean) and are listed by `pixel brief`, so agents can use them.
//
//   import { registerShape, registerTexture, registerMotion } from '@pixel-studio/core';
//   registerShape('star', { required: ['cx', 'cy', 'r'], keys: ['r2', 'points'], compile: (s) => ({ sdf, R, bbox }) });
//   registerTexture('feathers', (x, y, scale) => value);           // -1..1 brightness offset
//   registerMotion('float', { legged: false, generate: ({ parts, rig, params, samples, loop }) => ({ tracks }) });
//
// The CLI loads plug-in files with --plugin ./my-plugin.mjs; such a file default-exports
// `function setup({ registerShape, registerTexture, registerMotion }) { ... }`.
// Registering the same definition again under its name is a no-op (a dev server re-running setup); a different
// definition under a taken name throws. The registries stay private: shapeTypes() etc. hand out frozen copies.
import { SHAPE_TYPES, SHAPE_REQUIRED, SHAPE_KEYS, customShapes } from './shapes.js';
import { TEXTURES, customTextures } from './textures.js';
import { MOTION_MODELS, LEGGED_MODELS, customMotions } from './motion.js';

const NAME = /^[A-Za-z][\w-]*$/;
const described = [];

/**
 * Check a name for a new registration. Returns false when the exact same definition is already registered under
 * it (a dev server reloading a plug-in): registering again is then a no-op. A different definition throws.
 */
function claim(kind, name, taken, same) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`${kind} name must start with a letter and use letters, digits, "_" or "-" (got ${JSON.stringify(name)})`);
  if (!taken.includes(name)) return true;
  if (same) return false;
  throw new Error(`${kind} "${name}" already exists`);
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// The same definition: the same function, or one with identical source (a plug-in's setup run again makes new
// function objects from the same code).
const sameFn = (a, b) => typeof a === 'function' && typeof b === 'function' && (a === b || String(a) === String(b));

// Read-only views of the registries: fresh frozen arrays, so changing one cannot reach the engine.
/** Every shape type: the built-ins and registered ones. */
export const shapeTypes = () => Object.freeze([...SHAPE_TYPES]);
/** Every texture name. */
export const textures = () => Object.freeze([...TEXTURES]);
/** Every motion model name. */
export const motionModels = () => Object.freeze([...MOTION_MODELS]);
/** The motion models that need `rig.legs`. */
export const leggedModels = () => Object.freeze([...LEGGED_MODELS]);

/**
 * A new shape type. `compile(shape)` returns {sdf(x, y), R, bbox} like the built-ins: a signed
 * distance in part-local units (negative inside), the thickness used for lighting, and [x0, y0, x1, y1].
 * `required` keys must be numbers; `keys` lists other allowed keys (so typos get warnings).
 */
export function registerShape(type, { required = [], keys = [], compile, describe = '' } = {}) {
  const prev = described.find((d) => d.kind === 'shape' && d.name === type);
  if (!claim('shape', type, SHAPE_TYPES, prev && sameFn(customShapes.get(type), compile) && sameList(prev.required, required) && sameList(prev.keys, keys))) return;
  if (typeof compile !== 'function') throw new Error(`shape "${type}" needs a compile(shape) function`);
  SHAPE_TYPES.push(type);
  SHAPE_REQUIRED[type] = [...required];
  for (const k of [...required, ...keys]) if (!SHAPE_KEYS.includes(k)) SHAPE_KEYS.push(k);
  customShapes.set(type, compile);
  described.push({ kind: 'shape', name: type, describe, required: [...required], keys: [...keys] });
}

/** A new texture: fn(x, y, scale) → brightness offset about -1..1, in part-local pixels. */
export function registerTexture(name, fn, { describe = '' } = {}) {
  if (!claim('texture', name, TEXTURES, sameFn(customTextures.get(name), fn))) return;
  if (typeof fn !== 'function') throw new Error(`texture "${name}" needs a function (x, y, scale) => value`);
  TEXTURES.push(name);
  customTextures.set(name, fn);
  described.push({ kind: 'texture', name, describe });
}

/**
 * A new motion model, usable as "model" in figure presets or {"motion": "<name>"} in specs.
 * generate({parts, rig, params, samples, loop, frames, fps}) returns
 *   { tracks: {partId: {x|y|rot|sx|sy: number | number[samples]}}, speed?, speedY?, events?: [{u, name, data?}] }
 * where track arrays have one value per sample (samples = frames × 4 for loops). x/y/rot are added to
 * the rest pose; sx/sy multiply it. `legged: true` makes figures without rig.legs an error.
 */
export function registerMotion(name, { generate, legged = false, describe = '' } = {}) {
  if (!claim('motion model', name, MOTION_MODELS, sameFn(customMotions.get(name), generate) && LEGGED_MODELS.includes(name) === !!legged)) return;
  if (typeof generate !== 'function') throw new Error(`motion "${name}" needs a generate(context) function`);
  MOTION_MODELS.push(name);
  if (legged) LEGGED_MODELS.push(name);
  customMotions.set(name, generate);
  described.push({ kind: 'motion', name, describe, legged });
}

/** Everything registered so far: [{kind, name, describe, ...}]. */
export function registeredPlugins() { return described.map((d) => ({ ...d })); }

/** Load a plug-in module (default export: setup function receiving the register functions). */
export async function usePlugin(mod) {
  const setup = mod?.default ?? mod;
  if (typeof setup !== 'function') throw new Error('a plug-in module must default-export a function setup({ registerShape, registerTexture, registerMotion })');
  await setup({ registerShape, registerTexture, registerMotion });
}
