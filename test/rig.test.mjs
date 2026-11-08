import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate, compile, samplePose, worldMatrices, checkBounds, resolveExtends, mergeVariant, renderFrame,
} from '../src/core/index.js';

// A two-segment arm: shoulder at (30,50), elbow at (50,50), hand tip at (70,50).
const arm = (anim = {}) => ({
  materials: { m: { color: '#5b8def' } },
  parts: [
    { id: 'upper', pivot: [30, 50], shapes: [{ type: 'capsule', x1: 30, y1: 50, x2: 50, y2: 50, r: 3, material: 'm' }] },
    { id: 'lower', parent: 'upper', pivot: [50, 50], shapes: [{ type: 'capsule', x1: 50, y1: 50, x2: 70, y2: 50, r: 3, material: 'm' }] },
  ],
  animations: { a: { frames: 4, ...anim } },
});
const tipAt = (c, anim, f, part = 'lower', tip = [70, 50]) => {
  const { world } = worldMatrices(c.parts, samplePose(c, c.animations[anim], f));
  const m = world.get(part);
  return [m[0] * tip[0] + m[2] * tip[1] + m[4], m[1] * tip[0] + m[3] * tip[1] + m[5]];
};

test('reach: the chain bends so the tip lands on the target, per frame', () => {
  const c = compile(arm({ reach: [{ chain: ['upper', 'lower'], tip: [70, 50], target: [50, [70, 30, 70, 30]] }] }));
  for (const f of [0, 1]) {
    const [x, y] = tipAt(c, 'a', f);
    const ty = f === 0 ? 70 : 30;
    assert.ok(Math.hypot(x - 50, y - ty) < 0.2, `frame ${f}: tip at ${x},${y}`);
  }
});

test('reach: aim fixes the end part orientation while the rest of the chain solves', () => {
  const c = compile(arm({ reach: [{ chain: ['upper', 'lower'], tip: [70, 50], target: [44.142, 84.142], aim: 90 }] }));
  const pose = samplePose(c, c.animations.a, 0);
  const total = pose.get('upper').rot + pose.get('lower').rot;
  assert.ok(Math.abs(((total - 90 + 540) % 360) - 180) < 0.5, `end world rotation ${total}`);
  const [x, y] = tipAt(c, 'a', 0);
  assert.ok(Math.hypot(x - 44.142, y - 84.142) < 0.3, `tip at ${x},${y}`);
});

test('reach: limits are respected', () => {
  const c = compile(arm({ reach: [{ chain: ['upper', 'lower'], tip: [70, 50], target: [30, 90], limits: { lower: [0, 20] } }] }));
  const r = samplePose(c, c.animations.a, 0).get('lower').rot;
  assert.ok(r >= 0 && r <= 20, `lower rot ${r}`);
});

test('reach: validation explains bad constraints', () => {
  const { errors } = validate(arm({ reach: [{ chain: ['lower', 'upperr'], tip: [70, 50], target: [50, 50] }] }));
  assert.match(errors[0].message, /unknown part "upperr" — did you mean "upper"/);
  const e2 = validate(arm({ reach: [{ chain: ['lower'], end: 'upper', tip: [1, 2], target: [50, 'x'] }] })).errors.map((e) => e.message).join('\n');
  assert.match(e2, /not "upper" or one of its ancestors/);
  assert.match(e2, /target must be \[x, y\]/);
});

test('bounds: parts that leave the canvas are reported with frames and edge', () => {
  const c = compile(arm({ tracks: { upper: { x: [0, 40, 0, 0] } } }));
  const w = checkBounds(c);
  assert.equal(w.length, 1); // only the lower arm (tip at x 113) crosses the right edge, in frame 1
  assert.deepEqual([w[0].part, w[0].edge, w[0].frames.join()], ['lower', 'right', '1']);
  assert.match(w[0].message, /past the right edge in frame 1/);
  assert.deepEqual(checkBounds(compile(arm())), []);
});

const base = () => ({
  name: 'base',
  materials: { skin: { color: '#f2b58c', texture: 'noise' }, eye: { color: '#000000', flat: true } },
  parts: [
    { id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] },
    { id: 'hat', parent: 'body', shapes: [{ type: 'rect', x: 40, y: 10, w: 20, h: 10, material: 'skin' }] },
    { id: 'feather', parent: 'hat', shapes: [{ type: 'circle', cx: 60, cy: 8, r: 3, material: 'skin' }] },
    { id: 'eye', parent: 'body', shapes: [{ type: 'circle', cx: 55, cy: 45, r: 3, material: 'eye' }] },
  ],
  animations: {
    idle: { frames: 4, tracks: { body: { y: [0, 1, 0, -1] }, feather: { rot: [0, 10, 0, -10] } } },
    wave: { frames: 2, tracks: {} },
  },
});

test('extends: materials merge per field, parts patch/add/remove (with descendants), animations merge', () => {
  const v = mergeVariant(base(), {
    extends: 'base.json',
    name: 'variant',
    materials: { skin: { color: '#8a5a3c' }, cap: { color: '#e2433c' } },
    parts: [
      { id: 'hat', remove: true },
      { id: 'body', addShapes: [{ type: 'circle', cx: 50, cy: 80, r: 5, material: 'skin' }] },
      { id: 'eye', z: 9 },
      { id: 'cap', parent: 'body', shapes: [{ type: 'rect', x: 40, y: 15, w: 20, h: 6, material: 'cap' }] },
    ],
    animations: { wave: null, idle: { fps: 12, tracks: { eye: { show: [1, 0, 1, 1] } } } },
  });
  assert.equal(v.name, 'variant');
  assert.equal(v.extends, undefined);
  assert.deepEqual(v.materials.skin, { color: '#8a5a3c', texture: 'noise' });
  assert.deepEqual(v.parts.map((p) => p.id), ['body', 'eye', 'cap']); // feather went with its parent
  assert.equal(v.parts[0].shapes.length, 2);
  assert.equal(v.parts[1].z, 9);
  assert.deepEqual(Object.keys(v.animations), ['idle']);
  assert.equal(v.animations.idle.fps, 12);
  assert.deepEqual(Object.keys(v.animations.idle.tracks), ['body', 'eye']); // feather track dropped
  assert.deepEqual(validate(v).errors, []);
});

test('extends: materialMap re-points shapes; resolveExtends follows chains', async () => {
  const files = {
    'a.json': base(),
    'b.json': { extends: 'a.json', materials: { fur: { color: '#777777' } }, materialMap: { skin: 'fur' } },
  };
  const spec = await resolveExtends({ extends: 'b.json', name: 'c' }, (ref) => structuredClone(files[ref]));
  assert.equal(spec.name, 'c');
  assert.ok(spec.parts.every((p) => p.shapes.every((s) => s.material !== 'skin')));
  const { errors, warnings } = validate(spec);
  assert.deepEqual(errors, []);
  assert.equal(spec.materials.skin, undefined); // mapped away and unused: dropped
  assert.ok(renderFrame(compile(spec), { res: 16 }).rgba.some((v) => v > 0));
  await assert.rejects(resolveExtends({ extends: 'nope.json' }, () => { throw new Error('ENOENT'); }), /cannot load "nope.json"/);
});
