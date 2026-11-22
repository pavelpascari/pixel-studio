// Bundling only some animations (buildBundle `animations`, `pixel bundle --anims`) and the CLI's views default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compile, buildBundle, resolveSpec } from '../src/core/index.js';
import { selectAnimations, pruneStates, STAGE_ROLES } from '../src/core/bundle.js';
import { checkBundle } from '../../runtime/src/pixel-sprite.js';

const read = (dir, f) => JSON.parse(readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8'));
const load = async (name) => compile(await resolveSpec(read('examples', `${name}.json`), {
  loadRef: (f) => read('examples', f), loadFigure: (n) => read('figures', `${n}.json`), warn: () => {},
}));
const encode = (w, h) => `data:image/png;base64,${w}x${h}`;
const names = (b) => Object.keys(b.animations);
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
// A tiny blob with a front view, a transition and a state machine: fast to render. The geese are only compiled.
const FIXTURE = fileURLToPath(new URL('./fixtures/tiny-views.json', import.meta.url));
const tiny = () => once('tiny', async () => compile(await resolveSpec(JSON.parse(readFileSync(FIXTURE, 'utf8')), { loadFigure: (n) => read('figures', `${n}.json`) })));
const goose = () => once('goose', () => load('goose-root'));

test('selectAnimations: the named ones plus their views, the views\' turns and the transitions between kept ones', async () => {
  const c = await goose();
  assert.deepEqual(selectAnimations(c, ['idle', 'waddle', 'honk']), [
    'idle', 'waddle', 'honk', 'idle@front', 'waddle@front', 'honk@front', 'turn@front', 'unturn@front', 'look@front',
    'idle@back', 'waddle@back', 'honk@back', 'turn@back', 'unturn@back', 'waddle>idle', 'idle>waddle']);
  assert.ok(!selectAnimations(c, ['idle', 'run']).includes('idle>waddle'), 'a transition needs both ends');
  assert.ok(selectAnimations(c, ['idle', 'run']).includes('run>idle'));
  // hack has no front or back version: no turns either.
  assert.deepEqual(selectAnimations(c, ['hack']), ['hack']);
  assert.deepEqual(selectAnimations(c, 'idle, honk').slice(0, 2), ['idle', 'honk'], 'a comma-separated string works too');
});

test('selectAnimations: "stage" keeps the animation <pixel-stage> plays for each role the character has', async () => {
  const fox = await load('fox'), slime = await load('slime');
  const own = (c, list) => selectAnimations(c, list).filter((n) => !n.includes('@') && !n.includes('>'));
  assert.deepEqual(own(await goose(), ['stage']), ['idle', 'waddle', 'run', 'rush', 'honk', 'jump', 'fall', 'sit', 'duck', 'peek', 'climb']);
  assert.deepEqual(own(fox, ['stage']), ['idle', 'walk', 'trot', 'jump', 'fall', 'duck', 'peek'], 'fox runs with its trot; gallop and leap go');
  assert.deepEqual(own(slime, ['stage']), ['idle', 'hop', 'travel', 'fall', 'peek'], 'slime walks and runs with travel, reacts with a hop');
  assert.deepEqual(own(await goose(), ['stage', 'hack']).slice(-1), ['hack'], 'a preset and names combine');
});

test('STAGE_ROLES matches the roles <pixel-stage> looks up', () => {
  const src = readFileSync(new URL('../../runtime/src/pixel-stage.js', import.meta.url), 'utf8');
  const literal = src.match(/const ROLES = (\{[\s\S]*?\});/)[1];
  const json = literal.replace(/'/g, '"').replace(/(\w+):/g, '"$1":').replace(/,\s*\}$/, '}');
  assert.deepEqual({ ...STAGE_ROLES }, JSON.parse(json));
});

test('selectAnimations: an unknown name is an error that lists what the character has', async () => {
  const c = await load('fox');
  assert.throws(() => selectAnimations(c, ['idle', 'quack']), /no animation "quack" in .*\(have: idle, walk, trot, gallop, leap, jump, fall, duck, peek; or "stage"/);
  assert.throws(() => selectAnimations(c, []), /no animations to keep/);
  assert.throws(() => selectAnimations(c, { idle: true }), /list of names/);
});

test('pruneStates: nodes without their animation go, with the transitions and fidgets that use them', () => {
  const states = {
    initial: 'hack', inputs: { speed: 0, go: 'trigger' },
    nodes: { hack: { anim: 'hack' }, idle: { anim: 'idle', random: [{ anim: 'hack' }, { anim: 'blink' }] }, honk: { anim: 'honk', then: 'hack' }, walk: { anim: 'walk' } },
    transitions: [{ from: ['idle', 'hack'], to: 'walk', when: 'speed > 0' }, { from: 'hack', to: 'idle' }, { to: 'hack', when: 'go' }, { from: '*', to: 'honk', when: 'go' }],
    interactions: [{ on: 'click', fire: 'go' }],
  };
  const out = pruneStates(states, { idle: {}, blink: {}, honk: {}, walk: {} });
  assert.deepEqual(Object.keys(out.nodes), ['idle', 'honk', 'walk']);
  assert.equal(out.initial, 'idle', 'a dropped initial node becomes the first one left');
  assert.deepEqual(out.nodes.idle.random, [{ anim: 'blink' }]);
  assert.equal(out.nodes.honk.then, 'previous', 'a one-shot whose next node went returns to the previous one');
  assert.deepEqual(out.transitions, [{ from: ['idle'], to: 'walk', when: 'speed > 0' }, { from: '*', to: 'honk', when: 'go' }]);
  assert.deepEqual(out.interactions, states.interactions);
  assert.equal(states.nodes.hack.anim, 'hack', 'the input is not changed');
  assert.equal(pruneStates(states, { idle: {}, hack: {}, blink: {}, honk: {}, walk: {} }), states, 'unchanged when nothing is missing');
  assert.equal(pruneStates(states, { other: {} }), null, 'no node left: no state machine');
});

test('buildBundle({animations}): a smaller bundle the runtime accepts, its state machine pruned', async () => {
  const c = await tiny();
  const some = await buildBundle(c, { resolutions: [16], encode, animations: ['idle', 'travel'] });
  assert.deepEqual(names(some), ['idle', 'travel', 'idle@front', 'turn@front', 'unturn@front', 'travel>idle']);
  assert.deepEqual(Object.keys(some.points.top), names(some), 'points only for the animations kept');
  assert.deepEqual(Object.keys(some.states.nodes), ['idle', 'move']);
  assert.equal(some.states.nodes.idle.random, undefined, 'its only fidget (peek) went');
  assert.deepEqual(some.states.transitions.map((t) => t.to), ['move', 'idle']);
  checkBundle(structuredClone(some));
  const side = await buildBundle(c, { resolutions: [16], encode, views: [], animations: ['hop', 'fall'] });
  assert.deepEqual(names(side), ['hop', 'fall']);
  assert.deepEqual(Object.keys(side.states.nodes), ['jump'], 'jump plays hop');
  assert.equal(side.states.initial, 'jump');
  checkBundle(structuredClone(side));
  const none = await buildBundle(c, { resolutions: [16], encode, animations: ['fall'] });
  assert.equal(none.states, undefined, 'no node can play: no state machine');
  checkBundle(structuredClone(none));
  // Pruning also covers views left out: a node that plays "idle@front" would otherwise fail checkBundle.
  const fronted = { ...c, states: { ...c.states, nodes: { ...c.states.nodes, face: { anim: 'idle@front' } } } };
  assert.equal((await buildBundle(fronted, { resolutions: [16], encode, views: [] })).states.nodes.face, undefined);
  await assert.rejects(buildBundle(c, { resolutions: [16], encode, animations: ['quack'] }), /no animation "quack" in tiny \(have: idle, hop, travel, fall, peek;/);
});

test('buildBundle keeps every view and animation by default (the demos and stage pages turn their characters)', async () => {
  const b = await buildBundle(await tiny(), { resolutions: [16], encode });
  assert.deepEqual(names(b), Object.keys((await tiny()).animations));
  assert.ok(b.animations['idle@front'] && b.animations['turn@front']);
});

// ---------- the CLI ----------

const BIN = fileURLToPath(new URL('../bin/pixel.mjs', import.meta.url));
function bundle(spec, ...flags) {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-bundle-'));
  try {
    const out = join(dir, 'x.bundle.json');
    const r = spawnSync(process.execPath, [BIN, 'bundle', spec === 'tiny' ? FIXTURE : spec, '--res', '16', '--out', out, ...flags], { encoding: 'utf8' });
    return { ...r, bundle: r.status === 0 ? JSON.parse(readFileSync(out, 'utf8')) : null };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('pixel bundle: the side view only unless --views asks for more', () => {
  const plain = bundle('tiny');
  assert.equal(plain.status, 0, plain.stderr);
  assert.deepEqual(names(plain.bundle), ['idle', 'hop', 'travel', 'fall', 'peek', 'travel>idle'], 'no front view');
  assert.match(plain.stderr, /note: side view only; --views all \(or front\) adds the character's other views/);
  const all = bundle('tiny', '--views', 'all');
  assert.ok(all.bundle.animations['idle@front'] && all.bundle.animations['turn@front'] && all.bundle.animations['unturn@front']);
  assert.doesNotMatch(all.stderr, /side view only/);
  assert.deepEqual(names(bundle('tiny', '--views', 'front').bundle), names(all.bundle));
  assert.deepEqual(names(bundle('tiny', '--views', 'none').bundle), names(plain.bundle));
  assert.doesNotMatch(bundle('blob').stderr, /side view only/, 'no note for a character without views');
  const bad = bundle('blob', '--views', 'front');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /error: --views: no view "front" \(this character has only the side view\)/);
  assert.match(bundle('tiny', '--views', 'back').stderr, /no view "back" \(views: front, all or none\)/);
  assert.match(bundle('tiny', '--views').stderr, /--views needs a value/);
});

test('pixel bundle --anims: only those animations and what they need; states pruned; unknown names listed', () => {
  const some = bundle('tiny', '--anims', 'idle,travel', '--views', 'all');
  assert.equal(some.status, 0, some.stderr);
  assert.deepEqual(names(some.bundle), ['idle', 'travel', 'idle@front', 'turn@front', 'unturn@front', 'travel>idle']);
  assert.match(some.stderr, /note: states: dropped node jump \(no animation left to play\)/);
  checkBundle(some.bundle);
  const stage = bundle('tiny', '--anims', 'stage');
  assert.deepEqual(names(stage.bundle), ['idle', 'hop', 'travel', 'fall', 'peek', 'travel>idle'], 'everything the stage plays for a blob');
  const gone = bundle('tiny', '--anims', 'fall');
  assert.equal(gone.bundle.states, undefined);
  assert.match(gone.stderr, /dropped the state machine/);
  checkBundle(gone.bundle);
  const bad = bundle('tiny', '--anims', 'idle,quack');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^(note: .*\n)*error: no animation "quack" in tiny \(have: idle, hop, travel, fall, peek; or "stage" for what <pixel-stage> uses\)\n$/);
  assert.match(bundle('tiny', '--anims').stderr, /--anims needs a list/);
});

test('pixel help lists --anims', () => {
  assert.match(execFileSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' }), /--anims idle,walk\|stage/);
});
