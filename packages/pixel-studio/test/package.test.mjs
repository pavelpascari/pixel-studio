// The two packages are released together: same version, and @pixel-studio/core pins exactly that runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const engine = json('../package.json');
const runtime = json('../../runtime/package.json');

test('@pixel-studio/core and @pixel-studio/runtime share one version', () => {
  assert.equal(runtime.name, '@pixel-studio/runtime');
  assert.equal(engine.version, runtime.version);
  assert.equal(engine.dependencies['@pixel-studio/runtime'], runtime.version, 'an exact pin, not a range');
  assert.deepEqual(Object.keys(engine.dependencies), ['@pixel-studio/runtime'], 'no other dependencies');
  assert.equal(runtime.dependencies, undefined, 'the runtime has no dependencies');
});

test('every export of both packages points at a file', () => {
  for (const [pkg, dir] of [[engine, '../'], [runtime, '../../runtime/']]) {
    for (const [key, target] of Object.entries(pkg.exports)) {
      assert.ok(existsSync(new URL(dir + target, import.meta.url)), `${pkg.name} exports ${key} → ${target}`);
    }
  }
});

test('@pixel-studio/core/runtime and @pixel-studio/core/stage re-export the runtime package', async () => {
  const shim = await import('../src/runtime.js');
  const direct = await import('../../runtime/src/pixel-sprite.js');
  assert.equal(shim.checkBundle, direct.checkBundle);
  const stage = await import('../src/stage.js');
  assert.equal(stage.jumpArc, (await import('../../runtime/src/pixel-stage.js')).jumpArc);
});

test('the runtime never imports the engine', () => {
  for (const f of ['pixel-sprite.js', 'pixel-stage.js']) {
    const src = readFileSync(new URL(`../../runtime/src/${f}`, import.meta.url), 'utf8');
    const specs = [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.deepEqual(specs.filter((s) => s !== './pixel-sprite.js'), [], `${f} imports only ./pixel-sprite.js`);
  }
});
