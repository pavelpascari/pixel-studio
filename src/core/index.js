// Public API of the Pixel Studio engine (isomorphic: browser + Node, zero dependencies).
export { validate, compile, TRACK_PROPS } from './spec.js';
export { renderFrame, renderAnimation, renderSheet, animationMeta, resolveStyle, lodForRes, DETAIL_PRESETS, DETAIL_NAMES } from './render.js';
export { buildRamp, parseHex, toHex } from './color.js';
export { TEXTURES } from './textures.js';
export { SHAPE_TYPES } from './shapes.js';
export { contactSheet, createImage, blit } from './image.js';
export { frameToAscii } from './ascii.js';
export { buildBundle, bakePoints, BUNDLE_FORMAT } from './bundle.js';
export { samplePose, samplePoseAt, sampleValue, frameTime, followOffsets } from './animate.js';
export { worldMatrices, solveReach, overflowForPose } from './rig.js';
export { checkBounds } from './lint.js';
export { resolveExtends, mergeVariant, resolveSpec } from './extend.js';
export { resolveFigure, expandFigure } from './figure.js';
export { generateMotion, MOTION_MODELS, LEGGED_MODELS } from './motion.js';
export { exportSheet } from './export.js';
export { pngBytes, paletteOf } from './png.js';
export { buildMixes } from './mix.js';
export { registerShape, registerTexture, registerMotion, registeredPlugins, usePlugin } from './plugins.js';
