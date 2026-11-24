// Importing hand-drawn sheets: the PNG decoder, the aseprite / grid / frames importers, bundleImport and `pixel import`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compile, resolveSpec, buildBundle, exportSheet, importSheet, bundleImport, pngPixels, registerImporter, registeredPlugins, importers, usePlugin,
} from '../src/core/index.js';
import { encodePNG, decodePNG } from '../src/node/png.js';
import { checkBundle } from '../../runtime/src/pixel-sprite.js';
import { keepAnimations } from '../src/core/bundle.js';

const read = (dir, f) => JSON.parse(readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8'));
const load = async (name) => compile(await resolveSpec(read('examples', `${name}.json`), {
  loadRef: (f) => read('examples', f), loadFigure: (n) => read('figures', `${n}.json`), warn: () => {},
}));
const CLI = fileURLToPath(new URL('../bin/pixel.mjs', import.meta.url));
const pixel = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const dataURL = (w, h, rgba) => `data:image/png;base64,${encodePNG(w, h, rgba).toString('base64')}`;
const fromURL = (u) => decodePNG(Buffer.from(u.slice(22), 'base64'));

/** A w×h image where pixel (x, y) is fill(x, y) → [r, g, b, a]. */
function image(w, h, fill) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(fill(x, y), (y * w + x) * 4);
  return { width: w, height: h, rgba };
}
/** An in-memory folder: readFile reads from `files` (name → bytes). */
const memory = (files) => ({ readFile: async (p) => { if (!files[p]) throw new Error(`no file ${p}`); return files[p]; }, decodePNG });
const png = (img) => encodePNG(img.width, img.height, img.rgba);
const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], CLEAR = [0, 0, 0, 0];

// ---------- PNG decoding ----------

/** PNG bytes written by hand: any colour type and depth (8 or 16), optionally Adam7-interlaced, filter 0 rows. */
function rawPNG(w, h, { colourType, depth = 8, interlace = 0, sample, plte, trns }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType], bytes = depth / 8;
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const out = [];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    for (let j = 0; j < ph; j++) {
      out.push(0);
      for (let i = 0; i < pw; i++) for (const v of sample(x0 + i * dx, y0 + j * dy).slice(0, channels)) {
        if (bytes === 2) out.push(v >> 8, v & 255); else out.push(v);
      }
    }
  }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = colourType; ihdr[12] = interlace;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    ...(plte ? [chunk('PLTE', plte)] : []), ...(trns ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', deflateSync(Buffer.from(out))), chunk('IEND', [])]);
}

test('pngPixels reads back what pngBytes writes, indexed and RGBA', () => {
  const few = image(13, 7, (x, y) => ((x + y) % 3 ? RED : x % 2 ? BLUE : CLEAR));
  const many = image(20, 20, (x, y) => [x * 12, y * 12, (x * y) & 255, 128 + x]);   // > 256 colours: written RGBA
  for (const img of [few, many]) {
    const got = decodePNG(png(img));
    assert.equal(got.width, img.width);
    assert.equal(got.height, img.height);
    assert.deepEqual(got.rgba, img.rgba);
  }
});

test('pngPixels: grey, grey+alpha, RGB with a colour key, 16-bit and interlaced images', () => {
  const grey = decodePNG(rawPNG(3, 1, { colourType: 0, sample: (x) => [x * 100] }));
  assert.deepEqual([...grey.rgba], [0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255]);
  const ga16 = decodePNG(rawPNG(2, 1, { colourType: 4, depth: 16, sample: (x) => [x ? 0xffff : 0x8000, x ? 0 : 0xffff] }));
  assert.deepEqual([...ga16.rgba], [128, 128, 128, 255, 255, 255, 255, 0]);
  const keyed = decodePNG(rawPNG(2, 1, { colourType: 2, sample: (x) => (x ? [1, 2, 3] : [9, 9, 9]), trns: [0, 1, 0, 2, 0, 3] }));
  assert.deepEqual([...keyed.rgba], [9, 9, 9, 255, 1, 2, 3, 0]);
  const fill = (x, y) => [(x * 30) & 255, (y * 30) & 255, 77, 255];
  const laced = decodePNG(rawPNG(9, 10, { colourType: 6, interlace: 1, sample: fill }));
  assert.deepEqual(laced.rgba, image(9, 10, fill).rgba);
  assert.throws(() => decodePNG(Buffer.from('not a png at all')), /not a PNG/);
});

test('pngPixels works with an asynchronous inflate (browsers)', async () => {
  const img = image(4, 4, (x) => (x % 2 ? RED : BLUE));
  const got = await pngPixels(png(img), async (z) => (await import('node:zlib')).inflateSync(z));
  assert.deepEqual(got.rgba, img.rgba);
});

// ---------- aseprite ----------

test('aseprite: a sheet written by `pixel export` comes back as the bundle `pixel bundle` makes', async () => {
  const c = await load('fox');
  const ex = exportSheet(c, 32, { image: 'fox.32.png' });
  const files = { 'fox.32.png': encodePNG(ex.width, ex.height, ex.rgba) };
  const imported = await importSheet({ name: 'fox.32.json', bytes: Buffer.from(JSON.stringify(ex.json)) }, memory(files));
  assert.equal(imported.format, 'aseprite');
  const { bundle, report } = await bundleImport(imported, { encode: dataURL });
  checkBundle(structuredClone(bundle));
  const made = await buildBundle(c, { resolutions: [32], encode: dataURL, views: [] });
  assert.equal(bundle.name, made.name);
  assert.deepEqual(Object.keys(bundle.animations), Object.keys(made.animations));
  for (const [n, a] of Object.entries(made.animations)) {
    const b = bundle.animations[n];
    assert.equal(b.row, a.row, n); assert.equal(b.frames, a.frames, n); assert.equal(b.fps, a.fps, n); assert.equal(b.loop, a.loop, n);
    assert.deepEqual(b.events, a.events, n);
    // speeds were in spec units; now in frame pixels
    if (a.speed) assert.ok(Math.abs(b.speed - (a.speed * 32) / made.size[1]) < 0.02, `${n} speed`);
    if (a.wall != null) assert.ok(Math.abs(b.wall - (a.wall * 32) / made.size[0]) < 0.02, `${n} wall`);
  }
  assert.deepEqual(fromURL(bundle.variants[0].image).rgba, fromURL(made.variants[0].image).rgba);
  assert.equal(report.groundFrom, 'file');
  assert.ok(Math.abs(bundle.ground - (made.ground * 32) / made.size[1]) < 0.02);
  // points round-trip within the pixel export rounds them to
  for (const [p, byAnim] of Object.entries(made.points)) for (const [an, list] of Object.entries(byAnim)) list.forEach(([x, y], f) => {
    const [bx, by] = bundle.points[p][an][f];
    assert.ok(Math.abs(bx - (x * 32) / made.size[0]) <= 0.51 && Math.abs(by - (y * 32) / made.size[1]) <= 0.51, `${p} ${an} ${f}`);
  });
});

test('aseprite: a climb from `pixel export` keeps its climbing speed and wall line, in frame pixels', async () => {
  const c = keepAnimations(await load('goose-greylag'), ['climb']);
  const ex = exportSheet(c, 32, { image: 'g.png' });
  const imported = await importSheet({ name: 'g.json', bytes: Buffer.from(JSON.stringify(ex.json)) }, memory({ 'g.png': encodePNG(ex.width, ex.height, ex.rgba) }));
  const { bundle } = await bundleImport(imported, { encode: dataURL });
  const src = ex.json.meta.pixelStudio, a = bundle.animations.climb, [fw, fh] = bundle.size;
  assert.ok(src.animations.climb.wall > 0 && src.animations.climb.speedY > 0);
  assert.ok(Math.abs(a.wall - (src.animations.climb.wall * fw) / src.size[0]) < 0.02);
  assert.ok(Math.abs(a.speedY - (src.animations.climb.speedY * fh) / src.size[1]) < 0.02);
});

/** A 3-frame Aseprite-style sheet: frame 1 trimmed, frame 2 rotated, as an array, with tags and a slice. */
function asepriteFixture() {
  // full frames are 4×4; each shows a red 2×2 block at a different place
  const sheet = image(12, 4, () => CLEAR);
  const put = (x, y, c) => sheet.rgba.set(c, (y * 12 + x) * 4);
  for (const [x, y] of [[0, 2], [1, 2], [0, 3], [1, 3]]) put(x, y, RED);      // frame 0 at (0,2), untrimmed in 0..3
  for (const [x, y] of [[4, 0], [5, 0], [4, 1], [5, 1]]) put(x, y, BLUE);     // frame 1 trimmed to 2×2, placed at (2,2)
  // frame 2: a 4×2 image (red top row, blue bottom row) stored rotated clockwise as 2×4 at x=8
  for (let x = 0; x < 4; x++) { put(8 + 1, x, RED); put(8 + 0, x, BLUE); }
  const json = {
    frames: [
      { filename: 'a 0', frame: { x: 0, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 }, duration: 100 },
      { filename: 'a 1', frame: { x: 4, y: 0, w: 2, h: 2 }, rotated: false, trimmed: true, spriteSourceSize: { x: 2, y: 2, w: 2, h: 2 }, sourceSize: { w: 4, h: 4 }, duration: 100 },
      { filename: 'a 2', frame: { x: 8, y: 0, w: 4, h: 2 }, rotated: true, trimmed: true, spriteSourceSize: { x: 0, y: 2, w: 4, h: 2 }, sourceSize: { w: 4, h: 4 }, duration: 300 },
    ],
    meta: {
      image: 'sheet.png', size: { w: 12, h: 4 },
      frameTags: [{ name: 'walk', from: 0, to: 2, direction: 'pingpong' }, { name: 'hit', from: 1, to: 2, direction: 'reverse', repeat: '1' }],
      slices: [{ name: 'head', keys: [{ frame: 0, bounds: { x: 1, y: 0, w: 1, h: 1 } }, { frame: 2, bounds: { x: 0, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 0 } }] }],
    },
  };
  return { json, files: { 'sheet.png': png(sheet) } };
}

test('aseprite: trimmed and rotated frames, tag directions, repeat, durations as holds, slices as points', async () => {
  const { json, files } = asepriteFixture();
  const imported = await importSheet({ name: 'hero.json', bytes: Buffer.from(JSON.stringify(json)) }, memory(files));
  const [walk, hit] = imported.animations;
  assert.deepEqual([walk.name, walk.frames.length, hit.name, hit.frames.length], ['walk', 4, 'hit', 2]);   // pingpong 0 1 2 1
  const px = (f, x, y) => [...f.rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  assert.deepEqual(px(walk.frames[0], 0, 2), RED);
  assert.deepEqual(px(walk.frames[1], 2, 2), BLUE);          // untrimmed back to its place
  assert.deepEqual(px(walk.frames[1], 0, 0), CLEAR);
  assert.deepEqual(px(walk.frames[2], 0, 2), RED);           // unrotated: red top row at y=2
  assert.deepEqual(px(walk.frames[2], 3, 3), BLUE);
  assert.deepEqual(hit.frames[0].rgba, walk.frames[2].rgba);  // reverse
  assert.equal(hit.loop, false);
  assert.deepEqual(imported.points.head.walk, [[1, 0], [1, 0], [1, 0], [1, 0]]);
  assert.deepEqual(imported.points.head.hit, [[1, 0], [1, 0]]);   // frame 2's key: pivot (1, 0) of bounds at (0, 0)
  const { bundle, report } = await bundleImport(imported, { encode: dataURL });
  checkBundle(structuredClone(bundle));
  assert.deepEqual(bundle.animations.walk, { row: 0, frames: 4, fps: 10, loop: true, durations: [100, 100, 300, 100] });
  assert.deepEqual(bundle.animations.hit, { row: 1, frames: 2, fps: 3.33, loop: false, durations: [300, 100] });
  assert.deepEqual(bundle.points.head.walk[0], [1, 0, 0]);
  assert.equal(report.groundFrom, 'pixels');
  assert.equal(bundle.ground, 4);   // the first frame's lowest pixel is the bottom row (no idle: the first animation)
  assert.ok(report.hints.some((h) => /no "idle"/.test(h)));
  assert.ok(report.hints.some((h) => /"walk" has no speed/.test(h)));
});

test('aseprite: a sheet without tags is one "idle"; a missing image is a clear error', async () => {
  const { json, files } = asepriteFixture();
  delete json.meta.frameTags;
  const imported = await importSheet({ name: 'hero.json', bytes: Buffer.from(JSON.stringify(json)) }, memory(files));
  assert.deepEqual(imported.animations.map((a) => [a.name, a.frames.length]), [['idle', 3]]);
  assert.ok(imported.notes.some((n) => /no tags/.test(n)));
  json.meta.image = 'gone.png';
  await assert.rejects(importSheet({ name: 'hero.json', bytes: Buffer.from(JSON.stringify(json)) }, memory(files)), /no file gone\.png/);
});

// ---------- grid ----------

/** Rows of 8×8 frames: row r has counts[r] filled frames (colour by row), then empty cells. */
function gridSheet(counts, cols = Math.max(...counts)) {
  return image(cols * 8, counts.length * 8, (x, y) => {
    const r = Math.floor(y / 8), c = Math.floor(x / 8);
    return c < counts[r] && y % 8 >= 2 && y % 8 < 7 ? (r % 2 ? BLUE : RED) : CLEAR;
  });
}

test('grid: anims name the rows; frame counts come from the flags or the cells that are not empty', async () => {
  const bytes = png(gridSheet([4, 6, 2], 6));
  const ctx = (options) => ({ decodePNG, options });
  const a = await importSheet({ name: 'blob.png', bytes }, ctx({ frame: '8x8', anims: 'idle,walk:5,jump' }));
  assert.equal(a.format, 'grid');
  assert.deepEqual(a.animations.map((x) => [x.name, x.frames.length]), [['idle', 4], ['walk', 5], ['jump', 2]]);
  // no frame size: square frames from the row count
  const b = await importSheet({ name: 'blob.png', bytes }, ctx({ anims: 'idle,walk,jump' }));
  assert.equal(b.animations[0].frames[0].w, 8);
  assert.ok(b.notes.some((n) => /assumed 8x8/.test(n)));
  // no names: row1.., and a one-row sheet is "idle"
  const c = await importSheet({ name: 'blob.png', bytes }, ctx({ frame: 8 }));
  assert.deepEqual(c.animations.map((x) => x.name), ['row1', 'row2', 'row3']);
  const one = await importSheet({ name: 'one.png', bytes: png(gridSheet([3])) }, ctx({}));
  assert.deepEqual(one.animations.map((x) => [x.name, x.frames.length]), [['idle', 3]]);
  const { bundle } = await bundleImport(one, { encode: dataURL, fps: 6 });
  assert.deepEqual(bundle.animations.idle, { row: 0, frames: 3, fps: 6, loop: true });
  assert.equal(bundle.ground, 7);
  await assert.rejects(importSheet({ name: 'blob.png', bytes }, ctx({ frame: '8x8', anims: 'idle:9' })), /has 9 frames but a row holds 6/);
  await assert.rejects(importSheet({ name: 'blob.png', bytes }, ctx({ frame: '3x' })), /WIDTHxHEIGHT/);
  await assert.rejects(importSheet({ name: 'odd.png', bytes: png(image(10, 7, () => RED)) }, ctx({})), /cannot tell the frame size/);
});

// ---------- frames ----------

test('frames: a folder of PNGs, grouped by name or by subfolder, idle first, sizes padded bottom-centre', async () => {
  const small = png(image(4, 4, () => RED)), big = png(image(8, 8, () => BLUE));
  const files = { 'walk_2.png': small, 'walk_10.png': small, 'walk_1.png': small, 'idle/0.png': big, 'idle/1.png': big, 'title.png': small, 'notes.txt': Buffer.from('x') };
  const imported = await importSheet({ name: 'hero', entries: Object.keys(files) }, memory(files));
  assert.equal(imported.format, 'frames');
  assert.deepEqual(imported.animations.map((a) => [a.name, a.frames.length]), [['idle', 2], ['walk', 3], ['title', 1]]);
  const { bundle, report } = await bundleImport(imported, { encode: dataURL, speed: { walk: 24 }, loop: { title: false } });
  assert.deepEqual([bundle.size, bundle.animations.walk.speed, bundle.animations.title.loop], [[8, 8], 24, false]);
  assert.ok(report.notes.some((n) => /walk, title stand bottom-centre/.test(n)));
  const sheet = fromURL(bundle.variants[0].image);
  const at = (x, y) => [...sheet.rgba.subarray((y * sheet.width + x) * 4, (y * sheet.width + x) * 4 + 4)];
  assert.deepEqual(at(1, 9), CLEAR);   // walk frame 0 (row 1): the 4×4 frame sits at x 2..5, y 12..15
  assert.deepEqual(at(2, 12), RED);
  assert.deepEqual(at(2, 11), CLEAR);
  await assert.rejects(importSheet({ name: 'empty', entries: ['a.txt'] }, memory({})), /has no PNG files/);
});

// ---------- options ----------

test('bundleImport options: fps for all or per animation, unknown animation names, ground', async () => {
  const { json, files } = asepriteFixture();
  const imported = await importSheet({ name: 'hero.json', bytes: Buffer.from(JSON.stringify(json)) }, memory(files));
  const { bundle } = await bundleImport(imported, { encode: dataURL, fps: { walk: 12, '*': 5 }, ground: 3, name: 'Hero' });
  assert.deepEqual(bundle.animations.walk, { row: 0, frames: 4, fps: 12, loop: true });   // an fps option drops the holds
  assert.equal(bundle.animations.hit.fps, 5);
  assert.equal(bundle.ground, 3);
  assert.equal(bundle.name, 'Hero');
  await assert.rejects(bundleImport(imported, { encode: dataURL, speed: { run: 3 } }), /speed: no animation "run" \(have: walk, hit\)/);
  await assert.rejects(bundleImport(imported, { encode: dataURL, fps: 90 }), /90 fps is outside/);
  await assert.rejects(bundleImport(imported, { encode: dataURL, ground: 9 }), /ground must be a row between 0 and 4/);
});

// ---------- plug-ins ----------

test('registerImporter: plug-in importers are tried first, listed, and can be named', async () => {
  const read = async (source, ctx) => ({ animations: [{ name: 'idle', frames: [{ w: 1, h: 1, rgba: new Uint8Array([1, 2, 3, 255]), duration: 50 }] }] });
  await usePlugin(({ registerImporter: reg }) => reg('dots', { detect: (s) => s.name.endsWith('.dots'), read, describe: 'one dot' }));
  registerImporter('dots', { detect: (s) => s.name.endsWith('.dots'), read });   // same code again: a no-op
  assert.throws(() => registerImporter('dots', { detect: () => true, read }), /already exists/);
  assert.throws(() => registerImporter('aseprite', { detect: () => true, read }), /already exists/);
  assert.throws(() => registerImporter('9bad', { detect: () => true, read }), /must start with a letter/);
  assert.deepEqual(importers(), ['aseprite', 'grid', 'frames', 'dots']);
  assert.ok(registeredPlugins().some((p) => p.kind === 'importer' && p.name === 'dots' && p.describe === 'one dot'));
  const got = await importSheet({ name: 'x.dots', bytes: new Uint8Array() }, { decodePNG });
  assert.equal(got.format, 'dots');
  const { bundle } = await bundleImport(got, { encode: dataURL });
  assert.equal(bundle.animations.idle.fps, 20);
  await assert.rejects(importSheet({ name: 'x.zip', bytes: new Uint8Array() }, { decodePNG }), /cannot tell how to import x\.zip/);
  await assert.rejects(importSheet({ name: 'x.png', bytes: new Uint8Array() }, { decodePNG, format: 'psd' }), /no importer "psd"/);
});

// ---------- CLI ----------

test('pixel import: aseprite and grid sheets, --check, --external and flag errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-import-'));
  try {
    const { json, files } = asepriteFixture();
    writeFileSync(join(dir, 'sheet.png'), files['sheet.png']);
    writeFileSync(join(dir, 'hero.json'), JSON.stringify(json));
    const check = pixel('import', join(dir, 'hero.json'), '--check', '--speed', 'walk=30');
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /read hero\.json \(aseprite\): 2 animations, 4x4 frames/);
    assert.match(check.stdout, /walk +4 frames +10 fps with holds, loops, speed 30 px\/s/);
    assert.match(check.stderr, /hint: no "idle"/);
    assert.ok(!existsSync('hero.bundle.json'));
    const out = join(dir, 'out', 'hero.bundle.json');
    const run = pixel('import', join(dir, 'hero.json'), '--out', out, '--external', '--loop', 'hit=true');
    assert.equal(run.status, 0, run.stderr);
    const bundle = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(bundle.variants[0].image, 'hero.4.png');
    assert.ok(existsSync(join(dir, 'out', 'hero.4.png')));
    assert.equal(bundle.animations.hit.loop, true);
    writeFileSync(join(dir, 'blob.png'), png(gridSheet([4, 2])));
    const grid = pixel('import', join(dir, 'blob.png'), '--frame', '8x8', '--anims', 'idle,hop', '--out', join(dir, 'blob.bundle.json'));
    assert.equal(grid.status, 0, grid.stderr);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, 'blob.bundle.json'), 'utf8')).animations), ['idle', 'hop']);
    const bad = pixel('import', join(dir, 'hero.json'), '--fps', 'walk=fast');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /--fps takes numbers \(got "fast"\)/);
    const missing = pixel('import', join(dir, 'nope.json'));
    assert.match(missing.stderr, /no such file or folder/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
