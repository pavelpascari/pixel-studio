// <pixel-sprite> — plays a Pixel Studio bundle on any web page. No dependencies.
//
//   <script type="module" src="pixel-sprite.js"></script>
//   <pixel-sprite src="fox.bundle.json" anim="idle" size="128"
//                 hover-anim="walk" click-anim="wave" alt="A fox">
//     <img src="fox-poster.png" alt="">   <!-- optional: shown before load, without JS, and on error -->
//   </pixel-sprite>
//
// Or inline the bundle (fully self-contained snippet):
//   <pixel-sprite anim="idle"><script type="application/json">{...bundle...}</script></pixel-sprite>
//
// Attributes: src, anim, size (CSS px, default 128), res (force a variant), fps (override),
//             hover-anim, click-anim, paused, flip, alt ("" = decorative)
//             state (set by the element: loading | ready | error)
// API:        el.play(name, {once, restart, mix}), el.pause(), el.resume(), el.reload(),
//             el.bundle, el.animations, el.currentAnim, el.frame, el.displaySize, el.groundOffset,
//             el.pxPerSecond(name), el.pxPerSecondY(name), el.point(name, {relative}), el.topAt(x0, x1), el.hitTest(x, y)
// Events:     'ready'; 'error' (detail: {error}); 'spriteend' (bubbles; detail: {anim}) when a one-shot or
//             non-looping animation ends — also under reduced motion, after the animation's duration;
//             'spriteevent' (bubbles; detail: {anim, frame, name, data}) when a frame with a baked event
//             (footstep, land, launch, an author's "honk") is shown.
// Rate:       rate="2" plays everything twice as fast (0.25..4); el.effectiveRate includes state machine
//             node rates and burst speed-ups. Bursts: three or more quick clicks fire 'spriteburst'
//             {count, rate} and, when they stop, 'spritecalm'; a burst speeds up a playing click-anim
//             instead of restarting it. burst="off" turns detection off.
// States:     if the bundle has a state machine ("states"), the element runs it: el.set(input, value),
//             el.fire(trigger), el.stateNode, and a 'statechange' event (detail: {from, to}). Its
//             interactions replace hover-anim / click-anim. states="off" disables it (pixel-stage does).
// Skins:      skin="winter" picks a skin baked into the bundle (variants with that skin).
// Module:     export { clock, pickVariant, deviceScale, checkBundle, StateMachine, parseCondition, PixelSprite, BUNDLE_FORMAT }. `clock.add(fn)` runs fn(dt, now) on the
//             same frame loop and clamped dt the sprites use, so page movement stays in step with the legs.
//
// Playback is robust by design: one shared frame loop that a failing sprite cannot stop; one load path
// guarded by a token (src changes cannot race); the box is reserved from `size` before the bundle
// arrives; decoded sheets are shared between sprites; scale is chosen in *device* pixels so every
// sprite pixel is a whole number of screen pixels on any devicePixelRatio; hover animations are for
// mouse and pen only (a tap plays them once on touch screens). Respects prefers-reduced-motion (live)
// and pauses while off-screen.

export const BUNDLE_FORMAT = 'pixel-sprite/1';
// Bundles of the same major version play: "pixel-sprite/1.1" adds things a /1 runtime may ignore.
const FORMAT_MAJOR = /^pixel-sprite\/1(?:\.\d+)*$/;
const isObj = (o) => o != null && typeof o === 'object' && !Array.isArray(o);
// Name-keyed maps without a prototype, so "constructor" or "toString" is just a name that is not there.
const bare = (o) => Object.assign(Object.create(null), o);
const MAX_BACKING = 4096;   // longest canvas side in device px

const report = (e) => (typeof reportError === 'function' ? reportError(e) : console.error(e));
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(nowMs()), 16));

// ---------- clock: one frame loop for every sprite and for page code ----------

/**
 * Shared frame loop. Subscribers get (dt, now): dt in ms, clamped to `maxDt` so a background tab or a
 * long frame doesn't teleport anything. The next frame is requested *before* subscribers run and each
 * runs in its own try/catch, so one failing subscriber cannot stop the others.
 */
export const clock = (() => {
  const subs = new Set();
  let id = 0, last = -1;   // last < 0: no previous frame
  function frame(t) {
    id = 0;
    if (!subs.size) { last = -1; return; }
    id = raf(frame);
    const dt = last < 0 ? 0 : Math.min(api.maxDt, Math.max(0, t - last));
    last = t;
    for (const fn of [...subs]) {
      if (!subs.has(fn)) continue;
      try { fn(dt, t); } catch (e) { report(e); }
    }
  }
  const api = {
    /** Upper bound for dt, in ms. */
    maxDt: 100,
    /** Run fn(dt, now) every frame. Returns a function that removes it. */
    add(fn) {
      subs.add(fn);
      if (!id) { last = -1; id = raf(frame); }
      return () => subs.delete(fn);
    },
    remove(fn) { subs.delete(fn); },
    /** Forget the previous frame time: the next frame gets dt = 0 (used after the page was hidden). */
    reset() { last = -1; },
    get size() { return subs.size; },
  };
  return api;
})();

// ---------- assets: bundles and decoded sheets, shared and retryable ----------

/** Throw a clear error unless `b` looks like a pixel-sprite/1 bundle. Returns b. */
export function checkBundle(b, where = 'bundle') {
  const fail = (msg) => { throw new Error(`pixel-sprite: ${where}: ${msg}`); };
  if (!isObj(b)) fail('not a JSON object');
  if (typeof b.format !== 'string' || !FORMAT_MAJOR.test(b.format)) fail(`format is ${JSON.stringify(b.format)}, expected "${BUNDLE_FORMAT}"`);
  if (b.animations != null && !isObj(b.animations)) fail('animations must be an object keyed by name');
  b.animations = bare(b.animations);
  const anims = Object.entries(b.animations);
  if (!anims.length) fail('has no animations');
  for (const [name, a] of anims) {
    if (!(Number.isInteger(a?.row) && a.row >= 0 && Number.isInteger(a.frames) && a.frames >= 1 && a.frames <= 256 && a.fps > 0 && a.fps <= 60))
      fail(`animation "${name}" needs integer row >= 0, integer frames 1..256 and fps above 0 and at most 60`);
    if (a.loop != null && typeof a.loop !== 'boolean') fail(`animation "${name}": loop must be true or false`);
  }
  if (b.size != null && !(Array.isArray(b.size) && b.size.length === 2 && b.size.every((n) => typeof n === 'number' && n > 0))) fail('size must be [width, height] in units');
  if (b.ground != null && !(typeof b.ground === 'number' && b.ground >= 0)) fail('ground must be a number (the foot line in units)');
  if (b.points != null) {
    if (!isObj(b.points)) fail('points must be an object keyed by name');
    b.points = bare(b.points);
    for (const [n, pt] of Object.entries(b.points)) if (!isObj(pt)) fail(`point "${n}" must be an object of per-animation positions`);
  }
  for (const [name, a] of anims) {
    if (a.durations != null && !(Array.isArray(a.durations) && a.durations.length === a.frames && a.durations.every((d) => Number.isFinite(d) && d >= 1)))
      fail(`animation "${name}": durations must list one number of ms (>= 1) per frame`);
    if (a.events != null && !(Array.isArray(a.events) && a.events.every((e) => Number.isInteger(e?.frame) && e.frame >= 0 && e.frame < a.frames && typeof e.name === 'string')))
      fail(`animation "${name}": events must be [{frame, name}] with frames inside the animation`);
  }
  if (b.states != null) {
    if (!isObj(b.states)) fail('states must be an object');
    const nodes = b.states.nodes;
    if (!isObj(nodes) || !Object.keys(nodes).length) fail('states has no nodes');
    b.states.nodes = bare(nodes);
    for (const [n, node] of Object.entries(nodes)) if (!b.animations[node?.anim]) fail(`states node "${n}" plays unknown animation "${node?.anim}"`);
    for (const k of ['transitions', 'interactions']) if (b.states[k] != null && !Array.isArray(b.states[k])) fail(`states.${k} must be an array`);
    for (const t of b.states.transitions ?? []) parseCondition(t?.when);
  }
  if (!Array.isArray(b.variants) || !b.variants.length) fail('has no variants');
  for (const v of b.variants) {
    if (!(Number.isInteger(v?.frameW) && v.frameW > 0 && Number.isInteger(v.frameH) && v.frameH > 0)) fail(`variant ${v?.res} needs whole-number frameW and frameH`);
    if (typeof v.image === 'string') continue;
    // A skin stored as a change to the default sheet of the same resolution.
    if (!v.skin || !b.variants.some((d) => !d.skin && d.res === v.res && typeof d.image === 'string')) fail(`variant ${v.res} needs an image`);
    if (v.overlay != null && typeof v.overlay !== 'string') fail(`variant ${v.res} (${v.skin}): overlay must be an image URL`);
    if (v.recolor != null && !(Array.isArray(v.recolor) && v.recolor.every((p) => Array.isArray(p) && p.length === 2 && p.every((h) => /^[0-9a-f]{8}$/i.test(h)))))
      fail(`variant ${v.res} (${v.skin}): recolor must be [["rrggbbaa", "rrggbbaa"], ...]`);
  }
  return b;
}

const bundles = new Map();   // absolute url → Promise<bundle>; failures are evicted so a retry refetches
function fetchBundle(url) {
  let p = bundles.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`pixel-sprite: ${url} → HTTP ${r.status}`); return r.text(); })
      // a server that answers a missing file with an HTML page (SPA fallbacks) gets a message naming the URL
      .then((t) => { try { return JSON.parse(t); } catch { throw new Error(`pixel-sprite: ${url} is not JSON (${/^\s*</.test(t) ? 'got an HTML page: is the path right?' : 'could not parse it'})`); } })
      .then((b) => checkBundle(b, url));
    bundles.set(url, p);
    p.catch(() => { if (bundles.get(url) === p) bundles.delete(url); });
  }
  return p;
}

const images = new WeakMap();   // variant object → Promise<ImageBitmap | HTMLImageElement | canvas>
function variantImage(v, base, bundle) {
  let p = images.get(v);
  if (!p) {
    const abs = (u) => (u.startsWith('data:') ? u : new URL(u, base).href);
    if (typeof v.image === 'string') p = decodeImage(abs(v.image), v);
    else {
      const def = bundle.variants.find((d) => !d.skin && d.res === v.res && typeof d.image === 'string');
      p = Promise.all([variantImage(def, base, bundle), v.overlay ? decodeImage(abs(v.overlay), v) : null]).then(([img, over]) => applySkin(img, v, over));
    }
    images.set(v, p);
    p.catch(() => { if (images.get(v) === p) images.delete(v); });
  }
  return p;
}
/** The default sheet with a skin's colours swapped and its overlay pixels written over it. */
async function applySkin(img, v, over) {
  const w = img.width, h = img.height;
  const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h), px = data.data;
  if (v.recolor?.length) {
    const map = new Map(v.recolor.map(([f, t]) => [parseInt(f, 16) >>> 0, parseInt(t, 16) >>> 0]));
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const to = map.get(((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0);
      if (to !== undefined) { px[i] = to >>> 24; px[i + 1] = (to >>> 16) & 255; px[i + 2] = (to >>> 8) & 255; px[i + 3] = to & 255; }
    }
  }
  if (over) {
    // Copied, not blended: an overlay pixel replaces what is under it.
    const oc = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ox = oc.getContext('2d', { willReadFrequently: true });
    ox.drawImage(over, 0, 0);
    const op = ox.getImageData(0, 0, w, h).data;
    for (let i = 0; i < px.length; i += 4) if (op[i + 3]) { px[i] = op[i]; px[i + 1] = op[i + 1]; px[i + 2] = op[i + 2]; px[i + 3] = op[i + 3]; }
  }
  ctx.putImageData(data, 0, 0);
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(cv); } catch { /* use the canvas */ } }
  return cv;
}
async function decodeImage(url, v) {
  const img = new Image();
  // Sheets on another origin (a CDN) need CORS, or skins and hit tests cannot read their pixels.
  if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
  img.src = url;
  try { await img.decode(); } catch { throw new Error(`pixel-sprite: could not decode the ${v.res} px sheet (${url.startsWith('data:') ? 'data URL' : url})`); }
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(img); } catch { /* fall back to the <img> */ } }
  return img;
}

/**
 * Choose the resolution variant for a display size (CSS px). Each sprite pixel becomes k×k CSS
 * pixels with integer k ≥ 2 (crisp, visibly "pixel art"). Among variants that land within 20% of the
 * requested size, the most detailed wins; otherwise the closest fit.
 */
export function pickVariant(variants, size) {
  const scored = variants.map((v) => {
    const k = Math.max(1, Math.round(size / v.frameH));
    return { v, k, err: Math.abs(v.frameH * k - size) / size };
  });
  const good = scored.filter((c) => c.k >= 2 && c.err <= 0.2);
  if (good.length) return good.reduce((a, b) => (b.v.res > a.v.res ? b : a)).v;
  const pool = scored.some((c) => c.k >= 2) ? scored.filter((c) => c.k >= 2) : scored;
  return pool.reduce((a, b) => (b.err < a.err || (b.err === a.err && b.v.res > a.v.res) ? b : a)).v;
}

/**
 * Device pixels per sprite pixel: the CSS scale k from `size`, converted to whole device pixels so
 * pixels are even at any devicePixelRatio (2.625, 1.5, browser zoom), capped to bound memory.
 */
export function deviceScale(frameW, frameH, size, dpr = 1) {
  const k = Math.max(1, Math.round(size / frameH));
  const cap = Math.max(1, Math.floor(MAX_BACKING / Math.max(frameW, frameH)));
  return Math.min(cap, Math.max(1, Math.round(k * dpr)));
}

// ---------- shared page observers ----------

let probe = null;          // 1×1 canvas for hitTest
const live = new Set();   // connected sprites
let io = null, rmq = null, dprq = null;
const reducedMotion = () => !!rmq?.matches;
const onChange = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));
const offChange = (mq, fn) => (mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn));

function setupPage() {
  if (rmq || typeof matchMedia !== 'function') return;
  rmq = matchMedia('(prefers-reduced-motion: reduce)');
  onChange(rmq, () => live.forEach((el) => el._sync()));
  watchDpr();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') clock.reset(); });
  addEventListener('pageshow', (e) => { if (e.persisted) clock.reset(); });
}
function watchDpr() {
  if (dprq) offChange(dprq, onDpr);
  dprq = matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
  onChange(dprq, onDpr);
}
function onDpr() { watchDpr(); live.forEach((el) => el._layout()); }

function observe(el, on) {
  if (typeof IntersectionObserver !== 'function') return;
  io ??= new IntersectionObserver((entries) => {
    const latest = new Map();   // several entries per target can be queued: the last one is current
    for (const e of entries) latest.set(e.target, e.isIntersecting);
    for (const [target, visible] of latest) target._setVisible(visible);
  }, { rootMargin: '50px' });
  if (on) io.observe(el); else io.unobserve(el);
}

// ---------- bursts: many clicks in a short time ----------

/**
 * Counts hits that come in quick succession (each within `gap` ms of the previous one). From the
 * `min`-th hit on it reports a burst: {count, rate}, where rate is a suggested speed-up
 * (1.35 for the first burst hit, +0.35 per extra hit, up to 3). Pure: pass the time in.
 */
export class BurstDetector {
  constructor({ min = 3, gap = 450 } = {}) { this.min = min; this.gap = gap; this.count = 0; this.last = -Infinity; }
  /** Register a hit at time t (ms). Returns {count, rate, burst}. */
  hit(t) {
    this.count = t - this.last <= this.gap ? this.count + 1 : 1;
    this.last = t;
    const extra = this.count - this.min + 1;
    return { count: this.count, rate: extra > 0 ? Math.min(3, 1 + 0.35 * extra) : 1, burst: extra > 0 };
  }
  /** True once the burst is over (no hit for `gap` ms after a burst). Resets the count. */
  calm(t) {
    if (this.count >= this.min && t - this.last > this.gap) { this.count = 0; return true; }
    if (t - this.last > this.gap) this.count = 0;
    return false;
  }
}

// ---------- state machine (bundle "states") ----------

/**
 * Parse a transition condition: terms joined by "&&" (or "and"); a term is `name`, `!name`, or
 * `name op literal` with op one of == != > < >= <= and a number, true, false or a (quoted) word.
 * Returns a function (inputs, triggers) → boolean. Throws on bad syntax.
 */
export function parseCondition(src) {
  if (src == null || src === '' || src === true) return () => true;
  const terms = String(src).split(/\s*(?:&&|\band\b)\s*/).map((t) => {
    const m = t.trim().match(/^(!?)([A-Za-z_][\w-]*)(?:\s*(==|!=|>=|<=|>|<)\s*(.+))?$/);
    if (!m) throw new Error(`pixel-sprite: cannot read condition "${t}" (use: name, !name, or name > 3)`);
    const [, not, name, op, raw] = m;
    if (!op) return (inp, trig) => !!(trig.has(name) || inp[name]) !== !!not;
    let v = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
    v = v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
    const cmp = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b }[op];
    return (inp) => cmp(inp[name], v);
  });
  return (inp, trig) => terms.every((f) => f(inp, trig));
}

/**
 * A small declarative state machine (the bundle's `states`), independent of the DOM.
 *   def = { initial, inputs: {name: number | boolean | "trigger"}, nodes: {name: {anim, then?, random?}},
 *           transitions: [{from, to, when?, at?}], interactions?: [{on, fire?, set?}] }
 * `at`: "now" (default), "end" (when the animation finishes or loops), "sync" (keep the walk
 * phase), or an event name such as "footstep" (switch on the next one).
 * The host passes {play(anim, {once, phase}), phase(), onChange(from, to)}.
 */
export class StateMachine {
  constructor(def, animations, host) {
    this.def = def; this.anims = animations; this.host = host;
    this.inputs = Object.create(null); this.triggers = new Set();
    for (const [k, v] of Object.entries(def.inputs ?? {})) this.inputs[k] = v === 'trigger' ? false : v;
    this.transitions = (def.transitions ?? []).map((t) => ({ ...t, test: parseCondition(t.when), from: [].concat(t.from ?? '*') }));
    this.node = null; this.prev = null; this.pending = null; this.fidget = null; this.wait = 0;
  }

  start(node = this.def.initial ?? Object.keys(this.def.nodes)[0]) { this._go(node, {}); }

  set(name, value) { this.inputs[name] = value; this._applyRate(); this.evaluate(); }

  /** Playback speed for the current node: a number, or the value of an input (clamped 0.25..4). */
  rate() {
    const r = this._nodeDef()?.rate;
    const v = typeof r === 'string' ? Number(this.inputs[r]) : r;
    return Number.isFinite(v) && v > 0 ? Math.min(4, Math.max(0.25, v)) : 1;
  }
  _applyRate() { this.host.rate?.(this.rate()); }

  /** Apply the interactions for `on` ("click", "enter", "leave", "burst", "calm"); "$count"/"$rate" take values from `ctx`. */
  interact(on, ctx = {}) {
    for (const it of this.def.interactions ?? []) {
      if (it.on !== on) continue;
      if (it.set) for (const [k, v] of Object.entries(it.set)) this.set(k, typeof v === 'string' && v.startsWith('$') ? ctx[v.slice(1)] ?? 0 : v);
      if (it.fire) this.fire(it.fire);
    }
  }
  fire(name) { this.triggers.add(name); this.evaluate(); this.triggers.delete(name); }

  /** Check transitions from the current node; the first that matches wins. */
  evaluate() {
    for (const t of this.transitions) {
      if (t.to === this.node || !(t.from.includes('*') || t.from.includes(this.node))) continue;
      if (!t.test(this.inputs, this.triggers)) continue;
      const at = t.at ?? 'now';
      if (at === 'now') return this._go(t.to, {});
      if (at === 'sync') return this._go(t.to, { phase: this.host.phase() });
      this.pending = { ...t, fired: [...this.triggers] };   // remember triggers until it happens
      return;
    }
    // Nothing matches any more: drop a waiting transition whose condition went false.
    if (this.pending && !this.pending.test(this.inputs, new Set(this.pending.fired))) this.pending = null;
  }

  /** A baked event was shown (footstep, land, ...). */
  event(name) { if (this.pending?.at === name) this._take(); }
  /** The current animation looped. */
  loopEnd() { if (this.pending?.at === 'end') this._take(); }
  /** A one-shot finished (a node's non-looping animation, or a random fidget). */
  ended() {
    if (this.fidget) { this.fidget = null; this.wait = 0; this.host.play(this._nodeDef().anim, {}); return; }
    if (this.pending) return this._take();
    const then = this._nodeDef().then;
    if (then) return this._go(then === 'previous' ? this.prev ?? this.def.initial : then, {});
    this.evaluate();
  }

  /** Time passes (ms): random idle fidgets. */
  update(dt) {
    const r = this._nodeDef()?.random;
    if (!r?.length || this.fidget) return;
    if (this.wait <= 0) { this.wait = this._delay(r); return; }
    this.wait -= dt;
    if (this.wait > 0) return;
    let k = Math.random() * r.reduce((s, f) => s + (f.weight ?? 1), 0);
    const f = r.find((x) => (k -= x.weight ?? 1) <= 0) ?? r[0];
    if (this.anims[f.anim]) { this.fidget = f.anim; this.host.play(f.anim, { once: true }); }
  }

  _delay(r) {
    const [lo, hi] = [].concat(r[0].every ?? [4, 10]);
    return 1000 * (lo + Math.random() * ((hi ?? lo) - lo));
  }
  _nodeDef() { return this.def.nodes[this.node]; }
  _take() {
    const t = this.pending;
    this.pending = null;
    if (t.test(this.inputs, new Set(t.fired))) this._go(t.to, {});
  }
  _go(to, { phase }) {
    const n = this.def.nodes[to];
    if (!n) return;
    const from = this.node;
    if (from !== to) this.prev = from;
    this.node = to; this.pending = null; this.fidget = null; this.wait = 0;
    const a = this.anims[n.anim];
    this.host.play(n.anim, { once: !!(n.then || (a && a.loop === false)), phase });
    this._applyRate();
    if (from !== to && from != null) this.host.onChange?.(from, to);
    // An input may already ask to move on (bounded, so A ⇄ B with both conditions true cannot loop).
    if ((this._depth = (this._depth ?? 0) + 1) < 8) this.evaluate();
    this._depth--;
  }
}

// ---------- the element ----------

const STYLE = `
:host{display:inline-block;line-height:0;vertical-align:bottom}
canvas{display:block;image-rendering:crisp-edges;image-rendering:pixelated}
:host([flip]) canvas{transform:scaleX(-1)}
:host(:not([state=ready])) canvas{display:none}
:host([state=ready]) slot{display:none}
::slotted(img){display:block;width:100%;height:100%;object-fit:contain;image-rendering:pixelated}`;

const clampRate = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(4, Math.max(0.25, n)) : 1; };

// (Base class guard lets Node import the helpers for tests.)
const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

export class PixelSprite extends Base {
  static observedAttributes = ['src', 'anim', 'size', 'res', 'paused', 'fps', 'alt', 'skin', 'rate'];
  static clock = clock;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><style></style><canvas part="canvas" width="0" height="0"></canvas><slot></slot>`;
    this._box = root.querySelectorAll('style')[1];
    this._canvas = root.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._visible = true;
    this._token = 0; this._vtoken = 0; this._timer = 0;
    this._anim = null; this._frame = 0; this._acc = 0; this._once = false; this._ended = false;
    this._tick = (dt) => { try { this._sm?.update(dt); this._advance(dt); } catch (e) { this._fail(e); } };
  }

  connectedCallback() {
    setupPage();
    live.add(this);
    observe(this, true);
    if (this._inited) { this._layout(); this._sync(); return; }   // moved in the DOM: resume, don't restart
    this._inited = true;
    this._fps = Math.min(60, Number(this.getAttribute('fps')) || 0);
    this._userRate = clampRate(this.getAttribute('rate'));
    this._nodeRate = 1; this._burstRate = 1;
    this._bursts = new BurstDetector();
    this._userLabel = this.hasAttribute('aria-label');
    for (const t of ['pointerenter', 'pointerleave', 'pointerdown', 'click']) this.addEventListener(t, this);
    this._a11y();
    this._layout();
    this._load();
  }

  disconnectedCallback() {
    live.delete(this);
    observe(this, false);
    this._sync();
  }

  attributeChangedCallback(name, oldV, newV) {
    // Before the first connect (and during an upgrade) connectedCallback does the work, once.
    if (!this._inited || oldV === newV) return;
    if (name === 'src') this._load();
    else if (name === 'anim') { if (!this._sm) this.play(newV); }
    else if (name === 'size' || name === 'res' || name === 'skin') this._layout();
    else if (name === 'paused') this._sync();
    else if (name === 'fps') this._fps = Math.min(60, Number(newV) || 0);
    else if (name === 'rate') this._userRate = clampRate(newV);
    else if (name === 'alt') this._a11y();
  }

  // ----- public API -----

  get bundle() { return this._bundle; }
  get animations() { return this._bundle ? Object.keys(this._bundle.animations) : []; }
  get currentAnim() { return this._anim; }
  get frame() { return this._frame; }
  get state() { return this.getAttribute('state') || 'idle'; }
  /** Displayed size in CSS px ({width, height}), or null before the bundle is ready. */
  get displaySize() { return this._css ? { ...this._css } : null; }
  /** CSS px from the top of the box down to the character's foot line (bundle `ground`). */
  get groundOffset() {
    if (!this._css) return null;
    const h = this._bundle.size?.[1] ?? 100;
    return ((this._bundle.ground ?? h) / h) * this._css.height;
  }

  /** CSS px per second upward for a climbing animation (bundle `speedY`); null if none. */
  pxPerSecondY(name = this._anim) {
    const a = this._bundle?.animations[name];
    if (!a?.speedY || !this._css) return null;
    return (a.speedY * this._css.height) / (this._bundle.size?.[1] ?? 100);
  }

  /**
   * Where an attachment point (bundle `points`, e.g. "beak") is in the frame showing now:
   * {x, y, rot} in client px (viewport), or relative to the sprite's box with {relative: true}.
   * Mirrored with `flip`. null if the bundle has no such point.
   */
  point(name, { relative = false } = {}) {
    const pts = this._bundle?.skinPoints?.[this.getAttribute('skin')] ?? this._bundle?.points;
    const tbl = pts?.[name]?.[this._anim];
    if (!tbl?.length || !this._css) return null;
    const [ux, uy, rot] = tbl[Math.min(this._frame, tbl.length - 1)];
    const [w, h] = this._bundle.size ?? [100, 100];
    let x = (ux / w) * this._css.width, y = (uy / h) * this._css.height, r = rot;
    if (this.hasAttribute('flip')) { x = this._css.width - x; r = 180 - rot; }
    if (!relative) { const box = this._canvas.getBoundingClientRect(); x += box.left; y += box.top; }
    return { x, y, rot: r };
  }

  /**
   * The highest opaque pixel between x0 and x1 (px relative to the sprite's box, as `point` gives
   * them with {relative: true}) in the frame showing now, as a y relative to the box; null if that
   * strip is empty or the sheet cannot be read (cross-origin). Cached per frame.
   */
  topAt(x0, x1) {
    if (!this._css || this.state !== 'ready') return null;
    const v = this._variant, an = this._bundle.animations[this._anim], W = this._css.width;
    if (this.hasAttribute('flip')) [x0, x1] = [W - x1, W - x0];
    const a = Math.max(0, Math.floor((Math.min(x0, x1) / W) * v.frameW)), b = Math.min(v.frameW, Math.ceil((Math.max(x0, x1) / W) * v.frameW));
    if (b <= a) return null;
    if (this._topImg !== this._img) { this._topImg = this._img; this._topCache = new Map(); }   // new sheet or skin
    const key = `${this._anim}:${this._frame}:${a}:${b}`;
    if (!this._topCache.has(key)) {
      let top = null;
      try {
        const c = Object.assign(document.createElement('canvas'), { width: b - a, height: v.frameH }).getContext('2d', { willReadFrequently: true });
        c.drawImage(this._img, this._frame * v.frameW + a, an.row * v.frameH, b - a, v.frameH, 0, 0, b - a, v.frameH);
        const d = c.getImageData(0, 0, b - a, v.frameH).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { top = Math.floor((i >> 2) / (b - a)); break; }
      } catch { /* cross-origin sheet */ }
      this._topCache.set(key, top);
    }
    const top = this._topCache.get(key);
    return top == null ? null : (top / v.frameH) * this._css.height;
  }

  /** True if the sprite has an opaque pixel at this client point in the frame showing now. */
  hitTest(clientX, clientY) {
    if (!this._css || this.state !== 'ready') return false;
    const box = this._canvas.getBoundingClientRect();
    let x = clientX - box.left, y = clientY - box.top;
    if (x < 0 || y < 0 || x >= box.width || y >= box.height) return false;
    if (this.hasAttribute('flip')) x = box.width - 1 - x;
    // Sample the sheet pixel under the point on a shared 1×1 canvas (never read back the display canvas).
    const v = this._variant, an = this._bundle.animations[this._anim];
    const sx = this._frame * v.frameW + Math.floor((x / box.width) * v.frameW), sy = an.row * v.frameH + Math.floor((y / box.height) * v.frameH);
    try {
      probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      probe.clearRect(0, 0, 1, 1);
      probe.drawImage(this._img, sx, sy, 1, 1, 0, 0, 1, 1);
      return probe.getImageData(0, 0, 1, 1).data[3] > 0;
    } catch { return true; }   // a cross-origin sheet cannot be read: fall back to the box
  }

  /**
   * CSS px per second this animation should travel for its feet not to slide (from the bundle's
   * `speed` in units/s and the displayed height). null if the animation has no speed.
   */
  pxPerSecond(name = this._anim) {
    const a = this._bundle?.animations[name];
    if (!a?.speed || !this._css) return null;
    return (a.speed * this._css.height) / (this._bundle.size?.[1] ?? 100);
  }

  /**
   * Play an animation. A one-shot (`once`) returns to the hover or base animation when it ends.
   * Calling play with the animation already running is a no-op unless `restart` (default: `once`).
   * Returns false if the animation does not exist (or nothing is loaded yet).
   */
  play(name, { once = false, restart = once, mix = true } = {}) {
    const anims = this._bundle?.animations;
    if (!anims?.[name]) return false;
    // Already blending into this animation through a transition clip: let the clip finish.
    if (!restart && this._then?.name === name) return true;
    if (!restart && name === this._anim && !this._once && !this._ended) return true;
    // A baked transition clip "A>B" plays first when the switch happens where A ends: on its first
    // frame (a loop's end) or after a one-shot finished.
    const clip = mix && this._anim && this._anim !== name && anims[`${this._anim}>${name}`];
    const atBoundary = this._ended || this._frame === 0 || (this._once && this._frame === anims[this._anim]?.frames - 1);
    this._then = null;
    if (clip && atBoundary) {
      this._start(`${this._anim}>${name}`, true);
      this._then = { name, once };
      return true;
    }
    this._start(name, once);
    return true;
  }

  _start(name, once) {
    this._stopTimer();
    this._anim = name; this._frame = 0; this._acc = 0; this._once = once; this._ended = false;
    this._plays = (this._plays || 0) + 1;
    this._draw();
    this._sync();
    if (this._running) this._emit(0);
  }
  /** Playback speed multiplier (0.25..4), the `rate` attribute. Movement should scale with `effectiveRate`. */
  get rate() { return this._userRate ?? 1; }
  set rate(v) { this.setAttribute('rate', String(v)); }
  /** The speed frames actually play at: `rate` × the state machine node's rate × a burst speed-up. */
  get effectiveRate() { return (this._userRate ?? 1) * (this._nodeRate ?? 1) * (this._burstRate ?? 1); }

  /** State machine: set an input (number / boolean). */
  set(name, value) { this._sm?.set(name, value); }
  /** State machine: fire a trigger input. */
  fire(name) { this._sm?.fire(name); }
  /** State machine: the current node's name (null without a state machine). */
  get stateNode() { return this._sm?.node ?? null; }

  pause() { this.setAttribute('paused', ''); }
  resume() { this.removeAttribute('paused'); }
  /** Load again, refetching the bundle (use after an 'error'). */
  reload() {
    const src = this.getAttribute('src');
    if (src) bundles.delete(new URL(src, document.baseURI).href);
    this._load();
  }

  // ----- loading -----

  async _load() {
    const token = ++this._token;
    const src = this.getAttribute('src');
    const inline = src ? null : this.querySelector('script[type="application/json"]');
    if (!src && !inline) {
      // The parser may not have reached an inline bundle yet.
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (token === this._token) this._load(); }, { once: true });
      return;
    }
    this.setAttribute('state', 'loading');
    try {
      await null;   // always settle asynchronously, so listeners added right after append() see ready/error
      const base = src ? new URL(src, document.baseURI).href : document.baseURI;
      const bundle = src ? await fetchBundle(base) : checkBundle(JSON.parse(inline.textContent), 'inline bundle');
      const variant = this._chooseVariant(bundle);
      const img = await variantImage(variant, base, bundle);
      if (token !== this._token) return;   // a newer load started meanwhile
      // Commit everything at once: no frame ever sees a new bundle with an old animation.
      this._stopTimer();
      this._bundle = bundle; this._base = base; this._variant = variant; this._img = img;
      this._anim = null; this._once = false; this._ended = false;
      this._a11y();
      this._layout();
      this.setAttribute('state', 'ready');
      this._sm = bundle.states && this.getAttribute('states') !== 'off' ? this._machine(bundle) : null;
      if (this._sm) this._sm.start(bundle.states.nodes[this.getAttribute('anim')] ? this.getAttribute('anim') : undefined);
      else this.play(this._baseAnim(), { restart: true });
      this.dispatchEvent(new CustomEvent('ready'));
    } catch (error) {
      if (token === this._token) this._fail(error);
    }
  }

  _machine(bundle) {
    return new StateMachine(bundle.states, bundle.animations, {
      play: (anim, { once, phase }) => {
        if (!this.play(anim, { once, restart: true })) return;
        if (phase != null) { const a = bundle.animations[anim]; this._frame = Math.floor(phase * a.frames) % a.frames; this._draw(); }
      },
      phase: () => { const a = bundle.animations[this._anim]; return a ? (this._frame + Math.min(1, this._acc / this._frameMs(a, this._frame))) / a.frames : 0; },
      onChange: (from, to) => this.dispatchEvent(new CustomEvent('statechange', { bubbles: true, detail: { from, to } })),
      rate: (r) => { this._nodeRate = r; },
    });
  }

  _fail(error) {
    this._ended = true;
    this._sync();
    this.setAttribute('state', 'error');
    console.error(error);
    this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
  }

  _chooseVariant(bundle) {
    const skin = this.getAttribute('skin') || null;
    let vs = bundle.variants.filter((v) => (v.skin ?? null) === skin);
    if (!vs.length) vs = bundle.variants.filter((v) => !v.skin);   // unknown skin: the default look
    vs = vs.sort((a, b) => a.res - b.res);
    const forced = Number(this.getAttribute('res'));
    return (forced && vs.find((v) => v.res === forced)) || pickVariant(vs, this._size());
  }

  _size() { return Number(this.getAttribute('size')) || 128; }

  // ----- layout: reserve the box, pick the variant, size the canvas in device pixels -----

  _layout() {
    const b = this._bundle;
    if (!b) { const s = this._size(); this._setBox(s, s); return; }
    const v = this._chooseVariant(b);
    if (v !== this._variant) { this._swapVariant(v); return; }
    const dpr = globalThis.devicePixelRatio || 1;
    const m = deviceScale(v.frameW, v.frameH, this._size(), dpr);
    const c = this._canvas;
    if (c.width !== v.frameW * m || c.height !== v.frameH * m) { c.width = v.frameW * m; c.height = v.frameH * m; }
    this._m = m;
    this._css = { width: (v.frameW * m) / dpr, height: (v.frameH * m) / dpr };
    c.style.width = `${this._css.width}px`; c.style.height = `${this._css.height}px`;
    this._setBox(this._css.width, this._css.height);
    this._draw();
  }

  async _swapVariant(v) {
    const token = this._token, vt = ++this._vtoken;
    try {
      const img = await variantImage(v, this._base, this._bundle);
      if (token !== this._token || vt !== this._vtoken) return;
      this._variant = v; this._img = img;
      this._layout();
    } catch (e) {
      if (token === this._token && vt === this._vtoken) this._fail(e);
    }
  }

  _setBox(w, h) {
    const css = `:host{width:${w}px;height:${h}px}`;
    if (this._box.textContent !== css) this._box.textContent = css;
  }

  _a11y() {
    if (this.getAttribute('alt') === '') {   // decorative: hidden from assistive tech
      if (!this.hasAttribute('aria-hidden')) { this.setAttribute('aria-hidden', 'true'); this._autoHidden = true; }
      if (this._autoRole) { this.removeAttribute('role'); this._autoRole = false; }
      if (!this._userLabel) this.removeAttribute('aria-label');
      return;
    }
    if (this._autoHidden) { this.removeAttribute('aria-hidden'); this._autoHidden = false; }
    if (!this.hasAttribute('role')) { this.setAttribute('role', 'img'); this._autoRole = true; }
    if (!this._userLabel) this.setAttribute('aria-label', this.getAttribute('alt') || this._bundle?.name || 'animated sprite');
  }

  // ----- input: hover for mouse and pen, taps on touch screens -----

  handleEvent(e) {
    const burst = e.type === 'click' && this.getAttribute('burst') !== 'off' ? this._clickBurst() : null;
    if (this._sm) return this._interact(e, burst);
    const hover = this.getAttribute('hover-anim');
    if (e.type === 'pointerdown') { this._pointer = e.pointerType; return; }
    if (e.type === 'click') {
      const a = this.getAttribute('click-anim') || (this._pointer === 'touch' ? hover : null);
      // A burst of clicks speeds the one-shot up instead of restarting it on every click.
      if (a && burst && this._once && this._anim === a) this._burstRate = burst.rate;
      else if (a) this.play(a, { once: true });
      this._pointer = null;
      return;
    }
    if (e.pointerType === 'touch') return;   // touch brackets every tap with enter/leave
    this._hover = e.type === 'pointerenter';
    if (hover && !this._once) this.play(this._hover ? hover : this._baseAnim());
  }

  /**
   * Count a click toward a burst. From the third quick click on, fires 'spriteburst' {count, rate};
   * after the clicking stops, 'spritecalm' {count}, and any burst speed-up ends.
   */
  _clickBurst() {
    const now = performance.now();
    const b = this._bursts.hit(now);
    if (!b.burst) return null;
    this.dispatchEvent(new CustomEvent('spriteburst', { bubbles: true, detail: { count: b.count, rate: b.rate } }));
    clearTimeout(this._calmTimer);
    this._calmTimer = setTimeout(() => {
      if (!this._bursts.calm(performance.now())) return;
      this._burstRate = 1;
      this.dispatchEvent(new CustomEvent('spritecalm', { bubbles: true, detail: { count: b.count } }));
      this._sm?.interact('calm', { count: b.count, rate: 1 });
    }, this._bursts.gap + 20);
    return b;
  }

  /**
   * Pointer input → state machine interactions: "click" (also taps), "enter" / "leave" (mouse, pen),
   * "burst" (a quick run of clicks: "$count" and "$rate" in `set`) and "calm" (the burst is over).
   */
  _interact(e, burst) {
    if (e.type === 'pointerdown') return;
    const on = e.type === 'click' ? 'click' : e.pointerType === 'touch' ? null : e.type === 'pointerenter' ? 'enter' : 'leave';
    if (on) this._sm.interact(on);
    if (burst) this._sm.interact('burst', burst);
  }

  // ----- playback -----

  _baseAnim() {
    const a = this.getAttribute('anim');
    return a && this._bundle.animations[a] ? a : Object.keys(this._bundle.animations)[0];
  }

  _rate(a) { return (this._fps || a.fps) * this.effectiveRate; }

  _setVisible(v) { this._visible = v; this._sync(); }

  _stopTimer() { if (this._timer) { clearTimeout(this._timer); this._timer = 0; } }

  _sync() {
    const a = this._bundle?.animations[this._anim];
    const moving = !!(a && this._img && this.isConnected && a.frames > 1 && !this._ended && !this.hasAttribute('paused'));
    const run = moving && this._visible && !reducedMotion();
    if (run !== !!this._running) { if (run) clock.add(this._tick); else clock.remove(this._tick); this._running = run; }
    // Reduced motion or off-screen: no frame stepping, but one-shots and non-looping animations still
    // end on time, so code waiting for 'spriteend' never hangs.
    const hold = moving && (reducedMotion() || !this._visible) && (this._once || !a.loop);
    if (!hold) this._stopTimer();
    else if (!this._timer) {
      this._frame = this._once ? Math.floor(a.frames / 2) : a.frames - 1;
      this._draw();
      let ms = 0;
      for (let f = 0; f < a.frames; f++) ms += this._frameMs(a, f);
      this._timer = setTimeout(() => { this._timer = 0; this._end(); }, ms);
    }
  }

  /** How long frame f shows, in ms: the bundle's per-frame durations (holds) or 1000 / fps. */
  _frameMs(a, f) { return a.durations ? (a.durations[f] * a.fps) / this._rate(a) : 1000 / this._rate(a); }

  _advance(dt) {
    const a = this._bundle.animations[this._anim];
    const plays = this._plays;
    this._acc += dt;
    let f = this._frame, steps = 0;
    while (this._acc >= this._frameMs(a, f)) {
      if (++steps > a.frames * 2) { this._acc = 0; break; }   // never spin: at most two loops per tick
      this._acc -= this._frameMs(a, f);
      if (f + 1 < a.frames) f++;
      else if (a.loop && !this._once) {
        f = 0;
        if (this._sm) { this._frame = f; this._sm.loopEnd(); if (this._plays !== plays) return; }
      } else { if (f !== this._frame) { this._frame = f; this._draw(); } this._end(); return; }
      if (a.events) {
        // Every frame entered fires its events, also frames skipped in a catch-up after a slow frame.
        this._frame = f;
        if (this._emit(f) && this._plays !== plays) return;   // a listener started another animation
      }
    }
    if (f !== this._frame || f !== this._drawn) { this._frame = f; this._draw(); }
  }

  /** Fire the events of frame f of the current animation. Returns true if there were any. */
  _emit(f) {
    const a = this._bundle.animations[this._anim];
    let any = false;
    for (const e of a.events || []) {
      if (e.frame !== f) continue;
      if (!any) { any = true; if (this._drawn !== f) this._draw(); }
      this.dispatchEvent(new CustomEvent('spriteevent', { bubbles: true, detail: { anim: this._anim, frame: f, name: e.name, data: e.data } }));
      this._sm?.event(e.name);
    }
    return any;
  }

  _end() {
    const done = this._anim;
    if (this._then) {   // a transition clip finished: on to the animation it leads into (no spriteend)
      const { name, once } = this._then;
      this._then = null;
      this._start(name, once);
      return;
    }
    const fire = () => this.dispatchEvent(new CustomEvent('spriteend', { detail: { anim: done }, bubbles: true }));
    if (this._sm) {
      const plays = this._plays;
      this._once = false; this._ended = true; this._sync();
      fire();
      if (this._plays === plays) this._sm.ended(done);   // unless a listener already played something
      return;
    }
    if (!this._once) { this._ended = true; this._sync(); fire(); return; }
    this._once = false;
    fire();
    if (this._anim !== done || this._once) return;   // a listener already chose what plays next
    const hover = this._hover && this.getAttribute('hover-anim');
    if (!hover || !this.play(hover, { restart: true })) this.play(this._baseAnim(), { restart: true });
  }

  _draw() {
    const v = this._variant, a = this._bundle?.animations[this._anim], m = this._m;
    if (!v || !a || !this._img || !m) return;
    const ctx = this._ctx, c = this._canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(this._img, this._frame * v.frameW, a.row * v.frameH, v.frameW, v.frameH, 0, 0, v.frameW * m, v.frameH * m);
    this._drawn = this._frame;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('pixel-sprite')) customElements.define('pixel-sprite', PixelSprite);
