// <pixel-stage> — characters that live on a web page: they walk along cards, drop and jump between
// them, climb their sides, sit on edges, and dive behind things. No dependencies besides
// pixel-sprite.js.
//
//   <script type="module" src="pixel-stage.js"></script>
//   <pixel-stage>
//     <pixel-actor src="goose.bundle.json" size="64" alt="a goose"></pixel-actor>
//   </pixel-stage>
//
//   <article class="card" data-pixel-surface data-pixel-climbable>…</article>
//   <img src="plant.png" data-pixel-hide>
//
// Page elements opt in with attributes:
//   data-pixel-surface    its top edge is a platform characters can stand and walk on
//                         (="animated": it moves by CSS animation/transform; read every frame, characters ride it)
//   data-pixel-climbable  its left and right sides are walls (implies surface)
//   data-pixel-perch      a favourite place to sit (implies surface)
//   data-pixel-hide       a hiding spot: characters duck behind it and peek out (it must stand on a surface)
//   data-pixel-occluder   characters are always drawn behind it (sticky headers, foreground images)
//   data-pixel-avoid      characters never stand on it or hide behind it
//
// The stage is a 0×0 layer that never takes clicks (pointer-events: none). Characters move in the
// document's coordinates, so scrolling costs nothing. Element boxes are read only when something
// changes (resize, DOM changes, fonts, transitions). Occlusion cuts the occluder's box out of the
// character with clip-path. The same gestures work with a mouse, a pen and a finger (see Gesture): tapping or
// clicking a character's opaque pixels shoos it away (that click does not reach the page); a still press of 400 ms
// picks it up (a mouse or pen can also just drag it), and letting go throws it with the pointer's speed. A swipe
// that starts on a character still scrolls the page: only a completed hold takes the finger. The characters are
// decorative (aria-hidden) and take no focus; a real button pauses all of them (WCAG 2.2.2) and remembers the
// choice. With prefers-reduced-motion the characters stand still.
//
// Stage attributes:  controls = bottom-right (default) | bottom-left | top-right | top-left | none
//                    floor    = document (default: the bottom of the page) | none
//                    roam     = viewport (default: prefer places on screen) | page
//                    grab     = on (default: pick up by hold or drag, any pointer) | mouse (mouse and pen only,
//                               no touch listeners: the 0.2 behaviour) | off (no picking up; taps still shoo)
// Actor attributes:  src, size (default 64), alt, start (selector to stand on first), keep-in-view (come
//                    back when scrolled out of sight: run there, or drop in from the top of the screen),
//                    behaviours (default "wander sit hide climb jump"), anims ("walk=waddle run=run ...")
// JS:  stage.actors, stage.pause(), stage.resume(), stage.paused, stage.world.invalidate(), stage.scrollSpeed;
//      stage events 'pixel-fastscroll' {speed} and 'pixel-scrollsettle'
//      actor.goTo(element | {x, y}, {then: 'sit' | 'hide' | 'idle'}), actor.hideBehind(el), actor.say(text, ms),
//      actor.shoo(), actor.catchUp(), actor.activity; events on the actor: 'pixel-activity' {from, to}, 'pixel-land',
//      'pixel-arrive', 'pixel-tap' {count, pointerType}, 'pixel-burst' {count, rate, pointerType} (rage taps: it
//      panics) and 'pixel-calm', 'pixel-grab' {pointerType} / 'pixel-throw' {vx, vy, pointerType} (picked up and
//      let go by the reader), 'pixel-catchup', 'pixel-enter', 'pixel-exit', 'pixel-pickup' / 'pixel-drop' /
//      'pixel-deliver' {prop} (a page element the character carries). Module: GESTURE, Gesture, throwVelocity.
//      Every event bubbles and is composed. Renamed in 0.2.0-alpha: the old names (tap, burst, actorstate, …,
//      sceneevent, fastscroll, …) and actor.state still work for one alpha release.

import { clock, BurstDetector, SPRITE_EVENTS } from './pixel-sprite.js';

// Events: every event is dispatched as `pixel-<name>` (bubbles, composed) through emit().
// legacy name, remove after 0.2.0-alpha: the pre-0.2 name of each event (none of them bubbled).
const LEGACY_EVENTS = {
  tap: 'tap', burst: 'burst', calm: 'calm', enter: 'enter', exit: 'exit', land: 'land', arrive: 'arrive', drop: 'drop',
  pickup: 'pickup', deliver: 'deliver', catchup: 'catchup', activity: 'actorstate',
  sceneevent: 'sceneevent', scenestep: 'scenestep', sceneend: 'sceneend', scrollsettle: 'scrollsettle', fastscroll: 'fastscroll',
};
function emit(el, name, detail) {
  el.dispatchEvent(new CustomEvent(`pixel-${name}`, { bubbles: true, composed: true, detail }));
  // legacy name, remove after 0.2.0-alpha
  if (LEGACY_EVENTS[name]) el.dispatchEvent(new CustomEvent(LEGACY_EVENTS[name], { detail }));
}
/**
 * Scenes name actor and stage events by their short names ("tap", "arrive"); on an actor or the stage those are
 * the `pixel-` DOM events. Anything else ("click", "submit", "pixel-tap") is used as written.
 */
export function sceneEventName(name, onPixelElement) {
  if (!onPixelElement) return name;
  if (name === 'actorstate') return 'pixel-activity';   // legacy name, remove after 0.2.0-alpha
  return Object.hasOwn(LEGACY_EVENTS, name) || NEW_EVENTS.has(name) ? `pixel-${name}` : name;
}
const isPixelEl = (el) => el instanceof PixelActor || el instanceof PixelStage;
// Events added after 0.2.0-alpha: no legacy alias, but scenes still use their short names.
const NEW_EVENTS = new Set(['grab', 'throw']);

// ---------- gestures: one pointer's press on a character, without the DOM ----------

/**
 * Timings and distances (CSS px) of the gestures. A touch picks a character up only after a still hold, so a
 * swipe that starts on it stays a scroll; a mouse or pen picks it up as soon as it drags (or after the same hold).
 */
export const GESTURE = Object.freeze({ holdMs: 400, holdSlop: 10, dragSlop: 6, tapSlop: 12, tapMs: 600, throwWindowMs: 100 });

/**
 * Throw velocity (px/s) from pointer samples [{x, y, t}] (each a move) and the release time: the movement over
 * the last `throwWindowMs` of moves, each axis capped to ±cap. A pointer that rested for longer than that before
 * letting go throws nothing.
 */
export function throwVelocity(track, cap = Infinity, releaseT = track[track.length - 1]?.t) {
  const end = track[track.length - 1];
  if (!end || releaseT - end.t > GESTURE.throwWindowMs) return { vx: 0, vy: 0 };
  const recent = track.filter((p) => end.t - p.t <= GESTURE.throwWindowMs);
  const a = recent[0], dt = Math.max(16, end.t - a.t) / 1000;
  const v = (k) => (recent.length < 2 ? 0 : Math.max(-cap, Math.min(cap, (end[k] - a[k]) / dt)));
  return { vx: v('x'), vy: v('y') };
}

/**
 * The gesture of one press: feed it the pointer's points ({x, y, t}, client px and ms) and it says what they mean.
 *   mode: 'pending' (pressed on a character, may become a pick-up) → 'grabbed' → 'done';
 *         'none' (not a pick-up: a press elsewhere, a touch that moved, so a scroll) → 'done'.
 * move() → 'grab' (picked up now), 'drag' (moving it), 'scroll' (a touch gave up the hold) or null.
 * hold(t) → true if the still hold just picked it up. up() → {type: 'throw', vx, vy} | {type: 'tap'} | null.
 * cancel() → {type: 'drop'} if it was holding the character, else null.
 */
export class Gesture {
  constructor(p, { pointerType = 'mouse', id = 1, onActor = false, canGrab = true } = {}) {
    this.pointerType = pointerType; this.id = id;
    this.start = p; this.last = p; this.far = 0;
    this.mode = onActor && canGrab ? 'pending' : 'none';
    this.track = [];
  }
  get grabbed() { return this.mode === 'grabbed'; }
  get pending() { return this.mode === 'pending'; }
  _see(p) { this.last = p; this.far = Math.max(this.far, Math.hypot(p.x - this.start.x, p.y - this.start.y)); }
  _grab(p) { this.mode = 'grabbed'; this.track = [p]; }
  move(p) {
    this._see(p);
    if (this.mode === 'grabbed') {
      this.track.push(p);
      if (this.track.length > 12) this.track.shift();
      return 'drag';
    }
    if (this.mode !== 'pending') return null;
    // A finger that moves before the hold completes is scrolling the page: let it.
    if (this.pointerType === 'touch') { if (this.far > GESTURE.holdSlop) { this.mode = 'none'; return 'scroll'; } return null; }
    if (this.far > GESTURE.dragSlop) { this._grab(p); return 'grab'; }
    return null;
  }
  hold(t) {
    if (this.mode !== 'pending' || t - this.start.t < GESTURE.holdMs - 1) return false;
    this._grab({ ...this.last, t });
    return true;
  }
  up(p, cap) {
    const was = this.mode;
    this._see(p);
    this.mode = 'done';
    if (was === 'grabbed') {
      // The release usually repeats the last move's position: only a new position is a sample.
      const end = this.track[this.track.length - 1];
      if (p.x !== end.x || p.y !== end.y) this.track.push(p);
      return { type: 'throw', ...throwVelocity(this.track, cap, p.t) };
    }
    if (this.far <= GESTURE.tapSlop && p.t - this.start.t <= GESTURE.tapMs) return { type: 'tap' };
    return null;
  }
  cancel() {
    const was = this.mode;
    this.mode = 'done';
    return was === 'grabbed' ? { type: 'drop' } : null;
  }
}

const FLAGS = ['surface', 'climbable', 'perch', 'hide', 'occluder', 'avoid'];
const SELECTOR = FLAGS.map((f) => `[data-pixel-${f}]`).join(',');
const ORDERS = ['goTo', 'hideBehind', 'perform', 'shoo', 'pickUp', 'drop', 'exit', 'enter'];
const CARRY_POINTS = ['carry', 'beak', 'handR', 'hand', 'nose', 'head', 'top'];
const ROLES = {
  idle: ['idle'], walk: ['walk', 'waddle', 'trot', 'travel'], run: ['run', 'trot', 'travel', 'walk', 'waddle'],
  rush: ['rush'], jump: ['jump'], fall: ['fall'], sit: ['sit'], duck: ['duck', 'sneak'], peek: ['peek'], climb: ['climb'],
  react: ['honk', 'wave', 'hop'],
};
// Views: a character whose bundle has "<anim>@front" / "@back" animations (a spec with "views") can face
// the viewer or turn its back. Moving along the page is always seen from the side: these steps turn back first.
const VIEWS = { viewer: 'front', front: 'front', away: 'back', back: 'back', side: 'side' };
const SIDE_STEPS = new Set(['walk', 'leave', 'jump', 'climb']);
const SIDE_ROLES = new Set(['walk', 'run', 'rush', 'climb', 'jump', 'fall']);
const DEFAULT_BEHAVIOURS = 'wander sit hide climb jump gaze';
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[(Math.random() * xs.length) | 0];
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const snap = (v) => { const d = globalThis.devicePixelRatio || 1; return Math.round(v * d) / d; };

// ---------- world: the page as platforms, walls and hiding spots ----------

export class World {
  constructor(stage) {
    this.stage = stage;
    this.dirty = true;
    this.version = 0;
    this.items = [];
    this.platforms = [];
    this._radius = new WeakMap();
  }

  observe() {
    const mark = () => { this.dirty = true; };
    this._ro = new ResizeObserver(mark);
    this._ro.observe(document.documentElement);
    this._mo = new MutationObserver((records) => {
      if (records.some((r) => !this.stage.contains(r.target))) mark();
    });
    this._mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: FLAGS.map((f) => `data-pixel-${f}`).concat(['hidden']) });
    this._listeners = [['resize', mark], ['load', mark], ['transitionend', mark], ['animationend', mark]];
    for (const [t, fn] of this._listeners) addEventListener(t, fn, true);
    document.fonts?.ready.then(mark);
    this._observed = new Set();
  }

  disconnect() {
    this._ro?.disconnect(); this._mo?.disconnect();
    for (const [t, fn] of this._listeners || []) removeEventListener(t, fn, true);
  }

  /** Mark the page layout as changed (call after moving elements yourself, e.g. with transforms). */
  invalidate() { this.dirty = true; }

  /** Read every opted-in element's box (one batch of layout reads) and rebuild the platforms. */
  read() {
    const o = this.stage.getBoundingClientRect();
    const ox = o.left + scrollX, oy = o.top + scrollY;   // stage origin in document coordinates
    this.origin = { x: ox, y: oy };
    const els = [...document.querySelectorAll(SELECTOR)].filter((el) => !this.stage.contains(el));
    for (const el of els) if (!this._observed.has(el)) { this._ro.observe(el); this._observed.add(el); }
    const de = document.documentElement;
    this.left = -ox;   // the page's left edge (the stage may sit further right, in a centred column say)
    this.width = Math.max(de.scrollWidth, innerWidth) - ox;
    this.height = Math.max(de.scrollHeight, innerHeight) - oy;
    this.items = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;   // hidden or collapsed
      let radius = this._radius.get(el);
      if (radius == null) { radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; this._radius.set(el, radius); }
      const has = (f) => el.hasAttribute(`data-pixel-${f}`);
      this.items.push({
        el, l: r.left + scrollX - ox, t: r.top + scrollY - oy, r: r.right + scrollX - ox, b: r.bottom + scrollY - oy, radius,
        surface: has('surface') || has('climbable') || has('perch'), climbable: has('climbable'), perch: has('perch'),
        animated: el.getAttribute('data-pixel-surface') === 'animated',
        hide: has('hide'), occluder: has('occluder'), avoid: has('avoid'),
      });
    }
    // Platforms: the top edge of each surface (off its rounded corners), plus the floor.
    this.platforms = this.items.filter((it) => it.surface && !it.avoid).map((it) => ({
      el: it.el, item: it, animated: it.animated, x1: it.l + Math.min(it.radius, (it.r - it.l) / 4), x2: it.r - Math.min(it.radius, (it.r - it.l) / 4), y: it.t,
    }));
    if ((this.stage.getAttribute('floor') ?? 'document') !== 'none') this.platforms.push({ el: null, floor: true, x1: this.left, x2: this.width, y: this.height });
    this.dirty = false;
    this.version++;
  }

  /**
   * Re-read only the elements marked data-pixel-surface="animated" (moved by CSS animations or
   * transforms, which no observer reports), updating their items and platforms in place.
   * Each platform's dx is how far it moved since the last frame.
   */
  readAnimated() {
    const o = this.origin;
    for (const p of this.platforms) {
      if (!p.animated) continue;
      const it = p.item, r = it.el.getBoundingClientRect();
      const l = r.left + scrollX - o.x, t = r.top + scrollY - o.y;
      p.dx = l - it.l;
      it.l = l; it.r = r.right + scrollX - o.x; it.t = t; it.b = r.bottom + scrollY - o.y;
      const inset = Math.min(it.radius, (it.r - it.l) / 4);
      p.x1 = it.l + inset; p.x2 = it.r - inset; p.y = it.t;
    }
  }

  /** The viewport in stage coordinates. */
  viewport() {
    const o = this.origin ?? { x: 0, y: 0 };
    return { l: scrollX - o.x, t: scrollY - o.y, r: scrollX - o.x + innerWidth, b: scrollY - o.y + innerHeight };
  }

  platformOf(el) { return this.platforms.find((p) => (el ? p.el === el : p.floor)); }

  /** The first platform at or below y that contains x (where something falling at x lands). */
  below(x, y, except) {
    let best = null;
    for (const p of this.platforms) if (p !== except && x >= p.x1 && x <= p.x2 && p.y >= y - 0.5 && (!best || p.y < best.y)) best = p;
    return best;
  }
}

// ---------- the stage ----------

// (Base class guard lets Node import the helpers for tests.)
const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

export class PixelStage extends Base {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000;contain:style}
      .layer{position:absolute;left:0;top:0;z-index:0}
      button{position:fixed;z-index:1;pointer-events:auto;font:13px/1.2 system-ui,sans-serif;padding:8px 12px;border-radius:999px;
        border:1px solid #0003;background:#fffe;color:#222;box-shadow:0 1px 4px #0002;cursor:pointer;min-height:36px}
      button:focus-visible{outline:3px solid #4b7bec;outline-offset:2px}
      :host([controls=none]) button{display:none}
      :host(:not([controls])) button,:host([controls=bottom-right]) button{right:12px;bottom:calc(12px + env(safe-area-inset-bottom))}
      :host([controls=bottom-left]) button{left:12px;bottom:calc(12px + env(safe-area-inset-bottom))}
      :host([controls=top-right]) button{right:12px;top:12px}
      :host([controls=top-left]) button{left:12px;top:12px}
    </style><div class="layer" aria-hidden="true"><slot></slot></div><button type="button" part="control"></button>`;
    this._button = root.querySelector('button');
    this._button.addEventListener('click', () => (this.paused ? this.resume() : this.pause()));
    this.world = new World(this);
    this._tick = (dt) => this.tick(dt);
  }

  get actors() { return [...this.querySelectorAll('pixel-actor')]; }

  /** The scene playing now ({name, finished, stop}) or null. */
  get scene() { return this._scene ?? null; }

  /**
   * Play a scene: an object, JSON text, or a selector for a <script type="application/json"> holding one.
   * Returns {name, finished: Promise<boolean>, stop()}; a new scene stops the one playing. Throws an Error
   * listing every problem (err.errors = [{path, message}]) if the scene is not valid.
   * `trigger` is the element that set it off: steps can name it "$trigger" (or "$trigger .letter" inside it).
   */
  playScene(scene, { trigger = null } = {}) {
    scene = this._loadScene(scene, 'playScene');
    const names = this._castNames(scene);
    const find = (sel) => {
      if (sel === '$trigger') return trigger;
      if (sel.startsWith('$trigger ')) return trigger?.querySelector(sel.slice(9)) ?? null;
      try { return document.querySelector(sel); } catch { return null; }
    };
    const castEl = (name) => { const el = find(scene.cast?.[name] ?? `#${name}`); return el instanceof PixelActor ? el : null; };
    const cast = names.map(castEl).filter(Boolean);
    this._scene?.stop();
    let stop;
    const stopped = new Promise((r) => (stop = r));
    const was = cast.map((a) => a.directed);
    if (scene.directed !== false) for (const a of cast) a.directed = true;
    const env = {
      actor: (n) => (names.includes(n) ? castEl(n) : null),
      element: find,
      beside: (a, b) => ({ x: b.x + (a.x < b.x ? -1 : 1) * (a.W + b.W) * 0.4, y: b.y - 1 }),
      along: (el, at) => { const r = el.getBoundingClientRect(), o = this.getBoundingClientRect(); return { x: r.left - o.left + r.width * (0.08 + 0.84 * at), y: r.top - o.top - 1 }; },   // off the rounded corners
      wait: (ms) => new Promise((r) => setTimeout(() => r(true), ms)),
      listen: (t, ev, timeout) => new Promise((r) => {
        const el = t === 'stage' ? this : t;
        if (!el?.addEventListener) return r(false);
        let timer = 0;
        const on = () => { clearTimeout(timer); r(true); };
        const type = sceneEventName(ev, isPixelEl(el));
        el.addEventListener(type, on, { once: true });
        if (timeout) timer = setTimeout(() => { el.removeEventListener(type, on); r(false); }, timeout);
        stopped.then(() => { clearTimeout(timer); el.removeEventListener(type, on); });
      }),
      emit: (name, detail) => emit(this, 'sceneevent', { scene: scene.name, name, detail }),
      onStep: (step, path) => emit(this, 'scenestep', { scene: scene.name, step, path }),
      stopped,
    };
    // Characters must be loaded and standing somewhere before they take orders.
    const placed = (a) => new Promise((r) => { const t0 = performance.now(); const poll = () => (a._placed || performance.now() - t0 > 10000 ? r() : setTimeout(poll, 50)); poll(); });
    const handle = { name: scene.name ?? null, source: scene, trigger, stop: () => stop(), finished: null };
    handle.finished = Promise.race([Promise.all(cast.map(placed)).then(() => runScene(scene, env)), stopped.then(() => false)])
      .then((completed) => {
        cast.forEach((a, i) => { a.directed = was[i]; a.hurry(1); });
        if (this._scene === handle) this._scene = null;
        stop();
        emit(this, 'sceneend', { scene: scene.name, completed });
        return completed;
      });
    this._scene = handle;
    return handle;
  }

  _castNames(scene) { return scene?.cast && typeof scene.cast === 'object' ? Object.keys(scene.cast) : this.actors.map((a) => a.id).filter(Boolean); }

  /** An object, JSON text or a selector → a checked scene object (throws listing the problems). */
  _loadScene(scene, who) {
    if (typeof scene === 'string') {
      const t = scene.trim();
      const text = t.startsWith('{') ? t : document.querySelector(t)?.textContent;
      if (text == null) throw new Error(`${who}: nothing found for "${t}"`);
      scene = JSON.parse(text);
    }
    const errors = checkScene(scene, this._castNames(scene));
    if (errors.length) {
      const e = new Error(`${who}: invalid scene\n${errors.map((x) => `  ${x.path}: ${x.message}`).join('\n')}`);
      e.errors = errors;
      throw e;
    }
    return scene;
  }

  /**
   * Arm a scene with a "trigger": {"event", "on", "once"?, "preventDefault"?}. When the event happens it plays
   * (stopping any other scene; ignored while this one is already playing). "on" is a selector (matched on
   * elements added later too), a cast name or "stage"; the "visible" event fires when a matching element is
   * half in view. Returns {disarm()}. <script type="application/json" data-pixel-scene> scenes are armed for you.
   */
  arm(scene) {
    scene = this._loadScene(scene, 'arm');
    const t = scene.trigger;
    if (!t) throw new Error('arm: the scene has no "trigger"');
    let fired = false, off = () => {};
    const fire = (el, e) => {
      if ((t.once && fired) || this._scene?.source === scene) return;
      fired = true;
      if (t.preventDefault) e?.preventDefault();
      // Next task: let the page's own handlers for this event run first (showing the letter, say).
      setTimeout(() => { try { this.playScene(scene, { trigger: el }); } catch (err) { console.error(err); } });
      if (t.once) off();
    };
    const castEl = this._castNames(scene).includes(t.on) ? document.querySelector(scene.cast?.[t.on] ?? `#${t.on}`) : null;
    if (t.on === 'stage' || castEl) {
      const el = castEl ?? this, h = (e) => fire(el, e), type = sceneEventName(t.event, isPixelEl(el));
      el.addEventListener(type, h);
      off = () => el.removeEventListener(type, h);
    } else if (t.event === 'visible') {
      const io = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { io.unobserve(en.target); fire(en.target); } }, { threshold: 0.5 });
      for (const el of document.querySelectorAll(t.on)) io.observe(el);
      off = () => io.disconnect();
    } else {
      // Delegated on the document (capture), so it works for elements added later and pages that stop propagation.
      // An actor or the stage matching the selector answers to the pixel- name ("tap" → "pixel-tap"), other elements to t.event.
      const pixel = sceneEventName(t.event, true);
      const h = (e) => { const el = e.target?.closest?.(t.on); if (el && e.type === sceneEventName(t.event, isPixelEl(el))) fire(el, e); };
      const types = [...new Set([t.event, pixel])];
      for (const type of types) document.addEventListener(type, h, true);
      off = () => { for (const type of types) document.removeEventListener(type, h, true); };
    }
    const armed = { scene, disarm: () => { off(); this._armed?.delete(armed); } };
    (this._armed ??= new Set()).add(armed);
    return armed;
  }

  get paused() { return this._paused; }

  connectedCallback() {
    this._paused = store.get('pixel-stage:paused') === '1';
    this._label();
    this.world.observe();
    this._rm = matchMedia('(prefers-reduced-motion: reduce)');
    this._onRm = () => this._sync();
    this._rm.addEventListener?.('change', this._onRm);
    this._input();
    this._scrolling();
    this._sync();
    // Once the page is parsed: arm the triggered scenes, and play <pixel-stage scene="#intro">.
    const auto = () => {
      if (!this.isConnected) return;
      const mine = (el) => { const st = el.closest('pixel-stage'); return st ? st === this : document.querySelector('pixel-stage') === this; };
      for (const el of document.querySelectorAll('script[type="application/json"][data-pixel-scene]')) {
        if (!mine(el) || [...(this._armed ?? [])].some((a) => a.el === el)) continue;
        try { const sc = JSON.parse(el.textContent); if (sc?.trigger) this.arm(sc).el = el; } catch (e) { console.error(`pixel-stage: scene in ${el.id ? `#${el.id}` : 'a script'}:`, e); }
      }
      if (this.hasAttribute('scene')) { try { this.playScene(this.getAttribute('scene')); } catch (e) { console.error(e); } }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else setTimeout(auto);
  }

  disconnectedCallback() {
    clock.remove(this._tick);
    this._scene?.stop();
    for (const a of [...(this._armed ?? [])]) a.disarm();
    this.world.disconnect();
    this._rm?.removeEventListener?.('change', this._onRm);
    this._unscroll?.();
    for (const [t, fn] of this._inputs || []) document.removeEventListener(t, fn, true);
    this._endInput?.();
    if (this._touchGuarded) { document.removeEventListener('touchmove', this._onTouchMove, true); this._touchGuarded = false; }
  }

  pause() { this._paused = true; store.set('pixel-stage:paused', '1'); this._label(); this._sync(); }
  resume() { this._paused = false; store.set('pixel-stage:paused', null); this._label(); this._sync(); }

  _label() {
    const n = this.actors.length;
    const who = this.getAttribute('label') || (n === 1 ? 'character' : 'characters');
    this._button.textContent = `${this._paused ? 'Play' : 'Pause'} ${who}`;
    this._button.setAttribute('aria-pressed', String(!!this._paused));
  }

  /** Run the loop unless paused or the user prefers reduced motion. */
  _sync() {
    this._touchGuard();
    const still = this._paused || reducedMotion();
    for (const a of this.actors) a._setStill(still);
    if (still) clock.remove(this._tick); else clock.add(this._tick);
    if (still) this.tick(0, true);   // place everyone once
  }

  /** One frame: read the page if it changed, then think, move, and write styles. */
  tick(dt, placeOnly = false) {
    const w = this.world;
    if (w.dirty) { w.read(); for (const a of this.actors) a._worldChanged(w); }
    else if (w.platforms.some((p) => p.animated)) w.readAnimated();
    for (const a of this.actors) if (a._ready && !a._placed) a._place(w);
    const s = Math.min(dt, 100) / 1000;
    for (const a of this.actors) if (a._ready) a._update(placeOnly ? 0 : s, w, placeOnly);
    for (const a of this.actors) if (a._ready) a._write(w);
  }

  // ----- scrolling: how fast the reader moves; actors that keep in view catch up when it settles -----
  _scrolling() {
    let lastY = scrollY, lastT = performance.now(), fast = false, timer = 0;
    this.scrollSpeed = 0;
    const settle = () => {
      this.scrollSpeed = 0;
      if (fast) { fast = false; emit(this, 'scrollsettle'); }
      for (const a of this.actors) a._checkInView?.(this.world, true);
    };
    const onScroll = () => {
      const t = performance.now(), dt = Math.max(1, t - lastT);
      const v = ((scrollY - lastY) / dt) * 1000;   // px/s, + is down
      this.scrollSpeed = this.scrollSpeed * 0.6 + v * 0.4;
      lastY = scrollY; lastT = t;
      // "Fast" is more than a screen height and a half per second.
      if (!fast && Math.abs(this.scrollSpeed) > innerHeight * 1.5) {
        fast = true;
        emit(this, 'fastscroll', { speed: Math.round(this.scrollSpeed) });
      }
      clearTimeout(timer);
      timer = setTimeout(settle, 160);
    };
    addEventListener('scroll', onScroll, { passive: true });
    this._unscroll = () => removeEventListener('scroll', onScroll);
  }

  // ----- input: tap or click a character to shoo it; hold or drag it to pick it up; never block other clicks -----
  //
  // The same gestures for every pointer (see Gesture): a tap or click shoos, quick taps are rage taps, a still
  // press of GESTURE.holdMs picks the character up, and letting go throws it. A mouse or pen also picks it up by
  // dragging at once; a finger must hold first, because a swipe that starts on a character is a scroll.
  _input() {
    let g = null, actor = null, off = null, holdTimer = 0, swallow = null, unlock = null;
    const hit = (e) => this.actors.find((a) => a._ready && a._hit(e.clientX, e.clientY, this.world));
    const local = (e) => ({ x: e.clientX + scrollX - this.world.origin.x, y: e.clientY + scrollY - this.world.origin.y });
    const pt = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
    const finish = () => { clearTimeout(holdTimer); unlock?.(); unlock = null; g = null; actor = null; off = null; };
    // While a finger or pen rests on a character: no text selection, callout or magnifier (iOS) from the
    // long press. Scrolling is untouched; the page's own inline styles come back when the press ends.
    const lock = () => {
      const s = document.documentElement.style, keys = ['-webkit-user-select', 'user-select', '-webkit-touch-callout'];
      const was = keys.map((k) => [k, s.getPropertyValue(k), s.getPropertyPriority(k)]);
      for (const k of keys) s.setProperty(k, 'none');
      return () => { for (const [k, v, p] of was) if (v) s.setProperty(k, v, p); else s.removeProperty(k); };
    };
    const grab = (e) => {
      const p = local(e);
      off = { dx: actor.x - p.x, dy: actor.y - p.y };
      actor._grab();
      // A short buzz where supported (Android; not iOS). Chrome refuses it, with a console note, before the first tap.
      if (g.pointerType !== 'mouse' && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(10);
      emit(actor, 'grab', { pointerType: g.pointerType });
    };
    const onDown = (e) => {
      swallow = null;   // a new press: its own click is the page's
      if (g && e.pointerId !== g.id) {
        // A second finger: while waiting for a hold it is a pinch (a zoom, not a pick-up); while holding, ignored.
        if (g.grabbed) return;
        if (g.pending) { finish(); return; }
      }
      if (g) onCancel({ pointerId: g.id });   // a press whose end never arrived (released outside the window)
      if (e.button !== 0) return;
      actor = hit(e) ?? null;
      const canGrab = !!actor && this._grabs(e.pointerType || 'mouse');
      g = new Gesture(pt(e), { pointerType: e.pointerType || 'mouse', id: e.pointerId, onActor: !!actor, canGrab });
      if (!g.pending) return;
      // Never preventDefault here for touch: until the hold completes, a swipe must scroll the page.
      if (g.pointerType !== 'touch') e.preventDefault();   // no text selection or native drag while holding a character
      if (g.pointerType !== 'mouse') unlock = lock();
      holdTimer = setTimeout(() => {
        if (g?.hold(performance.now())) grab({ clientX: g.last.x, clientY: g.last.y });
      }, GESTURE.holdMs);
    };
    const onMove = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const r = g.move(pt(e));
      if (r === 'grab') { clearTimeout(holdTimer); grab(e); }
      else if (r === 'scroll') { clearTimeout(holdTimer); unlock?.(); unlock = null; }
      if (g.grabbed && off) { const p = local(e); actor._dragTo(p.x + off.dx, p.y + off.dy); }
    };
    const onUp = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const a0 = actor, type = g.pointerType;
      const r = g.up(pt(e), (a0?.H ?? 64) * 30);   // capped so a throw stays on the page
      finish();
      if (r?.type === 'throw') {
        a0._throw(r.vx, r.vy);
        emit(a0, 'throw', { vx: Math.round(r.vx), vy: Math.round(r.vy), pointerType: type });
        swallow = pt(e);
        return;
      }
      if (r?.type !== 'tap') return;
      const a = hit(e);
      if (!a) return;
      swallow = pt(e);
      // Taps in quick succession are a burst (rage taps): the character panics instead.
      const det = (a._bursts ??= new BurstDetector());
      const b = det.hit(performance.now());
      emit(a, 'tap', { count: b.count, pointerType: type });
      if (b.burst) a._rage({ ...b, min: det.min, pointerType: type }, local(e)); else a.shoo(local(e));
    };
    // The browser took the pointer (a scroll began, a system gesture): a held character drops where it is.
    // Except on touch while holding (or about to hold) a character: iOS cancels the pointer stream when its own
    // long-press begins (about half a second in, just after our 400 ms hold), yet keeps sending touch events for
    // the same finger. The gesture then carries on from those (see onTouch) until the finger lifts.
    const onCancel = (e) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.pointerType === 'touch' && (g.grabbed || g.pending) && fingerDown) { g.viaTouch = true; return; }
      const a0 = actor, type = g.pointerType;
      const r = g.cancel();
      finish();
      if (r) { a0._throw(0, 0); emit(a0, 'throw', { vx: 0, vy: 0, pointerType: type }); }
    };
    // Once a character is held, the finger moves it instead of the page. This listener is not passive because
    // the decision has to be possible on the first move after the hold; it does nothing otherwise. It is only
    // registered while a finger can pick a character up (see _touchGuard): WebKit decides at touchstart whether
    // a touch's moves can be cancelled, so it cannot be added once a hold completes.
    this._onTouchMove = (e) => {
      if (g?.viaTouch) { const t = e.touches[0]; if (t) onMove({ pointerId: g.id, clientX: t.clientX, clientY: t.clientY }); }
      if (g?.grabbed && e.cancelable) e.preventDefault();
    };
    // Whether a finger is on the screen (so a cancelled pointer can carry on as touch), and the end of a gesture
    // that carried on as touch: lifting the finger releases (a throw), a touchcancel drops.
    let fingerDown = false;
    const onTouch = (e) => {
      fingerDown = e.touches.length > 0;
      if (!g?.viaTouch || e.type === 'touchstart' || fingerDown) return;
      const t = e.changedTouches[0], at = { pointerId: g.id, clientX: t?.clientX ?? g.last.x, clientY: t?.clientY ?? g.last.y };
      if (e.type === 'touchend') onUp(at);
      else { g.viaTouch = false; onCancel(at); }
    };
    // A long press on a character (held or waiting for the hold) opens no context menu (Android, desktop touch).
    const onMenu = (e) => { if (g && g.mode !== 'none' && g.pointerType !== 'mouse') e.preventDefault(); };
    // The click that follows a tap on a character or a throw does not reach the page; the click of any later press
    // does (a new press clears this). Not matched by position: WebKit moves a tap's click onto a nearby link.
    const onClick = (e) => {
      const s = swallow;
      if (!s || performance.now() - s.t > 500) return;
      swallow = null;
      e.preventDefault(); e.stopPropagation();
    };
    this._inputs = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onCancel],
      ['contextmenu', onMenu], ['click', onClick], ['touchstart', onTouch], ['touchend', onTouch], ['touchcancel', onTouch]];
    for (const [t, fn] of this._inputs) document.addEventListener(t, fn, { capture: true, passive: t === 'pointermove' || t.startsWith('touch') ? true : undefined });
    this._endInput = finish;
    this._touchGuard();
  }

  /** `grab`: 'on' (default), 'mouse' (mouse and pen only) or 'off'. */
  get grab() { const v = this.getAttribute('grab'); return v === 'off' || v === 'mouse' ? v : 'on'; }
  set grab(v) { this.setAttribute('grab', String(v)); }

  /** Whether a press with this pointer type can pick a character up now. */
  _grabs(pointerType) {
    const mode = this.grab;
    return mode !== 'off' && !(mode === 'mouse' && pointerType === 'touch') && !this._paused && !reducedMotion();
  }

  /**
   * The page-wide non-passive touchmove listener exists only while a finger can pick a character up: grab="on",
   * not paused, no reduced motion. Otherwise the stage adds no listener that could delay a scroll.
   */
  _touchGuard() {
    const want = !!this._onTouchMove && this.isConnected !== false && this._grabs('touch');
    if (want === !!this._touchGuarded) return;
    this._touchGuarded = want;
    if (want) document.addEventListener('touchmove', this._onTouchMove, { capture: true, passive: false });
    else document.removeEventListener('touchmove', this._onTouchMove, true);
  }

  attributeChangedCallback(name) { if (name === 'grab') this._touchGuard(); }
  static observedAttributes = ['grab'];
}

// ---------- an actor: a sprite with a body in the world and a small brain ----------

export class PixelActor extends Base {
  static observedAttributes = ['src', 'size', 'alt', 'skin'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{position:absolute;left:0;top:0;display:block;visibility:hidden;will-change:transform}
      :host([data-ready]){visibility:visible}
      :host([offstage]){visibility:hidden}
      .body{position:relative}
      pixel-sprite{display:block}
      .say{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:600 12px/1.2 system-ui,sans-serif;
        background:#fff;color:#222;border:2px solid #222;border-radius:8px;padding:3px 7px;opacity:0;transition:opacity .15s}
      .say.on{opacity:1}
      .say:not(.on){display:none}
    </style><div class="box"><div class="body"><pixel-sprite part="sprite"></pixel-sprite><slot name="carry"></slot></div></div><div class="say" part="bubble"></div>`;
    this.sprite = root.querySelector('pixel-sprite');
    this._box = root.querySelector('.box');   // clips the body where it is slid out past the page's edge (see _write)
    this._body = root.querySelector('.body');
    this._bubble = root.querySelector('.say');
    this.x = 0; this.y = 0; this.facing = 1; this.activity = 'idle'; this.view = 'side';
    this.plan = []; this.behind = new Set(); this._orders = [];
    this.sprite.addEventListener('pixel-ready', () => this._onReady());
    this.sprite.addEventListener('pixel-event', (e) => this._onEvent(e.detail));
    this.sprite.addEventListener('pixel-end', (e) => {
      if (this._step?.waitEnd === e.detail.anim) this._step.done = true;
      if (this._turning?.anim === e.detail.anim) this._endTurn();
    });
    // The inner sprite is an implementation detail: its events (composed, so they would cross the shadow
    // boundary) stop here, and a listener on the actor sees each logical event once, from the actor.
    for (const n of SPRITE_EVENTS) root.addEventListener(`pixel-${n}`, (e) => e.stopPropagation());
  }

  connectedCallback() {
    for (const a of ['src', 'size', 'alt', 'skin']) if (this.hasAttribute(a)) this.sprite.setAttribute(a, this.getAttribute(a));
    if (!this.hasAttribute('size')) this.sprite.setAttribute('size', '64');
    this.sprite.setAttribute('states', 'off');   // the stage chooses animations itself
    this.sprite.setAttribute('burst', 'off');    // the stage counts taps and fires the actor's own pixel-burst
    // `loading` is not forwarded: an actor always loads at once. The stage needs its size and animations to
    // place it and route it, and it walks on and off the screen; lazy loading is for plain sprites.
  }
  attributeChangedCallback(name, _o, v) {
    if (!this.sprite) return;
    if (v == null) this.sprite.removeAttribute(name); else this.sprite.setAttribute(name, v);
  }

  get stage() { return this.closest('pixel-stage'); }

  // legacy name, remove after 0.2.0-alpha: `state` is `activity` (idle, walking, performing, …).
  get state() { return this.activity; }
  set state(v) { this.activity = v; }

  _onReady() {
    const b = this.sprite.bundle;
    const parse = Object.fromEntries((this.getAttribute('anims') || '').split(/[\s,]+/).filter(Boolean).map((p) => p.split('=')));
    this.anims = {};
    for (const [role, names] of Object.entries(ROLES)) this.anims[role] = [parse[role], ...names].find((n) => n && b.animations[n]) || null;
    this.anims.idle ??= Object.keys(b.animations)[0];
    const allowed = (this.getAttribute('behaviours') || DEFAULT_BEHAVIOURS).split(/\s+/);
    this.can = (what) => allowed.includes(what) && (
      what === 'jump' ? !!this._jumpTimes() : what === 'climb' ? !!(this.anims.climb && b.animations[this.anims.climb].speedY) :
        what === 'sit' ? !!this.anims.sit : what === 'hide' ? !!(this.anims.duck || this.anims.idle) : true);
    this.W = this.sprite.displaySize.width; this.H = this.sprite.displaySize.height;
    this._endTurn(); this.view = 'side';
    this._ready = true;
    this._placed = false;
    const stage = this.stage;
    if (stage) { stage._label(); if (stage.paused || reducedMotion()) stage.tick(0, true); }
  }

  /** {launch, land, flightMs, totalMs} for the jump animation, from its baked events. */
  _jumpTimes() {
    const a = this.anims?.jump && this.sprite.bundle.animations[this.anims.jump];
    const launch = a?.events?.find((e) => e.name === 'launch')?.frame, land = a?.events?.find((e) => e.name === 'land')?.frame;
    if (launch == null || land == null) return null;
    const ms = (f) => (a.durations ? a.durations[f] : 1000 / a.fps) / this.sprite.effectiveRate;
    let flight = 0, total = 0;
    for (let f = 0; f < a.frames; f++) { if (f >= launch && f < land) flight += ms(f); total += ms(f); }
    return { launch, land, flightMs: flight, totalMs: total };
  }

  _setStill(still) {
    this._still = still;
    if (still) this.sprite.setAttribute('paused', ''); else this.sprite.removeAttribute('paused');
  }

  // ----- public API -----

  /** Walk (jumping, dropping and climbing as needed) to an element's top or a point, then sit, hide or idle. */
  goTo(target, { then = 'idle' } = {}) {
    const w = this.stage?.world;
    if (!w || !this._ready) return false;
    if (this._busy()) { this._pending = () => this.goTo(target, { then }); return true; }
    let dest, x;
    if (target instanceof Element) {
      const it = w.items.find((i) => i.el === target);
      if (it?.hide && then === 'hide') return this.hideBehind(target);
      dest = w.platformOf(target); x = dest ? (dest.x1 + dest.x2) / 2 : null;
    } else if (target && 'x' in target) { dest = w.below(target.x, target.y ?? 0); x = target.x; }
    if (!dest) return false;
    const last = then === 'sit' && this.can('sit') ? this._sitStep(dest) : { type: 'idle', ms: rand(1500, 3000) };
    const path = this._route(dest, last.x ?? x, w);
    if (!path) return false;
    this.plan = [...path, last, { type: 'arrive' }];
    this._step = null;
    return true;
  }

  /** Go and hide behind a data-pixel-hide element, peeking out now and then. */
  hideBehind(el) {
    if (this._busy()) { this._pending = () => this.hideBehind(el); return true; }
    const w = this.stage?.world;
    const spot = w && this._hideSpot(w.items.find((i) => i.el === el), w);
    if (!spot) return false;
    const path = this._route(spot.p, spot.x, w);
    if (!path) return false;
    this.plan = [...path, { type: 'hide', item: spot.item, ms: rand(4000, 7000) }, { type: 'arrive' }];
    this._step = null;
    return true;
  }

  /** Play one of the bundle's own animations where it stands: a one-shot until it ends, a loop for `ms`. Then carry on. */
  perform(name, { ms = 2400 } = {}) {
    if (!this._ready || !this.sprite.bundle?.animations?.[name]) return false;
    if (this._busy()) { this._pending = () => this.perform(name, { ms }); return true; }
    this.plan = [{ type: 'perform', name, ms }];
    this._step = null;
    return true;
  }

  /** Show a speech bubble above the head (or beak) for ms milliseconds. */
  say(text, ms = 1800) {
    this._bubble.textContent = text;
    this._bubble.classList.add('on');
    this._bubbleW = null;
    this._sayUntil = performance.now() + ms;
    return new Promise((ok) => setTimeout(() => ok(true), ms));
  }

  /**
   * Turn to face 'left', 'right', another actor, or an element; or turn toward the reader ('viewer'), away
   * from them ('away') and back ('side') if the character has those views. Turning returns a promise.
   */
  face(what) {
    if (typeof what === 'string' && what in VIEWS) return this._turnTo(VIEWS[what]);
    if (what === 'left' || what === 'right') { this.facing = what === 'left' ? -1 : 1; this._turnTo('side'); return true; }
    const box = (el) => { const r = el.getBoundingClientRect(), o = this.stage.getBoundingClientRect(); return r.left + r.width / 2 - o.left; };
    const x = what instanceof PixelActor ? what.x : what instanceof Element && this.stage ? box(what) : what?.x;
    if (x == null || x === this.x) return false;
    this.facing = x > this.x ? 1 : -1;
    return true;
  }

  /** The views this character has besides the side: ['front', 'back'] from its bundle's "@front"/"@back" animations. */
  get views() {
    const names = Object.keys(this.sprite.bundle?.animations ?? {});
    return [...new Set(names.filter((n) => n.startsWith('turn@')).map((n) => n.slice(5)))];
  }

  /** Start turning to a view ('side', 'front', 'back'); resolves true when the turn is done, false if it has no such view. */
  _turnTo(view) {
    if (!this._ready) return Promise.resolve(false);
    if (view !== 'side' && !this.views.includes(view)) return Promise.resolve(false);
    if (view === this.view && !this._turning) return Promise.resolve(true);
    const from = this.view, a = this.sprite.bundle.animations;
    const anim = view === 'side' ? `unturn@${from}` : `turn@${view}`;
    this._endTurn();
    this.view = view;
    if (!a[anim] || reducedMotion() || this._still) return Promise.resolve(true);
    this.sprite.play(anim, { once: true });
    const ms = (a[anim].frames / a[anim].fps) * 1000 / (this.sprite.effectiveRate || 1);
    return new Promise((done) => {
      this._turning = { anim, done, timer: setTimeout(() => this._endTurn(), ms + 400) };
    });
  }

  _endTurn() {
    const t = this._turning;
    if (!t) return;
    this._turning = null;
    clearTimeout(t.timer);
    t.done(true);
  }

  /**
   * In a hurry: everything plays `rate` times faster and it moves that much faster (feet still planted), and walks
   * become runs. hurry(1) to calm down. Scenes use it for a step's "speed".
   */
  hurry(rate = 1.6) {
    this._hurry = rate > 1 ? rate : 0;
    this._boost(Math.max(1, Math.min(4, rate)), 'hurry');
    return true;
  }

  /** What it is carrying (the page element it picked up), or null. */
  get carrying() { return this._carry?.el ?? null; }

  /**
   * Walk over to an element (any element: a letter beside a form, an icon) and pick it up. A copy rides at
   * the beak or hand (the `carry` point if the figure has one); the original is hidden, keeping its space.
   */
  pickUp(el) {
    const w = this.stage?.world;
    if (!w || !this._ready || this.offstage || this._carry || !(el instanceof Element)) return false;
    if (this._busy()) { this._pending = () => this.pickUp(el); return true; }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cx = r.left + scrollX - w.origin.x + r.width / 2, by = r.bottom + scrollY - w.origin.y;
    // Stand on the surface nearest the element's bottom edge (above or below it) that spans it.
    const near = w.platforms.filter((p) => cx >= p.x1 - this.W && cx <= p.x2 + this.W)
      .sort((a, b) => Math.abs(a.y - by) + (a.y < by ? this.H * 0.5 : 0) - Math.abs(b.y - by) - (b.y < by ? this.H * 0.5 : 0));
    for (const p of near.slice(0, 4)) {
      const path = this._route(p, cx, w);
      if (path) {
        this.plan = [...path, { type: 'pickup', el }, { type: 'idle', ms: rand(600, 1200) }];
        this._step = null;
        return true;
      }
    }
    return false;
  }

  /** Put down what it carries: 'here' (at its feet, where it stays) or 'back' (where it came from). */
  drop(how = 'here') {
    if (!this._carry || !this._ready) return false;
    if (this._busy()) { this._pending = () => this.drop(how); return true; }
    this.plan = [{ type: 'drop', how }, { type: 'idle', ms: rand(600, 1200) }];
    this._step = null;
    return true;
  }

  /**
   * Leave the screen by its left or right edge ('auto': the nearer one): along a surface that reaches the
   * edge, hopping down when one ends. Off screen it is `offstage` (hidden); anything carried is delivered
   * (a 'deliver' event). Undirected characters come back on their own a few seconds later.
   */
  exit(side = 'auto') {
    const w = this.stage?.world;
    if (!w || !this._ready || this.offstage) return false;
    if (this._busy()) { this._pending = () => this.exit(side); return true; }
    const vp = w.viewport();
    if (side !== 'left' && side !== 'right') side = this.x < (vp.l + vp.r) / 2 ? 'left' : 'right';
    const dir = side === 'left' ? -1 : 1;
    const reaches = (p) => (dir < 0 ? p.x1 <= vp.l + this.W / 2 : p.x2 >= vp.r - this.W / 2);
    let path = [];
    if (!this.platform || !reaches(this.platform)) {
      const ps = w.platforms.filter((p) => reaches(p) && p.y > vp.t + this.H && p.y <= vp.b + 2)
        .sort((a, b) => Math.abs(a.y - this.y) - Math.abs(b.y - this.y));
      for (const p of ps.slice(0, 4)) { const r = this._route(p, dir < 0 ? p.x1 : p.x2, w, true); if (r) { path = r; break; } }
    }
    this.plan = [...path, { type: 'leave', dir }];
    this._step = null;
    return true;
  }

  /**
   * Come back on screen: walk in from the 'left' or 'right' edge along a visible surface that reaches it,
   * or drop in from the top ('top', or onto a given element's surface). 'auto' tries the sides first.
   */
  enter(from = 'auto') {
    const w = this.stage?.world;
    if (!w || !this._ready || !this.offstage) return false;
    const vp = w.viewport();
    const seen = (p) => p.y > vp.t + this.H && p.y <= vp.b + 2 && Math.min(p.x2, vp.r) - Math.max(p.x1, vp.l) > this.W;
    const sides = from === 'left' || from === 'right' ? [from] : from === 'auto' ? (Math.random() < 0.5 ? ['left', 'right'] : ['right', 'left']) : [];
    this._returnAt = 0;
    for (const side of sides) {
      const dir = side === 'left' ? 1 : -1;   // the way it walks in
      const ps = w.platforms.filter((p) => seen(p) && (side === 'left' ? p.x1 <= vp.l + 2 : p.x2 >= vp.r - 2)).sort((a, b) => b.y - a.y);
      if (!ps.length) continue;
      const p = ps[0];
      this._onstage();
      this.platform = p; this.y = p.y; this.facing = dir;
      this.x = side === 'left' ? vp.l - this.W / 2 - 2 : vp.r + this.W / 2 + 2;
      this.plan = [{ type: 'walk', x: clampTo(p, side === 'left' ? vp.l + this.W * 1.5 : vp.r - this.W * 1.5, this.W * 0.5), p, free: true }];
      this._step = null;
      return true;
    }
    // From the top: onto the element's surface, or a visible one.
    const want = from instanceof Element ? w.platformOf(from) : null;
    const visible = w.platforms.filter(seen);
    const p = want ?? (visible.length ? pick(visible) : null);
    if (!p) return false;
    this._onstage();
    this.x = clampTo(p, (Math.max(p.x1, vp.l) + Math.min(p.x2, vp.r)) / 2 + rand(-1, 1) * this.W, this.W * 0.5);
    this.y = Math.min(p.y - this.H, vp.t - 4);
    this.plan = [];
    this._fall(0);
    this._vy = this.H * 4;
    return true;
  }

  _onstage() {
    this.offstage = false;
    this.removeAttribute('offstage');
    emit(this, 'enter');
  }

  _offstage() {
    this.offstage = true;
    this.setAttribute('offstage', '');
    this.platform = null; this.behind.clear();
    this._setActivity('offstage');
    this._returnAt = performance.now() + rand(5000, 9000);
    const c = this._carry;
    if (c) { this._carry = null; c.clone.remove(); emit(this, 'deliver', { prop: c.el }); }
    emit(this, 'exit');
  }

  /** Start carrying el: a copy (styled like it) flies from its place to the carry point. */
  _take(el) {
    const w = this.stage.world, r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const clone = el.cloneNode(true);
    clone.removeAttribute('id');
    for (const n of clone.querySelectorAll('[id]')) n.removeAttribute('id');
    for (const k of cs) clone.style.setProperty(k, cs.getPropertyValue(k));   // keep its look outside its old ancestors
    Object.assign(clone.style, {
      position: 'absolute', left: '0', top: '0', margin: '0', width: `${r.width}px`, height: `${r.height}px`, boxSizing: 'border-box',
      pointerEvents: 'none', transform: 'none', translate: 'none', rotate: 'none', scale: 'none', visibility: 'visible', transition: 'none', animation: 'none', zIndex: '-1',   // behind the character: the beak overlaps the corner it holds
    });
    clone.slot = 'carry';
    clone.setAttribute('aria-hidden', 'true');
    this.append(clone);
    this._carry = { el, clone, w: r.width, h: r.height, from: { x: r.left + scrollX - w.origin.x, y: r.top + scrollY - w.origin.y }, t0: performance.now(), vis: el.style.visibility };
    el.style.visibility = 'hidden';
    emit(this, 'pickup', { prop: el });
  }

  /** Let go of what it carries: it stays on the stage at its feet, or flies back and the original reappears. */
  _release(how) {
    const c = this._carry, stage = this.stage;
    if (!c || !stage) return;
    this._carry = null;
    const L = this.x - this.W / 2, T = this.y - (this.sprite.groundOffset ?? this.H);
    const at = this._carryAt(c);
    c.clone.removeAttribute('slot');
    c.clone.style.transform = `translate(${L + at.x}px, ${T + at.y}px) rotate(${at.rot}deg)`;
    c.clone.style.zIndex = String(Math.round(this.y) + 1);
    stage.append(c.clone);
    const to = how === 'back' ? c.from : { x: this.x + this.facing * this.W * 0.3 - c.w / 2, y: this.y - c.h };
    requestAnimationFrame(() => {
      c.clone.style.transition = 'transform .3s ease-in';
      c.clone.style.transform = `translate(${to.x}px, ${to.y}px) rotate(0deg)`;
    });
    if (how === 'back') setTimeout(() => { c.clone.remove(); c.el.style.visibility = c.vis; }, 320);
    emit(this, 'drop', { prop: c.el, how });
  }

  /**
   * How the carried thing hangs, relative to the actor's box: held by its near top corner just behind the carry
   * point (a beak tip, a hand), so it hangs forward and down, tipped a little, leaving the beak or hand in view.
   * {x, y} is its top-left; {gx, gy} the held corner inside it (the rotation's pivot).
   */
  _carryAt(c) {
    let p = null;
    for (const n of CARRY_POINTS) if ((p = this.sprite.point(n, { relative: true }))) break;
    p ??= { x: this.W / 2, y: this.H * 0.35 };
    const d = this.facing < 0 ? -1 : 1;
    const gx = d > 0 ? Math.min(c.w * 0.15, 6) : c.w - Math.min(c.w * 0.15, 6), gy = Math.min(c.h * 0.15, 4);
    const hold = { x: p.x - d * this.W * 0.03, y: p.y + this.H * 0.01 };   // in the beak, not on its tip
    return { x: hold.x - gx, y: hold.y - gy, gx, gy, rot: d * 14 };
  }

  /** Directed characters do nothing on their own between orders: they idle where they are (scenes set this). */
  get directed() { return this.hasAttribute('directed'); }
  set directed(v) { this.toggleAttribute('directed', !!v); }

  /**
   * Awaitable orders for scripts and scenes: run('goTo', el, {then}), run('hideBehind', el), run('perform', name, {ms}),
   * run('shoo', from?). Resolves true when the order is carried out (arrived, sitting, hidden, animation played),
   * false if it is impossible or gets interrupted (a tap, a drag, another order to the same character). Waits for
   * the character to land first if it is in the air.
   */
  run(action, ...args) {
    if (!ORDERS.includes(action)) return Promise.reject(new Error(`pixel-actor.run: unknown action "${action}" (${ORDERS.join(', ')})`));
    return new Promise((resolve) => {
      const start = () => {
        if (this._pendingOrder?.start === start) this._pendingOrder = null;
        if (!this[action](...args)) return resolve(false);
        // Done on arrival: before the closing rest (idle, sit, hide), not after it.
        const step = { type: 'done' };
        const rest = this.plan.findLastIndex((st) => ['idle', 'sit', 'hide'].includes(st.type));
        const at = rest >= 0 && this.plan.slice(rest + 1).every((st) => st.type === 'arrive') ? rest : this.plan.length;
        this.plan.splice(at, 0, step);
        this._orders.push({ step, resolve });
      };
      if (!this._ready || !this._placed || this._busy()) {
        this._pendingOrder?.resolve(false);
        this._pending = start; this._pendingOrder = { start, resolve };
      } else start();
    });
  }

  _do_done(st) {
    const i = this._orders.findIndex((o) => o.step === st);
    if (i >= 0) { this._orders[i].resolve(true); this._orders.splice(i, 1); }
    return true;
  }

  /** Orders whose plan was replaced (tap, drag, a new order) end with false. */
  _sweepOrders() {
    if (this._orders.length) this._orders = this._orders.filter((o) => o.step === this._step || this.plan.includes(o.step) || void o.resolve(false));
    if (this._pendingOrder && this._pending !== this._pendingOrder.start) { this._pendingOrder.resolve(false); this._pendingOrder = null; }
  }

  /** Startle: react, then run somewhere away from `from` (stage coordinates). */
  shoo(from = { x: this.x, y: this.y }, { react = true } = {}) {
    const w = this.stage?.world;
    if (!w || !this._ready) return false;
    if (this._busy()) { this._pending = () => this.shoo(from, { react }); return true; }
    this.facing = from.x > this.x ? -1 : 1;
    const away = w.platforms.filter((p) => p.y <= w.viewport().b + this.H && p.y >= w.viewport().t)
      .map((p) => ({ p, x: clampTo(p, from.x > this.x ? p.x1 + this.W : p.x2 - this.W, this.W) }))
      .map((c) => ({ ...c, d: Math.hypot(c.x - from.x, c.p.y - from.y) }))
      .sort((a, b) => b.d - a.d);
    for (const c of away.slice(0, 4)) {
      const path = this._route(c.p, c.x, w, true);
      if (path) {
        this.plan = [...(react && this.anims.react ? [{ type: 'react' }] : []), ...path, { type: 'idle', ms: rand(800, 1600) }];
        this._step = null;
        return true;
      }
    }
    return false;
  }

  /**
   * Rage taps: panic. The character plays faster (the burst's rate) and runs from the taps; a 'burst'
   * event {count, rate} lets pages react. When the taps stop, a 'calm' event, and back to normal speed.
   */
  _rage(b, from) {
    emit(this, 'burst', { count: b.count, rate: b.rate, pointerType: b.pointerType });
    this._boost(b.rate, 'rage');
    if (this.anims.react && b.count % 3 === 0) this.say(['!!', 'HONK!!', '?!'][(b.count / 3) % 3 | 0], 700);
    // Already panicking: keep running (re-planned away from the latest tap) rather than reacting again.
    this.shoo(from, { react: b.count === b.min });
    clearTimeout(this._calmTimer);
    this._calmTimer = setTimeout(() => {
      if (!this._bursts.calm(performance.now())) return;
      this._boost(1, 'rage');
      emit(this, 'calm');
    }, this._bursts.gap + 20);
  }

  /** Temporary speed-ups by reason ('rage', 'catchup'); the largest wins. */
  _boost(rate, why) {
    (this._boosts ??= {})[why] = rate;
    const r = Math.max(1, ...Object.values(this._boosts));
    if (r === 1) this.sprite.removeAttribute('rate'); else this.sprite.setAttribute('rate', String(Math.round(r * 100) / 100));
  }

  /**
   * keep-in-view: if the character has left the screen, come back. Close enough → run there at a
   * boost (feet still planted); far → drop in from the top of the screen onto a visible surface.
   * Checked a few times a second and whenever scrolling settles; never in the middle of a fast scroll.
   */
  _checkInView(w, settled = false) {
    if (!this.hasAttribute('keep-in-view') || this.offstage || this.activity === 'leaving' || this._step?.free || !this._ready || !this._placed || this._still || this._busy() || (this._catching ?? 0) > performance.now()) return;
    const now = performance.now();
    if (!settled && now - (this._lastViewCheck ?? 0) < 300) return;
    this._lastViewCheck = now;
    if (!settled && Math.abs(this.stage?.scrollSpeed ?? 0) > 50) return;   // let the reader finish scrolling
    const vp = w.viewport(), m = this.H * 0.25;
    const top = this.y - (this.sprite.groundOffset ?? this.H), out = this.y < vp.t + m || top > vp.b - m || this.x < vp.l || this.x > vp.r;
    if (out) this.catchUp();
  }

  /** Come back into view now (see keep-in-view). Returns how: 'run', 'drop' or null. */
  catchUp() {
    const w = this.stage?.world;
    if (!w || !this._ready) return null;
    const vp = w.viewport();
    const visible = w.platforms.filter((p) => p.y > vp.t + this.H && p.y < vp.b - 4 && Math.min(p.x2, vp.r) - Math.max(p.x1, vp.l) > this.W);
    if (!visible.length) return null;
    // The visible surface nearest to where the character is.
    const near = (p) => Math.abs(p.y - this.y) + Math.abs(Math.max(p.x1, Math.min(p.x2, this.x)) - this.x);
    const target = visible.sort((a, b) => near(a) - near(b))[0];
    const x = clampTo(target, Math.max(vp.l + this.W, Math.min(vp.r - this.W, this.x)), this.W * 0.5);
    emit(this, 'catchup', { from: { x: this.x, y: this.y } });
    this._catching = performance.now() + 10000;   // at most this long, even if the plan is abandoned
    const done = () => { this._catching = 0; this._boost(1, 'catchup'); };
    clearTimeout(this._catchTimer);
    this._catchTimer = setTimeout(done, 10000);
    const path = this.platform && near(target) < innerHeight * 1.2 ? this._route(target, x, w, true) : null;
    if (path) {
      this._boost(2.5, 'catchup');
      this.plan = [...path, { type: 'call', fn: done }, { type: 'idle', ms: 800 }];
      this._step = null;
      return 'run';
    }
    // Too far to run: drop in from just above the top of the screen.
    this.plan = [{ type: 'call', fn: done }];
    this._step = null;
    this.x = x;
    this.y = vp.t - 4;
    this.facing = x > (vp.l + vp.r) / 2 ? -1 : 1;
    this._fall(0);
    this._vy = this.H * 4;
    return 'drop';
  }

  _do_call(st) { st.fn(); return true; }

  /** In the air, held, or on a wall: new orders wait until the character lands. */
  _busy() { return this.activity === 'falling' || this.activity === 'dragged' || ['jump', 'climb'].includes(this._step?.type); }

  /** Picked up by the pointer: dangle (the fall animation) and follow it. */
  _grab() {
    this.plan = []; this._step = null; this.platform = null; this.behind.clear();
    this._setActivity('dragged');
    this._play('fall');
  }
  _dragTo(x, y) { this.x = x; this.y = y; }
  /** Let go: fly with the throw's velocity and land on whatever is below. */
  _throw(vx, vy) {
    this._fall(vx);
    this._vy = vy;
    this.facing = vx < 0 ? -1 : 1;
  }

  // ----- the body -----

  _worldChanged(w) {
    if (!this._ready) return;
    if (!this._placed) return this._place(w);
    if (['climbing', 'jumping', 'falling', 'dragged', 'leaving'].includes(this.activity) || this._step?.free || this.offstage) return this._remap(w);
    // Stay on the same element; if it went away or moved from under us, fall.
    const p = this.platform && (this.platform.floor ? w.platformOf(null) : w.platformOf(this.platform.el));
    if (p && this.x >= p.x1 - 2 && this.x <= p.x2 + 2) { this.platform = p; this.y = p.y; }
    else if (this.platform) { this._fall(0); }
    this._remap(w);
  }

  /** After the world is re-read, point plan steps at the new platform and item objects (by element). */
  _remap(w) {
    const plat = (p) => (p ? (p.floor ? w.platformOf(null) : w.platformOf(p.el)) : p);
    const item = (it) => (it ? w.items.find((i) => i.el === it.el) : it);
    for (const st of [this._step, ...this.plan]) {
      if (!st) continue;
      if (st.p) st.p = plat(st.p);
      if (st.item) st.item = item(st.item);
      if (('p' in st && !st.p) || ('item' in st && !st.item)) { this.plan = []; if (st === this._step && st.type !== 'jump') this._step = null; break; }
    }
  }

  _place(w) {
    const startSel = this.getAttribute('start');
    const startEl = startSel && document.querySelector(startSel);
    const vp = w.viewport();
    let p = startEl && w.platformOf(startEl);
    if (!p) {
      const inView = w.platforms.filter((q) => !q.floor && q.y > vp.t + this.H && q.y < vp.b && q.x2 - q.x1 > this.W);
      p = inView.length ? pick(inView) : w.platformOf(null) ?? w.platforms[0];
    }
    if (!p) return;
    this.platform = p;
    this.x = clampTo(p, p.floor ? (vp.l + vp.r) / 2 : rand(p.x1, p.x2), this.W);
    this.y = p.y;
    this._placed = true;
    this._setActivity('idle');
    this._play('idle');
    this.setAttribute('data-ready', '');
  }

  _setActivity(s) {
    if (s === this.activity) return;
    const from = this.activity;
    this.activity = s;
    emit(this, 'activity', { from, to: s });
  }

  _play(role, opts) {
    let name = this.anims[role] || this.anims.idle;
    if (this.view !== 'side') {
      const viewed = `${name}@${this.view}`;
      if (SIDE_ROLES.has(role) || !this.sprite.bundle.animations[viewed]) { this._endTurn(); this.view = 'side'; }   // seen from the side
      else if (this._turning) return viewed;   // the turn plays first
      else name = viewed;
    } else if (this._turning && !SIDE_ROLES.has(role) && !opts?.once) return name;
    if (opts?.once) return this.sprite.play(name, opts) && name;
    if (this.sprite.currentAnim !== name) this.sprite.play(name);
    return name;
  }

  _onEvent(d) {
    if (this._step?.type === 'jump' && d.name === 'launch') this._step.airborne = true;
  }

  _hit(cx, cy, w) {
    if (this.offstage) return false;
    const vx = cx + scrollX - w.origin.x, vy = cy + scrollY - w.origin.y;
    const L = this.x - this.W / 2, T = this.y - this.sprite.groundOffset;
    if (vx < L || vx > L + this.W || vy < T || vy > T + this.H) return false;
    if (this._clipped(vx, vy, w)) return false;
    return this.sprite.hitTest(cx, cy);
  }

  _clipped(vx, vy, w) {
    return this._occluders(w).some((it) => vx >= it.l && vx <= it.r && vy >= it.t && vy <= it.b);
  }

  _speed(role) {
    const name = this.anims[role];
    // Faster playback (a boost, a burst) means proportionally faster movement: the feet stay planted.
    return ((name && this.sprite.pxPerSecond(name)) || this.H * (role === 'run' ? 1.4 : 0.5)) * this.sprite.effectiveRate;
  }

  // ----- the brain: run the plan, or choose what to do next -----

  _update(dt, w, placeOnly) {
    // Resized (the size attribute, a new variant loading): speed, jumps and hit areas follow the new box.
    const box = this.sprite.displaySize;
    if (box && (box.width !== this.W || box.height !== this.H)) { this.W = box.width; this.H = box.height; }
    if (!this._placed) return;
    if (this._sayUntil && performance.now() > this._sayUntil) { this._bubble.classList.remove('on'); this._sayUntil = 0; }
    if (placeOnly || this._still) return;
    if (this.activity === 'dragged') return;
    this._checkInView(w);
    if (this.activity === 'falling') return this._fallStep(dt, w);
    // Riding a moving surface: carried along with it; off its end, fall.
    if (this.platform?.animated) {
      this.x += this.platform.dx ?? 0;
      this.y = this.platform.y;
      if (this.x < this.platform.x1 - 2 || this.x > this.platform.x2 + 2) { this._fall(0); return; }
    }
    if (this._pending && !this._busy()) { const run = this._pending; this._pending = null; run(); }
    this._sweepOrders();
    if (this.offstage) {
      while (this.plan[0]?.type === 'done') this._do_done(this.plan.shift());
      if (!this.directed && this._returnAt && performance.now() > this._returnAt) this.enter('auto');
      return;
    }
    if (!this._step) {
      if (!this.plan.length) { if (this.directed) this.plan = [{ type: 'idle', ms: 400 }]; else this._choose(w); }
      this._step = this.plan.shift() || { type: 'idle', ms: 1000 };
      this._step.t = 0;
    }
    const st = this._step;
    // Facing the reader (or away) and about to move along the page: turn to the side first.
    if (SIDE_STEPS.has(st.type) && (this.view !== 'side' || this._turning)) {
      if (this.view !== 'side') this._turnTo('side');
      return;
    }
    st.t += dt * 1000;
    const done = this[`_do_${st.type}`](st, dt, w);
    if (done) this._step = null;
  }

  _do_idle(st) { this._setActivity('idle'); this._play('idle'); return st.t >= st.ms; }

  /** Look at the reader: turn the head (the three-quarter "look@front"), or turn right round to face them. */
  _do_gaze(st) {
    this._setActivity('idle');
    const look = this.sprite.bundle.animations['look@front'];
    if (!st.started) { st.started = true; if (st.full || !look) this._turnTo('front'); }
    if (this.view === 'front') this._play('idle');
    else if (!this._turning && look && this.sprite.currentAnim !== 'look@front') this.sprite.play('look@front');
    if (st.t < st.ms) return false;
    if (this.view !== 'side') this._turnTo('side');
    return true;
  }
  _do_arrive() { emit(this, 'arrive'); return true; }

  _do_react(st) {
    if (!st.started) { st.started = true; const n = this._play('react', { once: true }); st.waitEnd = n; this._setActivity('startled'); if (this.anims.react === 'honk') this.say('HONK!', 900); }
    return st.done || st.t > 2500;
  }

  _do_perform(st) {
    if (!st.started) {
      st.started = true;
      this._setActivity('performing');
      const once = this.sprite.bundle.animations[st.name].loop === false;
      this.sprite.play(st.name, once ? { once: true } : undefined);
      if (once) st.waitEnd = st.name;
    }
    return st.done || st.t >= (st.waitEnd ? 4000 : st.ms);
  }

  _do_walk(st, dt, w) {
    if (st.p?.animated && st.p === this.platform) st.x += st.p.dx ?? 0;   // the spot moves with its surface
    // Long way to go: run (at the run's own no-slide speed).
    if (!st.run && st.t === dt * 1000 && (this._hurry || Math.abs(st.x - this.x) > this.W * 4) && this.anims.run) st.run = true;
    const role = st.run ? this._runRole() : 'walk';
    this._setActivity(st.run ? 'running' : 'walking');
    const dx = st.x - this.x;
    if (Math.abs(dx) < 1) { this.x = st.x; return true; }
    this.facing = Math.sign(dx);
    this._play(role);
    const step = Math.min(Math.abs(dx), this._speed(role) * dt);
    this.x += this.facing * step;
    // Walked off the end of the platform: fall.
    // Walked off the end: drop, with only a little sideways speed so it lands where the route expects.
    if (this.platform && !st.free && (this.x < this.platform.x1 - 1 || this.x > this.platform.x2 + 1)) { this._fall(this.facing * Math.min(this._speed(role) * 0.6, this.W)); return true; }
    return false;
  }

  /** In a hurry, a figure with a "rush" gait (wings going, neck out) uses it to run. */
  _runRole() { return this._hurry && this.anims.rush ? 'rush' : 'run'; }

  _do_pickup(st) {
    if (!st.started) {
      st.started = true;
      this._setActivity('picking up');
      this.face(st.el);
      this._play(this.anims.duck ? 'duck' : 'idle');
      if (st.el.isConnected) this._take(st.el);
    }
    if (st.t > 350) this._play('idle');
    return st.t >= 500;
  }

  _do_drop(st) {
    if (!st.started) { st.started = true; this._play(this.anims.duck ? 'duck' : 'idle'); this._release(st.how); }
    if (st.t > 300) this._play('idle');
    return st.t >= 450;
  }

  /** Off the edge of the screen: walk (or run) on, hop down where a surface ends, until out of view. */
  _do_leave(st, dt, w) {
    const vp = w.viewport(), dir = st.dir;
    if (!st.started) { st.started = true; this.facing = dir; this.behind.clear(); }
    this._setActivity('leaving');
    if (!st.air) {
      const role = this.anims.run ? this._runRole() : 'walk';
      this._play(role);
      this.x += dir * this._speed(role) * dt;
      const p = this.platform, atEdge = p && (dir < 0 ? p.x1 <= vp.l + this.W / 2 : p.x2 >= vp.r - this.W / 2);
      if (!p || (!atEdge && (this.x < p.x1 - 1 || this.x > p.x2 + 1))) {
        // Leap for the edge: fast enough to clear it before coming back down to this height (a big jump if it is far).
        const gap = Math.max(0, dir > 0 ? vp.r - this.x : this.x - vp.l) + this.W;
        st.air = true; st.vy = -this.H * 6; this.platform = null;
        st.vx = dir * Math.min(this.H * 20, Math.max(this._speed(role), gap / 0.45));
      }
    } else {
      this._play('fall');
      const y0 = this.y;
      st.vy = Math.min(this.H * 30, st.vy + this.H * 28 * dt);
      this.x += st.vx * dt; this.y += st.vy * dt;
      if (st.vy > 0) {
        let land = null;
        for (const p of w.platforms) if (this.x >= p.x1 && this.x <= p.x2 && p.y >= y0 - 0.5 && p.y <= this.y && (!land || p.y < land.y)) land = p;
        if (land) { this.y = land.y; this.platform = land; st.air = false; }
      }
    }
    if (this.x - this.W / 2 > vp.r || this.x + this.W / 2 < vp.l || this.y - this.H > vp.b) { this._offstage(); return true; }
    return false;
  }

  _do_jump(st, dt) {
    const j = this._jumpTimes();
    if (!st.started) {
      st.started = true;
      if (st.p.animated && st.rel != null) st.x = clampTo(st.p, st.p.x1 + st.rel, this.W * 0.2);   // it has moved since planning
      this.facing = st.x >= this.x ? 1 : -1;
      st.waitEnd = this._play('jump', { once: true });
      this._setActivity('jumping');
      const lift = Math.max(this.H * 0.3, 8);
      st.arc = jumpArc(this.x, this.y, st.x, st.p.y, lift, j.flightMs / 1000);
      st.arc.y1 = st.p.y;
      st.x0 = this.x; st.y0 = this.y; st.air = 0;
      st.limit = j.totalMs + 800;
    }
    if (st.airborne && st.air < st.arc.T) {
      st.x1L ??= st.p.x1;   // where the target surface was at launch (it may be moving)
      st.air = Math.min(st.arc.T, st.air + dt);
      const t = st.air, drift = (st.p.x1 - st.x1L) * (t / st.arc.T);   // follow a moving target in the air
      this.x = st.x0 + st.arc.vx * t + drift;
      this.y = st.y0 + st.arc.vy * t + (st.arc.g * t * t) / 2 + (st.p.y - st.arc.y1) * (t / st.arc.T);
      this.platform = null;
      if (t >= st.arc.T) { this._land(st); emit(this, 'land'); }
    }
    if (st.done || st.t > st.limit) {
      this._land(st);
      return true;
    }
    return false;
  }

  /** Finish a jump on its target surface (where it is now, if it moved), on it. */
  _land(st) {
    const moved = st.x1L == null ? 0 : st.p.x1 - st.x1L;
    this.x = clampTo(st.p, st.x + moved, 1);
    this.y = st.p.y;
    this.platform = st.p;
  }

  _do_climb(st, dt, w) {
    const it = st.item, a = this.sprite.bundle.animations[this.anims.climb];
    if (!st.started) {
      st.started = true;
      this.facing = st.side === 'left' ? 1 : -1;
      // Put the feet on the wall: the climb animation's wall line (units) meets the element's side.
      const wallPx = ((a.wall ?? this.sprite.bundle.size[0] * 0.6) / this.sprite.bundle.size[0]) * this.W;
      this.x = this.facing > 0 ? it.l - wallPx + this.W / 2 : it.r + wallPx - this.W / 2;
      this.platform = null;
      this._setActivity('climbing');
    }
    this._play('climb');
    this.y -= this.sprite.pxPerSecondY(this.anims.climb) * this.sprite.effectiveRate * dt;
    if (this.y <= it.t + this.H * 0.15) {
      this.y = Math.max(this.y, it.t);
      // Over the top: hop onto it (or step on if there is no jump).
      const top = w.platformOf(it.el);
      const x = clampTo(top, this.facing > 0 ? top.x1 + this.W * 0.45 : top.x2 - this.W * 0.45, this.W);
      if (this.can('jump')) this.plan.unshift({ type: 'jump', p: top, x });
      else { this.x = x; this.y = top.y; this.platform = top; }
      return true;
    }
    return false;
  }

  _do_sit(st) {
    this._setActivity('sitting');
    if (st.facing) this.facing = st.facing;
    this._play('sit');
    return st.t >= st.ms && !this.directed;   // directed: stay seated until the next order
  }

  _do_hide(st, dt, w) {
    this._setActivity('hiding');
    this.behind.add(st.item.el);
    // Duck, and every few seconds peek out over the top.
    const cycle = st.t % 3200;
    this._play(cycle > 2000 && this.anims.peek ? 'peek' : 'duck');
    if (st.t >= st.ms && !this.directed) {   // directed: stay hidden until the next order
      // Walk out from behind it.
      const it = st.item, out = this.x < (it.l + it.r) / 2 ? it.l - this.W * 0.6 : it.r + this.W * 0.6;
      this.plan.unshift({ type: 'walk', x: clampTo(this.platform, out, this.W) });
      return true;
    }
    return false;
  }

  _fall(vx) {
    this._setActivity('falling');
    this.platform = null;
    this._vx = vx; this._vy = 0;
    this._play('fall');
    this._step = null;
  }

  _fallStep(dt, w) {
    const g = this.H * 28, vmax = this.H * 30;
    this._play('fall');
    const y0 = this.y;
    this._vy = Math.min(vmax, this._vy + g * dt);
    this._vx *= Math.max(0, 1 - 0.8 * dt);   // a little air drag on throws
    this.x = Math.max((w.left ?? 0) + this.W / 2, Math.min(w.width - this.W / 2, this.x + this._vx * dt));   // inside the page
    this.y += this._vy * dt;
    // Land on the first platform crossed from above (no tunnelling through thin cards).
    let land = null;
    for (const p of w.platforms) if (this.x >= p.x1 && this.x <= p.x2 && p.y >= y0 - 0.5 && p.y <= this.y && (!land || p.y < land.y)) land = p;
    if (land) {
      this.y = land.y; this.platform = land; this._setActivity('idle');
      // Landed somewhere else than planned (or fell without a plan): think again.
      if (this.plan[0]?.p && this.plan[0].p !== land) this.plan = [];
      emit(this, 'land');
      this._play('idle');
    } else if (this.y > w.height + this.H * 2) { this._placed = false; this._place(w); }
  }

  // ----- choosing what to do -----

  _choose(w) {
    if (this._catching) { this._catching = 0; this._boost(1, 'catchup'); }   // a catch-up whose plan was abandoned
    const vp = w.viewport();
    const roamPage = this.stage?.getAttribute('roam') === 'page';
    const near = (p) => roamPage || (p.y > vp.t + this.H * 0.5 && p.y < vp.b + this.H);
    const options = [];
    const add = (weight, fn) => options.push({ weight, fn });
    add(2, () => [{ type: 'idle', ms: rand(1500, 4000) }]);
    if (this.can('wander')) add(4, () => {
      const ps = w.platforms.filter((p) => near(p) && p.x2 - p.x1 > this.W * 0.6);
      const p = ps.length ? pick(ps) : this.platform;
      return this._routeOrNull(p, rand(p.x1 + this.W * 0.3, p.x2 - this.W * 0.3), w, [{ type: 'idle', ms: rand(800, 2500) }]);
    });
    if (this.can('sit')) add(2, () => {
      const ps = w.platforms.filter((p) => !p.floor && near(p));
      const perches = ps.filter((p) => p.item.perch);
      const p = perches.length && Math.random() < 0.7 ? pick(perches) : ps.length ? pick(ps) : null;
      if (!p) return null;
      const st = this._sitStep(p);
      return this._routeOrNull(p, st.x, w, [st]);
    });
    if (this.can('hide')) add(2, () => {
      const spots = w.items.filter((it) => it.hide && !it.avoid).map((it) => this._hideSpot(it, w)).filter((s) => s && near(s.p));
      if (!spots.length) return null;
      const s = pick(spots);
      return this._routeOrNull(s.p, s.x, w, [{ type: 'hide', item: s.item, ms: rand(4000, 8000) }]);
    });
    if (this.can('gaze') && this.views.includes('front')) add(1.2, () => [{ type: 'gaze', ms: rand(1800, 3500), full: Math.random() < 0.5 }]);
    if (this.can('climb')) add(2, () => {
      const walls = this._walls(w).filter((c) => near(c.top));
      if (!walls.length) return null;
      const c = pick(walls);
      return this._routeOrNull(c.base, c.baseX, w, [{ type: 'climb', item: c.item, side: c.side }]);
    });
    for (let tries = 0; tries < 6; tries++) {
      let r = Math.random() * options.reduce((s, o) => s + o.weight, 0);
      const o = options.find((x) => (r -= x.weight) <= 0) || options[0];
      const plan = o.fn();
      if (plan) { this.plan = plan; return; }
    }
    this.plan = [{ type: 'idle', ms: 1500 }];
  }

  _sitStep(p) {
    const right = Math.random() < 0.5;
    return { type: 'sit', ms: rand(4000, 8000), facing: right ? 1 : -1, x: clampTo(p, right ? p.x2 - this.W * 0.22 : p.x1 + this.W * 0.22, this.W * 0.2), p };
  }

  /** Where to stand to be behind a hiding spot: a platform whose line passes behind it. */
  _hideSpot(it, w) {
    if (!it) return null;
    const ps = w.platforms.filter((p) => p.y >= it.t + this.H * 0.25 && p.y <= it.b + this.H * 0.15 && p.x2 > it.l && p.x1 < it.r && p.el !== it.el);
    if (!ps.length) return null;
    const p = ps.sort((a, b) => a.y - b.y)[0];
    return { p, item: it, x: clampTo(p, (Math.max(it.l, p.x1) + Math.min(it.r, p.x2)) / 2, 0) };
  }

  /** Climbable sides whose foot rests on a platform: {item, side, base, baseX, top}. */
  _walls(w) {
    const out = [];
    for (const it of w.items) {
      if (!it.climbable || it.avoid) continue;
      const top = w.platformOf(it.el);
      if (!top) continue;
      for (const side of ['left', 'right']) {
        const x = side === 'left' ? it.l - this.W * 0.5 : it.r + this.W * 0.5;
        const base = w.platforms.find((p) => p !== top && Math.abs(p.y - it.b) <= this.H * 0.25 && x >= p.x1 && x <= p.x2);
        if (base) out.push({ item: it, side, base, baseX: x, top });
      }
    }
    return out;
  }

  _routeOrNull(p, x, w, tail) {
    if (!p) return null;
    const path = this._route(p, x, w);
    return path ? [...path, ...tail] : null;
  }

  /**
   * Plan a path from where we stand to (platform p, x): cheapest route over platforms linked by
   * drops, jumps and climbs, where cost = px walked + a cost per action. Returns steps, or null.
   */
  _route(dest, x, w, run = false) {
    const from = this.platform;
    if (!from || !dest) return null;
    x = clampTo(dest, x, this.W * 0.3);
    if (from === dest) return [{ type: 'walk', x, run, p: dest }];
    const H = this.H;
    const actionCost = { drop: H * 0.8, jump: H * 1.5, climb: H * 2 };
    // Dijkstra over platforms; each node remembers where we arrive on it.
    const best = new Map([[from, { cost: 0, x: this.x, prev: null, link: null }]]);
    const open = [from], closed = new Set();
    while (open.length) {
      open.sort((a, b) => best.get(a).cost - best.get(b).cost);
      const p = open.shift();
      if (closed.has(p)) continue;
      closed.add(p);
      if (p === dest) break;
      const here = best.get(p);
      for (const l of this._links(p, w)) {
        const start = l.kind === 'drop' ? l.edge : l.kind === 'jump' ? l.takeoff : l.baseX;
        const arrive = l.kind === 'drop' ? l.edge : l.kind === 'jump' ? l.land : null;
        const cost = here.cost + Math.abs(start - here.x) + actionCost[l.kind] + (l.kind === 'climb' ? p.y - l.to.y : 0);
        const ax = arrive ?? (l.side === 'left' ? l.to.x1 + this.W * 0.45 : l.to.x2 - this.W * 0.45);
        if (!best.has(l.to) || cost < best.get(l.to).cost) { best.set(l.to, { cost, x: ax, prev: p, link: l }); open.push(l.to); }
      }
    }
    if (!best.has(dest)) return null;
    const hops = [];
    for (let p = dest; best.get(p).prev; p = best.get(p).prev) hops.unshift(best.get(p).link);
    const steps = [];
    for (const l of hops) {
      if (l.kind === 'drop') steps.push({ type: 'walk', x: l.edge, run, p: l.from });
      else if (l.kind === 'jump') steps.push({ type: 'walk', x: l.takeoff, run, p: l.from }, { type: 'jump', p: l.to, x: l.land, rel: l.land - l.to.x1 });
      else if (l.kind === 'climb') steps.push({ type: 'walk', x: l.baseX, run, p: l.from }, { type: 'climb', item: l.item, side: l.side, p: l.to });
    }
    steps.push({ type: 'walk', x, run, p: dest });
    return steps;
  }

  /** Ways to leave platform p. */
  _links(p, w) {
    const out = [], W = this.W, H = this.H;
    // Drop off either end onto whatever is below.
    for (const dir of [-1, 1]) {
      const edge = dir > 0 ? p.x2 + 2 : p.x1 - 2;
      const to = w.below(edge, p.y + 1, p);
      if (to && to !== p) out.push({ kind: 'drop', from: p, to, edge });
    }
    // Jump to platforms within reach.
    if (this.can('jump')) {
      const maxX = W * 3, maxUp = H * 1.8;
      for (const q of w.platforms) {
        if (q === p || p.y - q.y > maxUp || q.y - p.y > H * 6) continue;
        let takeoff, land;
        if (q.x1 >= p.x2) { takeoff = p.x2 - W * 0.2; land = q.x1 + W * 0.35; }
        else if (q.x2 <= p.x1) { takeoff = p.x1 + W * 0.2; land = q.x2 - W * 0.35; }
        else if (q.y < p.y) {
          // q is above and overlaps: take off beside it, never through it.
          if (p.x1 < q.x1 - W * 0.4) { takeoff = q.x1 - W * 0.6; land = q.x1 + W * 0.35; }
          else if (p.x2 > q.x2 + W * 0.4) { takeoff = q.x2 + W * 0.6; land = q.x2 - W * 0.35; }
          else continue;
        } else continue;   // below and overlapping: dropping is the way down
        if (Math.abs(land - takeoff) > maxX || q.x2 - q.x1 < W * 0.5) continue;
        out.push({ kind: 'jump', from: p, to: q, takeoff: clampTo(p, takeoff, 0), land: clampTo(q, land, W * 0.2) });
      }
    }
    // Climb walls whose foot is on this platform.
    if (this.can('climb')) for (const c of this._walls(w)) if (c.base === p) out.push({ kind: 'climb', from: p, to: c.top, baseX: c.baseX, item: c.item, side: c.side });
    return out;
  }

  // ----- drawing: position, depth, occlusion -----

  _occluders(w) {
    const L = this.x - this.W / 2, T = this.y - (this.sprite.groundOffset ?? this.H), R = L + this.W, B = T + this.H;
    for (const el of [...this.behind]) {
      const it = w.items.find((i) => i.el === el);
      if (!it || it.r <= L || it.l >= R || it.b <= T || it.t >= B) { if (this.activity !== 'hiding') this.behind.delete(el); }
    }
    return w.items.filter((it) => (it.occluder || this.behind.has(it.el)) && it.el !== this.platform?.el &&
      it.r > L && it.l < R && it.b > T && it.t < B);
  }

  _write(w) {
    const gy = this.sprite.groundOffset ?? this.H;
    let L = snap(this.x - this.W / 2), T = snap(this.y - gy);
    // Past the page's right or bottom edge (walking off it, held or falling past it, or just the few pixels of
    // box below the feet of a character on the floor): keep the box inside the page and slide the body out of it
    // instead, clipped. The page is measured with the characters on it, so a box poking out would make it bigger:
    // a scrollbar, and at the next read a lower floor (or a wider page) that the character follows, read after read.
    let sx = 0, sy = 0;
    if (L + this.W > w.width) { sx = L + this.W - w.width; L -= sx; }
    if (T + this.H > w.height) { sy = T + this.H - w.height; T -= sy; }
    const shift = sx || sy ? `${sx}px ${sy}px` : '';
    if (shift !== (this._shift ?? '')) { this._body.style.translate = shift; this._box.style.overflow = shift ? 'clip' : ''; this._shift = shift; }
    if (this._carry) {
      const c = this._carry, at = this._carryAt(c), k = Math.min(1, (performance.now() - c.t0) / 280);
      let x = at.x, y = at.y;
      if (k < 1) {
        const e = 1 - (1 - k) ** 2, x0 = c.from.x - L - sx, y0 = c.from.y - T - sy;   // in the body's coordinates
        x = x0 + (x - x0) * e; y = y0 + (y - y0) * e - Math.sin(Math.PI * k) * this.H * 0.3;
      }
      c.clone.style.transformOrigin = `${at.gx}px ${at.gy}px`;
      c.clone.style.transform = `translate(${snap(x)}px, ${snap(y)}px) rotate(${at.rot * k}deg)`;
    }
    const tf = `translate(${L}px, ${T}px)`;
    if (tf !== this._tf) { this.style.transform = tf; this._tf = tf; }
    const z = String(Math.round(this.y));
    if (z !== this._z) { this.style.zIndex = z; this._z = z; }
    const flip = this.facing < 0;
    if (flip !== this.sprite.hasAttribute('flip')) this.sprite.toggleAttribute('flip', flip);
    // Cut every occluder's box out of the character (disjoint cells, so even-odd never cancels).
    // A hiding spot also covers the feet resting on its bottom edge (they reach a pixel or two below it).
    const holes = this._occluders(w).map((it) => [it.l - L, it.t - T, it.r - L, it.b - T + (this.behind.has(it.el) ? this.H * 0.12 : 0)]);
    const clip = holes.length ? `path(evenodd, "M0 0H${snap(this.W)}V${snap(this.H)}H0Z${cells(holes, this.W, this.H).map(([a, b, c, d]) => `M${a} ${b}H${c}V${d}H${a}Z`).join('')}")` : '';
    if (clip !== this._clip) { this.style.clipPath = clip; this._clip = clip; }
    if (this._sayUntil) {
      const beak = this.sprite.point('beak', { relative: true }), head = this.sprite.point('head', { relative: true });
      const p = beak || head || { x: this.W / 2, y: this.H * 0.1 };
      // Above the head, not over it: the highest opaque pixel over the head and beak (a hat or hood
      // included), else the points themselves.
      const xs = [beak?.x, head?.x].filter((x) => x != null);
      const pad = this.W * 0.06;
      const top = xs.length ? this.sprite.topAt(Math.min(...xs) - pad, Math.max(...xs) + pad) : null;
      const y = top ?? Math.min(...[beak?.y, head?.y].filter((v) => v != null), p.y);
      // Kept inside the page: a bubble poking past its right edge would add a scrollbar.
      const half = (this._bubbleW ??= this._bubble.offsetWidth) / 2;
      const bx = Math.max(half - L, Math.min(w.width - L - half, p.x + sx));
      this._bubble.style.left = `${bx}px`; this._bubble.style.top = `${y + sy - 4}px`;
    }
  }
}

// ---------- helpers ----------

function clampTo(p, x, margin) {
  if (!p) return x;
  const lo = p.x1 + margin, hi = p.x2 - margin;
  return lo > hi ? (p.x1 + p.x2) / 2 : Math.min(hi, Math.max(lo, x));
}

// ---------- scenes: scripted moments as data ----------
//
// { "cast": {"goose": "#goose"}, "loop": false, "steps": [
//     {"actor": "goose", "goTo": "#bench", "then": "sit"},
//     {"together": [{"actor": "goose", "say": "honk?"}, {"actor": "moss", "perform": "think", "ms": 2000}]},
//     {"wait": 500}, {"waitFor": "tap", "on": "moss"}, {"emit": "chapter-2"} ] }

const SCENE_ACTIONS = ['goTo', 'hideBehind', 'perform', 'say', 'shoo', 'face', 'pickUp', 'drop', 'exit', 'enter'];
const SCENE_FLOW = ['wait', 'together', 'waitFor', 'emit'];
const SCENE_EXTRA = { goTo: ['then', 'at', 'speed'], hideBehind: ['speed'], pickUp: ['speed'], exit: ['speed'], enter: ['speed'], perform: ['ms'], say: ['ms'], waitFor: ['on', 'timeout'], emit: ['detail'] };
const SCENE_COMMON = ['actor', 'async', 'note'];

/** Check a scene. Returns [{path, message}]; empty when it can be played. `castNames` lists the actors it may use. */
export function checkScene(scene, castNames = null) {
  const errors = [], err = (path, message) => errors.push({ path, message });
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { err('$', 'a scene is an object with "steps"'); return errors; }
  for (const k of Object.keys(scene)) if (!['name', 'cast', 'steps', 'loop', 'directed', 'trigger', 'note'].includes(k)) err(`$.${k}`, `unknown key (name, cast, steps, loop, directed, trigger)`);
  const t = scene.trigger;
  if (t != null) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) err('$.trigger', 'a trigger is {"event": "submit", "on": "#signup"}');
    else {
      for (const k of Object.keys(t)) if (!['event', 'on', 'once', 'preventDefault'].includes(k)) err(`$.trigger.${k}`, 'unknown key (event, on, once, preventDefault)');
      if (typeof t.event !== 'string' || !t.event) err('$.trigger.event', 'an event name, like "submit", "click", "tap" or "visible"');
      if (typeof t.on !== 'string' || !t.on) err('$.trigger.on', 'what to watch: a selector, a cast name, or "stage"');
      for (const k of ['once', 'preventDefault']) if (k in t && typeof t[k] !== 'boolean') err(`$.trigger.${k}`, `${k} is true or false`);
    }
  }
  if (scene.cast != null && (typeof scene.cast !== 'object' || Array.isArray(scene.cast))) err('$.cast', 'cast maps names to selectors: {"goose": "#goose"}');
  if (scene.loop != null && typeof scene.loop !== 'boolean' && !(Number.isInteger(scene.loop) && scene.loop > 0)) err('$.loop', 'loop is true, false or a number of times');
  const names = castNames ?? (scene.cast ? Object.keys(scene.cast) : null);
  const steps = (list, path) => {
    if (!Array.isArray(list) || !list.length) return err(path, 'a non-empty list of steps');
    list.forEach((st, i) => step(st, `${path}[${i}]`));
  };
  const step = (st, p) => {
    if (!st || typeof st !== 'object' || Array.isArray(st)) return err(p, 'a step is an object, like {"actor": "goose", "goTo": "#bench"}');
    const kinds = [...SCENE_ACTIONS, ...SCENE_FLOW].filter((k) => k in st);
    if (kinds.length !== 1) return err(p, kinds.length ? `one action per step (found ${kinds.join(', ')}); use "together" to run several at once` : `no action: use one of ${[...SCENE_ACTIONS, ...SCENE_FLOW].join(', ')}`);
    const kind = kinds[0];
    const allowed = [kind, ...SCENE_COMMON, ...(SCENE_EXTRA[kind] ?? [])];
    for (const k of Object.keys(st)) if (!allowed.includes(k)) err(`${p}.${k}`, `not used by "${kind}" (allowed: ${allowed.join(', ')})`);
    if (SCENE_ACTIONS.includes(kind)) {
      if (typeof st.actor !== 'string') err(`${p}.actor`, `"${kind}" needs an "actor"`);
      else if (names && !names.includes(st.actor)) err(`${p}.actor`, `"${st.actor}" is not in the cast (${names.join(', ')})`);
    }
    const v = st[kind];
    const num = (x, path, what) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) err(path, `${what} must be a number of milliseconds`); };
    if (kind === 'goTo' && typeof v !== 'string' && !(v && typeof v === 'object' && Number.isFinite(v.x))) err(`${p}.goTo`, 'a selector, a cast name, or {"x": …, "y": …}');
    if (kind === 'goTo' && st.at != null && !(typeof st.at === 'number' && st.at >= 0 && st.at <= 1)) err(`${p}.at`, 'at is where along the surface: 0 (left end) … 1 (right end)');
    if (kind === 'goTo' && st.then != null && !['idle', 'sit', 'hide'].includes(st.then)) err(`${p}.then`, 'then is idle, sit or hide');
    if ((kind === 'hideBehind') && typeof v !== 'string') err(`${p}.${kind}`, 'a selector');
    if (kind === 'perform' && typeof v !== 'string') err(`${p}.perform`, 'the name of one of the actor\'s animations');
    if (kind === 'say' && typeof v !== 'string') err(`${p}.say`, 'the text to show');
    if (kind === 'shoo' && v !== true && typeof v !== 'string') err(`${p}.shoo`, 'true, or what to run from (a selector or cast name)');
    if (kind === 'face' && typeof v !== 'string') err(`${p}.face`, '"left", "right", "viewer", "away", "side", a cast name or a selector');
    if (kind === 'pickUp' && typeof v !== 'string') err(`${p}.pickUp`, 'a selector for the element to pick up');
    if (kind === 'drop' && v !== true && v !== 'here' && v !== 'back') err(`${p}.drop`, 'true or "here" (at its feet), or "back" (where it came from)');
    if (kind === 'exit' && !['left', 'right', 'auto'].includes(v)) err(`${p}.exit`, '"left", "right" or "auto" (the nearer edge)');
    if (kind === 'enter' && typeof v !== 'string') err(`${p}.enter`, '"left", "right", "top", "auto", or a selector to drop onto');
    if (kind === 'wait') num(v, `${p}.wait`, 'wait');
    if (kind === 'together') steps(v, `${p}.together`);
    if (kind === 'waitFor') {
      if (typeof v !== 'string') err(`${p}.waitFor`, 'an event name, like "tap", "click" or "arrive"');
      if (typeof st.on !== 'string') err(`${p}.on`, 'what to listen on: a cast name, a selector, or "stage"');
      if (st.timeout != null) num(st.timeout, `${p}.timeout`, 'timeout');
    }
    if (kind === 'emit' && typeof v !== 'string') err(`${p}.emit`, 'an event name');
    if (('ms' in st)) num(st.ms, `${p}.ms`, 'ms');
    if ('speed' in st && !(typeof st.speed === 'number' && st.speed >= 0.25 && st.speed <= 4)) err(`${p}.speed`, 'speed is how much faster: 0.25 … 4 (1.5 is a hurry)');
  };
  steps(scene.steps, '$.steps');
  // a loop that never waits would replay instantly, forever
  const takesTime = (list) => Array.isArray(list) && list.some((st) => st && typeof st === 'object' && !('emit' in st) && (!('together' in st) || takesTime(st.together)));
  if (scene.loop === true && Array.isArray(scene.steps) && scene.steps.length && !takesTime(scene.steps))
    err('$.loop', 'a scene that loops forever needs a step that takes time (wait, waitFor, or an actor doing something)');
  return errors;
}

/**
 * Play a checked scene. `env` connects it to the page (the stage provides one; tests pass fakes):
 *   actor(name) → actor | null, element(sel) → Element | null, wait(ms) → Promise,
 *   listen(target, event, timeout) → Promise<boolean>, emit(name, detail), onStep(step, path), stopped: Promise
 * Resolves true when every step ran (steps that fail, like an unreachable goTo, are skipped), false if stopped.
 */
export async function runScene(scene, env) {
  let stopped = false;
  // One stop listener for the whole scene: each waiting step registers here, rather than chaining onto a promise
  // that never settles (which would pile up reactions in a scene that loops for hours).
  const waiters = new Set();
  env.stopped.then(() => { stopped = true; for (const w of waiters) w(false); });
  const untilStopped = (p) => {
    let w;
    const s = new Promise((r) => { w = r; waiters.add(r); });
    return Promise.race([p, s]).finally(() => waiters.delete(w));
  };
  const target = (v) => (typeof v !== 'string' ? v : env.actor(v) ?? env.element(v));
  const exec = async (st, path) => {
    if ('wait' in st) return env.wait(st.wait);
    if ('together' in st) return (await Promise.all(st.together.map((s, i) => run(s, `${path}.together[${i}]`)))).every(Boolean);
    if ('waitFor' in st) return env.listen(st.on === 'stage' ? 'stage' : target(st.on), st.waitFor, st.timeout);
    if ('emit' in st) { env.emit(st.emit, st.detail); return true; }
    const a = env.actor(st.actor);
    if (!a) return false;
    if (!st.speed) return act(st, a);
    a.hurry?.(st.speed);
    try { return await act(st, a); } finally { a.hurry?.(1); }
  };
  const act = async (st, a) => {
    if ('say' in st) return a.say(st.say, st.ms ?? 1800);
    if ('face' in st) return a.face(['left', 'right', 'viewer', 'away', 'side'].includes(st.face) ? st.face : target(st.face));
    if ('goTo' in st) {
      const t = env.actor(st.goTo) ?? target(st.goTo);
      if (!t) return false;
      // Another actor: stand next to it, on the side we come from. An element with "at": that spot along its top.
      const dest = t.run ? env.beside(a, t) : st.at != null && typeof st.goTo === 'string' ? env.along(t, st.at) : t;
      return dest ? a.run('goTo', dest, { then: st.then ?? 'idle' }) : false;
    }
    if ('hideBehind' in st) { const el = env.element(st.hideBehind); return el ? a.run('hideBehind', el) : false; }
    if ('perform' in st) return a.run('perform', st.perform, st.ms != null ? { ms: st.ms } : undefined);
    if ('shoo' in st) return a.run('shoo', ...(st.shoo === true ? [] : [target(st.shoo)].filter(Boolean)));
    if ('pickUp' in st) { const el = env.element(st.pickUp); return el ? a.run('pickUp', el) : false; }
    if ('drop' in st) return a.run('drop', st.drop === true ? 'here' : st.drop);
    if ('exit' in st) return a.run('exit', st.exit);
    if ('enter' in st) return a.run('enter', ['left', 'right', 'top', 'auto'].includes(st.enter) ? st.enter : env.element(st.enter) ?? 'top');
    return false;
  };
  const run = async (st, path) => {
    if (stopped) return false;
    env.onStep?.(st, path);
    const p = exec(st, path);
    if (st.async) { p.catch(() => {}); return true; }
    return untilStopped(p);
  };
  const times = scene.loop === true ? Infinity : scene.loop || 1;
  for (let n = 0; n < times && !stopped; n++) {
    const t0 = Date.now();
    for (let i = 0; i < scene.steps.length && !stopped; i++) await run(scene.steps[i], `$.steps[${i}]`);
    // A pass whose steps all finished at once (every actor missing, say) must not spin: give each pass at least
    // 100 ms, through a real timer, so the page keeps running.
    if (n + 1 < times && !stopped) await untilStopped(new Promise((r) => setTimeout(r, Math.max(0, 100 - (Date.now() - t0)))));
  }
  return !stopped;
}

/**
 * Gravity and launch velocity for a jump from (x0, y0) to (x1, y1) that peaks `lift` px above the
 * higher end and lasts exactly `flight` seconds (the animation's launch→land time). Screen y is down.
 */
export function jumpArc(x0, y0, x1, y1, lift, flight) {
  const apex = Math.min(y0, y1) - lift;
  const up = Math.sqrt(y0 - apex), down = Math.sqrt(y1 - apex);
  const g = 2 * ((up + down) / flight) ** 2;
  return { vx: (x1 - x0) / flight, vy: -Math.sqrt(2 * g * (y0 - apex)), g, T: flight };
}

/**
 * Split possibly overlapping rectangles [x1, y1, x2, y2] (clipped to w×h, rounded to device pixels)
 * into disjoint cells covering their union, so an even-odd path has no double-cut holes.
 */
export function cells(rects, w, h) {
  const rs = rects.map(([a, b, c, d]) => [snap(Math.max(0, a)), snap(Math.max(0, b)), snap(Math.min(w, c)), snap(Math.min(h, d))]).filter(([a, b, c, d]) => c > a && d > b);
  if (rs.length <= 1) return rs;
  const xs = [...new Set(rs.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rs.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    let run = null;   // merge vertical runs of covered cells in this column
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      const covered = rs.some(([a, b, c, d]) => cx > a && cx < c && cy > b && cy < d);
      if (covered) { if (run) run[3] = ys[j + 1]; else run = [xs[i], ys[j], xs[i + 1], ys[j + 1]]; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}

if (typeof customElements !== 'undefined') {
  if (!customElements.get('pixel-actor')) customElements.define('pixel-actor', PixelActor);
  if (!customElements.get('pixel-stage')) customElements.define('pixel-stage', PixelStage);
}
