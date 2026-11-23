// An idle <pixel-stage>: no frame loop while every character is off-screen and none has to keep going. The stage's
// own logic on fakes: an IntersectionObserver the test drives, and the shared clock (whose frames never run here).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- fakes (installed before the modules are imported) ----------

let io = null;
globalThis.IntersectionObserver = class {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); io = this; }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  /** Report these actors as in view (or not). */
  fire(els, isIntersecting) { this.cb(els.map((target) => ({ target, isIntersecting }))); }
};
globalThis.requestAnimationFrame = () => 1;   // frames never run: the tests call tick() themselves
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.performance ??= { now: () => Date.now() };

const { PixelStage, PixelActor } = await import('../src/pixel-stage.js');
const { clock } = await import('../src/pixel-sprite.js');

/** A character the stage drives: ready, placed, and wandering (nothing that needs the loop) unless told. */
const fakeActor = (name) => ({ name, _ready: true, _placed: true, needs: false, _needsLoop() { return this.needs; }, _setStill() {}, _update() {}, _write() {} });

/** A stage with these actors, connected: observing them and in the frame loop. */
function stage(actors) {
  const st = Object.create(PixelStage.prototype, { actors: { get: () => actors } });
  Object.assign(st, { world: { dirty: false, platforms: [] }, _paused: false, _touchGuard() {}, _tick: (dt) => st.tick(dt) });
  st._watchActors();
  st._sync();
  return st;
}
/** Whether the stage's tick is in the shared frame loop. */
const running = (st) => { const n = clock.size; clock.remove(st._tick); const had = clock.size < n; if (had) clock.add(st._tick); return had; };

test('idle: once every character is reported off-screen, the stage leaves the frame loop; one in view brings it back', () => {
  const a = fakeActor('a'), b = fakeActor('b');
  const st = stage([a, b]);
  assert.equal(running(st), true);
  st.tick(16);
  assert.equal(running(st), true, 'not before the observer has reported every character');
  io.fire([a], false);
  st.tick(16);
  assert.equal(running(st), true, 'b not reported yet');
  io.fire([b], false);
  st.tick(16);
  assert.equal(running(st), false, 'both off-screen: idle');
  io.fire([b], true);
  assert.equal(running(st), true, 'b scrolled into view: running again');
  st.tick(16);
  assert.equal(running(st), true);
});

test('idle: not while a character needs the loop, or a scene is playing; paused stays paused', () => {
  const a = fakeActor('a');
  const st = stage([a]);
  io.fire([a], false);
  a.needs = true;
  st.tick(16);
  assert.equal(running(st), true, 'a character that needs the loop keeps it');
  a.needs = false;
  st._scene = { name: 'intro' };
  st.tick(16);
  assert.equal(running(st), true, 'a scene keeps it');
  st._scene = null;
  st.tick(16);
  assert.equal(running(st), false);
  // Paused while idle, then resumed: still idle until a character is seen.
  st._paused = true; st._sync();
  st._paused = false; st._sync();
  assert.equal(running(st), false);
  io.fire([a], true);
  assert.equal(running(st), true);
});

test('idle: a character that is still loading does not keep the stage running; loading wakes it', () => {
  const a = fakeActor('a'), b = { ...fakeActor('b'), _ready: false };
  const st = stage([a, b]);
  io.fire([a], false);
  st.tick(16);
  assert.equal(running(st), false);
  st._wake();   // what a character's pixel-ready does
  assert.equal(running(st), true);
});

/** A real actor's _needsLoop on a bare object with these fields. */
function needs(fields, attrs = []) {
  const a = Object.create(PixelActor.prototype);
  Object.assign(a, { _placed: true, activity: 'idle', plan: [], _step: { type: 'idle', ms: 400 }, _orders: [], offstage: false }, fields);
  a.hasAttribute = (n) => attrs.includes(n) || (n === 'directed' && !!fields.directedAttr);
  return a._needsLoop();
}

test('_needsLoop: wandering or waiting for orders can wait off-screen; orders, falls, keep-in-view and returns cannot', () => {
  // Can wait.
  assert.equal(needs({}), false, 'idling');
  assert.equal(needs({ _step: { type: 'walk', x: 10 }, plan: [{ type: 'idle', ms: 900 }] }), false, 'wandering on its own');
  assert.equal(needs({ directedAttr: true }), false, 'directed, waiting for the next order');
  assert.equal(needs({ offstage: true, directedAttr: true }), false, 'directed and away: it comes back only when told');
  // Cannot.
  assert.equal(needs({}, ['keep-in-view']), true, 'keep-in-view');
  assert.equal(needs({ activity: 'falling' }), true, 'in the air');
  assert.equal(needs({ activity: 'dragged' }), true, 'held');
  assert.equal(needs({ offstage: true }), true, 'away off the screen, coming back by itself');
  assert.equal(needs({ _placed: false }), true, 'not placed yet');
  assert.equal(needs({ _orders: [{}] }), true, 'an order from run() or a scene');
  assert.equal(needs({ _pending: () => {} }), true, 'an order waiting for it to land');
  assert.equal(needs({ plan: [{ type: 'walk' }, { type: 'idle' }, { type: 'arrive' }] }), true, 'goTo() from the page');
  assert.equal(needs({ directedAttr: true, plan: [{ type: 'perform', name: 'honk' }] }), true, 'directed, with something to do');
  assert.equal(needs({ _sayUntil: 1 }), true, 'speaking');
});

test('idle: an order to a character wakes its stage', () => {
  const st = stage([]);
  st.tick(16);
  assert.equal(running(st), false, 'no characters: idle');
  const a = Object.create(PixelActor.prototype);
  Object.assign(a, { isConnected: true, _ready: false, closest: () => st });
  assert.equal(a.goTo({ x: 0, y: 0 }), false);   // not loaded yet: refused, but the stage woke to look
  assert.equal(running(st), true);
});
