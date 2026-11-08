// Plug-ins change process-wide registries, so they are tested in their own file (own process).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, compile, renderFrame, resolveSpec, registerShape, registerMotion, registeredPlugins, usePlugin } from '../src/core/index.js';

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
