import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  validate, compile, renderFrame, renderSheet, renderAnimation, resolveStyle, lodForRes, buildRamp, parseHex, buildBundle, resolveSpec,
} from '../src/core/index.js';
import { sampleValue } from '../src/core/animate.js';
import { sdEllipse, sdRoundRect, sdCapsule, sdPolygon } from '../src/core/shapes.js';
import { encodePNG } from '../src/node/png.js';

// Pip is dressed on the chibi figure: resolve it into a plain spec first.
const pip = await resolveSpec(JSON.parse(readFileSync(new URL('../examples/pip.json', import.meta.url), 'utf8')), {
  loadFigure: (n) => JSON.parse(readFileSync(new URL(`../figures/${n}.json`, import.meta.url), 'utf8')),
});
const blob = () => ({
  materials: { m: { color: '#5b8def' }, eye: { color: '#000000', flat: true } },
  parts: [
    { id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'm' }] },
    { id: 'eye', parent: 'body', z: 5, shapes: [{ type: 'circle', cx: 50, cy: 50, r: 1, material: 'eye' }] },
  ],
  animations: { idle: { frames: 4, fps: 8, tracks: { body: { x: [0, 20, 0, -20] } } } },
});

test('SDFs: sign and distance', () => {
  assert.equal(sdEllipse(0, 0, 10, 10), -10);
  assert.ok(Math.abs(sdEllipse(12, 0, 10, 10) - 2) < 1e-9);
  assert.ok(sdRoundRect(0, 0, 5, 5, 0) < 0 && sdRoundRect(6, 0, 5, 5, 0) > 0);
  assert.ok(Math.abs(sdCapsule(0, 3, -5, 0, 5, 0, 1, 1) - 2) < 1e-9);
  const tri = [[0, 0], [10, 0], [0, 10]];
  assert.ok(sdPolygon(2, 2, tri) < 0 && sdPolygon(9, 9, tri) > 0);
});

test('validation reports JSON paths and suggestions', () => {
  const s = blob();
  s.parts[0].shapes[0].type = 'circel';
  s.parts[1].shapes[0].material = 'eyes';
  s.animations.idle.tracks.bdy = { y: 1 };
  const { errors } = validate(s);
  const msgs = errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(msgs, /\$\.parts\[0\]\.shapes\[0\]\.type: .*did you mean "circle"/);
  assert.match(msgs, /\$\.parts\[1\]\.shapes\[0\]\.material: unknown material "eyes" — did you mean "eye"/);
  assert.match(msgs, /\$\.animations\.idle\.tracks\.bdy: unknown part/);
  assert.throws(() => compile(s), /invalid spec/);
});

test('validation catches parent cycles and bad tracks', () => {
  const s = blob();
  s.parts[0].parent = 'eye';
  s.animations.idle.tracks.eye = { spin: 3 };
  const msgs = validate(s).errors.map((e) => e.message).join('\n');
  assert.match(msgs, /parent cycle/);
  assert.match(msgs, /unknown track property/);
});

test('examples validate cleanly', () => {
  assert.deepEqual(validate(pip).errors, []);
});

test('detail level follows resolution', () => {
  assert.equal(lodForRes(16), 1);
  assert.equal(lodForRes(32), 2);
  assert.equal(lodForRes(64), 3);
  const c = compile(pip);
  assert.equal(resolveStyle(c, 16).tones, 2);
  assert.equal(resolveStyle(c, 64).tones, 5);
  assert.equal(resolveStyle(c, 64, { lod: 1 }).tones, 2);
  assert.equal(resolveStyle(c, 64, { tones: 4 }).tones, 4);
});

test('ramps: base colour in place, dark → light', () => {
  for (const n of [2, 3, 5]) {
    const r = buildRamp('#3f7f5f', n);
    assert.equal(r.length, n);
    const lum = r.map(([a, b, c]) => a * 0.3 + b * 0.59 + c * 0.11);
    for (let i = 1; i < n; i++) assert.ok(lum[i] > lum[i - 1], `ramp ${n} not increasing`);
    assert.ok(r.some((c) => c.join() === parseHex('#3f7f5f').join()));
  }
});

test('track values: keyframes, waves, steps', () => {
  assert.equal(sampleValue([0, 10], 0.25, true, false), 5);
  assert.equal(sampleValue([0, 10], 0.75, true, false), 5); // wraps back toward 0
  assert.equal(sampleValue({ keys: [0, 10], ease: 'step' }, 0.4, true, false), 0);
  assert.ok(Math.abs(sampleValue({ wave: 2 }, 0.25, true, false) - 2) < 1e-9);
  assert.ok(Math.abs(sampleValue({ wave: 2, shape: 'tri' }, 0.25, true, false) - 2) < 1e-9);
  assert.ok(sampleValue({ wave: 3, shape: 'bounce' }, 0.25, true, false) <= 0);
  assert.equal(sampleValue([1, 1, 0, 1], 0.5, true, true), 0);
});

test('render: deterministic, correct size, outline present', () => {
  const c = compile(pip);
  const a = renderFrame(c, { res: 32, anim: 'idle', frame: 0 });
  const b = renderFrame(c, { res: 32, anim: 'idle', frame: 0 });
  assert.equal(a.w, 32); assert.equal(a.h, 32);
  assert.deepEqual(a.rgba, b.rgba);
  assert.ok(a.ids.includes(-2), 'outline pixels expected');
});

test('render: thin features survive at icon size', () => {
  const c = compile(blob());
  const fr = renderFrame(c, { res: 16, anim: 'idle', frame: 0 });
  const eyeIdx = fr.materials.indexOf('eye');
  assert.ok(fr.ids.includes(eyeIdx), 'a 1-unit eye should still occupy a pixel at 16px');
});

test('render: animation moves parts (pixel-snapped)', () => {
  const c = compile(blob());
  const f0 = renderFrame(c, { res: 20, anim: 'idle', frame: 0 });
  const f1 = renderFrame(c, { res: 20, anim: 'idle', frame: 1 });
  const cx = (fr) => {
    let s = 0, n = 0;
    for (let i = 0; i < fr.w * fr.h; i++) if (fr.ids[i] >= 0) { s += i % fr.w; n++; }
    return s / n;
  };
  assert.ok(Math.abs(cx(f1) - cx(f0) - 4) < 0.6, `expected ~4px shift, got ${cx(f1) - cx(f0)}`);
});

test('render: minDetail gates shapes', () => {
  const s = blob();
  s.parts[1].shapes[0].minDetail = 3;
  const c = compile(s);
  const eyeAt = (res) => { const f = renderFrame(c, { res, anim: 'idle' }); return f.ids.includes(f.materials.indexOf('eye')); };
  assert.equal(eyeAt(16), false);
  assert.equal(eyeAt(64), true);
});

test('cut shapes erase only their own part', () => {
  const s = blob();
  s.parts[0].shapes.push({ type: 'rect', x: 40, y: 0, w: 20, h: 100, op: 'cut' });
  s.parts[1].shapes[0].r = 4;
  const c = compile(s);
  const f = renderFrame(c, { res: 50, anim: 'idle' });
  const id = (x, y) => f.ids[y * f.w + x];
  assert.equal(id(25, 15), -1, 'body should be cut away in the middle');
  assert.equal(id(25, 25), f.materials.indexOf('eye'), 'eye (other part) is untouched');
  assert.equal(id(15, 25), f.materials.indexOf('m'));
});

test('sheet layout: rows = animations, cols = frames', () => {
  const c = compile(pip);
  const sh = renderSheet(c, 24);
  const anims = Object.keys(c.animations);
  assert.equal(sh.height, anims.length * 24);
  assert.equal(sh.width, Math.max(...anims.map((a) => c.animations[a].frames)) * 24);
  assert.equal(sh.meta.animations.walk.row, anims.indexOf('walk'));
});

/** A small PNG decoder for the tests: colour types 3 (indexed, 1–8 bits) and 6 (RGBA8), all five filters. */
function decodePNG(png) {
  let at = 8, w, h, bits, type, plte, trns = new Uint8Array(0);
  const idat = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at), kind = png.toString('ascii', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bits = data[8]; type = data[9]; }
    if (kind === 'PLTE') plte = data;
    if (kind === 'tRNS') trns = data;
    if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 1, stride = Math.ceil((w * bits * (type === 6 ? 4 : 1)) / 8);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))), up = rows[y - 1];
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    rows.push(line);
  }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (type === 6) { out.set(rows[y].subarray(x * 4, x * 4 + 4), o); continue; }
    const bit = x * bits, k = (rows[y][bit >> 3] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
    out.set([plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], k < trns.length ? trns[k] : 255], o);
  }
  return { w, h, bits, type, rgba: out };
}
const sameVisible = (a, b) => a.every((v, i) => (i % 4 === 3 ? v === b[i] : a[i - (i % 4) + 3] === 0 || v === b[i]));

test('PNG encoder round-trips pixels: indexed for pixel art, RGBA beyond 256 colours', () => {
  const fr = renderAnimation(compile(blob()), 'idle', 16).frames[0];
  const png = encodePNG(fr.w, fr.h, fr.rgba);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const d = decodePNG(png);
  assert.equal(d.type, 3, 'few colours: indexed');
  assert.ok([1, 2, 4, 8].includes(d.bits));
  assert.ok(sameVisible(d.rgba, fr.rgba), 'same pixels');
  // A whole sheet (dozens of colours) and a noisy image (thousands: RGBA, filtered rows).
  const sh = renderSheet(compile(pip), 32);
  assert.ok(sameVisible(decodePNG(encodePNG(sh.width, sh.height, sh.rgba)).rgba, sh.rgba));
  const noise = new Uint8Array(37 * 23 * 4).map((_, i) => (Math.imul(i, 2654435761) >>> 9) & 255);
  const dn = decodePNG(encodePNG(37, 23, noise));
  assert.equal(dn.type, 6);
  assert.deepEqual([...dn.rgba], [...noise]);
  // Two colours: one bit per pixel, odd width.
  const two = new Uint8Array(13 * 3 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) % 3 ? 200 : 10));
  const d2 = decodePNG(encodePNG(13, 3, two));
  assert.equal(d2.bits, 1);
  assert.deepEqual([...d2.rgba], [...two]);
});

test('bundle has one variant per resolution', async () => {
  const b = await buildBundle(compile(pip), { resolutions: [32, 16], encode: () => 'data:' });
  assert.equal(b.format, 'pixel-sprite/1');
  assert.deepEqual(b.variants.map((v) => [v.res, v.lod]), [[16, 1], [32, 2]]);
  assert.deepEqual(Object.keys(b.animations), Object.keys(pip.animations));
});

test('unknown keys produce warnings with suggestions', () => {
  const s = blob();
  s.parts[1].shapes[0].minDetal = 2;
  s.style = { contactShadows: false };
  const w = validate(s).warnings.map((x) => `${x.path}: ${x.message}`).join('\n');
  assert.match(w, /shapes\[0\]\.minDetal: .*did you mean "minDetail"/);
  assert.match(w, /\$\.style\.contactShadows: .*did you mean "contactShadow"/);
});

test('sx/sy waves oscillate around 1', () => {
  const s = blob();
  s.animations.idle.tracks.body = { sy: { wave: 0.1 } };
  const c = compile(s);
  const f = renderFrame(c, { res: 32, anim: 'idle', frame: 0 });
  assert.ok(f.ids.some((v) => v >= 0), 'body should still be visible at sy wave phase 0');
});

test('validation catches values that would otherwise break rendering', () => {
  const s = blob();
  s.materials.m.tones = 'x';
  s.style = { light: 'left', dither: 'yes', tones: 12, outlineColor: 'red' };
  s.animations.idle.tracks.body.rot = { wave: 2, shape: 'zig' };
  s.animations.idle.tracks.eye = { y: { keys: [0, 1], ease: 'bouncy' }, x: { keys: [] } };
  const paths = validate(s).errors.map((e) => e.path).sort();
  assert.deepEqual(paths, [
    '$.animations.idle.tracks.body.rot.shape', '$.animations.idle.tracks.eye.x', '$.animations.idle.tracks.eye.y.ease',
    '$.materials.m.tones', '$.style.dither', '$.style.light', '$.style.outlineColor', '$.style.tones',
  ]);
});

test('waves wrap negative phases like positive ones', () => {
  for (const shape of ['sin', 'tri', 'square', 'bounce']) {
    for (const t of [0, 0.2, 0.6]) {
      const a = sampleValue({ wave: 1, shape, phase: -0.25 }, t, true, false);
      const b = sampleValue({ wave: 1, shape, phase: 0.75 }, t, true, false);
      assert.ok(Math.abs(a - b) < 1e-9, `${shape} t=${t}`);
    }
  }
});

test('API misuse gives clear errors', async () => {
  const c = compile(blob());
  assert.throws(() => renderFrame(c, { anim: 'nope' }), /unknown animation "nope"/);
  assert.throws(() => resolveStyle(c, 32, { lod: 4 }), /lod must be 1, 2 or 3/);
  await assert.rejects(buildBundle(c), /needs an encode/);
});

test('spec data cannot reach Object.prototype (unsafe ids and names are rejected)', async () => {
  const { errors } = validate({ materials: { m: '#fff' }, parts: [{ id: '__proto__', shapes: [{ type: 'circle', cx: 5, cy: 5, r: 2, material: 'm' }] }], animations: { constructor: { frames: 2 } } });
  assert.deepEqual(errors.map((e) => e.path), ['$.parts[0].id', '$.animations.constructor']);
  const { expandFigure } = await import('../src/core/index.js');
  const fig = JSON.parse((await import('node:fs')).readFileSync(new URL('../figures/goose.json', import.meta.url), 'utf8'));
  assert.throws(() => expandFigure({}, fig, JSON.parse('{"bones": {"__proto__": {"polluted": 1}}}')), /no bone "__proto__"/);
  expandFigure({ animations: { walk: { motion: 'walk', tracks: JSON.parse('{"__proto__": {"polluted": [1]}}') } } }, fig);
  assert.equal(({}).polluted, undefined);
});
