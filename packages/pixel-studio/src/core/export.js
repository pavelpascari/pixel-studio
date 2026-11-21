// Export for game engines: a sprite sheet PNG plus JSON in Aseprite's "hash" sheet format, which
// Phaser (load.aseprite / anims.createFromAseprite) reads directly. The same JSON carries a PixiJS
// `animations` map (Spritesheet), attachment points as Aseprite slices (one key per frame), and the
// Pixel Studio extras (events, speed, ground) under meta.pixelStudio. Frames are named by their
// index ("0", "1", ...), like Aseprite's --filename-format {frame}; tags and the animations map give names.
import { renderSheet } from './render.js';
import { bakePoints, groundFromPixels } from './bundle.js';

const VERSION = '0.1.0';

/**
 * @returns {{width, height, rgba, json}} json is the Aseprite/Pixi sheet description for `image`.
 */
export function exportSheet(compiled, res, { image = 'sheet.png', overrides = {} } = {}) {
  const sheet = renderSheet(compiled, res, overrides);
  const { frameW, frameH, animations } = sheet.meta;
  const frames = {}, frameTags = [], pixiAnimations = {}, order = {};
  let index = 0;
  for (const [name, a] of Object.entries(animations)) {
    const from = index, keys = [];
    for (let f = 0; f < a.frames; f++) {
      const key = String(index);   // frame names are their index, as Phaser's createFromAseprite expects
      frames[key] = {
        frame: { x: f * frameW, y: a.row * frameH, w: frameW, h: frameH },
        rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
        sourceSize: { w: frameW, h: frameH },
        duration: Math.round(a.durations ? a.durations[f] : 1000 / a.fps),
      };
      keys.push(key);
      order[`${name}/${f}`] = index++;
    }
    // Aseprite writes "repeat" (as a string) only when the tag plays a fixed number of times.
    frameTags.push({ name, from, to: index - 1, direction: 'forward', color: '#000000ff', ...(a.loop ? {} : { repeat: '1' }) });
    pixiAnimations[name] = keys;
  }
  // Attachment points become 1×1 slices with a key per frame (bounds in frame pixels).
  const pts = bakePoints(compiled) ?? {};
  const [uw, uh] = compiled.size;
  const slices = Object.entries(pts).map(([name, byAnim]) => ({
    name, color: '#0000ffff',
    keys: Object.entries(byAnim).flatMap(([anim, list]) => list.map(([x, y], f) => ({
      frame: order[`${anim}/${f}`], bounds: { x: Math.round((x / uw) * frameW), y: Math.round((y / uh) * frameH), w: 1, h: 1 },
    }))),
  }));
  const extras = Object.fromEntries(Object.entries(animations).map(([name, a]) => [name,
    Object.fromEntries(Object.entries({ fps: a.fps, loop: a.loop, speed: a.speed, speedY: a.speedY, wall: a.wall, events: a.events }).filter(([, v]) => v !== undefined))]));
  const json = {
    frames,
    animations: pixiAnimations,
    meta: {
      app: 'https://github.com/pavelpascari/pixel-studio', version: VERSION, image, format: 'RGBA8888',
      size: { w: sheet.width, h: sheet.height }, scale: '1', frameTags, layers: [], slices,
      pixelStudio: { name: compiled.name, res, lod: sheet.meta.lod, size: compiled.size, ground: compiled.ground ?? groundFromPixels(sheet, compiled.size), animations: extras },
    },
  };
  return { width: sheet.width, height: sheet.height, rgba: sheet.rgba, json };
}
