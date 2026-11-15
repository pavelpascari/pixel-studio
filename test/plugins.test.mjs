// Plug-ins change process-wide registries, so they are tested in their own file (own process).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validate, compile, renderFrame, resolveSpec, registerShape, registerTexture, registerMotion, registeredPlugins, usePlugin,
  shapeTypes, textures, motionModels, leggedModels, TRACK_PROPS, DETAIL_PRESETS,
} from '../src/core/index.js';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const loadFigure = (n) => json(`../figures/${n}.json`);

test('plug-in shapes, textures and motions validate, render and animate like built-ins', async () => {
  const spec = json('../examples/plugins/starfish.json');
  await assert.rejects(resolveSpec(spec, { loadFigure }), /unknown motion "float"/);
  await usePlugin(await import('../examples/plugins/extras.mjs'));
  assert.deepEqual(registeredPlugins().map((p) => `${p.kind}:${p.name}`), ['shape:star', 'texture:feathers', 'motion:float']);
  const resolved = await resolveSpec(spec, { loadFigure });
  const { errors, warnings } = validate(resolved);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const c = compile(resolved);
  const a = c.animations.float;
  assert.deepEqual(a.events.map((e) => e.name), ['top']);
  const f0 = renderFrame(c, { res: 32, anim: a, frame: 0 }), f6 = renderFrame(c, { res: 32, anim: a, frame: 6 });
  assert.ok(f0.rgba.some((v, i) => i % 4 === 3 && v > 0), 'the star is drawn');
  assert.notDeepEqual(f0.rgba, f6.rgba, 'it floats');
  // A typo in a plug-in shape's keys is caught like any other.
  const bad = validate({ materials: { m: '#fff' }, parts: [{ id: 'p', shapes: [{ type: 'star', cx: 50, cy: 50, material: 'm', tipz: 6 }] }] });
  assert.match(bad.errors.map((e) => e.message).join(), /star needs numeric "r"/);
  assert.match(bad.warnings.map((e) => e.message).join(), /did you mean "tips"\?/);
});

test('plug-in registration errors are clear', () => {
  assert.throws(() => registerShape('circle', { compile: () => ({}) }), /shape "circle" already exists/);
  assert.throws(() => registerShape('2star', { compile: () => ({}) }), /must start with a letter/);
  assert.throws(() => registerShape('blobby', {}), /needs a compile/);
  registerMotion('broken', { generate: ({ samples }) => ({ tracks: { body: { y: new Array(samples - 1).fill(0) } } }) });
  return resolveSpec({ figure: 'blob', animations: { b: { motion: 'broken' } } }, { loadFigure })
    .then(() => assert.fail('should throw'), (e) => assert.match(e.message, /body\.y has \d+ values, needs \d+/));
});

test('registering the exact same plug-in again is a no-op; a different one under the name still throws', async () => {
  const mod = await import('../examples/plugins/extras.mjs');
  const before = registeredPlugins().length;
  await usePlugin(mod);   // a dev server reloading the page's plug-ins
  await usePlugin(mod);
  assert.equal(registeredPlugins().length, before);
  assert.equal(shapeTypes().filter((t) => t === 'star').length, 1);
  assert.equal(textures().filter((t) => t === 'feathers').length, 1);
  assert.throws(() => registerShape('star', { required: ['cx', 'cy', 'r'], compile: () => ({}) }), /shape "star" already exists/);
  assert.throws(() => registerTexture('feathers', () => 0), /texture "feathers" already exists/);
  const generate = () => ({ tracks: {} });
  registerMotion('still', { generate });
  registerMotion('still', { generate });   // the same function: fine
  registerMotion('still', { generate: () => ({ tracks: {} }) });   // the same code (setup run again): fine
  assert.throws(() => registerMotion('still', { generate, legged: true }), /motion model "still" already exists/);
  assert.throws(() => registerMotion('still', { generate: () => ({ tracks: { body: { y: 1 } } }) }), /already exists/);
  assert.throws(() => registerTexture('noise', () => 0), /texture "noise" already exists/);   // built-ins are never "the same"
});

test('registry snapshots are read-only: changing one cannot reach the engine', () => {
  for (const list of [shapeTypes(), textures(), motionModels(), leggedModels(), TRACK_PROPS]) {
    assert.ok(Object.isFrozen(list));
    assert.throws(() => list.push('blob'), TypeError);
  }
  const copy = [...shapeTypes()];
  copy.push('blob');   // a copy is the caller's own
  assert.ok(!shapeTypes().includes('blob'));
  assert.ok(Object.isFrozen(DETAIL_PRESETS) && Object.isFrozen(DETAIL_PRESETS[2]));
  assert.throws(() => { DETAIL_PRESETS[2].tones = 9; }, TypeError);
  // validation still works and still lists the real types
  const { errors } = validate({ materials: { m: '#fff' }, parts: [{ id: 'p', shapes: [{ type: 'blob', material: 'm' }] }] });
  assert.match(errors[0].message, /unknown shape type "blob" \(one of rect, ellipse, circle, capsule, polygon/);
  assert.deepEqual(motionModels().slice(0, 3), ['gait', 'idle', 'pose']);
  assert.ok(leggedModels().includes('gait'));
});

test('the public entry point no longer exports internals or live registries', async () => {
  const pub = await import('../src/core/index.js');
  const internal = await import('../src/core/internal.js');
  for (const k of ['SHAPE_TYPES', 'TEXTURES', 'MOTION_MODELS', 'LEGGED_MODELS', 'samplePose', 'worldMatrices', 'blit', 'createImage', 'bakePoints', 'expandFigure', 'paletteOf'])
    assert.ok(!(k in pub), `${k} is not public`);
  for (const k of ['samplePose', 'samplePoseAt', 'worldMatrices', 'solveReach', 'blit', 'createImage', 'paletteOf', 'buildMixes'])
    assert.equal(typeof internal[k], 'function', `${k} is in internal.js`);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.exports['./internal'], './src/core/internal.js');
});
