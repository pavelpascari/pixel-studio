# `<pixel-stage>`: characters that live on the page

`<pixel-stage>` lets characters move around a real web page: walk along the top of a card, drop off its end, jump to the
next one, climb its side, sit on an edge with their legs dangling, and duck behind a box and peek out. The page opts
elements in with `data-pixel-*` attributes; nothing else on the page changes, and the characters never block a click.

Source: [`src/runtime/pixel-stage.js`](../src/runtime/pixel-stage.js) (it imports `pixel-sprite.js` from the same folder).
Demo: `npm run studio` and open `http://localhost:5173/demo/stage.html`. The design and the research behind it are in
[research/page-interactions.md](research/page-interactions.md).

- [Quick start](#quick-start)
- [Marking up the page](#marking-up-the-page)
- [Elements and attributes](#elements-and-attributes)
- [JavaScript API](#javascript-api)
- [What the characters do](#what-the-characters-do)
- [What a character needs from its bundle](#what-a-character-needs-from-its-bundle)
- [How it works](#how-it-works)
- [Phones, accessibility and performance](#phones-accessibility-and-performance)
- [Limits](#limits)

## Quick start

```html
<script type="module" src="pixel-stage.js"></script>   <!-- with pixel-sprite.js next to it -->

<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<div class="crate" data-pixel-hide></div>

<pixel-stage>
  <pixel-actor src="goose.bundle.json" size="64" alt="a goose" start=".card"></pixel-actor>
</pixel-stage>
```

Put `<pixel-stage>` anywhere in `<body>` (the end is a good place). It is a 0 × 0 layer; its characters are positioned in
document coordinates, so they scroll with the page.

## Marking up the page

| attribute | meaning |
|---|---|
| `data-pixel-surface` | The element's top edge is a platform: characters stand and walk on it (off its rounded corners). `data-pixel-surface="animated"` marks a surface that moves by CSS animation or transform (a drifting cloud, a sliding panel): it is re-read every frame, characters standing on it ride along, and jumps onto it follow it in the air. |
| `data-pixel-climbable` | Its left and right sides are walls a character can climb, if the side's foot rests on a platform. Implies surface. |
| `data-pixel-perch` | A favourite place to sit. Implies surface. |
| `data-pixel-hide` | A hiding spot. A character stands behind it (on a platform whose line passes behind it), ducks and peeks out. |
| `data-pixel-occluder` | Characters are always drawn behind it: a sticky header, a foreground image. |
| `data-pixel-avoid` | Never stand on it or hide behind it (the main call to action, a form). |

The bottom of the page is a floor (`floor="none"` removes it).

Layout tips, learned building the demo:

- A climbable card needs a platform at its foot: make the row of cards stand on a shelf (`data-pixel-surface`) or on another surface.
- A hiding spot must stand on a platform too, and be shorter than the character standing but taller than it ducking, so it can peek over. In the demo the crate is 34 px for a 64 px goose.
- How high a character can jump is 1.8 × its displayed height. Taller steps need a climbable side.
- Occluders and hiding spots are boxes, so use opaque ones (cards, images, filled buttons), not text.

## Elements and attributes

`<pixel-stage>`

| attribute | default | |
|---|---|---|
| `controls` | `bottom-right` | Where the pause button sits: `bottom-right`, `bottom-left`, `top-right`, `top-left`, or `none` (then provide your own control and call `pause()`). |
| `label` | `characters` | The word on the button: "Pause characters" / "Play characters". |
| `floor` | `document` | `none`: no floor at the bottom of the page. |
| `roam` | `viewport` | `page`: wander anywhere, not just near what is on screen. |

`<pixel-actor>`

| attribute | default | |
|---|---|---|
| `src`, `size`, `alt`, `skin` | `size` 64 | Passed to the inner `<pixel-sprite>`. Changing `size` on a live character works: its speed, jumps and hit area follow the new box. |
| `start` | a platform on screen | CSS selector of the element to stand on first. |
| `keep-in-view` | off | Stay in sight: when the reader scrolls the character off-screen, it comes back once scrolling settles. Close by, it runs there at 2.5× speed (feet still planted); further away, it drops in from the top of the screen onto a visible surface. |
| `behaviours` | `wander sit hide climb jump` | What it may choose to do on its own. Behaviours the bundle cannot do (no `climb` animation, …) are skipped. |
| `anims` | automatic | Map roles to animation names when the defaults don't find them: `anims="walk=waddle run=gallop"`. |

Animation roles and the names looked up for each, in order: idle `idle`; walk `walk waddle trot travel`; run `run trot travel walk`;
jump `jump`; fall `fall`; sit `sit`; duck `duck sneak`; peek `peek`; climb `climb`; react `honk wave hop`.

## JavaScript API

```js
const stage = document.querySelector('pixel-stage');
const goose = document.querySelector('#goose');           // a <pixel-actor>

goose.goTo(document.querySelector('#summit'), { then: 'sit' });   // walk, jump, drop and climb there, then sit
goose.hideBehind(document.querySelector('.crate'));               // run behind it, duck, peek
goose.say('honk?', 1800);                                          // speech bubble at the beak (or head)
goose.shoo();                                                      // startle and run away
goose.addEventListener('actorstate', (e) => console.log(e.detail.from, '→', e.detail.to));

stage.pause(); stage.resume(); stage.paused;                       // what the button does (remembered)
stage.world.invalidate();                                          // after moving elements with transforms
```

| member | |
|---|---|
| `actor.goTo(element \| {x, y}, {then})` | Plan a route and go. `then`: `'idle'` (default) or `'sit'`. Returns false if there is no route. Orders given mid-jump, mid-climb or mid-fall wait until the character lands. |
| `actor.hideBehind(element)` | Go behind a `data-pixel-hide` element. |
| `actor.perform(name, {ms})` | Play one of the bundle's own animations in place (a one-shot until it ends, a loop for `ms`, default 2400), then carry on. Waits if the character is in the air. Returns false for an unknown animation. |
| `actor.say(text, ms)` | Show a speech bubble, placed with the bundle's `beak` or `head` attachment point. |
| `actor.catchUp()` | Come back into view now, the way `keep-in-view` does. Returns `'run'`, `'drop'` or `null` (nothing visible to stand on). |
| `actor.shoo(from?)` | React (`honk`, `wave`, …) and run to the farthest reachable place on screen. Tapping a character does this. |
| `actor.state` | `idle`, `walking`, `running`, `jumping`, `falling`, `climbing`, `sitting`, `hiding`, `startled`, `dragged`. |
| `actor.sprite` | The inner `<pixel-sprite>` (for `spriteevent`, `point()`, …). |
| events | `actorstate` `{from, to}`, `land`, `arrive` (end of a `goTo`), `burst` `{count, rate}` and `calm` (rage taps), `catchup`. |
| `stage.actors`, `stage.pause()`, `stage.resume()`, `stage.paused`, `stage.world` | |
| `stage.scrollSpeed` | How fast the page is scrolling, px/s (+ down), smoothed. |
| stage events | `fastscroll` `{speed}` when scrolling goes faster than 1.5 screen heights a second; `scrollsettle` when it stops. |

The module also exports `World`, `PixelStage`, `PixelActor`, `jumpArc(x0, y0, x1, y1, lift, seconds)` and `cells(rects, w, h)`.

## What the characters do

When nothing is asked of them, characters choose by weight among: idle (2), wander to a spot on a platform near the
screen (4), sit on an edge, preferring perches (2), hide behind a hiding spot (2), climb a wall (2). Each choice is turned
into a route and run step by step:

| step | what happens | animation |
|---|---|---|
| walk | Moves along the platform at the animation's own no-slide speed (`pxPerSecond`); runs when the way is long. Walking past the end of a platform starts a fall. | walk / run |
| drop | Walk off an end; fall under gravity; land on the first platform crossed from above. | fall |
| jump | Plays the jump; between its `launch` and `land` events the character flies a ballistic arc whose gravity is solved so the flight lasts exactly that long, landing on the target. | jump |
| climb | Feet put on the wall using the animation's `wall` line, then moves up at `pxPerSecondY` (no slipping); at the top it hops on. | climb, jump |
| sit | At an edge, facing out, legs over it. | sit |
| hide | Stands behind the spot, which is cut out of the character; ducks, and every few seconds peeks. | duck, peek |
| shoo | A short reaction, then a run (jumping and dropping) to the far side. | react, run |

Routes come from a cost-based search over platforms (px walked plus a cost per drop, jump and climb), so a character
takes the sensible way round, not the fewest hops.

## What a character needs from its bundle

Everything the stage uses is baked into the bundle by the engine (see [runtime.md](runtime.md#bundle-format-pixel-sprite1)):

- `ground`: where the feet are, so the character stands exactly on a card's top edge.
- `speed` on walks and runs, `speedY` and `wall` on climbs: movement matches the feet.
- `launch` and `land` events on the jump: the flight is timed to the animation.
- `beak` / `head` points: where speech bubbles go.

The figure library has presets for all of it (`jump`, `fall`, `sit`, `duck`, `peek`, `climb`; see [figures.md](figures.md)).
List them in the spec's animations, for example `"jump": {"motion": "jump"}`.

## How it works

- **The world is read rarely.** Element boxes are read in one batch only when something changed: a `ResizeObserver` on
  the page and on every opted-in element, a `MutationObserver` for added or removed elements and `data-pixel-*` changes,
  and `resize`, `load`, font loading, `transitionend` and `animationend`. Scrolling reads nothing.
  Measured in the demo: one stage tick takes about 0.1 ms; changing a card's size causes one read.
- **Read, think, write.** Each frame: read boxes if dirty, then plan and move (plain JavaScript), then write each
  character's `transform`, `z-index` and `clip-path`, only when they changed.
- **Occlusion** is a `clip-path: path(evenodd, …)` on the character: its box minus every occluder that overlaps it,
  split into disjoint cells so overlapping occluders don't cancel out, and rounded to device pixels. The page is not touched.
- **Clicks go through.** The stage and its characters have `pointer-events: none`. A capture-phase listener tests taps
  against the character's opaque pixels (`hitTest`); only a tap on the character itself shoos it, and that one click does
  not reach the page.
- **One clock.** Movement uses the same frame clock and `dt` as the sprites' frame stepping (see [runtime.md](runtime.md)).

## Rage taps and fast scrolls

- **Rage taps.** Three or more quick taps or clicks on a character (each within 450 ms of the last) are a burst: the
  character panics. It plays and moves faster with every tap (1.35×, then +0.35 per tap, up to 3×), keeps running away
  from the latest tap, and the actor fires `burst` `{count, rate}`. When the taps stop, it fires `calm` and slows down.
  Movement always scales with the playback rate, so the feet stay planted at any speed.
- **Fast scrolls.** The stage tracks scroll speed (`stage.scrollSpeed`) and fires `fastscroll` and `scrollsettle`.
  Characters with `keep-in-view` wait for the scroll to settle, then catch up (see above).

```js
stage.addEventListener('fastscroll', () => goose.say('wait for me!'));
goose.addEventListener('burst', (e) => { if (e.detail.count >= 8) goose.say('OK OK OK'); });
```

## Phones, accessibility and performance

- Touch works like a mouse click: a tap on a character shoos it. Characters never call `preventDefault` on touch and never
  set `touch-action`, so scrolling and zooming are unaffected.
- With a mouse or pen, press on a character and drag to pick it up (it dangles, using its `fall` animation); let go to
  throw it with the pointer's speed. It flies, falls and lands on the first surface below. A press without a drag is a
  click, which shoos it. Dragging is off while paused or under reduced motion. Touch never drags, so a finger on a
  character still scrolls the page.
- The pause button is a real `<button>` in the tab order, above the characters, clear of the iPhone home indicator. The
  choice is stored in `localStorage` (`pixel-stage:paused`). This is what WCAG 2.2.2 (Pause, Stop, Hide) asks for.
- With `prefers-reduced-motion: reduce` the characters are placed and stand still; the setting is watched live.
- The characters' layer is `aria-hidden`; the button is not.
- Checked in desktop Chromium and in iOS 18.1 Safari (iPhone 16 simulator).

## Limits

- Occluders are rectangles. A character "behind" a heading's text is cut by the whole box.
- Elements moved by CSS `transform` or animations are not noticed until something marks the world dirty
  (`transitionend` / `animationend` do; otherwise call `stage.world.invalidate()`), unless they are marked
  `data-pixel-surface="animated"`, which is read every frame (a layout read per such element per frame, so use it for a few).
- Sticky and fixed elements are treated as if they stayed put: mark them `data-pixel-occluder`, not surface.
- Nested scroll containers and iframes are not supported; the stage works in the document's own scroll.
- A climbable side needs a platform at its foot; a hiding spot needs a platform passing behind it.
- Top-layer elements (modal dialogs, popovers) always paint above characters.
