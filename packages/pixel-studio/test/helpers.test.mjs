// The small helpers under the renderer: colours, textures, image compositing and the ASCII view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, toHex, rgbToHsv, hsvToRgb, baseIndex, buildRamp, darken } from '../src/core/color.js';
import { TEXTURES, customTextures, sampleTexture, hash2 } from '../src/core/textures.js';
import { createImage, blit, checker, contactSheet } from '../src/core/image.js';
import { frameToAscii } from '../src/core/ascii.js';

const px = (img, x, y) => [...img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)];
const lum = ([r, g, b]) => r * 0.3 + g * 0.59 + b * 0.11;

// ---------- colour ----------

test('parseHex: 6 or 3 digits, with or without #, any case; anything else is null', () => {
  assert.deepEqual(parseHex('#3ccf6e'), [0x3c, 0xcf, 0x6e]);
  assert.deepEqual(parseHex('3CCF6E'), [0x3c, 0xcf, 0x6e]);
  assert.deepEqual(parseHex(' #f0a '), [0xff, 0x00, 0xaa]);
  for (const bad of ['', '#12345', '#1234567', '#ggg', 'red', null, undefined, 42]) assert.equal(parseHex(bad), null, String(bad));
});

test('toHex: rounds and clamps each channel', () => {
  assert.equal(toHex([60, 207, 110]), '#3ccf6e');
  assert.equal(toHex([-20, 255.4, 300]), '#00ffff');
  assert.equal(toHex([0.5, 9.49, 15.5]), '#010910');
  for (const hex of ['#000000', '#ffffff', '#1c1630', '#d03030']) assert.equal(toHex(parseHex(hex)), hex);
});

test('rgbToHsv / hsvToRgb: known colours and a round trip', () => {
  assert.deepEqual(rgbToHsv([255, 0, 0]), [0, 1, 1]);
  assert.deepEqual(rgbToHsv([0, 255, 0]), [120, 1, 1]);
  assert.deepEqual(rgbToHsv([0, 0, 255]), [240, 1, 1]);
  assert.deepEqual(rgbToHsv([0, 0, 0]), [0, 0, 0], 'black: no hue, no saturation');
  assert.deepEqual(rgbToHsv([128, 128, 128]).slice(0, 2), [0, 0], 'grey: no hue, no saturation');
  assert.deepEqual(hsvToRgb([-120, 1, 1]).map(Math.round), [0, 0, 255], 'hue wraps below 0');
  assert.deepEqual(hsvToRgb([480, 1, 1]).map(Math.round), [0, 255, 0], 'and above 360');
  for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
    assert.deepEqual(hsvToRgb(rgbToHsv([r, g, b])).map(Math.round), [r, g, b], `${r},${g},${b}`);
  }
});

test('baseIndex: the base colour sits in the middle, one above the shadow for 2 tones', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(baseIndex), [1, 1, 1, 2, 2, 3, 3]);
});

test('buildRamp: n tones dark → light with the base colour at baseIndex', () => {
  for (const hex of ['#3f7f5f', '#d03030', '#1c1630', '#f1c27d']) for (const n of [2, 3, 4, 5, 7]) {
    const r = buildRamp(hex, n);
    assert.equal(r.length, n);
    assert.deepEqual(r[baseIndex(n)], parseHex(hex), `${hex} × ${n}: base in place`);
    for (let i = 1; i < n; i++) assert.ok(lum(r[i]) > lum(r[i - 1]), `${hex} × ${n}: tone ${i} lighter than ${i - 1}`);
    for (const c of r) for (const v of c) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
  }
  assert.deepEqual(buildRamp('#3f7f5f', 1), [[0x3f, 0x7f, 0x5f]], 'one tone is the colour itself');
  assert.deepEqual(buildRamp('not a colour', 1), [[255, 0, 255]], 'a bad colour shows as magenta');
});

test('buildRamp: shadows drift cool and highlights warm; greys stay nearly grey; hueShift 0 keeps the hue', () => {
  const [h] = rgbToHsv(parseHex('#3f7f5f')); // ~150°: green
  const r = buildRamp('#3f7f5f', 5);
  const hue = (c) => rgbToHsv(c)[0];
  assert.ok(hue(r[0]) > h, 'the shadow moves toward blue-violet (250°)');
  assert.ok(hue(r[4]) < h, 'the highlight moves toward yellow (55°)');
  const flat = buildRamp('#3f7f5f', 5, { hueShift: 0 });
  for (const c of [flat[0], flat[4]]) assert.ok(Math.abs(hue(c) - h) < 3, 'no drift with hueShift 0');
  for (const c of buildRamp('#808080', 5)) assert.ok(rgbToHsv(c)[1] <= 0.18, `grey tone ${c} stays nearly grey`);
});

test('darken: darker by about the amount, a little cooler', () => {
  const base = parseHex('#d03030');
  const d = darken(base);
  assert.ok(Math.abs(rgbToHsv(d)[2] - rgbToHsv(base)[2] * 0.55) < 0.01, 'value × (1 − 0.45)');
  assert.ok(lum(darken(base, 0.15)) > lum(d), 'a smaller amount is lighter');
  assert.deepEqual(darken([0, 0, 0]), [0, 0, 0]);
});

// ---------- textures ----------

test('textures: every built-in is deterministic, finite and roughly within -1..1', () => {
  for (const name of TEXTURES) for (const s of [1, 2, 3]) {
    const seen = new Set();
    for (let y = -12; y < 24; y++) for (let x = -12; x < 24; x++) {
      const v = sampleTexture(name, x, y, s);
      assert.ok(Number.isFinite(v) && v >= -1.5 && v <= 1.5, `${name} @${s} (${x},${y}) = ${v}`);
      assert.equal(sampleTexture(name, x, y, s), v, `${name} is deterministic`);
      seen.add(v);
    }
    assert.ok(seen.size > 1, `${name} @${s} is not flat`);
  }
});

test('textures: the scale makes features bigger (blocks of s × s for noise; stripes 2s high)', () => {
  for (const s of [1, 2, 4]) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      assert.equal(sampleTexture('noise', x, y, s), sampleTexture('noise', Math.floor(x / s) * s, Math.floor(y / s) * s, s));
    }
    const column = Array.from({ length: 8 * s }, (_, y) => sampleTexture('stripes', 0, y, s));
    assert.deepEqual(column, Array.from({ length: 8 * s }, (_, y) => (Math.floor(y / (2 * s)) % 2 ? -1 : 0.5)));
  }
  assert.equal(sampleTexture('noise', 3, 5, 0.2), sampleTexture('noise', 3, 5, 1), 'a scale under 1 counts as 1');
  assert.equal(sampleTexture('noise', 3, 5, 2.4), sampleTexture('noise', 3, 5, 2), 'and it is rounded');
});

test('textures: the patterns have their shape', () => {
  // checker: alternating 2s squares; bricks: mortar lines along rows; metal: horizontal brushing (same along x).
  assert.notEqual(sampleTexture('checker', 0, 0), sampleTexture('checker', 2, 0));
  assert.equal(sampleTexture('checker', 0, 0), sampleTexture('checker', 2, 2));
  for (let x = 0; x < 12; x++) assert.equal(sampleTexture('bricks', x, 0), -1, 'a mortar row every 3 px');
  for (let y = 0; y < 6; y++) for (let x = 1; x < 12; x++) assert.equal(sampleTexture('metal', x, y), sampleTexture('metal', 0, y));
  // fur: streaks run down (each column keeps one streak value plus a slower change along y).
  const furCols = new Set(Array.from({ length: 16 }, (_, x) => sampleTexture('fur', x, 0)));
  assert.ok(furCols.size > 8, 'columns differ');
  // spots: mostly 0 with a few dark spots.
  const spots = Array.from({ length: 48 * 48 }, (_, i) => sampleTexture('spots', i % 48, Math.floor(i / 48)));
  const dark = spots.filter((v) => v < 0).length;
  assert.ok(dark > 0 && dark < spots.length / 4, `spots are sparse (${dark} of ${spots.length})`);
});

test('textures: unknown names are 0; plug-in textures are clamped to ±1.5 and NaN becomes 0', () => {
  assert.equal(sampleTexture('nope', 4, 4), 0);
  try {
    customTextures.set('test-wild', (x) => (x === 0 ? 9 : x === 1 ? -9 : x === 2 ? NaN : 0.25));
    assert.deepEqual([0, 1, 2, 3].map((x) => sampleTexture('test-wild', x, 0)), [1.5, -1.5, 0, 0.25]);
    customTextures.set('test-scale', (x, y, s) => s / 10);
    assert.equal(sampleTexture('test-scale', 0, 0, 3.6), 0.4, 'a plug-in gets the rounded scale');
  } finally {
    customTextures.delete('test-wild');
    customTextures.delete('test-scale');
  }
});

test('hash2: in 0..1, deterministic, and neighbours differ', () => {
  const vs = [];
  for (let y = -8; y < 8; y++) for (let x = -8; x < 8; x++) {
    const v = hash2(x, y);
    assert.ok(v >= 0 && v < 1);
    assert.equal(hash2(x, y), v);
    vs.push(v);
  }
  assert.ok(new Set(vs).size > vs.length * 0.95, 'nearly no collisions');
  assert.notEqual(hash2(1, 2), hash2(2, 1), 'not symmetric');
});

// ---------- images ----------

test('createImage: transparent, or filled', () => {
  const blank = createImage(3, 2);
  assert.equal(blank.rgba.length, 3 * 2 * 4);
  assert.ok(blank.rgba.every((v) => v === 0));
  const red = createImage(2, 2, [255, 0, 0, 255]);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) assert.deepEqual(px(red, x, y), [255, 0, 0, 255]);
});

test('blit: scales by whole numbers, clips at every edge, skips transparent pixels, blends partial ones', () => {
  const src = createImage(2, 1);
  src.rgba.set([255, 0, 0, 255, 0, 0, 255, 0]); // red, then a fully transparent blue
  const dst = createImage(5, 3, [0, 0, 0, 255]);
  blit(dst, src, 1, 1, 2);
  assert.deepEqual(px(dst, 1, 1), [255, 0, 0, 255]);
  assert.deepEqual(px(dst, 2, 2), [255, 0, 0, 255], '×2: each source pixel covers 2 × 2');
  assert.deepEqual(px(dst, 3, 1), [0, 0, 0, 255], 'alpha 0 leaves the destination alone');
  assert.deepEqual(px(dst, 0, 0), [0, 0, 0, 255]);
  // Off every edge: nothing throws and only the overlap is drawn.
  for (const [x, y] of [[-3, 0], [4, 0], [0, -1], [0, 2], [-10, -10], [10, 10]]) blit(dst, src, x, y, 2);
  assert.deepEqual(px(dst, 4, 0), [255, 0, 0, 255], 'the part inside is drawn');
  // Half-transparent white over black: grey, and the alpha keeps the larger of the two.
  const half = createImage(1, 1, [255, 255, 255, 128]);
  const onto = createImage(1, 1, [0, 0, 0, 200]);
  blit(onto, half, 0, 0);
  assert.deepEqual(px(onto, 0, 0), [128, 128, 128, 200]);
});

test('checker: two alternating colours in cells, clipped to the image', () => {
  const img = createImage(6, 6);
  const a = [1, 1, 1, 255], b = [2, 2, 2, 255];
  checker(img, -1, -1, 8, 8, 2, a, b);
  assert.deepEqual(px(img, 0, 0), b, 'cell (0,0) in checker space is b');
  assert.deepEqual(px(img, 1, 0), a);
  assert.deepEqual(px(img, 1, 1), b);
  assert.deepEqual(px(img, 5, 5), b, "cell (3,3): even, b again");
});

test('contactSheet: one cell per frame scaled to the cell height; blocks stacked; frames drawn over a checker', () => {
  const frame = (w, h, c) => createImage(w, h, c);
  const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
  const blocks = [
    { res: 16, rows: [{ name: 'a', frames: [frame(16, 16, red), frame(16, 16, red), frame(16, 16, red)] }, { name: 'b', frames: [frame(16, 16, blue)] }] },
    { res: 32, rows: [{ name: 'a', frames: [frame(32, 32, red)] }] },
  ];
  const bg = [9, 9, 9, 255];
  const img = contactSheet(blocks, { cellH: 64, gap: 4, bg });
  // Block 1: k = 4 → 64 px cells, 3 columns, 2 rows. Block 2: k = 2 → 64 px cells. Width from the widest block.
  assert.equal(img.w, 3 * 64 + 2 * 4 + 2 * 4);
  assert.equal(img.h, 4 + (2 * 64 + 4) + 3 * 4 + 64 + 3 * 4);
  assert.deepEqual(px(img, 0, 0), bg, 'the margin is the background');
  assert.deepEqual(px(img, 4, 4), red, 'first frame at the margin');
  assert.deepEqual(px(img, 4 + 2 * 68 + 63, 4 + 63), red, 'third frame, last pixel');
  assert.deepEqual(px(img, 4, 4 + 68), blue, 'second row');
  assert.deepEqual(px(img, 4 + 68, 4 + 68), bg, 'a row with fewer frames leaves its other cells as background');
  const y2 = 4 + 2 * 64 + 4 + 12;
  assert.deepEqual(px(img, 4, y2), red, 'the second block starts after three gaps');
  // A transparent frame shows the checker, not the background.
  const clear = contactSheet([{ res: 8, rows: [{ name: 'x', frames: [createImage(8, 8)] }] }], { cellH: 16, gap: 2, bg });
  assert.notDeepEqual(px(clear, 2, 2), bg);
  assert.equal(px(clear, 2, 2)[3], 255);
});

test('contactSheet: a resolution above the cell height is drawn at 1×', () => {
  const img = contactSheet([{ res: 64, rows: [{ name: 'a', frames: [createImage(64, 64, [1, 2, 3, 255])] }] }], { cellH: 32, gap: 0 });
  assert.equal(img.w, 64);
  assert.equal(img.h, 64);
});

// ---------- ascii ----------

test('frameToAscii: # for outline, . for empty, one letter per material taken from its name', () => {
  const frame = { w: 4, h: 2, materials: ['skin', 'shirt', 'Eye'], ids: [-1, -2, 0, 1, 2, 0, -2, -1] };
  const { text, legend } = frameToAscii(frame);
  assert.equal(text, '.#sh\nes#.');
  assert.deepEqual(legend, { skin: 's', shirt: 'h', Eye: 'e' }, 'shirt takes its next free letter; Eye is lower-cased');
});

test('frameToAscii: names without a free letter fall back to the alphabet, then digits', () => {
  const materials = ['a', 'aa', 'a1', '#.', ...Array.from({ length: 30 }, (_, i) => `m${i}`)];
  const { legend } = frameToAscii({ w: 0, h: 0, materials, ids: [] });
  const chars = Object.values(legend);
  assert.equal(legend.a, 'a');
  assert.equal(legend.aa, 'b', 'a is taken: the first free letter of the alphabet');
  assert.equal(legend.a1, '1', 'a is taken: the next character of its own name');
  assert.equal(legend['#.'], 'c', 'symbols in a name are never used');
  assert.equal(new Set(chars).size, chars.length, 'every material has its own character');
  for (const c of chars) assert.match(c, /^[a-z0-9]$/);
});
