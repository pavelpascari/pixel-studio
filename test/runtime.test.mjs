import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariant } from '../src/runtime/pixel-sprite.js';

const vs = [16, 32, 64].map((res) => ({ res, frameH: res }));
const pick = (size) => pickVariant(vs, size).res;

test('variant choice: integer scale >= 2, most detail when close enough', () => {
  assert.equal(pick(24), 16);   // 16 × 2 = 32
  assert.equal(pick(36), 16);   // 16 × 2 = 32
  assert.equal(pick(64), 32);   // 32 × 2
  assert.equal(pick(72), 32);   // 32 × 2 = 64 (11% off)
  assert.equal(pick(128), 64);  // 64 × 2
  assert.equal(pick(150), 64);  // 64 × 2 = 128 (15% off)
  assert.equal(pick(400), 64);  // 64 × 6
  assert.equal(pick(12), 16);   // too small for anything: closest
});

// ---------- shared clock ----------
import { clock, checkBundle, deviceScale } from '../src/runtime/pixel-sprite.js';

function fakeFrames() {
  const queue = [];
  globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  return { step(t) { const fns = queue.splice(0); fns.forEach((fn) => fn(t)); return fns.length; } };
}

test('clock: a throwing subscriber cannot stop the loop or the other subscribers', () => {
  const frames = fakeFrames();
  const seen = [];
  const errors = [];
  const origErr = console.error; console.error = (e) => errors.push(e);
  const realReport = globalThis.reportError; globalThis.reportError = (e) => errors.push(e);
  const bad = () => { throw new Error('boom'); };
  const good = (dt) => seen.push(dt);
  clock.add(bad); const off = clock.add(good);
  frames.step(1000); frames.step(1016); frames.step(1032);
  assert.deepEqual(seen, [0, 16, 16]);
  assert.equal(errors.length, 3);
  clock.remove(bad); off();
  frames.step(1048);                                // empty: the loop stops itself
  assert.equal(frames.step(1064), 0);
  console.error = origErr; globalThis.reportError = realReport;
});

test('clock: dt is clamped and reset() starts from zero', () => {
  const frames = fakeFrames();
  const seen = [];
  const off = clock.add((dt) => seen.push(dt));
  frames.step(0); frames.step(5000); clock.reset(); frames.step(9000); frames.step(9010);
  off(); frames.step(9020);
  assert.deepEqual(seen, [0, clock.maxDt, 0, 10]);
});

test('checkBundle: clear errors for wrong or broken bundles', () => {
  const ok = { format: 'pixel-sprite/1', animations: { idle: { row: 0, frames: 4, fps: 8, loop: true } }, variants: [{ res: 16, frameW: 16, frameH: 16, image: 'data:,' }] };
  assert.equal(checkBundle(ok), ok);
  assert.throws(() => checkBundle({ ...ok, format: 'lottie' }), /format is "lottie"/);
  assert.throws(() => checkBundle({ ...ok, animations: {} }), /no animations/);
  assert.throws(() => checkBundle({ ...ok, animations: { idle: { row: 0, frames: 0, fps: 8 } } }), /animation "idle"/);
  assert.throws(() => checkBundle({ ...ok, variants: [] }), /no variants/);
  assert.throws(() => checkBundle(null, 'x.json'), /x\.json: not a JSON object/);
});

test('deviceScale: whole device pixels per sprite pixel at any DPR', () => {
  assert.equal(deviceScale(64, 64, 128, 1), 2);
  assert.equal(deviceScale(64, 64, 128, 2), 4);
  assert.equal(deviceScale(64, 64, 128, 2.625), 5);    // 5.25 → 5 device px, displayed at 121.9 CSS px
  assert.equal(deviceScale(64, 64, 128, 1.5), 3);
  assert.equal(deviceScale(64, 64, 6400, 3), 64);      // capped: 64 × 64 = 4096 px canvas
});

// ---------- <pixel-stage> helpers ----------
import { jumpArc, cells } from '../src/runtime/pixel-stage.js';

test('jumpArc: lands exactly on the target after the animation\'s flight time and peaks at the apex', () => {
  for (const [x0, y0, x1, y1] of [[0, 300, 120, 200], [0, 200, 80, 320], [50, 100, 50, 100]]) {
    const lift = 30, T = 0.4;
    const a = jumpArc(x0, y0, x1, y1, lift, T);
    const at = (t) => [x0 + a.vx * t, y0 + a.vy * t + (a.g * t * t) / 2];
    const [ex, ey] = at(T);
    assert.ok(Math.abs(ex - x1) < 1e-9 && Math.abs(ey - y1) < 1e-9, `lands on (${x1}, ${y1})`);
    const tPeak = -a.vy / a.g;
    assert.ok(Math.abs(at(tPeak)[1] - (Math.min(y0, y1) - lift)) < 1e-9, 'peaks lift px above the higher end');
  }
});

test('cells: overlapping cut-outs become disjoint cells covering exactly their union', () => {
  const rs = [[0, 0, 10, 10], [5, 5, 20, 20], [30, 0, 40, 5]];
  const out = cells(rs, 64, 64);
  const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
  assert.equal(out.reduce((s, r) => s + area(r), 0), 100 + 225 - 25 + 50);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const [a, b] = [out[i], out[j]];
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], 'cells do not overlap');
  }
  assert.deepEqual(cells([[-5, -5, 100, 3]], 64, 64), [[0, 0, 64, 3]], 'clipped to the sprite box');
});

// ---------- state machine ----------
import { StateMachine, parseCondition } from '../src/runtime/pixel-sprite.js';

const ANIMS = { idle: { frames: 8, loop: true }, walk: { frames: 8, loop: true }, run: { frames: 6, loop: true }, honk: { frames: 10, loop: false }, preen: { frames: 6, loop: true } };
const DEF = {
  initial: 'idle',
  inputs: { speed: 0, honk: 'trigger', hovered: false },
  nodes: { idle: { anim: 'idle', random: [{ anim: 'preen', every: [1, 1] }] }, walk: { anim: 'walk' }, run: { anim: 'run' }, honk: { anim: 'honk', then: 'previous' } },
  transitions: [
    { from: '*', to: 'honk', when: 'honk' },
    { from: 'idle', to: 'walk', when: 'speed > 0 && speed <= 60' },
    { from: ['idle', 'walk'], to: 'run', when: 'speed > 60', at: 'sync' },
    { from: 'run', to: 'walk', when: 'speed > 0 && speed <= 60', at: 'sync' },
    { from: ['walk', 'run'], to: 'idle', when: 'speed == 0', at: 'footstep' },
  ],
};
const machine = () => {
  const played = [], changes = [];
  const sm = new StateMachine(DEF, ANIMS, { play: (anim, o) => played.push([anim, o]), phase: () => 0.5, onChange: (f, t) => changes.push(`${f}>${t}`) });
  sm.start();
  return { sm, played, changes };
};

test('conditions: comparisons, booleans, negation, triggers, "&&"', () => {
  const c = parseCondition('speed > 3 && !sleepy && mood == happy');
  assert.equal(c({ speed: 4, sleepy: false, mood: 'happy' }, new Set()), true);
  assert.equal(c({ speed: 4, sleepy: true, mood: 'happy' }, new Set()), false);
  assert.equal(parseCondition('honk')({ honk: false }, new Set(['honk'])), true);
  assert.equal(parseCondition("name == 'Bo'")({ name: 'Bo' }, new Set()), true);
  assert.throws(() => parseCondition('speed >'), /cannot read condition/);
});

test('state machine: inputs move between nodes; "sync" keeps the phase; "footstep" waits for the feet', () => {
  const { sm, played, changes } = machine();
  assert.equal(sm.node, 'idle');
  sm.set('speed', 30);
  assert.equal(sm.node, 'walk');
  sm.set('speed', 90);
  assert.equal(sm.node, 'run');
  assert.deepEqual(played.at(-1), ['run', { once: false, phase: 0.5 }]);
  sm.set('speed', 0);
  assert.equal(sm.node, 'run', 'waits for the next footstep');
  sm.loopEnd();
  assert.equal(sm.node, 'run');
  sm.event('footstep');
  assert.equal(sm.node, 'idle');
  sm.set('speed', 30); sm.set('speed', 0); sm.set('speed', 40);
  assert.equal(sm.node, 'walk', 'the waiting stop is dropped when the speed comes back');
  sm.event('footstep');
  assert.equal(sm.node, 'walk');
  assert.deepEqual(changes, ['idle>walk', 'walk>run', 'run>idle', 'idle>walk']);
});

test('state machine: triggers fire one-shots that return to the previous node; random fidgets', () => {
  const { sm, played } = machine();
  sm.set('speed', 30);
  sm.fire('honk');
  assert.equal(sm.node, 'honk');
  assert.deepEqual(played.at(-1), ['honk', { once: true, phase: undefined }]);
  sm.fire('honk');
  assert.equal(sm.node, 'honk', 'no re-entry while honking');
  sm.ended();
  assert.equal(sm.node, 'walk', 'then: previous');
  sm.set('speed', 0); sm.event('footstep');
  assert.equal(sm.node, 'idle');
  sm.update(16); sm.update(1200);
  assert.deepEqual(played.at(-1), ['preen', { once: true }], 'fidget after "every" seconds');
  sm.ended();
  assert.equal(sm.node, 'idle');
  assert.deepEqual(played.at(-1)[0], 'idle');
});

test('checkBundle bounds fps and durations (a hostile bundle cannot spin the frame loop)', () => {
  const ok = { format: 'pixel-sprite/1', animations: { a: { row: 0, frames: 2, fps: 8 } }, variants: [{ res: 16, frameW: 16, frameH: 16, image: 'data:,' }] };
  assert.throws(() => checkBundle({ ...ok, animations: { a: { row: 0, frames: 2, fps: 1e9 } } }), /at most 60/);
  assert.throws(() => checkBundle({ ...ok, animations: { a: { row: 0, frames: 2, fps: 8, durations: [1e-9, 100] } } }), /durations/);
});

// ---------- bursts and rates ----------
import { BurstDetector } from '../src/runtime/pixel-sprite.js';

test('BurstDetector: quick hits become a burst with a rising rate; a pause calms it', () => {
  const b = new BurstDetector({ min: 3, gap: 400 });
  const r = [0, 200, 350, 500, 700].map((t) => b.hit(t));
  assert.deepEqual(r.map((x) => x.burst), [false, false, true, true, true]);
  assert.deepEqual(r.map((x) => x.rate), [1, 1, 1.35, 1.7, 2.05]);
  assert.equal(b.calm(900), false, 'still within the gap');
  assert.equal(b.calm(1200), true, 'calm after the gap');
  assert.equal(b.hit(1300).count, 1, 'a new run starts from one');
  assert.equal(new BurstDetector().hit(0).count, 1);
  const slow = new BurstDetector({ gap: 400 });
  assert.ok([0, 500, 1000, 1500].map((t) => slow.hit(t)).every((x) => !x.burst), 'slow clicks never burst');
});

test('state machine: node rates follow inputs; burst and calm interactions pass $rate', () => {
  const rates = [];
  const def = {
    initial: 'idle', inputs: { fury: 1 },
    nodes: { idle: { anim: 'idle' }, panic: { anim: 'run', rate: 'fury' } },
    transitions: [{ from: 'idle', to: 'panic', when: 'fury >= 2' }, { from: 'panic', to: 'idle', when: 'fury < 2' }],
    interactions: [{ on: 'burst', set: { fury: '$rate' } }, { on: 'calm', set: { fury: 1 } }],
  };
  const sm = new StateMachine(def, { idle: { frames: 4, loop: true }, run: { frames: 6, loop: true } }, { play: () => {}, phase: () => 0, rate: (r) => rates.push(r) });
  sm.start();
  sm.interact('burst', { count: 4, rate: 1.7 });
  assert.equal(sm.node, 'idle');
  sm.interact('burst', { count: 6, rate: 2.4 });
  assert.equal(sm.node, 'panic');
  assert.equal(rates.at(-1), 2.4, 'panic plays at the fury rate');
  sm.interact('burst', { count: 9, rate: 9 });
  assert.equal(rates.at(-1), 4, 'clamped to 4');
  sm.interact('calm');
  assert.equal(sm.node, 'idle');
  assert.equal(rates.at(-1), 1);
});

// ---------- scenes ----------
import { checkScene, runScene } from '../src/runtime/pixel-stage.js';

test('checkScene: accepts a valid scene and reports problems with JSON paths', () => {
  const ok = { cast: { goose: '#goose', clawd: '#clawd' }, loop: 2, steps: [
    { actor: 'goose', goTo: '#bench', then: 'sit' },
    { together: [{ actor: 'goose', say: 'honk?', ms: 900 }, { actor: 'clawd', perform: 'think', ms: 1200, async: true }] },
    { wait: 300 }, { waitFor: 'tap', on: 'clawd', timeout: 5000 }, { emit: 'done' }, { actor: 'clawd', face: 'goose' },
  ] };
  assert.deepEqual(checkScene(ok), []);
  const paths = (s, names) => checkScene(s, names).map((e) => e.path);
  assert.deepEqual(paths({ steps: [] }), ['$.steps']);
  assert.deepEqual(paths({ steps: [{ actor: 'goose', goTo: '#a', say: 'hi' }] }), ['$.steps[0]']);           // two actions
  assert.deepEqual(paths({ steps: [{ actor: 'fox', goTo: '#a' }] }, ['goose']), ['$.steps[0].actor']);          // not in the cast
  assert.deepEqual(paths({ steps: [{ goTo: '#a' }] }), ['$.steps[0].actor']);                                   // no actor
  assert.deepEqual(paths({ steps: [{ actor: 'g', goTo: '#a', then: 'dance' }] }), ['$.steps[0].then']);
  assert.deepEqual(paths({ steps: [{ wait: -1 }, { actor: 'g', perform: 'x', speed: 2 }] }), ['$.steps[0].wait', '$.steps[1].speed']);
  assert.deepEqual(paths({ steps: [{ together: [{ jump: 1 }] }] }), ['$.steps[0].together[0]']);
  assert.deepEqual(paths({ steps: [{ waitFor: 'tap' }], loop: 'yes' }), ['$.loop', '$.steps[0].on']);
});

/** Fake actors: each order takes `ms` and resolves true, or false when told to fail. */
function fakeEnv({ fail = [], log = [] } = {}) {
  let stop;
  const stopped = new Promise((r) => (stop = r));
  const actor = (name) => ({
    name,
    run: (action, ...args) => new Promise((r) => { log.push(`${name}.${action}:start`); setTimeout(() => { log.push(`${name}.${action}:end`); r(!fail.includes(action)); }, 20); }),
    say: (text) => { log.push(`${name}.say ${text}`); return Promise.resolve(true); },
    face: (dir) => { log.push(`${name}.face ${typeof dir === 'string' ? dir : dir.name}`); return true; },
  });
  const cast = { goose: actor('goose'), clawd: actor('clawd') };
  return { log, stop, env: {
    actor: (n) => cast[n] ?? null, element: (sel) => ({ sel }), stopped,
    wait: (ms) => new Promise((r) => setTimeout(() => r(true), ms)),
    listen: () => new Promise((r) => setTimeout(() => r(true), 10)),
    emit: (name) => log.push(`emit ${name}`),
  } };
}

test('runScene: steps run in order, "together" in parallel, async does not wait, failures are skipped', async () => {
  const { env, log } = fakeEnv({ fail: ['hideBehind'] });
  const done = await runScene({ steps: [
    { actor: 'goose', goTo: '#bench' },
    { together: [{ actor: 'goose', perform: 'honk' }, { actor: 'clawd', goTo: '#hill' }] },
    { actor: 'clawd', hideBehind: '#crate' },          // fails: the scene carries on
    { actor: 'goose', perform: 'idle', async: true },  // started, not awaited
    { actor: 'clawd', face: 'goose' },
    { emit: 'end' },
  ] }, env);
  assert.equal(done, true);
  const ends = () => log.filter((l) => l === 'goose.perform:end').length;
  assert.equal(ends(), 1);   // the scene finished before its async step did
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(log.slice(0, 6), ['goose.goTo:start', 'goose.goTo:end', 'goose.perform:start', 'clawd.goTo:start', 'goose.perform:end', 'clawd.goTo:end']);
  assert.ok(log.indexOf('goose.perform:start', 3) < log.indexOf('clawd.face goose'));   // async step started before the next one
  assert.equal(ends(), 2);   // …which still completes afterwards
  assert.ok(log.includes('emit end'));
});

test('runScene: loops a number of times, and stop() ends it mid-step', async () => {
  const a = fakeEnv();
  assert.equal(await runScene({ loop: 3, steps: [{ emit: 'tick' }] }, a.env), true);
  assert.equal(a.log.filter((l) => l === 'emit tick').length, 3);
  const b = fakeEnv();
  const p = runScene({ loop: true, steps: [{ wait: 15 }, { emit: 'tick' }] }, b.env);
  await new Promise((r) => setTimeout(r, 60));
  b.stop();
  assert.equal(await p, false);
  const n = b.log.length;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.log.length, n);   // nothing runs after stop
});

test('checkScene: triggers and the carry / exit / enter steps', () => {
  const ok = { cast: { goose: '#goose' }, trigger: { event: 'submit', on: '#signup', once: true, preventDefault: true }, steps: [
    { actor: 'goose', pickUp: '$trigger .letter' }, { actor: 'goose', exit: 'right' }, { wait: 1000 },
    { actor: 'goose', enter: 'left' }, { actor: 'goose', enter: '#footer' }, { actor: 'goose', drop: 'back' }, { actor: 'goose', drop: true },
  ] };
  assert.deepEqual(checkScene(ok), []);
  const paths = (s) => checkScene(s).map((e) => e.path);
  assert.deepEqual(paths({ trigger: { event: 'submit' }, steps: [{ wait: 1 }] }), ['$.trigger.on']);
  assert.deepEqual(paths({ trigger: { event: 'x', on: '#a', when: 1, once: 'yes' }, steps: [{ wait: 1 }] }), ['$.trigger.when', '$.trigger.once']);
  assert.deepEqual(paths({ trigger: 'submit', steps: [{ wait: 1 }] }), ['$.trigger']);
  assert.deepEqual(paths({ steps: [{ actor: 'g', exit: 'up' }, { actor: 'g', drop: 'away' }, { actor: 'g', pickUp: 3 }] }),
    ['$.steps[0].exit', '$.steps[1].drop', '$.steps[2].pickUp']);
});

test('runScene: carry, exit and enter become actor orders', async () => {
  const { env, log } = fakeEnv();
  await runScene({ steps: [{ actor: 'goose', pickUp: '#letter' }, { actor: 'goose', exit: 'right' }, { actor: 'goose', enter: 'left' }, { actor: 'goose', drop: true }] }, env);
  assert.deepEqual(log.filter((l) => l.endsWith(':start')), ['goose.pickUp:start', 'goose.exit:start', 'goose.enter:start', 'goose.drop:start']);
});
