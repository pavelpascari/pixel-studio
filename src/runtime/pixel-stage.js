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
// character with clip-path. Tapping or clicking a character's opaque pixels shoos it away (that
// click does not reach the page); with a mouse or pen, drag one to pick it up and throw it. A real button pauses all characters (WCAG 2.2.2) and remembers
// the choice. With prefers-reduced-motion the characters stand still.
//
// Stage attributes:  controls = bottom-right (default) | bottom-left | top-right | top-left | none
//                    floor    = document (default: the bottom of the page) | none
//                    roam     = viewport (default: prefer places on screen) | page
// Actor attributes:  src, size (default 64), alt, start (selector to stand on first), keep-in-view (come
//                    back when scrolled out of sight: run there, or drop in from the top of the screen),
//                    behaviours (default "wander sit hide climb jump"), anims ("walk=waddle run=run ...")
// JS:  stage.actors, stage.pause(), stage.resume(), stage.paused, stage.world.invalidate(), stage.scrollSpeed;
//      stage events 'fastscroll' {speed} and 'scrollsettle'
//      actor.goTo(element | {x, y}, {then: 'sit' | 'hide' | 'idle'}), actor.hideBehind(el), actor.say(text, ms),
//      actor.shoo(), actor.catchUp(), actor.state; events on the actor: 'actorstate' {from, to}, 'land', 'arrive',
//      'burst' {count, rate} (rage taps: it panics) and 'calm', 'catchup'

import { clock, BurstDetector } from './pixel-sprite.js';

const FLAGS = ['surface', 'climbable', 'perch', 'hide', 'occluder', 'avoid'];
const SELECTOR = FLAGS.map((f) => `[data-pixel-${f}]`).join(',');
const ORDERS = ['goTo', 'hideBehind', 'perform', 'shoo'];
const ROLES = {
  idle: ['idle'], walk: ['walk', 'waddle', 'trot', 'travel'], run: ['run', 'trot', 'travel', 'walk', 'waddle'],
  jump: ['jump'], fall: ['fall'], sit: ['sit'], duck: ['duck', 'sneak'], peek: ['peek'], climb: ['climb'],
  react: ['honk', 'wave', 'hop'],
};
const DEFAULT_BEHAVIOURS = 'wander sit hide climb jump';
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
    if ((this.stage.getAttribute('floor') ?? 'document') !== 'none') this.platforms.push({ el: null, floor: true, x1: 0, x2: this.width, y: this.height });
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
   */
  playScene(scene) {
    if (typeof scene === 'string') {
      const t = scene.trim();
      const text = t.startsWith('{') ? t : document.querySelector(t)?.textContent;
      if (text == null) throw new Error(`playScene: nothing found for "${t}"`);
      scene = JSON.parse(text);
    }
    const names = scene?.cast && typeof scene.cast === 'object' ? Object.keys(scene.cast) : this.actors.map((a) => a.id).filter(Boolean);
    const errors = checkScene(scene, names);
    if (errors.length) {
      const e = new Error(`playScene: invalid scene\n${errors.map((x) => `  ${x.path}: ${x.message}`).join('\n')}`);
      e.errors = errors;
      throw e;
    }
    const find = (sel) => { try { return document.querySelector(sel); } catch { return null; } };
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
        el.addEventListener(ev, on, { once: true });
        if (timeout) timer = setTimeout(() => { el.removeEventListener(ev, on); r(false); }, timeout);
        stopped.then(() => { clearTimeout(timer); el.removeEventListener(ev, on); });
      }),
      emit: (name, detail) => this.dispatchEvent(new CustomEvent('sceneevent', { detail: { scene: scene.name, name, detail } })),
      onStep: (step, path) => this.dispatchEvent(new CustomEvent('scenestep', { detail: { scene: scene.name, step, path } })),
      stopped,
    };
    // Characters must be loaded and standing somewhere before they take orders.
    const placed = (a) => new Promise((r) => { const t0 = performance.now(); const poll = () => (a._placed || performance.now() - t0 > 10000 ? r() : setTimeout(poll, 50)); poll(); });
    const handle = { name: scene.name ?? null, stop: () => stop(), finished: null };
    handle.finished = Promise.race([Promise.all(cast.map(placed)).then(() => runScene(scene, env)), stopped.then(() => false)])
      .then((completed) => {
        cast.forEach((a, i) => (a.directed = was[i]));
        if (this._scene === handle) this._scene = null;
        stop();
        this.dispatchEvent(new CustomEvent('sceneend', { detail: { scene: scene.name, completed } }));
        return completed;
      });
    this._scene = handle;
    return handle;
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
    // <pixel-stage scene="#intro">: play that scene once the page is parsed.
    if (this.hasAttribute('scene')) {
      const auto = () => { try { this.playScene(this.getAttribute('scene')); } catch (e) { console.error(e); } };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else setTimeout(auto);
    }
  }

  disconnectedCallback() {
    clock.remove(this._tick);
    this._scene?.stop();
    this.world.disconnect();
    this._rm?.removeEventListener?.('change', this._onRm);
    this._unscroll?.();
    for (const [t, fn] of this._inputs || []) document.removeEventListener(t, fn, true);
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
      if (fast) { fast = false; this.dispatchEvent(new CustomEvent('scrollsettle')); }
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
        this.dispatchEvent(new CustomEvent('fastscroll', { detail: { speed: Math.round(this.scrollSpeed) } }));
      }
      clearTimeout(timer);
      timer = setTimeout(settle, 160);
    };
    addEventListener('scroll', onScroll, { passive: true });
    this._unscroll = () => removeEventListener('scroll', onScroll);
  }

  // ----- input: tap or click a character to shoo it; never block other clicks -----
  _input() {
    let down = null, drag = null, swallow = 0;
    const hit = (e) => this.actors.find((a) => a._ready && a._hit(e.clientX, e.clientY, this.world));
    const local = (e) => ({ x: e.clientX + scrollX - this.world.origin.x, y: e.clientY + scrollY - this.world.origin.y });
    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      // Mouse and pen can pick a character up. Touch never does: a drag there must stay a scroll.
      if (e.pointerType === 'touch' || e.button !== 0 || this._paused || reducedMotion()) return;
      const a = hit(e);
      if (!a) return;
      e.preventDefault();   // no text selection or native drag while holding a character
      const p = local(e);
      drag = { a, id: e.pointerId, dx: a.x - p.x, dy: a.y - p.y, moved: false, track: [{ ...p, t: performance.now() }] };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = local(e);
      if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { drag.moved = true; drag.a._grab(); }
      if (!drag.moved) return;
      drag.track.push({ ...p, t: performance.now() });
      if (drag.track.length > 6) drag.track.shift();
      drag.a._dragTo(p.x + drag.dx, p.y + drag.dy);
    };
    const onUp = (e) => {
      if (drag && e.pointerId === drag.id) {
        const d = drag;
        drag = null;
        if (d.moved) {
          // Throw with the pointer's recent velocity (px/s), capped so it stays on the page.
          const a0 = d.track[0], a1 = d.track[d.track.length - 1], dt = Math.max(16, a1.t - a0.t) / 1000;
          const cap = d.a.H * 30;
          const v = (k) => Math.max(-cap, Math.min(cap, (a1[k] - a0[k]) / dt));
          d.a._throw(v('x'), v('y'));
          swallow = performance.now() + 500;
          return;
        }
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 || performance.now() - down.t > 600) return (down = null);
      down = null;
      const a = hit(e);
      if (!a) return;
      swallow = performance.now() + 500;
      // Taps in quick succession are a burst (rage taps): the character panics instead.
      const det = (a._bursts ??= new BurstDetector());
      const b = det.hit(performance.now());
      a.dispatchEvent(new CustomEvent('tap', { detail: { count: b.count } }));
      if (b.burst) a._rage({ ...b, min: det.min }, local(e)); else a.shoo(local(e));
    };
    const onClick = (e) => { if (performance.now() < swallow) { e.preventDefault(); e.stopPropagation(); swallow = 0; } };
    this._inputs = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['click', onClick]];
    for (const [t, fn] of this._inputs) document.addEventListener(t, fn, { capture: true, passive: t === 'pointermove' });
  }
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
      pixel-sprite{display:block}
      .say{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:600 12px/1.2 system-ui,sans-serif;
        background:#fff;color:#222;border:2px solid #222;border-radius:8px;padding:3px 7px;opacity:0;transition:opacity .15s}
      .say.on{opacity:1}
    </style><pixel-sprite part="sprite"></pixel-sprite><div class="say" part="bubble"></div>`;
    this.sprite = root.querySelector('pixel-sprite');
    this._bubble = root.querySelector('.say');
    this.x = 0; this.y = 0; this.facing = 1; this.state = 'idle';
    this.plan = []; this.behind = new Set(); this._orders = [];
    this.sprite.addEventListener('ready', () => this._onReady());
    this.sprite.addEventListener('spriteevent', (e) => this._onEvent(e.detail));
    this.sprite.addEventListener('spriteend', (e) => { if (this._step?.waitEnd === e.detail.anim) this._step.done = true; });
  }

  connectedCallback() {
    for (const a of ['src', 'size', 'alt', 'skin']) if (this.hasAttribute(a)) this.sprite.setAttribute(a, this.getAttribute(a));
    if (!this.hasAttribute('size')) this.sprite.setAttribute('size', '64');
    this.sprite.setAttribute('states', 'off');   // the stage chooses animations itself
  }
  attributeChangedCallback(name, _o, v) {
    if (!this.sprite) return;
    if (v == null) this.sprite.removeAttribute(name); else this.sprite.setAttribute(name, v);
  }

  get stage() { return this.closest('pixel-stage'); }

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
    this._sayUntil = performance.now() + ms;
    return new Promise((ok) => setTimeout(() => ok(true), ms));
  }

  /** Turn to face 'left', 'right', another actor, or an element. */
  face(what) {
    if (what === 'left' || what === 'right') { this.facing = what === 'left' ? -1 : 1; return true; }
    const box = (el) => { const r = el.getBoundingClientRect(), o = this.stage.getBoundingClientRect(); return r.left + r.width / 2 - o.left; };
    const x = what instanceof PixelActor ? what.x : what instanceof Element && this.stage ? box(what) : what?.x;
    if (x == null || x === this.x) return false;
    this.facing = x > this.x ? 1 : -1;
    return true;
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
    this.dispatchEvent(new CustomEvent('burst', { detail: { count: b.count, rate: b.rate } }));
    this._boost(b.rate, 'rage');
    if (this.anims.react && b.count % 3 === 0) this.say(['!!', 'HONK!!', '?!'][(b.count / 3) % 3 | 0], 700);
    // Already panicking: keep running (re-planned away from the latest tap) rather than reacting again.
    this.shoo(from, { react: b.count === b.min });
    clearTimeout(this._calmTimer);
    this._calmTimer = setTimeout(() => {
      if (!this._bursts.calm(performance.now())) return;
      this._boost(1, 'rage');
      this.dispatchEvent(new CustomEvent('calm'));
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
    if (!this.hasAttribute('keep-in-view') || !this._ready || !this._placed || this._still || this._busy() || (this._catching ?? 0) > performance.now()) return;
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
    this.dispatchEvent(new CustomEvent('catchup', { detail: { from: { x: this.x, y: this.y } } }));
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
  _busy() { return this.state === 'falling' || this.state === 'dragged' || ['jump', 'climb'].includes(this._step?.type); }

  /** Picked up by the pointer: dangle (the fall animation) and follow it. */
  _grab() {
    this.plan = []; this._step = null; this.platform = null; this.behind.clear();
    this._setState('dragged');
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
    if (['climbing', 'jumping', 'falling', 'dragged'].includes(this.state)) return this._remap(w);
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
    this._setState('idle');
    this._play('idle');
    this.setAttribute('data-ready', '');
  }

  _setState(s) {
    if (s === this.state) return;
    const from = this.state;
    this.state = s;
    this.dispatchEvent(new CustomEvent('actorstate', { detail: { from, to: s } }));
  }

  _play(role, opts) {
    const name = this.anims[role] || this.anims.idle;
    if (opts?.once) return this.sprite.play(name, opts) && name;
    if (this.sprite.currentAnim !== name) this.sprite.play(name);
    return name;
  }

  _onEvent(d) {
    if (this._step?.type === 'jump' && d.name === 'launch') this._step.airborne = true;
  }

  _hit(cx, cy, w) {
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
    if (this.state === 'dragged') return;
    this._checkInView(w);
    if (this.state === 'falling') return this._fallStep(dt, w);
    // Riding a moving surface: carried along with it; off its end, fall.
    if (this.platform?.animated) {
      this.x += this.platform.dx ?? 0;
      this.y = this.platform.y;
      if (this.x < this.platform.x1 - 2 || this.x > this.platform.x2 + 2) { this._fall(0); return; }
    }
    if (this._pending && !this._busy()) { const run = this._pending; this._pending = null; run(); }
    this._sweepOrders();
    if (!this._step) {
      if (!this.plan.length) { if (this.directed) this.plan = [{ type: 'idle', ms: 400 }]; else this._choose(w); }
      this._step = this.plan.shift() || { type: 'idle', ms: 1000 };
      this._step.t = 0;
    }
    const st = this._step;
    st.t += dt * 1000;
    const done = this[`_do_${st.type}`](st, dt, w);
    if (done) this._step = null;
  }

  _do_idle(st) { this._setState('idle'); this._play('idle'); return st.t >= st.ms; }
  _do_arrive() { this.dispatchEvent(new CustomEvent('arrive')); return true; }

  _do_react(st) {
    if (!st.started) { st.started = true; const n = this._play('react', { once: true }); st.waitEnd = n; this._setState('startled'); if (this.anims.react === 'honk') this.say('HONK!', 900); }
    return st.done || st.t > 2500;
  }

  _do_perform(st) {
    if (!st.started) {
      st.started = true;
      this._setState('performing');
      const once = this.sprite.bundle.animations[st.name].loop === false;
      this.sprite.play(st.name, once ? { once: true } : undefined);
      if (once) st.waitEnd = st.name;
    }
    return st.done || st.t >= (st.waitEnd ? 4000 : st.ms);
  }

  _do_walk(st, dt, w) {
    if (st.p?.animated && st.p === this.platform) st.x += st.p.dx ?? 0;   // the spot moves with its surface
    // Long way to go: run (at the run's own no-slide speed).
    if (!st.run && st.t === dt * 1000 && Math.abs(st.x - this.x) > this.W * 4 && this.anims.run) st.run = true;
    const role = st.run ? 'run' : 'walk';
    this._setState(st.run ? 'running' : 'walking');
    const dx = st.x - this.x;
    if (Math.abs(dx) < 1) { this.x = st.x; return true; }
    this.facing = Math.sign(dx);
    this._play(role);
    const step = Math.min(Math.abs(dx), this._speed(role) * dt);
    this.x += this.facing * step;
    // Walked off the end of the platform: fall.
    // Walked off the end: drop, with only a little sideways speed so it lands where the route expects.
    if (this.platform && (this.x < this.platform.x1 - 1 || this.x > this.platform.x2 + 1)) { this._fall(this.facing * Math.min(this._speed(role) * 0.6, this.W)); return true; }
    return false;
  }

  _do_jump(st, dt) {
    const j = this._jumpTimes();
    if (!st.started) {
      st.started = true;
      if (st.p.animated && st.rel != null) st.x = clampTo(st.p, st.p.x1 + st.rel, this.W * 0.2);   // it has moved since planning
      this.facing = st.x >= this.x ? 1 : -1;
      st.waitEnd = this._play('jump', { once: true });
      this._setState('jumping');
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
      if (t >= st.arc.T) { this._land(st); this.dispatchEvent(new CustomEvent('land')); }
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
      this._setState('climbing');
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
    this._setState('sitting');
    if (st.facing) this.facing = st.facing;
    this._play('sit');
    return st.t >= st.ms && !this.directed;   // directed: stay seated until the next order
  }

  _do_hide(st, dt, w) {
    this._setState('hiding');
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
    this._setState('falling');
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
    this.x = Math.max(this.W / 2, Math.min(w.width - this.W / 2, this.x + this._vx * dt));
    this.y += this._vy * dt;
    // Land on the first platform crossed from above (no tunnelling through thin cards).
    let land = null;
    for (const p of w.platforms) if (this.x >= p.x1 && this.x <= p.x2 && p.y >= y0 - 0.5 && p.y <= this.y && (!land || p.y < land.y)) land = p;
    if (land) {
      this.y = land.y; this.platform = land; this._setState('idle');
      // Landed somewhere else than planned (or fell without a plan): think again.
      if (this.plan[0]?.p && this.plan[0].p !== land) this.plan = [];
      this.dispatchEvent(new CustomEvent('land'));
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
      if (!it || it.r <= L || it.l >= R || it.b <= T || it.t >= B) { if (this.state !== 'hiding') this.behind.delete(el); }
    }
    return w.items.filter((it) => (it.occluder || this.behind.has(it.el)) && it.el !== this.platform?.el &&
      it.r > L && it.l < R && it.b > T && it.t < B);
  }

  _write(w) {
    const gy = this.sprite.groundOffset ?? this.H;
    const L = snap(this.x - this.W / 2), T = snap(this.y - gy);
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
      const p = this.sprite.point('beak', { relative: true }) || this.sprite.point('head', { relative: true }) || { x: this.W / 2, y: this.H * 0.1 };
      this._bubble.style.left = `${p.x}px`; this._bubble.style.top = `${p.y - 6}px`;
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
//     {"together": [{"actor": "goose", "say": "honk?"}, {"actor": "clawd", "perform": "think", "ms": 2000}]},
//     {"wait": 500}, {"waitFor": "tap", "on": "clawd"}, {"emit": "chapter-2"} ] }

const SCENE_ACTIONS = ['goTo', 'hideBehind', 'perform', 'say', 'shoo', 'face'];
const SCENE_FLOW = ['wait', 'together', 'waitFor', 'emit'];
const SCENE_EXTRA = { goTo: ['then', 'at'], perform: ['ms'], say: ['ms'], waitFor: ['on', 'timeout'], emit: ['detail'] };
const SCENE_COMMON = ['actor', 'async', 'note'];

/** Check a scene. Returns [{path, message}]; empty when it can be played. `castNames` lists the actors it may use. */
export function checkScene(scene, castNames = null) {
  const errors = [], err = (path, message) => errors.push({ path, message });
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { err('$', 'a scene is an object with "steps"'); return errors; }
  for (const k of Object.keys(scene)) if (!['name', 'cast', 'steps', 'loop', 'directed', 'note'].includes(k)) err(`$.${k}`, `unknown key (name, cast, steps, loop, directed)`);
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
    if (kind === 'face' && typeof v !== 'string') err(`${p}.face`, '"left", "right", a cast name or a selector');
    if (kind === 'wait') num(v, `${p}.wait`, 'wait');
    if (kind === 'together') steps(v, `${p}.together`);
    if (kind === 'waitFor') {
      if (typeof v !== 'string') err(`${p}.waitFor`, 'an event name, like "tap", "click" or "arrive"');
      if (typeof st.on !== 'string') err(`${p}.on`, 'what to listen on: a cast name, a selector, or "stage"');
      if (st.timeout != null) num(st.timeout, `${p}.timeout`, 'timeout');
    }
    if (kind === 'emit' && typeof v !== 'string') err(`${p}.emit`, 'an event name');
    if (('ms' in st)) num(st.ms, `${p}.ms`, 'ms');
  };
  steps(scene.steps, '$.steps');
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
  const halt = env.stopped.then(() => { stopped = true; return false; });
  const target = (v) => (typeof v !== 'string' ? v : env.actor(v) ?? env.element(v));
  const exec = async (st, path) => {
    if ('wait' in st) return env.wait(st.wait);
    if ('together' in st) return (await Promise.all(st.together.map((s, i) => run(s, `${path}.together[${i}]`)))).every(Boolean);
    if ('waitFor' in st) return env.listen(st.on === 'stage' ? 'stage' : target(st.on), st.waitFor, st.timeout);
    if ('emit' in st) { env.emit(st.emit, st.detail); return true; }
    const a = env.actor(st.actor);
    if (!a) return false;
    if ('say' in st) return a.say(st.say, st.ms ?? 1800);
    if ('face' in st) return a.face(['left', 'right'].includes(st.face) ? st.face : target(st.face));
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
    return false;
  };
  const run = async (st, path) => {
    if (stopped) return false;
    env.onStep?.(st, path);
    const p = exec(st, path);
    if (st.async) { p.catch(() => {}); return true; }
    return Promise.race([p, halt]);
  };
  const times = scene.loop === true ? Infinity : scene.loop || 1;
  for (let n = 0; n < times && !stopped; n++) {
    for (let i = 0; i < scene.steps.length && !stopped; i++) await run(scene.steps[i], `$.steps[${i}]`);
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
