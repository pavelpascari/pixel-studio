// <pixel-sprite loading="lazy"> and the box it reserves before load, on a small fake DOM: just enough of
// HTMLElement, IntersectionObserver, fetch and Image for the element's load path to run in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- the fake DOM (installed before the module is imported) ----------

const observers = [];
class FakeIO {
  constructor(cb, opts = {}) { this.cb = cb; this.rootMargin = opts.rootMargin; this.targets = new Set(); observers.push(this); }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  /** Report each target in `els` as intersecting (or not). */
  fire(els, isIntersecting = true) { this.cb(els.filter((el) => this.targets.has(el)).map((target) => ({ target, isIntersecting }))); }
}
const nearObserver = () => observers.find((o) => o.rootMargin === '100%');

const noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });
class FakeElement extends EventTarget {
  constructor() { super(); this._attrs = new Map(); this._connected = false; }
  get isConnected() { return this._connected; }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  hasAttribute(n) { return this._attrs.has(n); }
  setAttribute(n, v) {
    const old = this.getAttribute(n);
    this._attrs.set(n, String(v));
    if (this.constructor.observedAttributes?.includes(n)) this.attributeChangedCallback?.(n, old, String(v));
  }
  removeAttribute(n) {
    const old = this.getAttribute(n);
    this._attrs.delete(n);
    if (this.constructor.observedAttributes?.includes(n)) this.attributeChangedCallback?.(n, old, null);
  }
  toggleAttribute(n, on) { if (on) this.setAttribute(n, ''); else this.removeAttribute(n); }
  querySelector() { return null; }
  attachShadow() {
    const styles = [{ textContent: '' }, { textContent: '' }];
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
    return { set innerHTML(_) {}, querySelectorAll: () => styles, querySelector: () => canvas };
  }
}
globalThis.HTMLElement = FakeElement;
globalThis.IntersectionObserver = FakeIO;
globalThis.document = { baseURI: 'https://example.test/page.html', readyState: 'complete', addEventListener: noop };
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
globalThis.addEventListener = noop;
globalThis.requestAnimationFrame = () => 1;   // the frame loop never runs: these tests are about loading
globalThis.Image = class { decode() { return Promise.resolve(); } };

const BUNDLE = {
  format: 'pixel-sprite/1', name: 'blob',
  animations: { idle: { row: 0, frames: 2, fps: 10 }, hop: { row: 1, frames: 2, fps: 10 } },
  variants: [{ res: 16, frameW: 16, frameH: 16, image: 'data:image/png;base64,AAAA' }],
};
const fetched = [];
globalThis.fetch = async (url) => { fetched.push(url); return new Response(JSON.stringify(BUNDLE)); };

const { PixelSprite } = await import('../src/pixel-sprite.js');

// ---------- helpers ----------

let n = 0;
/** A new sprite with these attributes (a unique src each, so the bundle cache does not hide fetches). */
function sprite(attrs = {}) {
  const el = new PixelSprite();
  for (const [k, v] of Object.entries({ src: `blob-${++n}.json`, ...attrs })) el.setAttribute(k, v);
  return el;
}
const connect = (el) => { el._connected = true; el.connectedCallback(); return el; };
const disconnect = (el) => { el._connected = false; el.disconnectedCallback(); return el; };
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
const fetchesOf = (el) => fetched.filter((u) => u.endsWith(`/${el.getAttribute('src')}`)).length;
const reserved = (el) => el._box.textContent;

// ---------- tests ----------

test('loading: eager by default, as before: connect fetches, loads and fires pixel-ready', async () => {
  const el = sprite({ size: '64' });
  let ready = 0;
  el.addEventListener('pixel-ready', () => ready++);
  assert.equal(el.loading, 'eager');
  connect(el);
  assert.equal(el.status, 'loading');
  await settle();
  assert.equal(fetchesOf(el), 1);
  assert.equal(el.status, 'ready');
  assert.equal(ready, 1);
  assert.ok(!nearObserver()?.targets.has(el));
});

test('loading="lazy": nothing is fetched and status stays idle until the sprite comes near', async () => {
  const el = sprite({ size: '64', loading: 'lazy' });
  let ready = 0;
  el.addEventListener('pixel-ready', () => ready++);
  connect(el);
  await settle();
  assert.equal(el.loading, 'lazy');
  assert.equal(fetchesOf(el), 0);
  assert.equal(el.status, 'idle');
  assert.equal(el.hasAttribute('status'), false);
  assert.equal(reserved(el), ':host{width:64px;height:64px}', 'the box is reserved while waiting');
  const near = nearObserver();
  assert.ok(near.targets.has(el), 'watched with a one-viewport margin');

  near.fire([el], false);   // an entry that does not intersect changes nothing
  await settle();
  assert.equal(fetchesOf(el), 0);

  near.fire([el]);
  assert.equal(el.status, 'loading');
  await settle();
  assert.equal(fetchesOf(el), 1);
  assert.equal(el.status, 'ready');
  assert.equal(ready, 1);
  assert.ok(!near.targets.has(el), 'watched only until it first comes near');
});

test('loading="lazy": src changes before it comes near do not fetch; the last one loads', async () => {
  const el = connect(sprite({ loading: 'lazy' }));
  const first = el.getAttribute('src');
  el.setAttribute('src', 'second.json');
  el.setAttribute('src', 'third.json');
  el.reload();
  await settle();
  assert.equal(fetched.filter((u) => /\/(second|third)\.json$/.test(u) || u.endsWith(`/${first}`)).length, 0);
  nearObserver().fire([el]);
  await settle();
  assert.deepEqual(fetched.filter((u) => /\/(second|third)\.json$/.test(u) || u.endsWith(`/${first}`)), ['https://example.test/third.json']);
  assert.equal(el.status, 'ready');
  // Once loaded, it behaves like an eager sprite: a new src loads at once, wherever it is.
  el.setAttribute('src', 'fourth.json');
  await settle();
  assert.ok(fetched.includes('https://example.test/fourth.json'));
});

test('loading="lazy": attributes and pause() set while waiting apply once loaded', async () => {
  const el = connect(sprite({ loading: 'lazy', size: '48' }));
  el.setAttribute('anim', 'hop');
  el.pause();
  el.setAttribute('size', '32');
  assert.equal(el.play('hop'), false, 'play() before load returns false, as for an eager sprite');
  assert.equal(reserved(el), ':host{width:32px;height:32px}');
  nearObserver().fire([el]);
  await settle();
  assert.equal(el.status, 'ready');
  assert.equal(el.currentAnim, 'hop');
  assert.ok(!el._running, 'still paused: not in the frame loop');
  el.resume();
  assert.equal(el._running, true);
  assert.deepEqual(el.displaySize, { width: 32, height: 32 });
});

test('loading="lazy": removed before it comes near, it stops waiting; put back, it waits again', async () => {
  const el = connect(sprite({ loading: 'lazy' }));
  const near = nearObserver();
  disconnect(el);
  assert.ok(!near.targets.has(el));
  near.fire([el]);
  await settle();
  assert.equal(fetchesOf(el), 0);
  connect(el);
  assert.ok(near.targets.has(el));
  near.fire([el]);
  await settle();
  assert.equal(fetchesOf(el), 1);
  assert.equal(el.status, 'ready');
});

test('loading="lazy": switching to eager while waiting loads at once', async () => {
  const el = connect(sprite({ loading: 'lazy' }));
  await settle();
  assert.equal(fetchesOf(el), 0);
  el.removeAttribute('loading');
  await settle();
  assert.equal(fetchesOf(el), 1);
  assert.equal(el.status, 'ready');
  assert.ok(!nearObserver().targets.has(el));
});

test('loading="lazy" without IntersectionObserver loads at once', async () => {
  const real = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    const el = connect(sprite({ loading: 'lazy' }));
    await settle();
    assert.equal(fetchesOf(el), 1);
    assert.equal(el.status, 'ready');
  } finally { globalThis.IntersectionObserver = real; }
});

test('the box is reserved from size before the bundle arrives (128 px without size)', () => {
  assert.equal(reserved(connect(sprite({ loading: 'lazy' }))), ':host{width:128px;height:128px}');
  assert.equal(reserved(connect(sprite({ size: '72' }))), ':host{width:72px;height:72px}');
});
