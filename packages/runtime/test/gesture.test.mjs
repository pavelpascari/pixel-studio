// Gestures on characters: tap vs hold vs swipe vs drag, throw velocity, and the same events for every pointer type.
// The Gesture class is pure; the stage's input wiring runs here on a fake document with a fake clock.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------- a fake clock and document (installed before the modules are imported) ----------

let now = 1000;
globalThis.performance = { now: () => now };
mock.timers.enable({ apis: ['setTimeout'] });
/** Let `ms` pass: the clock and the timers. */
const wait = (ms) => { now += ms; mock.timers.tick(ms); };

const listeners = new Map();
const htmlStyle = {
  props: new Map(),
  setProperty(k, v, p = '') { this.props.set(k, [v, p]); },
  getPropertyValue(k) { return this.props.get(k)?.[0] ?? ''; },
  getPropertyPriority(k) { return this.props.get(k)?.[1] ?? ''; },
  removeProperty(k) { this.props.delete(k); },
};
globalThis.document = {
  documentElement: { style: htmlStyle },
  addEventListener(t, fn, opts) { listeners.set(t, { fn, opts }); },
  removeEventListener(t) { listeners.delete(t); },
};
globalThis.scrollX = 0; globalThis.scrollY = 0;
globalThis.matchMedia = () => ({ matches: false });
const buzzes = [];
Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (ms) => buzzes.push(ms) }, configurable: true });

const { Gesture, GESTURE, throwVelocity, PixelStage } = await import('../src/pixel-stage.js');
const { PixelSprite, TOUCH_HOVER_MS } = await import('../src/pixel-sprite.js');

// ---------- Gesture, pure ----------

const at = (x, y, t) => ({ x, y, t });

test('gesture: a quick still press is a tap, for every pointer type', () => {
  for (const pointerType of ['mouse', 'pen', 'touch']) {
    const g = new Gesture(at(0, 0, 0), { pointerType, onActor: true });
    assert.equal(g.move(at(3, 2, 50)), null);
    assert.deepEqual(g.up(at(3, 2, 120)), { type: 'tap' }, pointerType);
  }
});

test('gesture: a touch that moves before the hold is a scroll: no pick-up, no tap', () => {
  const g = new Gesture(at(100, 100, 0), { pointerType: 'touch', onActor: true });
  assert.equal(g.move(at(100, 105, 30)), null);                 // inside the slop: still waiting
  assert.equal(g.move(at(100, 100 - GESTURE.holdSlop - 2, 60)), 'scroll');
  assert.equal(g.hold(GESTURE.holdMs), false);                  // the timer runs out later: nothing
  assert.equal(g.move(at(100, 40, 120)), null);
  assert.equal(g.grabbed, false);
  assert.equal(g.up(at(100, 20, 200)), null);
});

test('gesture: a still touch hold picks up; dragging and letting go throws with the release velocity', () => {
  const g = new Gesture(at(100, 100, 0), { pointerType: 'touch', onActor: true });
  assert.equal(g.move(at(104, 103, 200)), null);                // a little jitter is allowed
  assert.equal(g.hold(GESTURE.holdMs - 50), false);             // too early
  assert.equal(g.hold(GESTURE.holdMs), true);
  assert.equal(g.grabbed, true);
  for (let i = 1; i <= 10; i++) assert.equal(g.move(at(104 + i * 10, 103 - i * 5, GESTURE.holdMs + i * 16)), 'drag');
  const r = g.up(at(214, 48, GESTURE.holdMs + 176), 5000);
  assert.equal(r.type, 'throw');
  assert.ok(Math.abs(r.vx - 625) < 1 && Math.abs(r.vy + 312.5) < 1, `${r.vx}, ${r.vy}`);   // 10 px and 5 px per 16 ms
});

test('gesture: a mouse or pen drag picks up at once; a still mouse hold picks up too', () => {
  for (const pointerType of ['mouse', 'pen']) {
    const g = new Gesture(at(0, 0, 0), { pointerType, onActor: true });
    assert.equal(g.move(at(4, 0, 10)), null);
    assert.equal(g.move(at(GESTURE.dragSlop + 1, 0, 20)), 'grab', pointerType);
    assert.equal(g.move(at(20, 0, 30)), 'drag');
  }
  const held = new Gesture(at(0, 0, 0), { pointerType: 'mouse', onActor: true });
  assert.equal(held.hold(GESTURE.holdMs), true);
  assert.deepEqual(held.up(at(0, 0, GESTURE.holdMs + 300)), { type: 'throw', vx: 0, vy: 0 });   // let go still: it drops
});

test('gesture: off the character, or while picking up is off, a press only taps', () => {
  for (const opts of [{ onActor: false }, { onActor: true, canGrab: false }]) {
    for (const pointerType of ['mouse', 'touch']) {
      const g = new Gesture(at(0, 0, 0), { pointerType, ...opts });
      assert.equal(g.move(at(30, 0, 10)), null);
      assert.equal(g.hold(GESTURE.holdMs), false);
      assert.equal(g.up(at(30, 0, 20)), null);                  // too far for a tap
      assert.deepEqual(new Gesture(at(0, 0, 0), { pointerType, ...opts }).up(at(1, 1, 50)), { type: 'tap' });
    }
  }
});

test('gesture: slow presses are not taps; cancel drops what is held', () => {
  assert.equal(new Gesture(at(0, 0, 0), { pointerType: 'touch' }).up(at(0, 0, GESTURE.tapMs + 1)), null);
  const pending = new Gesture(at(0, 0, 0), { pointerType: 'touch', onActor: true });
  assert.equal(pending.cancel(), null);
  const held = new Gesture(at(0, 0, 0), { pointerType: 'touch', onActor: true });
  held.hold(GESTURE.holdMs);
  assert.deepEqual(held.cancel(), { type: 'drop' });
});

test('throwVelocity: the last 100 ms count; a pointer that stopped throws nothing; capped', () => {
  assert.deepEqual(throwVelocity([]), { vx: 0, vy: 0 });
  assert.deepEqual(throwVelocity([at(0, 0, 0)]), { vx: 0, vy: 0 });
  // Fast early, then still for 300 ms before letting go.
  assert.deepEqual(throwVelocity([at(0, 0, 0), at(200, 0, 50), at(200, 0, 350), at(200, 0, 400)]), { vx: 0, vy: 0 });
  assert.deepEqual(throwVelocity([at(0, 0, 0), at(10, -20, 50), at(20, -40, 100)]), { vx: 200, vy: -400 });
  assert.deepEqual(throwVelocity([at(0, 0, 0), at(1000, -1000, 16)], 500), { vx: 500, vy: -500 });
  // Moving, then resting before letting go: nothing. Moves far apart (a slow device): the last two still count.
  assert.deepEqual(throwVelocity([at(0, 0, 0), at(10, 0, 50)], Infinity, 50 + GESTURE.throwWindowMs + 1), { vx: 0, vy: 0 });
  assert.deepEqual(throwVelocity([at(0, 0, 0), at(15, 0, 67), at(30, 0, 134)], Infinity, 185), { vx: 15 / 0.067, vy: 0 });
});

test('gesture: a release at the last move\'s position (as browsers send it) keeps the throw', () => {
  const g = new Gesture(at(0, 0, 0), { pointerType: 'touch', onActor: true });
  g.hold(GESTURE.holdMs);
  for (let i = 1; i <= 4; i++) g.move(at(-i * 15, -i * 12, GESTURE.holdMs + i * 67));
  const r = g.up(at(-60, -48, GESTURE.holdMs + 4 * 67 + 51));
  assert.ok(r.vx < -200 && r.vy < -150, `${r.vx}, ${r.vy}`);
});

// ---------- the stage's input wiring ----------

/** A stage with one character whose opaque pixels are the box 100..140 × 100..140 (client px). */
function setup({ paused = false } = {}) {
  listeners.clear();
  const log = [];
  const actor = new EventTarget();
  Object.assign(actor, {
    _ready: true, x: 120, y: 140, H: 40,
    _hit: (cx, cy) => cx >= 100 && cx <= 140 && cy >= 100 && cy <= 140,
    _grab: () => log.push('grab'),
    _dragTo: (x, y) => log.push(`to ${x},${y}`),
    _throw: (vx, vy) => log.push(`throw ${Math.round(vx)},${Math.round(vy)}`),
    shoo: () => log.push('shoo'),
    _rage: (b) => log.push(`rage ${b.count}`),
  });
  const events = [];
  for (const n of ['tap', 'burst', 'grab', 'throw']) actor.addEventListener(`pixel-${n}`, (e) => events.push({ type: n, ...e.detail }));
  const stage = { actors: [actor], world: { origin: { x: 0, y: 0 } }, _paused: paused };
  PixelStage.prototype._input.call(stage);
  return { stage, actor, log, events };
}
let ids = 0;
/** One pointer: down(x, y), move(x, y), up(), cancel(); each returns whether the event's default was prevented. */
function pointer(pointerType, { id = ++ids } = {}) {
  let x = 0, y = 0;
  const fire = (type, extra = {}) => {
    const e = { type, pointerType, pointerId: id, button: 0, clientX: x, clientY: y, cancelable: true, defaultPrevented: false, ...extra };
    e.preventDefault = () => { e.defaultPrevented = true; };
    e.stopPropagation = () => {};
    listeners.get(type)?.fn(e);
    return e.defaultPrevented;
  };
  return {
    down(px, py) { x = px; y = py; return fire('pointerdown'); },
    // On a touch screen each pointermove comes with a touchmove: the one the page scroll listens to.
    move(px, py) { x = px; y = py; fire('pointermove'); return pointerType === 'touch' ? fire('touchmove') : false; },
    up() { return fire('pointerup'); },
    cancel() { return fire('pointercancel'); },
    menu() { return fire('contextmenu'); },
    click() { return fire('click'); },
  };
}

test('input: a tap fires the same pixel-tap for mouse, pen and touch, with the pointer type', () => {
  for (const type of ['mouse', 'pen', 'touch']) {
    const { log, events } = setup();
    const p = pointer(type);
    p.down(120, 120); wait(80); p.up();
    assert.deepEqual(events, [{ type: 'tap', count: 1, pointerType: type }], type);
    assert.deepEqual(log, ['shoo']);
    assert.equal(p.click(), true, `${type}: the tap's click does not reach the page`);
    wait(1000);
  }
});

test('input: rage taps are a burst for every pointer type', () => {
  for (const type of ['mouse', 'touch']) {
    const { log, events } = setup();
    const p = pointer(type);
    for (let i = 0; i < 4; i++) { p.down(120, 120); wait(50); p.up(); wait(100); }
    assert.deepEqual(events.map((e) => `${e.type} ${e.count} ${e.pointerType}`), [1, 2, 3, 4].map((n) => `tap ${n} ${type}`));
    assert.deepEqual(log, ['shoo', 'shoo', 'rage 3', 'rage 4']);
    wait(2000);
  }
});

test('input: a swipe that starts on a character scrolls the page: nothing prevented, nothing picked up', () => {
  const { log, events } = setup();
  const p = pointer('touch');
  assert.equal(p.down(120, 120), false);
  assert.equal(htmlStyle.getPropertyValue('-webkit-touch-callout'), 'none');   // no callout while the finger rests
  wait(50);
  const prevented = [p.move(120, 110), p.move(120, 90), p.move(120, 60)];
  assert.equal(htmlStyle.props.size, 0, 'the page styles are back once it is a scroll');
  wait(GESTURE.holdMs);                                       // the hold timer would have run out by now
  p.move(120, 20);
  p.up();
  assert.deepEqual(prevented, [false, false, false]);
  assert.deepEqual(log, []);
  assert.deepEqual(events, []);
  assert.equal(p.click(), false);
});

test('input: touch hold picks up (buzz, pixel-grab), the finger moves it instead of the page, release throws', () => {
  const { log, events } = setup();
  const p = pointer('touch');
  buzzes.length = 0;
  p.down(120, 120);
  wait(200);
  assert.equal(p.move(123, 121), false, 'before the hold completes the page may still scroll');
  assert.equal(p.menu(), true, 'no context menu for a long press on a character');
  wait(GESTURE.holdMs - 200);
  assert.deepEqual(log, ['grab']);
  assert.deepEqual(buzzes, [10]);
  assert.deepEqual(events, [{ type: 'grab', pointerType: 'touch' }]);
  const prevented = [];
  for (let i = 1; i <= 5; i++) { wait(16); prevented.push(p.move(123 + i * 8, 121)); }
  assert.deepEqual(prevented, [true, true, true, true, true]);
  assert.equal(log[1], 'to 128,140', 'it follows the finger without jumping');
  p.up();
  assert.deepEqual(events.at(-1), { type: 'throw', vx: 500, vy: 0, pointerType: 'touch' });
  assert.equal(log.at(-1), 'throw 500,0');
  assert.equal(htmlStyle.props.size, 0, 'selection and callout are the page\'s again');
  assert.equal(p.click(), true, 'the click after a throw does not reach the page');
  p.down(10, 10); p.up();
  assert.equal(p.click(), false, 'a click somewhere else right after does');
  assert.equal(p.move(10, 10), false, 'later touches scroll as usual');
});

test('input: the same drag throws the same way with a mouse and a finger (after its hold)', () => {
  const throwOf = (type) => {
    const { events } = setup();
    const p = pointer(type);
    p.down(120, 120);
    if (type === 'touch') wait(GESTURE.holdMs);
    for (let i = 1; i <= 6; i++) { wait(16); p.move(120 + i * 12, 120 - i * 6); }
    p.up();
    wait(1000);
    return events.filter((e) => e.type !== 'grab').map(({ vx, vy, type: t }) => ({ t, vx, vy }));
  };
  assert.deepEqual(throwOf('mouse'), throwOf('touch'));
  assert.deepEqual(throwOf('mouse'), [{ t: 'throw', vx: 750, vy: -375 }]);
});

test('input: a mouse press on a character prevents text selection; elsewhere nothing is prevented', () => {
  setup();
  const m = pointer('mouse');
  assert.equal(m.down(120, 120), true);
  m.up();
  assert.equal(m.down(400, 400), false);
  m.up();
  assert.equal(m.menu(), false, 'right-click menus are never touched');
  const t = pointer('touch');
  t.down(400, 400);
  assert.equal(htmlStyle.props.size, 0, 'a touch off the character changes nothing');
  wait(GESTURE.holdMs + 10);
  assert.equal(t.move(400, 380), false);
  assert.equal(t.menu(), false);
  t.up();
});

test('input: pointercancel while holding drops the character; a second finger cancels a pending hold (pinch)', () => {
  const { log, events } = setup();
  const p = pointer('touch');
  p.down(120, 120); wait(GESTURE.holdMs);
  p.cancel();
  assert.deepEqual(log, ['grab', 'throw 0,0']);
  assert.deepEqual(events.at(-1), { type: 'throw', vx: 0, vy: 0, pointerType: 'touch' });
  log.length = 0;
  const a = pointer('touch'), b = pointer('touch');
  a.down(120, 120); wait(100);
  b.down(300, 300);
  wait(GESTURE.holdMs);
  assert.deepEqual(log, [], 'a pinch never picks up');
  assert.equal(htmlStyle.props.size, 0);
  a.up(); b.up();
});

test('input: paused, a hold does not pick up and a tap still shoos', () => {
  const { log, events } = setup({ paused: true });
  const p = pointer('touch');
  p.down(120, 120); wait(GESTURE.holdMs + 50);
  assert.equal(p.move(120, 90), false);
  p.up();
  assert.deepEqual(log, []);
  p.down(120, 120); wait(60); p.up();
  assert.deepEqual(events.map((e) => e.type), ['tap']);
});

// ---------- <pixel-sprite> state machine interactions on touch ----------

test('sprite: on touch a tap enters (then clicks) and leaves a few seconds after the last tap; mouse hovers', () => {
  const seen = [];
  const el = Object.create(PixelSprite.prototype);
  Object.assign(el, { _sm: { interact: (on) => seen.push(on) }, getAttribute: () => 'off' });
  const ev = (type, pointerType) => el.handleEvent({ type, pointerType });
  const tap = () => { ev('pointerenter', 'touch'); ev('pointerdown', 'touch'); ev('pointerleave', 'touch'); ev('click'); };
  tap();
  assert.deepEqual(seen, ['enter', 'click']);
  wait(TOUCH_HOVER_MS - 500);
  tap();                                                      // still "hovered": no second enter
  assert.deepEqual(seen, ['enter', 'click', 'click']);
  wait(TOUCH_HOVER_MS - 1);
  assert.equal(seen.length, 3);
  wait(1);
  assert.deepEqual(seen, ['enter', 'click', 'click', 'leave']);
  seen.length = 0;
  ev('pointerenter', 'mouse'); ev('pointerdown', 'mouse'); ev('click'); ev('pointerleave', 'mouse');
  wait(TOUCH_HOVER_MS * 2);
  assert.deepEqual(seen, ['enter', 'click', 'leave']);
});
