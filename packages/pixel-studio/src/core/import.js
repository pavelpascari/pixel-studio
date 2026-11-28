// Import: hand-drawn sprite sheets become web bundles that <pixel-sprite> and <pixel-stage> play.
//
//   const imported = await importSheet(source, { readFile, decodePNG, options });   // any format → frames
//   const { bundle, report } = await bundleImport(imported, { encode, fps, loop, speed, ground });
//
// A source is { name, bytes } for a file or { name, entries: [relative paths] } for a folder. The host supplies
// readFile(relativePath) → bytes (files next to the source, or inside the folder) and decodePNG(bytes) → {width,
// height, rgba}, so the same code runs in Node and in browsers. Built-in importers:
//   aseprite  JSON sheet in Aseprite's hash or array layout (also LibreSprite, TexturePacker, `pixel export`):
//             tags → animations, frame durations → holds, slices → attachment points, meta.pixelStudio → the rest
//   grid      a PNG laid out as a grid, one animation per row; options.frame "32x32", options.anims "idle:4,walk:8"
//   frames    a folder of PNGs, one per frame: walk_0.png, walk_1.png … or walk/0.png, walk/1.png …
// Plug-ins add more with registerImporter(name, { detect(source), read(source, ctx), describe }).
import { STAGE_ROLES, BUNDLE_FORMAT } from './bundle.js';

const r2 = (v) => Math.round(v * 100) / 100;
const isObj = (o) => o != null && typeof o === 'object' && !Array.isArray(o);
const ext = (name) => (/\.([^./\\]+)$/.exec(name)?.[1] ?? '').toLowerCase();
const baseName = (name) => String(name).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
const text = (bytes) => new TextDecoder().decode(bytes);
const DEFAULT_FPS = 10;   // Aseprite's default frame time is 100 ms

// ---------- registry ----------

const BUILT_IN = ['aseprite', 'grid', 'frames'];
const importers = new Map();   // name → { detect, read, describe }

/** Every importer name: the built-ins, then registered ones. */
export const importerNames = () => Object.freeze([...importers.keys()]);

/** Add an importer (also through a plug-in's setup). Registering the same functions again is a no-op. */
export function addImporter(name, { detect, read, describe = '' } = {}) {
  if (typeof name !== 'string' || !/^[A-Za-z][\w-]*$/.test(name)) throw new Error(`importer name must start with a letter and use letters, digits, "_" or "-" (got ${JSON.stringify(name)})`);
  if (typeof detect !== 'function' || typeof read !== 'function') throw new Error(`importer "${name}" needs detect(source) and read(source, ctx) functions`);
  const prev = importers.get(name);
  if (prev) {
    if (String(prev.detect) === String(detect) && String(prev.read) === String(read)) return false;
    throw new Error(`importer "${name}" already exists`);
  }
  importers.set(name, { detect, read, describe });
  return true;
}

/** The importer for a source: `format` when given, else the first whose detect() says yes (plug-ins first). */
export function pickImporter(source, format) {
  if (format) {
    const imp = importers.get(format);
    if (!imp) throw new Error(`no importer "${format}" (have: ${[...importers.keys()].join(', ')})`);
    return [format, imp];
  }
  const order = [...[...importers.keys()].filter((n) => !BUILT_IN.includes(n)), ...BUILT_IN];
  for (const n of order) {
    let yes = false;
    try { yes = !!importers.get(n).detect(source); } catch { /* a detect that throws means no */ }
    if (yes) return [n, importers.get(n)];
  }
  throw new Error(`cannot tell how to import ${source?.name ?? 'this'}: give a .json sheet (Aseprite), a .png grid or a folder of PNG frames, or name a format`);
}

/**
 * Read a source with its importer: { format, name, animations: [{name, frames: [{w, h, rgba, duration?}], fps?, loop?,
 * speed?, speedY?, wall?, events?}], points?: {name: {anim: [[x, y], ...]}} (frame px), ground? (frame px), notes }.
 */
export async function importSheet(source, { format, readFile, decodePNG, options = {}, warn = () => {} } = {}) {
  if (!source || typeof source.name !== 'string') throw new Error('importSheet needs a source {name, bytes} or {name, entries}');
  if (typeof decodePNG !== 'function') throw new Error('importSheet needs decodePNG(bytes) → {width, height, rgba}');
  const [name, imp] = pickImporter(source, format);
  const notes = [];
  const ctx = {
    options,
    decodePNG: async (bytes) => decodePNG(bytes),
    readFile: async (path) => {
      if (typeof readFile !== 'function') throw new Error(`cannot read ${path}: no readFile given`);
      return readFile(path);
    },
    warn: (m) => { notes.push(m); warn(m); },
  };
  const got = await imp.read(source, ctx);
  checkImported(got, name);
  return { format: name, name: got.name ?? baseName(source.name), ...got, notes: [...(got.notes ?? []), ...notes] };
}

function checkImported(got, who) {
  const fail = (m) => { throw new Error(`importer "${who}": ${m}`); };
  if (!isObj(got) || !Array.isArray(got.animations) || !got.animations.length) fail('found no animations');
  const seen = new Set();
  for (const a of got.animations) {
    if (typeof a?.name !== 'string' || !a.name) fail('every animation needs a name');
    if (seen.has(a.name)) fail(`two animations are named "${a.name}"`);
    seen.add(a.name);
    if (!Array.isArray(a.frames) || !a.frames.length) fail(`animation "${a.name}" has no frames`);
    if (a.frames.length > 256) fail(`animation "${a.name}" has ${a.frames.length} frames (at most 256)`);
    for (const f of a.frames) if (!(f && f.w > 0 && f.h > 0 && f.rgba?.length === f.w * f.h * 4)) fail(`animation "${a.name}" has a frame that is not {w, h, rgba}`);
  }
}

// ---------- helpers for importers ----------

/** A w×h region of an image as a frame (pixels outside the image stay transparent). */
export function cropFrame(img, x, y, w, h) {
  const rgba = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const sy = y + j;
    if (sy < 0 || sy >= img.height) continue;
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4, d = (j * w + i) * 4;
      rgba[d] = img.rgba[s]; rgba[d + 1] = img.rgba[s + 1]; rgba[d + 2] = img.rgba[s + 2]; rgba[d + 3] = img.rgba[s + 3];
    }
  }
  return { w, h, rgba };
}

const isEmpty = (f) => { for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i]) return false; return true; };

/** "32x32" or "32" (square) or [32, 32] → [w, h]; null when absent. */
export function parseSize(v, what = 'frame') {
  if (v == null || v === '') return null;
  const parts = Array.isArray(v) ? v : String(v).toLowerCase().split('x');
  const [w, h = w] = parts.map(Number);
  if (!(Number.isInteger(w) && w > 0 && Number.isInteger(h) && h > 0) || parts.length > 2) throw new Error(`${what} size must be WIDTHxHEIGHT in pixels, e.g. 32x32 (got "${v}")`);
  return [w, h];
}

// ---------- built-in importers ----------

addImporter('aseprite', {
  describe: 'Aseprite JSON sheet (hash or array): tags, durations, slices',
  detect: (s) => s.bytes && ext(s.name) === 'json' && (() => { try { const j = JSON.parse(text(s.bytes)); return isObj(j.meta) && (isObj(j.frames) || Array.isArray(j.frames)); } catch { return false; } })(),
  async read(source, ctx) {
    let json;
    try { json = JSON.parse(text(source.bytes)); } catch (e) { throw new Error(`${source.name} is not valid JSON: ${e.message}`); }
    if (!isObj(json.meta) || !(isObj(json.frames) || Array.isArray(json.frames))) throw new Error(`${source.name} is not an Aseprite sheet (it needs "frames" and "meta")`);
    if (typeof json.meta.image !== 'string' || !json.meta.image) throw new Error(`${source.name}: meta.image does not name the sheet's PNG`);
    const img = await ctx.decodePNG(await ctx.readFile(json.meta.image));
    // Sheet frames in order, each rebuilt at its full (untrimmed, unrotated) size.
    const list = Array.isArray(json.frames) ? json.frames : Object.entries(json.frames).map(([filename, f]) => ({ filename, ...f }));
    const sheetFrames = list.map((f, i) => {
      const r = f.frame;
      if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) throw new Error(`${source.name}: frame ${f.filename ?? i} has no frame rectangle`);
      const full = f.sourceSize ?? { w: r.w, h: r.h }, off = f.spriteSourceSize ?? { x: 0, y: 0 };
      let part = f.rotated
        // Rotated 90° clockwise on the sheet: the region is h wide and w tall.
        ? (() => { const reg = cropFrame(img, r.x, r.y, r.h, r.w), out = { w: r.w, h: r.h, rgba: new Uint8Array(r.w * r.h * 4) };
          for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) out.rgba.set(reg.rgba.subarray(((x * r.h) + (r.h - 1 - y)) * 4, ((x * r.h) + (r.h - 1 - y)) * 4 + 4), (y * r.w + x) * 4);
          return out; })()
        : cropFrame(img, r.x, r.y, r.w, r.h);
      if (full.w !== part.w || full.h !== part.h || off.x || off.y) part = place(part, full.w, full.h, off.x, off.y);
      return { ...part, duration: Number.isFinite(f.duration) && f.duration > 0 ? f.duration : undefined };
    });
    const extra = isObj(json.meta.pixelStudio) ? json.meta.pixelStudio : null;
    const tags = Array.isArray(json.meta.frameTags) ? json.meta.frameTags : [];
    const animations = [];
    const order = {};   // animation → sheet frame index per played frame (for slices)
    if (!tags.length) {
      animations.push({ name: 'idle', frames: sheetFrames });
      order.idle = sheetFrames.map((_, i) => i);
      ctx.warn('the sheet has no tags: all frames became one animation, "idle" (tag the frames in Aseprite to name animations)');
    }
    const covered = new Set();
    for (const t of tags) {
      const from = Number(t.from), to = Number(t.to);
      if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to < sheetFrames.length && from <= to)) throw new Error(`${source.name}: tag "${t.name}" covers frames ${t.from}..${t.to}, outside 0..${sheetFrames.length - 1}`);
      if (animations.some((a) => a.name === t.name)) { ctx.warn(`tag "${t.name}" appears twice: kept the first`); continue; }
      const up = []; for (let i = from; i <= to; i++) up.push(i);
      const down = [...up].reverse();
      const dir = t.direction ?? 'forward';
      const idx = dir === 'reverse' ? down
        : dir === 'pingpong' ? [...up, ...down.slice(1, -1)]
          : dir === 'pingpong_reverse' ? [...down, ...up.slice(1, -1)] : up;
      if (!['forward', 'reverse', 'pingpong', 'pingpong_reverse'].includes(dir)) ctx.warn(`tag "${t.name}": unknown direction "${dir}", played forward`);
      for (const i of idx) covered.add(i);
      const a = { name: String(t.name), frames: idx.map((i) => sheetFrames[i]) };
      // Aseprite writes "repeat" only for tags that play a fixed number of times.
      if (t.repeat != null && Number(t.repeat) > 0) {
        a.loop = false;
        if (Number(t.repeat) > 1) ctx.warn(`tag "${t.name}" repeats ${t.repeat} times: imported as playing once`);
      }
      const ex = extra?.animations?.[a.name];
      if (isObj(ex)) for (const k of ['fps', 'loop', 'speed', 'speedY', 'wall', 'events']) if (ex[k] !== undefined) a[k] = ex[k];
      animations.push(a);
      order[a.name] = idx;
    }
    const loose = sheetFrames.length - covered.size;
    if (tags.length && loose > 0) ctx.warn(`${loose} frame${loose > 1 ? 's are' : ' is'} in no tag and were left out`);
    // Slices: a key holds from its frame until the next key. A 1×1 slice is a point; a larger one its pivot or centre.
    const points = {};
    for (const s of Array.isArray(json.meta.slices) ? json.meta.slices : []) {
      const keys = (s.keys ?? []).filter((k) => isObj(k.bounds)).sort((a, b) => a.frame - b.frame);
      if (!s.name || !keys.length) continue;
      const at = (i) => { let k = keys[0]; for (const c of keys) if (c.frame <= i) k = c; return k; };
      const pos = (k) => {
        const b = k.bounds;
        if (k.pivot) return [b.x + k.pivot.x, b.y + k.pivot.y];
        return b.w <= 1 && b.h <= 1 ? [b.x, b.y] : [b.x + b.w / 2, b.y + b.h / 2];
      };
      points[s.name] = Object.fromEntries(Object.entries(order).map(([anim, idx]) => [anim, idx.map((i) => pos(at(i)))]));
    }
    // Our own export (meta.pixelStudio): ground and speeds are in spec units; bring them to frame pixels.
    const out = { name: extra?.name ?? baseName(json.meta.image), animations };
    if (Object.keys(points).length) out.points = points;
    const [uw, uh] = Array.isArray(extra?.size) ? extra.size : [], { w: fw, h: fh } = sheetFrames[0];
    if (uh > 0) {
      const k = fh / uh;
      if (Number.isFinite(extra.ground)) out.ground = r2(extra.ground * k);
      for (const a of animations) for (const p of ['speed', 'speedY']) if (Number.isFinite(a[p])) a[p] = r2(a[p] * k);
    }
    // A climb's wall line is an x in units.
    for (const a of animations) if (a.wall != null) { if (uw > 0 && Number.isFinite(a.wall)) a.wall = r2((a.wall * fw) / uw); else delete a.wall; }
    return out;
  },
});

addImporter('grid', {
  describe: 'a PNG laid out as a grid, one animation per row (options: frame "32x32", anims "idle:4,walk:8")',
  detect: (s) => s.bytes && ext(s.name) === 'png',
  async read(source, ctx) {
    const img = await ctx.decodePNG(source.bytes);
    const o = ctx.options;
    // anims: "idle:4,walk:8" or "idle,walk" (frames counted from the cells that are not empty), in row order.
    const anims = o.anims == null || o.anims === true ? null : (Array.isArray(o.anims) ? o.anims : String(o.anims).split(','))
      .map((s) => String(s).trim()).filter(Boolean).map((s) => {
        const [name, n] = s.split(':');
        if (n != null && !(Number.isInteger(Number(n)) && Number(n) > 0)) throw new Error(`anims: "${s}" must be name or name:frames, e.g. walk:8`);
        return { name: name.trim(), count: n == null ? null : Number(n) };
      });
    let size = parseSize(o.frame);
    if (!size) {
      const rows = anims?.length ?? 1, h = img.height / rows;
      if (!Number.isInteger(h) || img.width % h) throw new Error(`cannot tell the frame size of a ${img.width}x${img.height} sheet${anims ? ` with ${rows} rows` : ''}: give it, e.g. frame 32x32`);
      size = [h, h];
      ctx.warn(`frame size not given: assumed ${h}x${h} (square frames${anims ? `, ${rows} rows` : ', one row'})`);
    }
    const [fw, fh] = size;
    if (img.width % fw || img.height % fh) ctx.warn(`the ${img.width}x${img.height} sheet is not a whole number of ${fw}x${fh} frames: the extra pixels are ignored`);
    const cols = Math.floor(img.width / fw), rows = Math.floor(img.height / fh);
    if (!cols || !rows) throw new Error(`a ${fw}x${fh} frame does not fit the ${img.width}x${img.height} sheet`);
    if (anims && anims.length > rows) throw new Error(`anims names ${anims.length} rows but the sheet has ${rows}`);
    const used = anims ?? Array.from({ length: rows }, (_, r) => ({ name: rows === 1 ? 'idle' : `row${r + 1}`, count: null }));
    if (!anims) ctx.warn(rows === 1 ? 'one row: named it "idle" (name animations with anims, e.g. idle:4)' : `named the rows ${used.map((a) => a.name).join(', ')} (name them with anims, e.g. idle:4,walk:8)`);
    else if (anims.length < rows) ctx.warn(`the sheet has ${rows} rows; imported the first ${anims.length}`);
    const animations = used.map((a, r) => {
      if (a.count > cols) throw new Error(`anims: "${a.name}" has ${a.count} frames but a row holds ${cols}`);
      let frames = Array.from({ length: a.count ?? cols }, (_, c) => cropFrame(img, c * fw, r * fh, fw, fh));
      if (a.count == null) {   // drop the empty cells at the end of the row
        let n = frames.length;
        while (n > 1 && isEmpty(frames[n - 1])) n--;
        frames = frames.slice(0, n);
      }
      return { name: a.name, frames };
    });
    return { name: baseName(source.name), animations };
  },
});

addImporter('frames', {
  describe: 'a folder of PNG frames: walk_0.png, walk_1.png … or walk/0.png, walk/1.png …',
  detect: (s) => Array.isArray(s.entries),
  async read(source, ctx) {
    const groups = new Map();   // animation → [{n, path}]
    for (const path of source.entries) {
      if (ext(path) !== 'png') continue;
      const parts = String(path).split(/[\\/]/), stem = parts.pop().replace(/\.png$/i, '');
      const m = /^(.*?)[\s._-]*(\d+)$/.exec(stem);
      // walk/3.png and walk/walk_3.png → "walk"; walk_3.png → "walk"; title.png → its own one-frame animation
      const name = parts.length ? parts[parts.length - 1] : (m?.[1] || stem);
      const n = m ? Number(m[2]) : 0;
      if (!name) continue;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ n, path });
    }
    if (!groups.size) throw new Error(`${source.name} has no PNG files`);
    const animations = [];
    for (const [name, list] of groups) {
      list.sort((a, b) => a.n - b.n || (a.path < b.path ? -1 : 1));
      const frames = [];
      for (const { path } of list) {
        const img = await ctx.decodePNG(await ctx.readFile(path));
        frames.push({ w: img.width, h: img.height, rgba: img.rgba });
      }
      animations.push({ name, frames });
    }
    // An idle first: the animation a sprite shows when none is named.
    animations.sort((a, b) => (b.name === 'idle') - (a.name === 'idle'));
    return { name: baseName(source.name), animations };
  },
});

/** A frame placed at (x, y) on a transparent w×h canvas. */
function place(f, w, h, x, y) {
  const out = { w, h, rgba: new Uint8Array(w * h * 4) };
  for (let j = 0; j < f.h; j++) {
    const ty = y + j;
    if (ty < 0 || ty >= h) continue;
    for (let i = 0; i < f.w; i++) {
      const tx = x + i;
      if (tx < 0 || tx >= w) continue;
      out.rgba.set(f.rgba.subarray((j * f.w + i) * 4, (j * f.w + i) * 4 + 4), (ty * w + tx) * 4);
    }
  }
  return out;
}

// ---------- bundle ----------

/** A per-animation option: a value for all, or {anim: value, '*': default}. */
const pick = (opt, anim) => (isObj(opt) ? (Object.hasOwn(opt, anim) ? opt[anim] : opt['*']) : opt);

/**
 * A web bundle (pixel-sprite/1) from an imported sheet: frames packed one animation per row, the size of the largest
 * frame (smaller ones stand bottom-centre). One unit is one frame pixel. Options override what the file said:
 *   fps, loop, speed (px/s), speedY: a value or {anim: value, '*': default}; ground (px from the top); name.
 * `encode(w, h, rgba)` → image URL. Returns { bundle, report }: report = { frameW, frameH, width, height, ground,
 * groundFrom: 'option'|'file'|'pixels', animations: [{name, frames, fps, loop, durations?, speed?}], roles, hints, notes }.
 */
export async function bundleImport(imported, { encode, name, fps, loop, speed, speedY, ground } = {}) {
  if (typeof encode !== 'function') throw new Error('bundleImport needs an encode(w, h, rgba) function that returns an image URL');
  const notes = [...(imported.notes ?? [])], hints = [];
  const names = imported.animations.map((a) => a.name);
  for (const opt of [['fps', fps], ['loop', loop], ['speed', speed], ['speedY', speedY]]) {
    if (isObj(opt[1])) for (const k of Object.keys(opt[1])) if (k !== '*' && !names.includes(k)) throw new Error(`${opt[0]}: no animation "${k}" (have: ${names.join(', ')})`);
  }
  const frameW = Math.max(...imported.animations.flatMap((a) => a.frames.map((f) => f.w)));
  const frameH = Math.max(...imported.animations.flatMap((a) => a.frames.map((f) => f.h)));
  const odd = imported.animations.filter((a) => a.frames.some((f) => f.w !== frameW || f.h !== frameH)).map((a) => a.name);
  if (odd.length) notes.push(`frames differ in size: ${odd.join(', ')} stand bottom-centre in ${frameW}x${frameH} frames`);
  const cols = Math.max(...imported.animations.map((a) => a.frames.length));
  const width = cols * frameW, height = imported.animations.length * frameH;
  if (width > 4096 || height > 4096) notes.push(`the sheet is ${width}x${height}: some phones cannot decode images over 4096 px on a side`);
  const rgba = new Uint8Array(width * height * 4);
  const animations = {}, report = [];
  imported.animations.forEach((a, row) => {
    a.frames.forEach((f, c) => {
      const fit = f.w === frameW && f.h === frameH ? f : place(f, frameW, frameH, Math.floor((frameW - f.w) / 2), frameH - f.h);
      for (let y = 0; y < frameH; y++) rgba.set(fit.rgba.subarray(y * frameW * 4, (y + 1) * frameW * 4), ((row * frameH + y) * width + c * frameW) * 4);
    });
    const meta = { row, frames: a.frames.length };
    // Timing: an fps option wins (every frame then shows equally long). Else the frames' own durations: one fps
    // when they are all equal, holds (durations in ms) when not; the file's fps, when it has one, is the base rate.
    const given = pick(fps, a.name);
    const ds = a.frames.map((f) => f.duration);
    const timed = ds.every((d) => d > 0), even = timed && ds.every((d) => d === ds[0]);
    if (given != null) meta.fps = given;
    else if (a.fps != null) meta.fps = a.fps;
    else if (timed) {
      const common = [...ds].sort((x, y) => ds.filter((d) => d === y).length - ds.filter((d) => d === x).length)[0];
      meta.fps = r2(1000 / common);
    } else meta.fps = DEFAULT_FPS;
    if (given == null && timed && !even) meta.durations = ds.map(r2);
    if (!(meta.fps > 0 && meta.fps <= 60)) throw new Error(`animation "${a.name}": ${meta.fps} fps is outside 0..60${given == null ? ' (frames shorter than about 17 ms)' : ''}`);
    meta.loop = pick(loop, a.name) ?? a.loop ?? true;
    for (const [k, v] of [['speed', pick(speed, a.name) ?? a.speed], ['speedY', pick(speedY, a.name) ?? a.speedY]]) {
      if (v == null) continue;
      if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error(`animation "${a.name}": ${k} must be a number of px per second`);
      if (v) meta[k] = v;
    }
    if (a.wall != null) meta.wall = a.wall;
    if (Array.isArray(a.events)) {
      const ev = a.events.filter((e) => Number.isInteger(e?.frame) && e.frame >= 0 && e.frame < a.frames.length && typeof e.name === 'string');
      if (ev.length) meta.events = ev;
    }
    animations[a.name] = meta;
    report.push({ name: a.name, ...meta });
  });

  // The foot line: an option, the file's, or the lowest opaque row of the idle's first frame.
  let groundFrom = 'option', g = ground;
  if (g == null && Number.isFinite(imported.ground)) { g = imported.ground; groundFrom = 'file'; }
  if (g == null) {
    groundFrom = 'pixels';
    const row = animations.idle?.row ?? 0;
    g = frameH;
    find: for (let y = frameH - 1; y >= 0; y--) for (let x = 0; x < frameW; x++) if (rgba[((row * frameH + y) * width + x) * 4 + 3]) { g = y + 1; break find; }
  }
  if (!(Number.isFinite(g) && g >= 0 && g <= frameH)) throw new Error(`ground must be a row between 0 and ${frameH} (got ${g})`);

  // What <pixel-stage> will play, and what it needs that a drawing does not say.
  const roles = {};
  for (const [role, list] of Object.entries(STAGE_ROLES)) { const n = list.find((x) => animations[x]); if (n) roles[role] = n; }
  if (!roles.idle) hints.push(`no "idle": <pixel-stage> stands the character in "${names[0]}" (rename an animation to idle to choose)`);
  for (const role of ['walk', 'run', 'rush']) {
    const n = roles[role];
    if (n && !animations[n].speed) hints.push(`"${n}" has no speed, so a stage moves it at a guess and the feet slide: measure one stride in px and set speed ${n}=<px per second>`);
  }
  if (roles.climb && !animations[roles.climb].speedY) hints.push(`"${roles.climb}" has no speedY: set how many px per second it climbs`);
  if (!imported.points) hints.push('no attachment points (Aseprite slices named e.g. "head"): hats and props cannot follow the character');

  const bundle = { format: BUNDLE_FORMAT, name: name ?? imported.name, size: [frameW, frameH], ground: g, animations };
  if (imported.points) {
    bundle.points = Object.fromEntries(Object.entries(imported.points).map(([p, byAnim]) => [p,
      Object.fromEntries(Object.entries(byAnim).filter(([an]) => animations[an]).map(([an, list]) => [an, list.map(([x, y]) => [r2(x), r2(y), 0])]))]));
  }
  bundle.variants = [{ res: frameH, frameW, frameH, image: await encode(width, height, rgba) }];
  return { bundle, report: { frameW, frameH, width, height, ground: g, groundFrom, animations: report, roles, hints, notes } };
}
