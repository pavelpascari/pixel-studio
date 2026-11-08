# Sprites that interact with the page

Research for a feature request: Pixel Studio characters that treat the page as their world. A goose climbs onto a card and walks along its top edge, hides behind a button and peeks out, sits on a heading, and reacts to scroll, clicks, hover, text selection and form focus. It has to be reliable, fast, accessible and work on phones.

Date: 2026-11-08. Browser versions come from [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) 8.1.8 (2026-11-02), abbreviated **BCD** below. **(tested)** marks results from the proof of concept described in [§7](#7-proof-of-concept-what-was-tested), which ran in Chromium 156 (headless, desktop, DPR 1) through Playwright. **(unverified)** marks claims I could not confirm from a primary source or by test. No repository files were changed except this one.

Related research in this folder: [web-runtime-devices.md](web-runtime-devices.md) (playback robustness, shared clock, touch hover) and [animation-tools-survey.md](animation-tools-survey.md) (animation events R1, attachment points R2, hit areas R9). This design depends on several of their recommendations.

---

## 1. Summary

**Recommendation:** add a small, opt-in **world layer**. Its pieces:

- **`<pixel-stage>`**: one per page. It owns a single sprite layer positioned in document coordinates, a cached **surface map**, the frame loop, input handling and the accessibility controls.
- **Opt-in attributes** on page elements: `data-pixel-surface` (walkable top edge), `data-pixel-occluder` (sprites can go behind it), `data-pixel-climbable` (its sides are walls), `data-pixel-perch` (a good place to sit).
- **A behaviour state machine per character**, in the style of Shimeji's weighted "next behaviour" lists, on top of a few fixed locomotion primitives: walk-along, jump, fall, climb, perch, hide, peek, flee, follow and dragged.

Six findings drive the design:

1. **Prior art is simpler than it looks.** Every pet I examined uses an anchor point at the feet, a list of axis-aligned "borders" (floor, walls, ceiling, the active window's edges), constant-velocity walking, per-tick gravity for falls, and a weighted random state machine ([Shimeji-ee](https://github.com/LavenderSnek/ShimejiEE-cross-platform), [vscode-pets](https://github.com/tonybaloney/vscode-pets), [web-esheep](https://github.com/Adrianotiger/web-esheep), [oneko.js](https://github.com/adryd325/oneko.js)). None uses a physics engine. Pixel Studio adds one thing they lack: feet that never slide, because gait `speed` is exported per animation.
2. **Read the page rarely, in one batch, in document coordinates.** `getBoundingClientRect()` forces layout when the DOM is dirty ([list of layout-forcing APIs](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)). Cache rects in document coordinates and re-read only when `ResizeObserver`, `MutationObserver`, `resize` or font loading says something changed. Scrolling then costs nothing: the sprite layer scrolls with the document on the compositor. **(tested: 0 rect reads per frame while walking and after scrolling, 2 after a resize.)**
3. **Occlusion: draw sprites in one layer above the page and cut the occluder's shape out of the sprite with `clip-path: path(evenodd, …)`.** No page element moves into a new stacking context, page layout is untouched, and `path()` in `clip-path` works in Chrome 88, Firefox 71 and Safari 13.1 (BCD). **(tested: the goose's lower body disappears behind the button pixel for pixel, its head peeks over it, and clicks on the button still land.)** The limitation: an occluder is a rectangle or rounded rectangle and must be opaque.
4. **Never block the page.** Keep the layer at `pointer-events: none`, so sprites never intercept input; dragging a sprite is opt-in and claimed by hit-testing the sprite's own opaque pixels. Hide the layer from assistive technology (`aria-hidden`). Respect `prefers-reduced-motion`. Provide a visible pause/hide control, because WCAG 2.2.2 requires one for motion that starts automatically, lasts more than 5 s and runs alongside other content ([WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Move sprites only with `transform`, which does not count as layout shift ([web.dev CLS](https://web.dev/articles/cls)).
5. **Kinematics, not physics.** Walking on edges, ballistic jump arcs fitted to the hop animation's flight time, gravity falls and a pendulum while dragged are each a few lines of code (jump arc **tested**, §5.4). matter.js and planck.js are general rigid-body engines ([matter-js](https://github.com/liabru/matter-js), [planck.js](https://github.com/piqnt/planck.js)). They add weight and solve problems we do not have, such as stacking and rotation.
6. **The engine needs new motion assets and metadata.** Required: a ground line per bundle, a `climb` motion with a vertical speed, an edge-sit pose, a legged jump with launch and land events, fall and dragged poses, and peek poses. Most of these fit the existing `pose`, `hop` and `gait` models. Animation events (`launch`, `land`) and a ground anchor are the same features as R1 and R2 in [animation-tools-survey.md](animation-tools-survey.md).

**Key risks:** elements that move without resizing (CSS transforms, animations, sticky headers) leave the cache stale, so they need a move detector or per-frame polling (**tested: a `transform` on a card is not detected**). Nested scroll containers and iframes are separate worlds. Touch dragging conflicts with page scrolling. Content can get covered, which is an accessibility problem. Rect-based occlusion looks wrong for transparent occluders such as text headings.

---

## 2. Prior art

### 2.1 oneko.js (web, ~280 lines)

A port of the classic Neko cat that chases the cursor ([source](https://github.com/adryd325/oneko.js/blob/main/oneko.js)).

- **Rendering:** one `position: fixed` 32×32 `div` with a background sprite sheet, `z-index: 2147483647`, `pointer-events: none` and `aria-hidden` ([oneko.js L118–129](https://github.com/adryd325/oneko.js/blob/main/oneko.js)). It never blocks clicks.
- **Loop:** `requestAnimationFrame`, but the logic steps only every 100 ms, a fixed 10 Hz tick. It moves 10 px per tick toward the cursor (`nekoSpeed = 10`) and is clamped to the viewport.
- **Behaviours:** chase; idle for a random time, then sleep or scratch itself. The cat scratches a "wall" only when it is within 32 px of a viewport edge (`scratchWallN/S/E/W`). The viewport edges are its only world geometry.
- **Accessibility:** if `prefers-reduced-motion: reduce` matches, the script exits and no cat appears at all ([L4–8](https://github.com/adryd325/oneko.js/blob/main/oneko.js)).
- **Persistence:** position and state are saved to `localStorage` on `beforeunload`, so the cat survives navigation.

**Takeaway:** the minimum viable pet is fixed positioning, a `pointer-events: none` layer, a fixed-rate tick, and reduced motion off by default. It reads nothing from the page.

### 2.2 Shimeji / Shimeji-ee (desktop, Java)

Shimeji-ee is a fork of the original group-finity Shimeji. I read [LavenderSnek's cross-platform fork](https://github.com/LavenderSnek/ShimejiEE-cross-platform), which says it forks [Kilkakon's version](http://kilkakon.com/shimeji). It is the richest behaviour model I found, and it is **data-driven**:

- **Two XML files.** `actions.xml` defines *actions*: animations bound to a border type, with per-pose velocities. `behaviors.xml` defines *behaviours*: weighted, conditional sequences of actions ([actions.xml](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/ext-resources/conf/actions.xml), [behaviors.xml](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/ext-resources/conf/behaviors.xml)).
- **Anchor at the feet.** Every pose has `ImageAnchor="64,128"`, the bottom centre of a 128 px image. All collision is done on this single point.
- **The world is a set of borders.** `MascotEnvironment` exposes `floor`, `ceiling`, `wall`, `workArea` (the screen) and `activeIE`, the frontmost window and the only window the mascot interacts with ([MascotEnvironment.java](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/src/main/java/com/group_finity/mascot/environment/MascotEnvironment.java)). A border test is an exact integer comparison: `FloorCeiling.isOn` checks `y == location.y` and that x lies between left and right ([FloorCeiling.java](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/src/main/java/com/group_finity/mascot/environment/FloorCeiling.java)).
- **Actions are bound to borders.** For example `<Action Name="Walk" Type="Move" BorderType="Floor">` and `<Action Name="ClimbWall" Type="Move" BorderType="Wall">`. Climbing is a `Move` along a wall with per-pose `Velocity="0,-1"` / `"0,-2"` and a pause pose in between (a hitch-and-pull rhythm), toward a `TargetY` expression such as `activeIE.top+64`.
- **Climbing onto a window is a sequence.** `ClimbIEWall` = `ClimbWall` to near the top → `Offset Y=-64` (pop onto the top edge) → `Sit` → `Stand` → `Walk` along the top ([actions.xml L548–555](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/ext-resources/conf/actions.xml)). This is exactly the "goose climbs a card" scenario. Note that the transition from wall to top is a teleport hidden by a pose change, not a continuous motion.
- **Falling** (`Fall.java`): per tick, `vx -= vx·0.05` and `vy = vy − vy·0.1 + gravity(2)`. The motion is swept pixel by pixel, and for each sample the code searches up to 80 px upward for a floor so a fast fall does not tunnel through a window top ([Fall.java](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/src/main/java/com/group_finity/mascot/action/Fall.java)). After landing, the `Fall` behaviour selects `Bouncing` then `Stand` if on a floor, else `GrabWall`.
- **Dragging** (`Dragged.java`): the anchor follows the cursor plus an offset. A separate spring-damped `footX` (`footDx = (footDx + (cursorX − footX)·0.1)·0.8`) chooses the "pinched" pose by how far the feet lag the cursor, which makes the mascot swing like a pendulum ([Dragged.java](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/src/main/java/com/group_finity/mascot/action/Dragged.java)). On release, `Thrown` calls `Falling` with the cursor's velocity as the initial velocity.
- **Window interaction:** `WalkWithIE`, `FallWithIE` and `ThrowIE` actually move the OS window (`moveActiveIE`). The famous "throws your browser window" behaviour is a desktop privilege a web page does not have.
- **Behaviour selection:** each behaviour has a `Frequency` weight and an optional condition. Conditions are grouped by where the mascot stands, for example "on the floor or on activeIE.topBorder", or "on a wall". Each behaviour can list weighted `NextBehaviorList` follow-ups. Pinned behaviours (`Fall`, `Dragged`, `Thrown`) are `ALWAYS REQUIRED` with `Frequency="0"`, so the engine enters them only on events.

**Takeaways for us:** a feet anchor; borders as segments; actions bound to a border type; behaviours as weighted, conditional sequences; dedicated interrupt states for fall, drag and throw; the swept fall with snap-to-floor; and the pendulum drag. All of these port directly to the web.

### 2.3 eSheep and web-esheep

The 1995 Windows "stray sheep", re-implemented for the web by [Adrianotiger/web-esheep](https://github.com/Adrianotiger/web-esheep) (desktop version: [desktopPet](https://github.com/Adrianotiger/desktopPet)). Animations and transitions live in an XML file, like Shimeji's.

- **Walking on page elements:** an option `collisions: ["div", "hr"]` (default). On every 50 ms step (`setTimeout(…, 50)`), `#checkOverlapping()` loops over **every** element of those tags, calls `getBoundingClientRect()` on each, and for candidates also `getComputedStyle()`. It counts an element as a platform only if it has a visible `border-top` ([esheep.js L586–616, L678](https://github.com/Adrianotiger/web-esheep/blob/master/src/esheep.js)). Once on an element, the sheep re-reads the element's rect every step and drops off when the top has moved more than 3 px ([L756–774](https://github.com/Adrianotiger/web-esheep/blob/master/src/esheep.js)).
- **Dragging:** `mousemove` with `buttons == 1` on the sheep starts a "drag" animation, with a body-level `mousemove` fallback for fast pointers ([esheep.js](https://github.com/Adrianotiger/web-esheep/blob/master/src/esheep.js)). It is mouse-only, with no touch or pointer events.

**Takeaway:** this is the closest prior art to "walk on the page", and it shows what to avoid. It is implicit (every `div` with a top border), O(all divs) layout reads 20 times a second, and mouse-only. Pixel Studio should use explicit opt-in and cached rects.

### 2.4 vscode-pets (VS Code webview, TypeScript)

Pets live in a VS Code panel ([repo](https://github.com/tonybaloney/vscode-pets)).

- **State machine:** each pet declares `sequence.sequenceStates` with `possibleNextStates`, for example `walkLeft → [sitIdle, climbWallLeft, walkRight, runRight]`, `climbWallLeft → [wallHangLeft]`, `wallHangLeft → [jumpDownLeft]` ([cat.ts](https://github.com/tonybaloney/vscode-pets/blob/main/src/panel/pets/cat.ts)).
- **States are objects with `nextFrame()`** returning `stateContinue` or `stateComplete`. Climbing adds `climbSpeed` to `bottom` each frame until a height is reached. Jumping down subtracts `fallSpeed` until `bottom <= floor`, then lands ([states.ts](https://github.com/tonybaloney/vscode-pets/blob/main/src/panel/states.ts)).
- **The world** is the panel's floor and its left wall, plus a thrown ball to chase.

**Takeaway:** the climb-hang-jump-land chain is a good minimal "climb" grammar. A plain weighted FSM is enough for charming behaviour.

### 2.5 Clippy.js (web, jQuery)

Microsoft Agent characters for the web ([clippy.js](https://github.com/clippyjs/clippy.js); a maintained fork lives at [pithings/clippy](https://github.com/pithings/clippy)).

- **Agent API:** `play`, `animate`, `speak` (a speech balloon), `moveTo(x, y, duration)`, `gestureAt(x, y)` (chooses `Gesture<Dir>` or `Look<Dir>` from the direction), `hide` and `show` ([agent.js](https://github.com/clippyjs/clippy.js/blob/master/src/agent.js)).
- **Queue plus idle:** actions go into a queue. When the queue empties, a random `Idle*` animation plays (`_onQueueEmpty`). Movement uses a `Move<Dir>` animation with jQuery `animate` between its "waiting" branch and its exit branch, so the walk cycle and the translation are only loosely tied.
- **Dragging:** `mousedown` → `mousemove`/`mouseup` on `window`, with the position updated by a 10 ms `setTimeout` loop ([agent.js L380–436](https://github.com/clippyjs/clippy.js/blob/master/src/agent.js)).
- **Exit branching:** animation frames carry `branching` and `exitBranch` so an animation can be interrupted gracefully ([animator.js](https://github.com/clippyjs/clippy.js/blob/master/src/animator.js)).

**Takeaway:** `gestureAt` and look-at, speech bubbles, an action queue with idle fallback, and graceful interruption via exit branches. These are all useful for "reacts to hovered element / form focus". BonziBuddy was built on the same Microsoft Agent technology. I found no primary source for its internals beyond that **(unverified)**.

### 2.6 Desktop Goose (desktop, closed source)

The developer's page lists: steals the mouse, tracks mud on the screen, drags out Notepad windows and memes, and "will attack you if you poke him". There is a config file for aggression and a modding API ([itch.io page](https://samperson.itch.io/desktop-goose)). The source is not public, so its implementation is **unverified**. Its value for us is tone: a goose that *does things to your UI* is the charm. On the web, "drag a note onto the page" is an overlay element the stage owns, never a mutation of page content.

### 2.7 Rive / Lottie interactive characters (Duolingo-style)

- **Rive** state machines "connect animations together and define the logic that drives the transitions" ([Rive docs](https://rive.app/docs/editor/state-machine/state-machine)). For Duolingo's Lily video-call character, "the Rive State Machine drives Lily's mouth positions, facial expressions, camera movements, and all other animations", and the file is under 1 MB ([Rive blog](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life)). These characters live in their own canvas. They react to app state (inputs) and pointer events, but they do not walk on the host page's DOM.
- **lottie-interactivity** syncs a Lottie animation's frames to scroll position ("scroll" mode), to cursor position within the container ("cursor"), or chains animations ("chain") ([README](https://github.com/LottieFiles/lottie-interactivity)).

**Takeaway:** "react to page state" can be modelled as **inputs** to a character state machine (`scrollVelocity`, `hoveredElement`, `focusedField`). Scroll-scrubbed animation (lottie-interactivity) is a cheap, robust reaction that does not need a world model.

### 2.8 Summary table

| project | world model | surfaces found by | locomotion | drag | a11y / motion |
|---|---|---|---|---|---|
| oneko.js | viewport edges | none | 10 px / 100 ms toward cursor | none | exits on reduced motion; `aria-hidden`; `pointer-events: none` |
| Shimeji-ee | screen + active window borders | OS window rects | per-pose velocity; swept gravity fall with floor snap | pendulum drag, throw with cursor velocity | n/a (desktop) |
| web-esheep | every `div`/`hr` with a top border | `getBoundingClientRect` on all, every 50 ms | per-frame offsets from XML | mouse only | none found |
| vscode-pets | panel floor + left wall | fixed | constant speed; climb/fall by constant rate | none | n/a |
| Clippy.js | none | none | jQuery animate during a Move animation | mouse drag | none found |
| Rive/Lottie | own canvas | n/a | timeline / state machine | pointer listeners | author's job |

---

## 3. Reading the page as a world

### 3.1 APIs and what they cost

| need | API | notes |
|---|---|---|
| element box | [`getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) | Viewport-relative; edges change on every scroll, so add `scrollX/scrollY` for document coordinates (MDN). **Forces layout** if the DOM is dirty ([Paul Irish's list](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)); "reflow only has a cost if the document has changed". For a transformed element it returns the axis-aligned bounds of the transformed box ([CSSOM View](https://drafts.csswg.org/cssom-view/#dom-element-getclientrects); I did not re-read the exact algorithm text, **unverified**). |
| element resized | [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) | Chrome 64, Firefox 69, Safari 13.1 (BCD). Reports size changes only, **not** moves. |
| element moved | `IntersectionObserver` with a `rootMargin` trimmed to the element's current rect and `threshold: 1` | Any movement changes the intersection ratio and fires the callback. This is the `observeMove` technique in [Floating UI's `autoUpdate`](https://github.com/floating-ui/floating-ui/blob/master/packages/dom/src/autoUpdate.ts) (option `layoutShift`), credited there to [samthor.au/2021/observing-dom](https://samthor.au/2021/observing-dom/). Floating UI documents that transform-driven animations still need per-frame polling (`animationFrame: true`). |
| element on screen | [`IntersectionObserver`](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) | Async. Entries carry `boundingClientRect`, so you get a rect without a synchronous read. `<pixel-sprite>` already uses it to pause off-screen sprites. |
| DOM changes | [`MutationObserver`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) | Use to re-scan for `[data-pixel-*]`. Filter attributes (`attributeFilter`) so the stage's own `style` writes do not wake it. |
| viewport | `resize`, [`visualViewport`](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API) `resize`/`scroll` | "When the user pinch-zooms into the page, the visual viewport shrinks but the layout viewport is unchanged. … the on-screen keyboard (OSK) can shrink the visual viewport without affecting the layout viewport" (MDN). Reading `visualViewport.*` also forces layout (Paul Irish's list). |
| scroll | `scroll` (capture on `document` to see nested scrollers), [`scrollend`](https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event) | `scrollend`: Chrome 114, Firefox 109, Safari 26.2 (BCD). Use it for "react when scrolling stops". |
| text selection | [`selectionchange`](https://developer.mozilla.org/en-US/docs/Web/API/Document/selectionchange_event) + [`Range.getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Range/getBoundingClientRect) | Supported everywhere (BCD). The range rect is a forced read, so throttle it to once per frame. |
| focus | [`focusin`/`focusout`](https://developer.mozilla.org/en-US/docs/Web/API/Element/focusin_event) | They bubble, unlike `focus`, so one listener on `document` is enough. |
| hover | `pointerover` on `document` + `event.target.closest('[data-pixel-*]')` | No polling. Ignore on touch (see [web-runtime-devices.md §2.6](web-runtime-devices.md)). |
| frame loop | [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) | Paused in background tabs and hidden iframes. Runs at the display rate (60/120/144 Hz), so motion must be time-based (MDN). |

### 3.2 Coordinate space: document, not viewport

Prior art uses `position: fixed` and viewport coordinates (oneko, esheep). On a scrolling page this means every surface rect changes on every scroll frame, so you have to re-read or adjust everything. It also means JS has to reposition sprites during scrolling, which happens on the compositor, so sprites lag a frame behind the content they stand on.

**Proposal:** one sprite layer, `position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none`, as the first child of `<body>`, with sprites inside it positioned by `transform: translate(x, y)` in **document** coordinates. Surface rects are cached in document coordinates (`rect + scrollX/Y`). Then:

- Scrolling the main document changes nothing in the cache, and sprites scroll with the page for free. **(tested: 0 reads after `scrollTo`)**
- Pinch zoom and the mobile URL bar showing or hiding do not change document coordinates. Layout only changes if the page uses viewport units, and `ResizeObserver` on `<html>` plus `resize` catch that.
- Exceptions need care:
  - **`position: fixed` / `sticky` surfaces** move relative to the document while scrolling. Detect them once at scan time with `getComputedStyle(el).position` (on the element itself; an ancestor's stickiness is not detected, so authors should mark it with `data-pixel-surface="fixed"` **(design choice)**). Re-read only those on scroll. Sprites standing on them switch to a second, `position: fixed` layer while attached.
  - **Nested scroll containers:** an element inside an `overflow: auto` box moves when that box scrolls. Listen to `scroll` in the capture phase on `document`, and if the scroller contains surfaces, re-read those surfaces. Sprites on them will lag compositor scrolling by up to a frame. The clean fix is a stage *inside* the scroller (`<pixel-stage scope>`), see §5.
  - **Transforms and CSS animations** on surfaces are invisible to `ResizeObserver` **(tested: a card moved 40 px by `transform` left the goose 40 px off)**. Options: the IO move trick above (layout moves), opt-in per-frame polling for elements marked `data-pixel-surface="animated"`, or `transitionend`/`animationend` listeners that mark the world dirty.
  - **Iframes:** cross-origin iframe content cannot be read. Treat the `<iframe>` element itself as a box. Same-origin iframes would need their own stage **(design choice)**.
  - **Top layer** (modal `<dialog>`, popovers, fullscreen) always paints above everything regardless of `z-index` ([MDN top layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer)). Sprites cannot appear above a modal, which is the right behaviour. Pause the stage while a modal is open.
- **Clamping:** a sprite translated past the document's right or bottom edge extends the scrollable area. Clamp positions to the document box, or give the layer a size and `overflow: clip`.

### 3.3 The collision map

Built from opted-in elements only. For each element the stage caches:

```
{ el, rect: {left, top, right, bottom} (document px), radius (px, read once from border-radius),
  surface: bool, occluder: bool, climbable: bool, perch: bool, fixed: bool, depth: number }
```

Derived geometry, rebuilt only when dirty:

- **Platforms**: one segment per surface at `y = top`, from `left + r` to `right − r` (keep the feet off rounded corners). Overlapping platforms at the same `y` merge.
- **Walls**: for climbable elements, segments `x = left` and `x = right` from `top` to `bottom`.
- **Ground**: the bottom of the stage (or of the viewport) is a fallback floor, as in Shimeji's work area.
- **Navigation graph** (§5.4): nodes are platforms; edges are *walk* (same y, touching), *drop* (walk off an end onto something below), *jump* (reachable arc), *climb* (via a wall).

With fewer than ~50 opted-in elements, rebuilding is microseconds of JS plus one batch of rect reads. **(tested: one dirty refresh after a style write took ~28 µs on a tiny page; on a real page the forced layout costs whatever a layout of that page costs, which is why reads must be batched and rare.)**

**Frame discipline** (the general rule for avoiding forced reflow: read first, then write, never interleave; [Paul Irish](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)):

1. Observers only set `dirty = true`. They never read rects in their callbacks.
2. At the start of the stage's rAF callback, if `dirty`, read all rects in one loop (one layout at most).
3. Then run behaviour and kinematics (pure JS).
4. Then write `transform` and `clip-path` on sprites, and nothing else on the page.

---

## 4. Occlusion and depth

The goal is that a sprite appears behind element A (a button) and in front of B (the card it stands on).

### 4.1 Options

| technique | how | verdict |
|---|---|---|
| **z-index in the page** | Insert the sprite into the DOM next to A and give it a `z-index` below A's | `z-index` "only has meaning within its parent's stacking context", and stacking contexts are created by many properties: `transform`, `opacity < 1`, `filter`, `clip-path`, `contain: paint`, `will-change`, `position: fixed/sticky`, `isolation: isolate`, and more ([MDN stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context)). The sprite would have to move into A's stacking context and get a containing block there, which risks `overflow: hidden` clipping, breaking `:nth-child` and other selectors, and layout changes. **Fragile on arbitrary pages.** Use it only when the author composes the scene (below). |
| **`isolation: isolate` on the scene** | The author wraps a hero section in an isolated container and puts sprites inside it with explicit `z-index` | Reliable **when the author controls the markup**. `isolation` is supported everywhere (Chrome 41, Firefox 36, Safari 8, BCD). Gives true depth with transparency and any shape. |
| **overlay + `clip-path` cut-out (recommended)** | The sprite stays in the stage layer above everything. Its `clip-path` = its own box minus the occluder's rect, as `path(evenodd, "M0 0H w V h H0Z M x1 y1 H x2 V y2 H x1 Z")` | Page DOM and layout untouched. `clip-path` "does not affect the element's inherent geometry", clipped-out regions get no pointer events, and non-`none` values create a stacking context, which is harmless on our own element ([CSS Masking 1](https://www.w3.org/TR/css-masking-1/)). `path()` takes an optional `evenodd` fill rule in `clip-path`, and its lengths are px ([MDN `path()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/basic-shape/path)). Support: Chrome 88, Firefox 71, Safari 13.1 (BCD `clip-path.path`). **(tested)** |
| mask-image with a generated gradient/SVG | Same idea with `mask` | Works (unprefixed `mask-image`: Chrome 120, Firefox 53, Safari 15.4, BCD), but building a mask per frame is clumsier than a path string. A fallback for complex shapes only. |
| canvas-side cut-out | `clearRect` the occluded region inside `<pixel-sprite>`'s canvas | Quantized to sprite pixels (2–4 CSS px), so it misaligns with the DOM edge. Needs runtime changes. Not recommended. |
| duplicate-and-clip | Clone the occluder on top of the sprite | Duplicates interactive content and its accessibility tree. **Avoid.** |
| CSS `element()` as a mask | Use the occluder's live rendering as a mask | Only Firefox, prefixed `-moz-element()` (BCD). Not portable. |
| CSS anchor positioning | `anchor-name` on the element, `position-anchor` + `anchor()` on the sprite | Attaches without JS and keeps the attachment through scrolling ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning/Using)). `anchor()` / `anchor-name`: Chrome 125, Firefox 147, Safari 26 (BCD). But BCD records the `position-anchor` initial value changing three times in Chrome (125→127→144→151) and once in Safari (26→27), all marked partial, so the feature is still settling. It positions; it does not occlude. **Useful later** for a perched sprite on a sticky/animated element with no JS polling (progressive enhancement). |
| View transitions | `document.startViewTransition` | Snapshot-based transitions between DOM states (Chrome 111, Firefox 144, Safari 18, BCD; [MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)). Wrong tool for continuous character motion. Possibly useful for a "goose drags a card into place" flourish. |

### 4.2 Recommended: overlay plus rect cut-out

For each sprite, each frame, after the read phase:

```js
// r = occluder rect in document px; (L, T) = sprite's top-left in document px; W×H = sprite box
const x1 = Math.max(0, Math.round(r.left - L)), y1 = Math.max(0, Math.round(r.top - T));
const x2 = Math.min(W, Math.round(r.right - L)), y2 = Math.min(H, Math.round(r.bottom - T));
sprite.style.clipPath = (x2 > x1 && y2 > y1)
  ? `path(evenodd, "M0 0H${W}V${H}H0Z M${x1} ${y1}H${x2}V${y2}H${x1}Z")`
  : 'none';
```

- **Rounding matters.** In the PoC the button's top was at y = 229.4375. The unrounded cut produced anti-aliased, half-clipped pixels on the edge row (**tested: 12 pixels outside the cut changed**). Round to whole CSS px, or better, to device pixels.
- **Rounded corners:** read `border-*-radius` once at scan time and emit `A` (arc) commands in the hole sub-path.
- **Several occluders:** append one hole sub-path per overlapping occluder. With `evenodd`, overlapping holes cancel each other out, so merge overlapping occluder rects first, or use `nonzero` and wind each hole opposite to the outer box.
- **Depth semantics:** each occluder has a depth relative to the sprite. "Behind" is a state of the sprite (it entered *behind* A), not a global z-order. A sprite standing on top of a card is in front of that card, so the card is a surface, not a cut. A sprite that walks *behind* a card ("diving behind") adds the card to its occluder set for the duration of the behaviour. Sprites among themselves are ordered by `z-index = round(feetY)`, as `flock.html` already does.
- **Cost:** a `clip-path` change triggers repaint of the sprite only, not layout (CSS Masking: no effect on geometry). Each frame writes one string per sprite. **(tested: ~1.8 µs JS per sprite step including the string; style and paint cost not measured, unverified on phones.)**

**Limitations (tell authors):**

1. Occluders are boxes (optionally rounded). A goose "behind a heading's letters" would be cut by the heading's whole box, so it vanishes into empty space between glyphs. Use opaque occluders: buttons, cards, images, filled badges. For text headings use *perch* or *peek over*, not *hide behind*.
2. The occluder must be opaque within its box. If it is semi-transparent, the sprite is simply missing where it should faintly show through.
3. Transformed or rotated occluders use their axis-aligned bounds (see §3.1).
4. Anything above the sprite layer, such as the top layer and other `2147483647` overlays, wins. Sticky headers should be marked `data-pixel-occluder` so sprites pass *under* them; otherwise a goose walks over the site header while you scroll.

---

## 5. Proposed design for Pixel Studio

### 5.1 HTML / JS API sketch

```html
<script type="module" src="pixel-sprite.js"></script>
<script type="module" src="pixel-stage.js"></script>

<!-- one stage per page (or per scroll container with `scope`) -->
<pixel-stage controls="corner" max-actors="4">
  <pixel-actor src="goose-root.bundle.json" size="64"
               behaviours="wander climb perch hide peek flee follow-cursor"
               start="[data-pixel-perch='hero']"
               label="root the goose"></pixel-actor>
</pixel-stage>

<!-- opted-in page elements -->
<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<button data-pixel-occluder data-pixel-hide>Buy</button>
<h1 data-pixel-perch data-pixel-surface>Welcome</h1>
<header class="sticky" data-pixel-occluder data-pixel-surface="fixed">…</header>
<form data-pixel-watch="focus">…</form>
```

| attribute | meaning |
|---|---|
| `data-pixel-surface` (`=fixed` / `=animated`) | Its top edge is a platform. `fixed`: re-read on scroll. `animated`: poll its rect every frame while a sprite is on it. |
| `data-pixel-climbable` | Its left and right sides are walls. |
| `data-pixel-occluder` | Sprites can be behind it (rect cut-out). |
| `data-pixel-hide` | A hiding spot: a target for *hide* and *peek*. Implies occluder. |
| `data-pixel-perch` (`=name`) | A good place to sit. Optional name for scripting. |
| `data-pixel-watch="focus hover select click"` | Events in this subtree are inputs to actors. |
| `data-pixel-avoid` | Never stand on, cover or hide behind it (e.g. the primary CTA). |

JS:

```js
const stage = document.querySelector('pixel-stage');
const goose = stage.actors[0];
goose.goTo(document.querySelector('h1'), { then: 'perch' });   // path-find, walk/jump/climb, sit
goose.hideBehind(buyButton, { peek: true });
goose.on('arrive', e => …);                                   // also 'land', 'grab', 'drop', 'state'
stage.pause(); stage.hide();                                  // what the visible control does
stage.world.invalidate();                                     // after the page moves things by hand
```

`<pixel-actor>` wraps a `<pixel-sprite>` and adds world state (`x, y` of the feet in document px, `on`: the current surface, `facing`, `state`). `<pixel-sprite>` stays a pure player. The stage needs from it: the shared clock ([web-runtime-devices.md P1 #9](web-runtime-devices.md)), animation events, the ground line, and `fps` scaling (already supported via the `fps` attribute).

### 5.2 Behaviours and the animations each one needs

Locomotion primitives (always available; the stage moves the actor):

| primitive | movement | animation requirement | engine status |
|---|---|---|---|
| **walk-along** | x at `speed × size / 100` px/s along a platform; y glued to the platform top | gait with `speed` (`walk`/`waddle`, `run`, `sneak`) | exists. To travel slower or faster without sliding, scale `fps` (speed ∝ fps for a fixed stride, per figures.md: stride = speed × duty × cycle time) within ~±25 %, or switch gait |
| **turn** | none | short `turn` pose, or just flip | flip exists; a 2–3 frame `pose` is optional |
| **jump** (up/down/across) | ballistic arc (§5.4) during the flight interval only | **legged jump**: crouch, launch, airborne tuck, land. Needs `launch`/`land` frame events so the page starts and stops the arc on the right frames | `hop` exists but "is made for limbless bodies; a legged figure's feet simply travel with the body" (figures.md Limits). **New**: legged-jump model or a `pose`-based jump + events (survey R1) |
| **fall** | gravity from the current velocity, swept against platforms (Shimeji's snap) | looping `fall` pose (wings out for geese), then `land` (squash) | `pose` + `hop`-style squash; **new assets** |
| **climb** | y at `climbSpeed × size / 100` up a wall; x glued to the wall | **`climb` motion**: vertical gait with planted feet on a vertical wall, exporting a vertical speed | **New motion model.** Side-view gaits move along x only (figures.md Limits). Needs feet planted on a vertical line and `speedY` in the bundle |
| **mount** (wall → top) | short scripted move: up by body height, over the edge | `mount`/`pull-up` one-shot whose root track ends offset by (+dx, −dy). Keep the planted foot on the rim, unlike Shimeji's teleport | **new**: `pose` with root tracks + an "end offset" in the bundle so the stage applies the displacement when the clip ends |
| **dragged** | follows the pointer; pendulum swing from Shimeji's spring | `dangle` pose; `follow` springs on neck, legs and tail already give lag | `follow` exists; the dangle pose is **new** |
| **thrown** | fall with the pointer's release velocity | fall → land | as fall |

Behaviours (chosen by the state machine, built from primitives):

| behaviour | plan | extra animation |
|---|---|---|
| **wander** | random reachable platform → walk/jump there → idle | idle |
| **perch** (sit on a heading) | path to a `data-pixel-perch` → walk to a spot → `sit` | **edge-sit** pose: body lowered, feet tucked, or legs dangling over the edge when standing at the end of a platform |
| **hide** | path to a spot whose box overlaps a `data-pixel-hide` element → enter *behind* state (adds occluder) → walk/crouch until fully covered | `crouch` (sneak gait, which exists) |
| **peek** | while hidden, step until the head clears the occluder's top or side edge → hold → retreat | `peek-up` (neck stretch) and `peek-side` (lean) poses. `reach` constraints with the head's `aim` already exist and could aim the head at the cursor |
| **flee** | on tap, click near it, or fast cursor approach: pick the reachable platform farthest from the threat → run (and jump) | run (exists), `startle` one-shot |
| **follow** | follow the cursor or a focused field along the platform graph; stop at a comfortable distance | walk/run |
| **look-at** | face and aim the head at a hovered element, selection or focused field | head-aim pose (reach exists) |
| **react** | one-shots on events: honk on click, `hack` while typing in a watched form, cover eyes on password focus | per-character `pose` animations (honk, hack and headbang exist) |

### 5.3 State machine

A two-level design, following Reynolds' split into *action selection*, *steering* and *locomotion* ([Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/gdc99/)). Reynolds' catalogue includes seek, flee, arrival, wander, path following and a "hide" behaviour.

1. **Interrupt states** (Shimeji's "ALWAYS REQUIRED" set): `dragged`, `thrown`, `falling`. These are entered on events from any state.
2. **Behaviour layer**: a weighted, conditional choice, as in Shimeji's `Frequency` + `Condition`, grouped by "where am I" (on a platform / on a wall / hidden). Each behaviour is a short **sequence of primitives**, as in Shimeji's `ClimbIEWall`. Inputs (hovered element, focused field, selection rect, scroll velocity, cursor) raise the weights of matching behaviours or trigger them directly. This matches how Rive characters are driven by state machine inputs.
3. **Locomotion layer**: executes primitives and owns the frame-accurate sync of position and animation.

A full behaviour tree is not needed at this scale. [Behavior Trees in Robotics and AI](https://arxiv.org/abs/1709.00084) gives the trade-offs if the behaviour set grows. The behaviour table should be data (JSON alongside the bundle, or the declarative state machine proposed as R3 in [animation-tools-survey.md](animation-tools-survey.md)), so agents can author it like they author rigs.

### 5.4 Movement: kinematics, not a physics engine

- **Walking:** `x += dir × speed × size / 100 × dt` with `dt` from the **same clock** that steps frames (otherwise feet slide after long frames; [web-runtime-devices.md P1 #9](web-runtime-devices.md)). `y = platform.top`, re-read whenever the world refreshes. **(tested: feet y exactly equal to the card top over 400 steps, and they followed the card when it resized.)**
- **Ground line:** a sprite is placed so that `feetY = top + H × ground`. For the goose figure the toes rest at y ≈ 90.5 of 100 (`figures/goose.json`, `footNear.to`). **Bundles should export `ground` (units)** per figure, or per animation via an attachment point (survey R2). Today the PoC hard-codes 0.92.
- **Pixel snapping:** round the translate to whole CSS px (flock does this). Optionally snap to the sprite-pixel grid `k` while standing still, so idle sprites do not shimmer.
- **Jump arc:** given the take-off point (x0, y0), the landing point (x1, y1), an apex `lift` px above the higher of the two, and the jump animation's flight time `T` (its frames between `launch` and `land`), choose gravity so that the flight lasts exactly `T`:

  ```js
  // Screen y grows downward. Tested: lands exactly on (x1, y1) and peaks at the apex (3 cases).
  export function jumpArc(x0, y0, x1, y1, lift, flight) {
    const apex = Math.min(y0, y1) - lift;
    const up = Math.sqrt(y0 - apex), down = Math.sqrt(y1 - apex);
    const g = 2 * ((up + down) / flight) ** 2;          // T = (√(y0−apex) + √(y1−apex))·√(2/g)
    return { vx: (x1 - x0) / flight, vy: -Math.sqrt(2 * g * (y0 - apex)), g, T: flight };
  }
  // position at time t: x0 + vx·t, y0 + vy·t + g·t²/2
  ```

  Fitting gravity to the animation, instead of the animation to gravity, keeps the crouch, launch and land frames in sync. Cap `lift` and the horizontal distance per character (in units × size / 100) to define which jumps are **reachable**. For game-feel parameters (apex height and time, faster fall), see [Building a Better Jump (GDC 2016)](https://www.gdcvault.com/play/1023559/Math-for-Game-Programmers-Building).
- **Falling:** Shimeji-style per-frame gravity with drag. Sweep from the previous to the new feet position and snap to the first platform crossed from above, so a fast fall cannot tunnel through a card ([Fall.java](https://github.com/LavenderSnek/ShimejiEE-cross-platform/blob/master/src/main/java/com/group_finity/mascot/action/Fall.java)).
- **Pathfinding:** BFS/Dijkstra over the platform graph (§3.3). Costs = walk length / speed + jump or climb time. With tens of nodes, recompute the graph only when the world is dirty.
- **Physics engines:** [matter.js](https://github.com/liabru/matter-js) ("a 2D rigid body physics engine for the web") and [planck.js](https://github.com/piqnt/planck.js) ("JavaScript/TypeScript rewrite of Box2D", per its README) would add rotation, stacking, restitution and joints. Our characters are pre-animated and must not rotate or tumble freely, and the motion must stay locked to the gait speed. A physics engine would fight both. Consider one only for a "throw the goose and let it ragdoll" toy mode.

### 5.5 The per-frame algorithm and its costs

```
on rAF(now):                                     // one loop for the stage; skip when hidden, paused or reduced motion
  dt = clock.dt(now)                             // shared with <pixel-sprite> frame stepping
  if world.dirty: world.read()                   // READ: k × getBoundingClientRect, one layout at most
  if any actor on an "animated" or "fixed" surface: read just those rects
  input = drain(queued pointer/focus/selection/scroll events)   // the listeners only queue
  for actor in actors:                           // PURE JS
     actor.brain.update(input, world, dt)        // state machine: may pick a new primitive/path
     actor.locomotion.update(dt)                 // walk/jump/fall/climb → feet (x, y), facing, anim
     actor.occluders = world.occludersFor(actor) // rect overlap tests, O(occluders)
  for actor in actors:                           // WRITE
     style.transform = translate(round(x − W/2), round(y − H·ground))
     style.clipPath  = cutout(...) | 'none'      // only when changed
     style.zIndex    = round(y)                  // only when changed
     sprite.play(anim) / fps / flip              // only when changed
```

Costs:

- **Layout:** zero forced layouts in steady state (**tested**). One batched read when the page changes (resize, DOM mutation, font load).
- **Style/paint:** per actor per frame, one `transform` (composited if `will-change: transform`) and, when behind something, one `clip-path` repaint of a 64–128 px element. Canvas redraws happen only on animation frame changes (8–12 fps), which `<pixel-sprite>` already does.
- **JS:** ~2 µs per actor step in the PoC on desktop. A phone is perhaps 5–10× slower **(estimate, unverified)**, still negligible next to a 16.7 ms frame.
- **Budget on phones:** at most ~4 active actors by default (`max-actors`). Suspend actors that are off-screen for more than a few seconds: `<pixel-sprite>` already pauses drawing via `IntersectionObserver`, and their brains should be ticked at 1–2 Hz. Stop the loop entirely when the tab is hidden; rAF already pauses there (MDN).

### 5.6 Input, safety and accessibility

- **Never block clicks.** The layer and sprites have `pointer-events: none`, which makes events go "through" to whatever is underneath ([MDN pointer-events](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/pointer-events)). **(tested: Playwright clicked the button through the goose; the actionability check found no intercepting element.)** `<pixel-sprite>`'s own `hover-anim`/`click-anim` listeners will not fire there, so the stage owns input.
- **Making a sprite draggable or tappable without blocking:**
  - *Mouse/pen:* a capture-phase `pointerdown` listener on `document`. If the point is inside an actor's box **and** the sprite pixel there is opaque (hit-test the current frame, or use baked hit areas, survey R9), claim it: `preventDefault()`, `setPointerCapture`, start `dragged`, and swallow the following `click` in the capture phase.
  - *Touch:* `touch-action` is decided when the gesture starts, from the touched element and its ancestors, and later changes have no effect ([MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)). Because the page element underneath is the target, a drag on touch would also scroll the page. Options: (a) on coarse pointers, a **tap** shoos the goose (flee) and dragging is off; (b) a long-press makes the actor's body hit box `pointer-events: auto; touch-action: none` for the next gesture. Default to (a). MDN warns that `touch-action: none` can inhibit zooming.
- **Don't cover content.** Behaviours must never park on or hide behind `data-pixel-avoid` elements, form fields that have focus, or the current text selection. A sprite near the cursor or a focused element moves out of the way (*flee* with a short distance). Limit the time spent idling in front of text.
- **Screen readers:** the layer is `aria-hidden="true"` (as oneko does), so decorative actors produce no announcements. If an actor conveys information (say, a tutorial guide), it should mirror its messages into a polite live region that the page owns. This is out of scope for the MVP.
- **Keyboard:** the visible control ("pause geese" / "hide geese") is a real `<button>` in the tab order, persisted in `localStorage`. That satisfies WCAG 2.2.2 Pause, Stop, Hide (Level A) for motion that starts automatically, lasts more than 5 s and runs alongside other content ([WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Optional: actors react to keyboard focus moving (`focusin`), so keyboard users get the same delight.
- **Reduced motion:** `prefers-reduced-motion: reduce` (Chrome 74, Firefox 63, Safari 10.1, BCD) → no locomotion. Actors appear perched at their start spot, showing one still frame (the runtime already freezes playback). oneko instead removes the cat entirely. Listen for `change` on the media query.
- **Layout shift:** only `transform` on our own absolutely positioned elements, so there are no layout shifts. "CSS transform property lets you animate elements without triggering layout shifts" ([web.dev CLS](https://web.dev/articles/cls)). Inserting the layer as the first child of `body` with zero size does not move content. Reserve the size of any visible control.
- **Performance budget:** see §5.5. Also: no polling of page geometry beyond opted-in elements, and no `getComputedStyle` per frame (esheep does both).

### 5.7 Phased plan

| phase | scope | engine / runtime work |
|---|---|---|
| **MVP** | `<pixel-stage>` + one actor type; `data-pixel-surface` and `data-pixel-occluder`; walk-along, turn, idle, drop down (fall) and wander between platforms on one level, with drops; hide-behind with the rect cut-out; tap to flee; pause control; reduced motion; `aria-hidden`; desktop + mobile; document scroller only | Bundle `ground`; shared clock; animation events (`land`) |
| **v2: verticality** | Jump between platforms (arc + graph), climb (`data-pixel-climbable`) + mount, perch with edge-sit, peek up/side, drag + throw with mouse/pen, sticky/fixed surfaces, the IO move detector | **`climb` motion model with `speedY`**; legged jump with `launch`/`land`; edge-sit, dangle, peek, fall poses; "end offset" for mount |
| **v3: page awareness** | Inputs: `focusin` (look at or react to fields; cover eyes on password fields), `selectionchange` (walk to the selection or "eat" it, visually only), hover look-at, scroll reactions (`scroll` velocity → wobble or hold on; `scrollend` → resume), click reactions, follow cursor | head-aim pose parameters (reach targets exist); per-character reaction poses; behaviour table as data (survey R3) |
| **v4: richer** | Per-scroller stages, `data-pixel-surface="animated"` polling, anchor-positioned perching as progressive enhancement, a flock (several actors with separation, as in Reynolds), persistence across navigation (as oneko), touch long-press drag | — |

---

## 6. Interaction scenarios

Coordinates are document px; `S` = displayed sprite size, `u = S/100` px per unit.

### 6.1 The goose climbs a card and walks along its top

Setup: `<article class="card" data-pixel-surface data-pixel-climbable>`; the goose stands on the stage floor to the left of the card.

1. **Choose:** the wander behaviour picks the card's platform. The graph finds no jump edge (the top is above `maxLift`) but a climb edge via the card's left wall.
2. **Walk** to `x = card.left − W/2 + footInset` with `waddle` at `26.21 × u` px/s (goose-root `waddle.speed`). Turn to face the card.
3. **Grab:** play `climb` from frame 0. x stays glued to `card.left`, minus the body depth.
4. **Climb:** y decreases at `climb.speedY × u` px/s until the feet are one body-height below `card.top`.
5. **Mount:** play `mount` once. On its end event, apply its end offset (+dx, −dy) so the feet sit on `card.top`, and switch to the platform state `on = card`.
6. **Walk along:** `waddle` along `[card.left + r, card.right − r]`, with feet y = `card.top` re-read whenever the world is dirty (**tested** in the PoC).
7. **Card moves** (content above it grows): `ResizeObserver` on `<html>` marks the world dirty, the next frame re-reads it, and the goose rides along. If the card is *removed*: `MutationObserver` → rescan → the goose has no surface → `falling`.
8. **At the edge:** a weighted choice between turn, sit on the edge (`edge-sit`, legs dangling) and drop (walk off → `falling` → `land` on the next platform below, or on the floor).

### 6.2 The goose hides behind a button

Setup: `<button data-pixel-hide>Subscribe</button>` sits on a section whose top is a surface. The user clicks near the goose.

1. **Trigger:** a capture-phase `click` within 80 px of the goose. Flee picks the nearest `data-pixel-hide` reachable on the same platform (the button's bottom lies on or near the platform).
2. **Run** toward the button (`run`, `76.19 × u` px/s).
3. **Enter behind:** when the goose's box starts to overlap the button rect, add the button to its occluder set. From now on `clip-path` cuts out the button rect (**tested**: the lower body was hidden, the head visible above). Switch to `sneak` or `crouch` and continue until the box is inside the button's horizontal extent.
4. **Hold** with `idle` (crouched) for 2–6 s. A larger goose than the button shows its head, which is intended: "badly hidden".
5. **Exit:** walk out sideways. Remove the occluder once the boxes no longer overlap.
6. **Safety:** clicks on the button still reach it, because the layer has `pointer-events: none` (**tested**). If the button gains focus (keyboard user), the goose leaves.

### 6.3 The goose peeks over a heading

Setup: `<h2 data-pixel-perch>` with an opaque background (a heading with a transparent background cannot hide anything, §4.2). The goose stands on the section below, behind the heading box.

1. **Approach** behind the heading: add the heading to the occluder set. The goose is fully cut out.
2. **Peek:** play `peek-up` (neck-stretch pose) once and hold its last frame. The head rises above `h2.top` and becomes visible: only the region above the cut is drawn.
3. **Look:** with the head-aim reach target set toward the cursor, hold 1–3 s. If the pointer comes within 120 px, play `startle` and retract (play `peek-up` in reverse, or `crouch`).
4. **Side peek variant:** at the heading's left or right end, `peek-side` leans the head past `h2.left`.
5. **Perch variant** (sitting on the heading): jump onto `h2.top` (§5.4 arc) and play `edge-sit`. Use this variant for transparent headings.

### 6.4 The goose reacts to a form

Setup: `<form data-pixel-watch="focus">`.

1. `focusin` on an `<input>` → the goose walks to the nearest platform within ~200 px of the field (never covering it) and looks at it (head aim).
2. `input` events → play the `hack` loop (goose-root) while typing continues. Stop 1 s after the last keystroke.
3. `focusin` on `type=password` → `cover-eyes` pose (wing over face) until `focusout`.
4. Submit → `honk` once.

### 6.5 Scroll and selection

- **Scroll:** sprites on in-flow surfaces scroll with the page for free. On a scroll-velocity spike, actors that are mid-walk play `wobble` / hold on. On `scrollend` they resume. Actors on fixed surfaces stay put.
- **Selection:** on `selectionchange` (throttled to one per frame), read `getRangeAt(0).getBoundingClientRect()`. If it lies within a surface's horizontal extent and is visible, the goose walks to the platform above the selection and "pecks" it (a pose only; the page text is never changed).

---

## 7. Proof of concept: what was tested

Scratch files, not committed: `/private/tmp/claude-501/-Users-pavelpascari-work-projects-pavelpascari/72fe6b5a-fbe9-4b20-9267-e49508e075a3/scratchpad/pagework/poc/` (`index.html`, `stage.js`, `jump.mjs`, `jump.test.mjs`). The PoC uses the real `<pixel-sprite>` and `goose-root.bundle.json` from `demo/assets`, served over HTTP, in Chromium 156 (Playwright, desktop, DPR 1). Size 64 → the 32 px variant at k = 2.

| check | result |
|---|---|
| Feet glued to the card top over 400 walk steps at `waddle.speed × 64/100` = 16.77 px/s | feet y always exactly `card.top` (259.4375) |
| Rect reads during 400 walk steps | **0** |
| Rect reads after `scrollTo(0, 300)` (document coordinates) | **0** |
| Card resized (margin + height) → `ResizeObserver` → world refresh | 2 reads (card + button); goose y followed the new top (299.4375) |
| Card moved by `transform: translateY(40px)` | **not detected**: goose stayed at the old top (known limitation, §3.2) |
| Clip-path cut-out, sprite paused, screenshots with and without the clip | 760 goose pixels inside the button rect hidden by the clip; **0** goose pixels visible inside the button rect with the clip; head above the button visible (see screenshot) |
| Unrounded cut (button top at a fractional y) | 12 anti-aliased pixels changed on the edge row → round cut coordinates |
| Click on the button through the goose | the click landed (`clicks: 1`); the layer's computed `pointer-events` is `none` |
| JS cost per actor step (refresh no-op + kinematics + clip string) | ~1.8 µs (desktop) |
| Dirty refresh right after a style write (forced layout, tiny page) | ~28 µs |
| `jumpArc` (node) | lands exactly on target and peaks at the requested apex in 3 cases |

Not tested: Safari and Firefox rendering of `path(evenodd, …)` clips (support per BCD only), real phones, many actors, the cost of style and paint per frame, touch dragging.

---

## 8. Open questions and unverified items

- The CSSOM View wording on transformed elements' `getBoundingClientRect` was not re-read (§3.1); the behaviour is well known, but **unverified** here.
- Style and paint cost of per-frame `clip-path` on mobile Safari and Chrome Android: **unverified**. Fallback: switch the clip only when overlap begins or ends, and use a fixed cut for a stationary hidden goose.
- BonziBuddy and Desktop Goose internals: no primary source (§2.5, §2.6).
- `position-anchor` initial value churn (BCD) suggests waiting before relying on anchor positioning.
- Whether `scroll` events in the capture phase on `document` arrive for all nested scrollers in all browsers: expected per the DOM event model, **not tested**.
- Product question: should actors persist across page navigations (oneko does, via `localStorage`)?
- Product question: default on phones? Recommendation: on by default with tap-to-shoo, drag off, and at most 2 actors.
