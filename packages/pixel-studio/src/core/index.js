// Public API of the Pixel Studio engine (isomorphic: browser + Node, zero dependencies).
// Building blocks the pipeline uses internally (pose sampling, rig maths, PNG palettes, ...) are in
// ./internal.js (`pixel-studio/internal`): no compatibility promise there.
export { validate, compile, TRACK_PROPS } from './spec.js';
export { renderFrame, renderAnimation, renderSheet, animationMeta, resolveStyle, lodForRes, DETAIL_PRESETS, DETAIL_NAMES, MAX_RES } from './render.js';
export { buildRamp, parseHex, toHex } from './color.js';
export { contactSheet } from './image.js';
export { frameToAscii } from './ascii.js';
export { buildBundle, BUNDLE_FORMAT } from './bundle.js';
export { checkBounds } from './lint.js';
export { resolveSpec } from './extend.js';
export { resolveFigure } from './figure.js';
export { generateMotion } from './motion.js';
export { exportSheet } from './export.js';
export { pngBytes } from './png.js';
export {
  registerShape, registerTexture, registerMotion, registeredPlugins, usePlugin,
  shapeTypes, textures, motionModels, leggedModels,
} from './plugins.js';
