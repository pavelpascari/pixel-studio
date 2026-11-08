# `<pixel-sprite>` runtime and bundle format

`<pixel-sprite>` is a custom element that plays a Pixel Studio **bundle** (one JSON file holding a character's sprite sheets at several resolutions) on any web page. It has no dependencies. Source: [`src/runtime/pixel-sprite.js`](../src/runtime/pixel-sprite.js).

This page covers the element and the bundle format. For the character spec that bundles are built from, see [SPEC.md](SPEC.md). For the engine's JavaScript API (`buildBundle`, `renderSheet`, ...) see [api.md](api.md). For how the pieces fit together see [architecture.md](architecture.md). For skeletons, motions and `speed`, see [figures.md](figures.md). To produce a bundle, see [cli.md](cli.md#bundle).

- [Installation](#installation)
- [Attributes](#attributes)
- [Properties and methods](#properties-and-methods)
- [Events](#events)
- [Loading, errors and fallbacks](#loading-errors-and-fallbacks)
- [Animation playback](#animation-playback)
- [Events, attachment points and the foot line](#events-attachment-points-and-the-foot-line)
- [State machines](#state-machines)
- [Skins](#skins)
- [How the resolution variant is chosen](#how-the-resolution-variant-is-chosen)
- [Device pixels and scaling](#device-pixels-and-scaling)
- [Reduced motion and off-screen pausing](#reduced-motion-and-off-screen-pausing)
- [Touch screens](#touch-screens)
- [Styling](#styling)
- [Accessibility](#accessibility)
- [Moving a walking sprite across the page](#moving-a-walking-sprite-across-the-page)
- [Testing on devices](#testing-on-devices)
- [Examples](#examples)
- [Bundle format `pixel-sprite/1`](#bundle-format-pixel-sprite1)

## Installation

The runtime is a single ES module. Copy `src/runtime/pixel-sprite.js` next to your page and load it with a module script. Loading it registers the element as `pixel-sprite` (unless that name is already defined).

```html
<script type="module" src="pixel-sprite.js"></script>
<pixel-sprite src="fox.bundle.json" anim="idle" size="128"></pixel-sprite>
```

`npm run build:demo` copies this file to `demo/assets/pixel-sprite.js`, which is what the demo pages load.

If you install the package (from a git checkout or path; it is not on npm yet), the module is also exported as `pixel-studio/runtime`:

```js
import 'pixel-studio/runtime';                         // registers <pixel-sprite>
import { PixelSprite, clock, pickVariant } from 'pixel-studio/runtime';
```

The module exports:

| Export | What |
|---|---|
| `PixelSprite` | The element class. `PixelSprite.clock` is the same object as `clock`. |
| `clock` | The shared frame loop (see [Moving a walking sprite](#moving-a-walking-sprite-across-the-page)). |
| `pickVariant(variants, size)` | The variant chooser ([below](#how-the-resolution-variant-is-chosen)). |
| `deviceScale(frameW, frameH, size, dpr)` | Device pixels per sprite pixel ([below](#device-pixels-and-scaling)). |
| `checkBundle(bundle, where?)` | Throws a clear error unless the object is a valid `pixel-sprite/1` bundle; returns it. |
| `BUNDLE_FORMAT` | `"pixel-sprite/1"`. |

It can be imported in Node: without `HTMLElement`, the class extends an empty class and the element is not registered. The tests use this for the helpers and the clock.

### Inline bundles

Instead of `src`, the bundle can be placed inside the element in a `<script type="application/json">` child. This makes the snippet self-contained:

```html
<pixel-sprite anim="idle" size="64">
  <script type="application/json">{"format":"pixel-sprite/1","name":"...","animations":{...},"variants":[...]}</script>
</pixel-sprite>
```

If both are present, `src` wins. The inline JSON is read once, when the element connects (or when `src` changes). If the element connects while the page is still parsing and its inline script is not there yet, it tries again at `DOMContentLoaded`.

## Attributes

| Attribute | Default | Observed | Description |
|---|---|---|---|
| `src` | none | yes | URL of a bundle JSON file, resolved against `document.baseURI`. Changing it loads the new bundle; if several changes overlap, the last one wins. Fetches are cached per absolute URL, so sprites sharing a bundle fetch it once and share its decoded sheets. Failed fetches are not cached. |
| `anim` | first animation in the bundle | yes | Base animation. If the name is not in the bundle, the first animation is used. Changing the attribute plays the new animation (an unknown name is ignored). |
| `size` | `128` | yes | Target display height in CSS pixels. Used to reserve the box before load, to choose a resolution variant, and to choose the scale. The displayed size can differ from `size` (see [below](#how-the-resolution-variant-is-chosen)). |
| `res` | none | yes | Force a variant by its `res` (e.g. `res="16"` for a chunky look at a large size). If the bundle has no variant with that `res`, the automatic choice is used. |
| `fps` | the animation's `fps` | yes | Overrides the frame rate of every animation. |
| `hover-anim` | none | read on event | Ignored when the bundle has a [state machine](#state-machines) (its interactions take over). Animation to play while a mouse or pen is over the element. On leave the base animation resumes, unless a one-shot is still running. On touch screens a tap plays it once (see [Touch screens](#touch-screens)). |
| `click-anim` | none | read on event | Animation to play once on `click` (or tap). When it finishes, the element fires `spriteend` and returns to `hover-anim` (if a mouse is still over it) or to the base animation. |
| `paused` | absent | yes | Boolean. While present, playback stops on the current frame. `pause()` and `resume()` set and remove it. |
| `flip` | absent | CSS | Boolean. Mirrors the sprite horizontally with CSS (`transform: scaleX(-1)` on the canvas). Characters drawn facing right face left. |
| `skin` | none | yes | A skin baked into the bundle (see [Skins](#skins)). Unknown names show the default look. |
| `states` | on | at load | `states="off"` ignores the bundle's state machine (pages and `<pixel-stage>` that choose animations themselves set this). |
| `alt` | none | yes | Text alternative, copied into `aria-label`. `alt=""` marks the sprite as decorative (see [Accessibility](#accessibility)). |
| `state` | set by the element | — | `loading`, `ready` or `error`. Absent before the first load starts. Use it for CSS, e.g. `pixel-sprite[state=error] { display: none }`. |

Attribute changes made before the element is first connected (including the attribute callbacks of an upgrade) are folded into the single first load.

## Properties and methods

| Member | Description |
|---|---|
| `el.bundle` | The parsed bundle object, or `undefined` before it has loaded. Read-only. |
| `el.animations` | Array of animation names in the bundle (`[]` before load). |
| `el.currentAnim` | Name of the animation showing now (`null` before load). |
| `el.frame` | Index of the frame showing now. |
| `el.state` | `'idle'`, `'loading'`, `'ready'` or `'error'`. |
| `el.displaySize` | `{ width, height }` in CSS px as displayed, or `null` before load. |
| `el.pxPerSecond(name = currentAnim)` | CSS px per second that animation should travel for its feet not to slide, at the displayed size; `null` if it has no `speed`. |
| `el.play(name, { once = false, restart = once } = {})` | Play `name`. With `once: true` it plays to the end, fires `spriteend`, then returns to `hover-anim` (if a mouse is over it) or the base animation. If `name` is already playing (looping, not a one-shot) the call does nothing unless `restart: true`, so hovering in and out does not restart a walk cycle. Returns `false` for unknown names or before load. Does not change the `anim` attribute. |
| `el.pxPerSecondY(name)` | The same for climbing animations (`speedY`): CSS px per second upward. |
| `el.groundOffset` | CSS px from the top of the box down to the foot line (bundle `ground`): place the box at `feetY − groundOffset` to stand on something. |
| `el.point(name, { relative = false })` | Where an attachment point (bundle `points`, e.g. `beak`) is in the frame showing now: `{ x, y, rot }` in client px, or relative to the box. Mirrored with `flip`. `null` if the bundle has no such point. |
| `el.hitTest(clientX, clientY)` | `true` if the frame showing now has an opaque pixel there (for clicks on the character, not its box). |
| `el.set(input, value)` / `el.fire(trigger)` | Drive the bundle's state machine (no-ops without one). |
| `el.stateNode` | The state machine's current node, or `null`. |
| `el.pause()` / `el.resume()` | Set / remove the `paused` attribute. |
| `el.reload()` | Fetch the bundle again (bypassing the cache) and reload. Use after an `error`. |

## Events

| Event | Bubbles | `detail` | When |
|---|---|---|---|
| `ready` | no | none | The bundle has loaded, the variant sheet has decoded, and the base animation has started. Fired again after each successful `src` change or `reload()`. Always asynchronous, so a listener added right after `append()` sees it. |
| `error` | no | `{ error }` | Loading failed: HTTP error, invalid JSON, a bundle that fails `checkBundle`, an undecodable sheet, or an exception during playback. The element's `state` becomes `error` and fallback content shows (see below). The error is also logged with `console.error`. |
| `spriteend` | yes | `{ anim }` | A one-shot animation (`play(name, { once: true })`, `click-anim`, or a tap) reached its end, or a non-looping animation (`loop: false`) played as a normal animation reached its last frame. Also fired under reduced motion and while off-screen, after the animation's duration, so code waiting for it never hangs. |
| `spriteevent` | yes | `{ anim, frame, name, data }` | A frame with a baked event is shown: `footstep`, `land`, `launch`, an author's `honk` (see [Events](#events-attachment-points-and-the-foot-line)). |
| `statechange` | yes | `{ from, to }` | The state machine moved to another node. |

Because `spriteend` bubbles, one listener can watch every sprite on a page (from `demo/index.html`):

```html
<script type="module">
  document.addEventListener('spriteend', (e) => {
    if (e.target.localName === 'pixel-sprite') console.log('[pixel-sprite] finished', e.detail.anim);
  });
</script>
```

## Loading, errors and fallbacks

- **The box is reserved at once.** Before the bundle arrives the element is `size × size` CSS px (the canvas starts at 0 × 0, not the browser's default 300 × 150), so the page does not jump when it loads. After load the box takes the displayed size. If it fails, the box stays reserved.
- **Fallback content.** Children of the element (other than the inline bundle script) are shown until the sprite is `ready`, and again on `error`. A poster image is the usual choice; it also shows when JavaScript is off:

  ```html
  <pixel-sprite src="fox.bundle.json" size="128" alt="A fox">
    <img src="fox-poster.png" alt="">
  </pixel-sprite>
  ```

  Slotted `<img>` elements fill the box with `image-rendering: pixelated`. Any still of the character works as a poster (for example one frame cut from a `pixel render` sheet).
- **Before the script runs** the element is an unknown inline element. To reserve its space even then, add a rule such as `pixel-sprite:not(:defined) { display: inline-block; width: 128px; height: 128px }`.
- **Races.** Each load carries a token; a load that is overtaken by a newer `src` is dropped. A new bundle, its variant and its sheet are committed together, so no frame ever sees a bundle with an animation from another one.
- **Shared work.** Bundles are fetched once per URL and each variant sheet is decoded once (into an `ImageBitmap` where supported) and shared by every sprite that uses it.
- **Content Security Policy.** Bundles with data-URL sheets (the default) need `img-src data:`; fetched bundles need `connect-src` for their URL. For a strict CSP, build bundles whose `image` fields point at separate PNG files.

## Animation playback

All sprites on a page share one frame loop (the exported `clock`). It runs only while something is subscribed. Each frame it computes one `dt` (ms since the last frame, capped at `clock.maxDt` = 100 ms) and passes it to every subscriber. The next frame is requested before subscribers run, and each subscriber runs in its own `try`/`catch`: a sprite that throws goes to `state="error"` and leaves the loop, and every other sprite keeps playing. `dt` restarts from 0 when the page becomes visible again or is restored from the back/forward cache.

Each sprite accumulates `dt` and advances one frame every `1000 / fps` ms, and draws only when the frame changes. An animation is scheduled only if it has more than one frame, the element is connected and visible, it is not `paused`, the user does not prefer reduced motion, and a non-looping animation has not already ended.

There are three ways an animation can end:

| How it was started | `loop` in bundle | At the last frame |
|---|---|---|
| `anim` attribute, `hover-anim`, or `play(name)` | `true` | Wraps to frame 0 and keeps playing. |
| `anim` attribute, `hover-anim`, or `play(name)` | `false` | Stops on the last frame and fires `spriteend`. A later `play()` (or hover, click, `anim` change) starts again. |
| `click-anim`, a tap, or `play(name, { once: true })` | either | Fires `spriteend`, then plays `hover-anim` if a mouse is over the element and it has one, otherwise the base animation. If a `spriteend` listener calls `play()`, that choice wins. |

`loop` defaults to `true` in the spec; set `"loop": false` for actions like a honk or jump (see [SPEC.md](SPEC.md#animations)). In the example geese, `honk` is `loop: false`; the flock page plays it with `play('honk', { once: true })`.

**Frame rates.** Prefer rates that divide 30, 60 and 120 Hz evenly: 6, 10, 15 or 30 fps. Phones in low-power mode often cap the display at 30 Hz, and at 12 fps frames then last an uneven 2 or 3 refreshes, which reads as a stutter.

## Events, attachment points and the foot line

The engine bakes timing and geometry into the bundle, so pages can react to what the character is doing.

**Events.** Animations can carry `events: [{frame, name, data?}]`. Motion models add them automatically: `footstep`
(with `data.leg`) when a foot touches down in a walk, run or climb, `takeoff` and `land` for hops, `launch` and `land`
for jumps. Authors add their own (`"events": [{"frame": 3, "name": "honk"}]`). The element fires `spriteevent` when a frame
with events is shown, including frames skipped while catching up after a slow frame, and not while paused, off-screen or
under reduced motion.

```js
goose.addEventListener('spriteevent', (e) => {
  if (e.detail.name === 'footstep') playSound('pat');
  if (e.detail.name === 'honk') showBubble(goose.point('beak'));
});
```

**Holds.** An animation with `holds` in the spec gets `durations` (ms per frame) in the bundle; the element shows each
frame for its own duration. The `fps` attribute scales them.

**Attachment points.** `points` lists named points (`beak`, `head`, `handNear`, …) per animation and frame, in spec units.
`el.point('beak')` converts the current one to page coordinates: for speech bubbles, a held item drawn as another sprite,
particles, or a cursor the goose pecks at.

**The foot line.** `ground` is where the character's feet are (y in units). `el.groundOffset` gives it in CSS px for the
displayed size, so a sprite can stand exactly on an element's top edge: `top = element.top − groundOffset`.

## State machines

A bundle can carry a state machine (`states` in the spec, copied into the bundle). The page sets intent; the character
does the choreography. From `examples/goose-root.json`:

```json
"states": {
  "initial": "idle",
  "inputs": {"speed": 0, "honk": "trigger", "hovered": false},
  "nodes": {
    "idle": {"anim": "idle", "random": [{"anim": "hack", "every": [6, 12]}]},
    "walk": {"anim": "waddle"},
    "run":  {"anim": "run"},
    "honk": {"anim": "honk", "then": "previous"},
    "hack": {"anim": "hack"}
  },
  "transitions": [
    {"from": "*", "to": "honk", "when": "honk"},
    {"from": ["idle", "hack"], "to": "walk", "when": "speed > 0 && speed <= 60"},
    {"from": ["idle", "hack", "walk"], "to": "run", "when": "speed > 60", "at": "sync"},
    {"from": "run", "to": "walk", "when": "speed > 0 && speed <= 60", "at": "sync"},
    {"from": ["walk", "run"], "to": "idle", "when": "speed == 0", "at": "footstep"},
    {"from": "idle", "to": "hack", "when": "hovered"},
    {"from": "hack", "to": "idle", "when": "!hovered"}
  ],
  "interactions": [{"on": "click", "fire": "honk"}, {"on": "enter", "set": {"hovered": true}}, {"on": "leave", "set": {"hovered": false}}]
}
```

```js
goose.set('speed', 40);   // walks
goose.set('speed', 90);   // runs, without restarting the stride
goose.set('speed', 0);    // stops on the next footstep, feet together
goose.fire('honk');       // honks, then goes back to what it was doing
goose.addEventListener('statechange', (e) => console.log(e.detail.from, '→', e.detail.to));
```

| part | meaning |
|---|---|
| `inputs` | Starting values: numbers, booleans, words, or `"trigger"` (true only while it is being fired). |
| `nodes.<name>.anim` | The animation the node plays (looping, or once if the animation does not loop). |
| `nodes.<name>.then` | Play once, then go to this node, or `"previous"`. |
| `nodes.<name>.random` | Idle fidgets: `[{"anim", "every": [min, max] seconds, "weight"}]`, each played once, then back. |
| `transitions[].from` / `to` | A node, a list of nodes, or `"*"`. The first matching transition wins. |
| `transitions[].when` | `name`, `!name`, or `name op value` (`== != > < >= <=`), joined with `&&`. |
| `transitions[].at` | When to switch: `now` (default), `end` (when the animation finishes or loops), `sync` (keep the cycle's phase: walk → run without a hitch), or an event name such as `footstep`. A waiting switch is dropped if its condition stops being true. |
| `interactions` | `on`: `click` (taps too), `enter`, `leave` (mouse and pen); then `fire` a trigger and/or `set` inputs. They replace `hover-anim` and `click-anim`. |

`play()` still works and overrides the machine until its next transition. `states="off"` turns the machine off. The
machine is a plain class, exported as `StateMachine` (with `parseCondition`), and runs without a DOM.

## Skins

A spec's `skins` are named patches (parts, materials, material remapping, style) such as a party hat or a team colour.
The bundle bakes every skin as extra variants tagged with `skin`. The `skin` attribute picks one and can change at any
time; the sheet is swapped without restarting the animation.

```html
<pixel-sprite src="goose-root.bundle.json" skin="party"></pixel-sprite>
```

A skin that moves the parts attachment points ride on gets its own table (`skinPoints`); the foot line is shared.
Each skin adds a full set of sheets, so it adds about as much as the default look to the bundle (`goose-root`: 73 KB
with no skins, 212 KB with two).

## How the resolution variant is chosen

A bundle has several variants (by default 16, 32 and 64 px tall). The element picks one, much as `srcset` picks an image, and scales it by a whole number so that every sprite pixel becomes a `k × k` block of CSS pixels.

`pickVariant(variants, size)` (exported):

1. For each variant, `k = max(1, round(size / frameH))` and `err = |frameH × k − size| / size`.
2. Among variants with `k ≥ 2` and `err ≤ 0.2` (within 20% of `size`), choose the one with the largest `res` (the most detail).
3. Otherwise, choose the variant with the smallest `err`, considering only variants with `k ≥ 2` if any exist. Ties go to the larger `res`.

The sprite is then displayed at about `frameW × k` by `frameH × k` CSS pixels; the exact size is rounded to whole device pixels (see [Device pixels and scaling](#device-pixels-and-scaling)). A large variant is never scaled down below 1×.

Results with the default 16/32/64 variants (from `test/runtime.test.mjs` and the demo pages):

| `size` | Variant | `k` | Displayed height (at DPR 1) |
|---|---|---|---|
| 12 | 16 | 1 | 16 px |
| 24 | 16 | 2 | 32 px |
| 36 | 16 | 2 | 32 px |
| 64 | 32 | 2 | 64 px |
| 72 | 32 | 2 | 64 px |
| 128 | 64 | 2 | 128 px |
| 150 | 64 | 2 | 128 px |
| 400 | 64 | 6 | 384 px |

`size` is matched against frame **height**. The width follows the variant's aspect ratio (`frameW = round(res × width / height)` of the spec's canvas).

With `res` set, `k = max(1, round(size / frameH))` is still applied to the forced variant. For example `size="128" res="16"` displays the 16 px render at 8× (128 px).

Changing `size` or `res` re-runs the choice. A new variant sheet is decoded only if the chosen variant changed (and only once per page).

## Device pixels and scaling

Phones have fractional device pixel ratios (2.625, 2.75, 1.5) and desktop users zoom. An integer scale in CSS px is then a fractional scale in screen pixels, and pixel art comes out with uneven or blurred pixels. So the element picks the scale in **device** pixels:

```
k = max(1, round(size / frameH))                 // CSS scale, as above
m = max(1, round(k × devicePixelRatio))          // device px per sprite pixel (deviceScale)
canvas backing store = frameW·m × frameH·m       // drawn with nearest-neighbour, no smoothing
CSS size             = frameW·m / dpr × frameH·m / dpr
```

Every sprite pixel is exactly `m × m` screen pixels, whatever the browser's `image-rendering` support. For example, at DPR 2.625 and `size="128"` with a 64 px variant, `m = 5`, the canvas is 320 × 320, and the sprite is displayed at 121.9 CSS px. The backing store is capped at 4096 px on its longest side. The element re-lays-out when the device pixel ratio changes (moving the window to another screen, zooming). `image-rendering: pixelated` stays on as a safety net.

To keep the pixels aligned when you move a sprite, round positions to device pixels: `Math.round(x * devicePixelRatio) / devicePixelRatio`.

## Reduced motion and off-screen pausing

- **Reduced motion.** While `prefers-reduced-motion: reduce` matches, no sprite steps through frames: looping animations show frame 0. One-shots and non-looping animations are not left hanging: a one-shot shows its middle frame, a non-looping animation its last frame, and after the animation's nominal duration (`frames / fps`) the element fires `spriteend` and moves on as usual. The setting is watched live: turning it on or off takes effect immediately.
- **Off-screen.** One shared `IntersectionObserver` (with a 50 px margin, so sprites start just before they scroll in) takes sprites out of the frame loop while they are off-screen. They resume from the same frame. A one-shot started off-screen still ends (and fires `spriteend`) after its duration, as under reduced motion.
- **Removed from the document.** The sprite leaves the frame loop and the observer. If it is put back (for example, moved to another container), it resumes where it was instead of reloading.

## Touch screens

On touch screens `pointerenter` and `pointerleave` fire around every tap, so a hover animation would only flash while the finger is down. The element therefore:

- runs `hover-anim` on hover only for mouse and pen pointers;
- on a tap, plays `click-anim` once, or, if there is none, plays `hover-anim` once, so touch users see it too;
- never calls `preventDefault` and does not set `touch-action`, so sprites never block scrolling.

Make tappable sprites at least 44 × 44 CSS px, or give them padding.

## Styling

The element renders into a `<canvas>` in an open shadow root with these styles:

```css
:host { display: inline-block; line-height: 0; vertical-align: bottom }
canvas { display: block; image-rendering: crisp-edges; image-rendering: pixelated }
:host([flip]) canvas { transform: scaleX(-1) }
:host(:not([state=ready])) canvas { display: none }
:host([state=ready]) slot { display: none }
::slotted(img) { display: block; width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated }
```

- The host is `inline-block`, so sprites can sit in a line of text (`demo/index.html` uses `vertical-align: -6px` on an inline sprite). Set `display: block` when positioning it (as `demo/flock.html` does).
- The canvas is exposed as a part: style it with `pixel-sprite::part(canvas) { ... }`.
- Size the sprite with the `size` attribute, not CSS `width`/`height`. The element sizes its host and canvas itself; scaling it with CSS produces uneven pixels.
- Pixels in the sheet are opaque or fully transparent, so the page background shows around the character.

## Accessibility

- The element gets `role="img"` unless it already has a `role`.
- Unless you set `aria-label` yourself, it is set to the first non-empty value of: the `alt` attribute, the bundle's `name`, the string `"animated sprite"`. It updates when `alt` or the bundle changes.
- `alt=""` marks the sprite as decorative: the element gets `aria-hidden="true"` and no role.
- `click-anim` responds to `click` events only. The element is not focusable and has no keyboard handling, so do not use `click-anim` for anything a user needs.
- Users who prefer reduced motion see still frames (see above). Under WCAG 2.2.2, anything that moves for more than five seconds alongside other content needs a way to pause it: `pause()` or the `paused` attribute.

## Moving a walking sprite across the page

Gait animations made by the figure motion models (walk, run, trot, sneak, travelling hops) export a `speed` in the bundle: how many spec **units** per second the character should travel for its planted feet to stay still on the ground. Moving the element at that rate keeps the feet from sliding. See [figures.md](figures.md) and [SPEC.md](SPEC.md#motions) for how `speed` is computed.

`el.pxPerSecond(name)` converts it for you, using the displayed height and the bundle's `size` (the spec canvas in units):

```
px per second = speed × displayed height (CSS px) / canvas height (units)
```

For example, the `waddle` of `goose-root` has `speed: 26.21`; displayed at 128 px on a 100-unit canvas, the goose moves at 26.21 × 128 / 100 ≈ 33.5 px/s. Its `run` (`speed: 76.19`) moves at ≈ 97.5 px/s. Bundles built before `size` was added assume 100 units.

**Use the shared clock.** Move sprites from `clock.add(fn)`, not from a `requestAnimationFrame` loop of your own. `fn(dt, now)` gets the same capped `dt` the sprites step their frames with, so after a slow frame the body and the legs advance by the same amount and the feet still do not slide. `clock.add` returns a function that removes `fn`.

Notes:

- Characters on side-view figures face right. Set `flip` when moving left.
- Animations without `speed` (idle, poses, front-view walks) have no `speed` key; `pxPerSecond` returns `null`.
- Round positions to device pixels, and stop the loop while the scene is off-screen.

From `demo/flock.html` (abridged). Each goose is a `<pixel-sprite size="128">` inside an absolutely positioned wrapper:

```js
import { clock } from './assets/pixel-sprite.js';

function tick(dtMs, now) {
  const dt = dtMs / 1000;   // seconds
  for (const g of geese) {
    // ... pick a target (g.tx, g.ty)
    const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 4) g.dir = dx > 0 ? 1 : -1;
    const s = (g.sprite.pxPerSecond(gait) ?? g.speed) * dt;   // g.speed: fallback px/s
    g.x += (dx / d) * s; g.y += (dy / d) * s;
    setAnim(g, gait);
    const snap = (v) => Math.round(v * devicePixelRatio) / devicePixelRatio;
    g.el.style.transform = `translate(${snap(g.x)}px, ${snap(g.y)}px)`;
  }
}

// Run only while the lawn is on screen.
new IntersectionObserver((es) => (es.at(-1).isIntersecting ? clock.add(tick) : clock.remove(tick))).observe(lawn);
```

The flock page also checks `prefers-reduced-motion` itself and does not start its movement loop when it matches; the element only stops its own frame animation.

## Testing on devices

`test/browser/runtime.html` runs 21 behaviour checks in a real browser: single load on upgrade, the reserved box, errors and `reload()`, format checks, a throwing sprite not freezing the rest, `src` races, shared sheets, device-pixel scaling, `pxPerSecond`, decorative `alt`, touch and mouse input, one-shots, the shared clock, footstep events, holds, attachment points, the foot line, hit testing, the state machine and skins. They pass in desktop Chromium and in iOS 18.1 Safari (iPhone 16 simulator, device pixel ratio 3). Results and any failures are listed at the top of the page, so they can be read on a phone. Serve the repo (`npm run studio`) and open `/test/browser/runtime.html` on each device; the page prints the device pixel ratio, hover capability and reduced-motion setting next to the results.

## Examples

All from `demo/index.html` unless noted. Run `npm run studio` and open `http://localhost:5173/demo/`.

A small logo (`size=36` → 16 px variant at 2×):

```html
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="36" alt="Trailmark logo"></pixel-sprite>
```

Hover to walk, click to wave once:

```html
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="200"
              hover-anim="walk" click-anim="wave" alt="Pip the adventurer"></pixel-sprite>
```

A one-shot on click that returns to idle and fires `spriteend`:

```html
<pixel-sprite src="assets/slime.bundle.json" anim="idle" size="72" click-anim="hop" alt="Slime"></pixel-sprite>
```

A looping walk cycle as the base animation:

```html
<pixel-sprite src="assets/fox.bundle.json" anim="walk" size="72" alt="Fox"></pixel-sprite>
```

The same bundle at different sizes, and a forced variant:

```html
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="24"></pixel-sprite>             <!-- 16 px icon -->
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="64"></pixel-sprite>             <!-- 32 px sprite -->
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="128"></pixel-sprite>            <!-- 64 px portrait -->
<pixel-sprite src="assets/pip.bundle.json" anim="idle" size="128" res="16"></pixel-sprite>   <!-- 16 px at 8× -->
```

Inline in text:

```html
<p>Sprites can sit inline in text too
  <pixel-sprite class="inline-sprite" src="assets/slime.bundle.json" anim="idle" size="24" alt=""></pixel-sprite>
  like an emoji.</p>
<style>.inline-sprite { vertical-align: -6px; }</style>
```

Created from script, with `play(..., { once: true })` (from `demo/flock.html`):

```js
const sprite = document.createElement('pixel-sprite');
sprite.setAttribute('src', 'assets/goose-root.bundle.json');
sprite.setAttribute('anim', 'idle');
sprite.setAttribute('size', 128);
sprite.setAttribute('alt', 'root');
container.append(sprite);

sprite.play('honk', { once: true });   // returns to idle (or hover-anim) when done
```

## Bundle format `pixel-sprite/1`

A bundle is one JSON object. It is produced by `buildBundle()` in [`src/core/bundle.js`](../src/core/bundle.js), by `pixel bundle` ([cli.md](cli.md#bundle)), by `npm run build:demo`, and by the studio's export button. Example (from `pixel bundle examples/goose-root.json --res 48,24`, images shortened):

```json
{
  "format": "pixel-sprite/1",
  "name": "root (hacker goose)",
  "size": [100, 100],
  "ground": 90.5,
  "animations": {
    "idle":   { "row": 0, "frames": 8,  "fps": 6,  "loop": true },
    "waddle": { "row": 1, "frames": 8,  "fps": 10, "loop": true, "speed": 26.21,
                "events": [{ "frame": 0, "name": "footstep", "data": { "leg": "legNear" } },
                           { "frame": 4, "name": "footstep", "data": { "leg": "legFar" } }] },
    "honk":   { "row": 3, "frames": 10, "fps": 10, "loop": false, "events": [{ "frame": 3, "name": "honk" }],
                "durations": [100, 100, 100, 200, 100, 100, 100, 100, 100, 100] },
    "jump":   { "row": 4, "frames": 10, "fps": 10, "loop": false,
                "events": [{ "frame": 3, "name": "launch" }, { "frame": 7, "name": "land" }] },
    "climb":  { "row": 9, "frames": 8,  "fps": 12, "loop": true, "speedY": 24.55, "wall": 58, "events": [ ... ] },
    ...
  },
  "skins": ["party", "redteam"],
  "states": { ... },
  "points": { "beak": { "idle": [[85.5, 26.17, 0], ...], "waddle": [ ... ], ... }, "head": { ... }, "tail": { ... } },
  "variants": [
    { "res": 24, "lod": 2, "frameW": 24, "frameH": 24, "image": "data:image/png;base64,iVBORw0K..." },
    { "res": 48, "lod": 3, "frameW": 48, "frameH": 48, "image": "data:image/png;base64,iVBORw0K..." },
    { "res": 24, "lod": 2, "frameW": 24, "frameH": 24, "skin": "party", "image": "..." },
    ...
  ]
}
```

### Top level

| Field | Type | Description |
|---|---|---|
| `format` | string | Always `"pixel-sprite/1"` (exported as `BUNDLE_FORMAT`). The runtime rejects other values with an `error` event. |
| `name` | string | The spec's `name` (`"character"` if the spec has none). Used as the fallback `aria-label`. |
| `size` | [w, h] | The spec canvas in units. Optional (absent in bundles built with 0.1.0, where 100 × 100 is assumed). Used to convert `speed` to px/s. |
| `ground` | number | The foot line: y in units where the feet stand. From the figure (lowest toe, or the shadow line), the spec's `ground`, or the lowest opaque pixel of the first frame. |
| `animations` | object | Animation name → playback metadata. Key order is the spec's animation order; the first key is the default animation. Shared by all variants. |
| `points` | object, optional | Attachment points: `{name: {anim: [[x, y, rotDeg], …one per frame]}}` in units. |
| `skins` | array, optional | Names of the skins baked as extra variants. |
| `skinPoints` | object, optional | `{skin: points}` for skins whose points differ from the default look's. |
| `states` | object, optional | The state machine (see [State machines](#state-machines)). |
| `variants` | array | One entry per resolution (and per skin), sorted by `res` ascending within each look. |

### `animations[name]`

| Field | Type | Description |
|---|---|---|
| `row` | integer | Row of the sprite sheet holding this animation (0-based, same in every variant). |
| `frames` | integer | Number of frames (1–64 in the spec). Frame `i` is in column `i`. |
| `fps` | number | Frames per second (spec default 8). The element's `fps` attribute overrides it. |
| `loop` | boolean | `true` to repeat. `false` stops on the last frame and fires `spriteend` (see [Animation playback](#animation-playback)). |
| `speed` | number, optional | Travel speed in spec units per second for gait animations. Present only when non-zero. See [Moving a walking sprite](#moving-a-walking-sprite-across-the-page). |
| `speedY` | number, optional | Climbing speed, units per second upward. |
| `wall` | number, optional | Climbing: the x (units) of the wall the feet hold, to line the sprite up with an element's side. |
| `events` | array, optional | `[{frame, name, data?}]`, fired as `spriteevent`. |
| `durations` | array, optional | Milliseconds per frame, present when the spec has `holds`. |

### `variants[i]`

| Field | Type | Description |
|---|---|---|
| `res` | integer | Render resolution: the frame height in pixels. Default set: 16, 32, 64. |
| `lod` | 1, 2 or 3 | Detail tier the variant was rendered with: 1 icon (`res` ≤ 20), 2 sprite (21–40), 3 portrait (> 40), unless overridden at build time (`--lod`). Informational; the runtime does not use it. |
| `frameW` | integer | Frame width in pixels: `round(res × canvasWidth / canvasHeight)` of the spec's `size`. |
| `frameH` | integer | Frame height in pixels (equals `res`). |
| `skin` | string, optional | The skin this variant shows; absent for the default look. |
| `image` | string | The sprite sheet as a PNG. The tools write a `data:image/png;base64,...` URL. A relative or absolute URL also works: the runtime resolves it against the bundle's `src` URL (or the document base for inline bundles). |

### Sprite sheet layout

Each variant's image is a grid of frames, `frameW × frameH` each:

- one row per animation, in the order of `animations` (row index = `animations[name].row`);
- one column per frame, starting at column 0;
- sheet width = (most frames of any animation) × `frameW`; sheet height = (number of animations) × `frameH`;
- unused cells (animations with fewer frames) are transparent.

The runtime draws frame `f` of animation `a` from the source rectangle `x = f × frameW`, `y = a.row × frameH`, `frameW × frameH`.

`pixel render` writes the same sheet for one resolution as a separate PNG plus a JSON file with `{ name, image, res, lod, frameW, frameH, animations }` (no `format`, no `variants`). That is the `meta` object returned by `renderSheet()` in [`src/core/render.js`](../src/core/render.js); it is not a bundle and `<pixel-sprite>` cannot play it directly.
