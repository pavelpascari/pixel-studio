# Reliable, efficient sprite playback on the web across devices

Research for `<pixel-sprite>` (`src/runtime/pixel-sprite.js`). Question: how do we make sprite animation playback reliable and efficient on phones (iOS Safari, Android Chrome), on low-end hardware, on high-DPI screens, and with many sprites per page?

Date: 2026-11-08. Browser versions come from [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) (BCD) unless another source is linked. Items marked **(unverified)** could not be confirmed from a primary source. Items marked **(reproduced)** were confirmed by running the demo in Chromium 156 through Playwright (DPR 1). Those checks were run with throwaway scripts; no repository files were changed.

---

## 1. Summary and prioritized recommendations

Our assets are small. The largest sheet is 640×320 px (64 px variant, 10 frames × 5 rows), which is about 0.8 MB once decoded to RGBA. Each bundle is 17–33 KB, or 13–24 KB after gzip. Memory, texture-size and canvas-size limits are not a concern at this scale. Our risks are elsewhere: **loop robustness, load/upgrade races, layout before load, failure handling, fractional-DPR crispness, touch interactions, and keeping page movement in sync with frame stepping.**

### P0: correctness bugs (fix first)

1. **If one sprite throws, every sprite on the page stops for good (reproduced).** `tick()` calls `requestAnimationFrame` only at the end (`pixel-sprite.js:25`). When `_advance` throws, `rafId` stays non-zero, so `schedule()` (`:29`) never restarts the loop. Fix: request the next frame first, wrap each subscriber in `try/catch`, and reset `rafId` if anything escapes.
2. **Upgraded elements load twice (reproduced).** The common case is a module script that runs after the HTML is parsed. For an upgraded element, the HTML spec enqueues `attributeChangedCallback` for every attribute, then `connectedCallback` ([HTML §4.13.5 upgrade steps 4–5](https://html.spec.whatwg.org/multipage/custom-elements.html#concept-upgrade-an-element)). Because of `:102–103`, `_load()` runs twice. Measured result: **2 `ready` events and 2 image decodes per upgraded sprite**, compared with 1 and 1 for an element created with `createElement`. Fix: one load path with a generation token.
3. **The element is 300×150 CSS px before it loads, and stays that size if loading fails (reproduced).** The canvas starts at the [default canvas size](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element) (300×150), so a `size="24"` inline sprite takes up 300×150 until its bundle decodes. That causes layout shift and a large blank box when loading fails. Fix: reserve the box from `size` immediately and show a poster or fallback.
4. **Failures are silent and permanent.** A rejected fetch promise stays in `cache` forever (`:33–40`), so retries are impossible. Errors only go to `console.error` (`:122–124`). There is no `error` event and no fallback content.
5. **Changing `src` races.** Two overlapping `_load()` calls can finish in either order. During the `await` in `_pickVariant`, the new bundle is already set while `_anim` still names an animation from the old bundle. If a tick lands in that window, `_advance` reads `undefined.fps` and triggers bug 1 (reproduced by forcing the window).

### P1: device quality

6. **Make scaling DPR-aware.** Choose the scale in *device* pixels, so each sprite pixel covers a whole number of device pixels, and listen for DPR changes. Today `k` is an integer number of CSS px (`:146–148`). At DPR 2.625 that gives 5.25 device px per sprite pixel, so pixels come out uneven or blurred.
7. **Put `image-rendering: pixelated` last, or use it alone.** In browsers that support `crisp-edges` (Firefox 65+, Safari 7+, and Chrome 148+ per [BCD](https://github.com/mdn/browser-compat-data/blob/main/css/properties/image-rendering.json)), `crisp-edges` currently wins (`:69`; computed value confirmed in Chrome 156). At non-integer factors, `crisp-edges` gives uneven nearest-neighbour pixels, while [`pixelated` snaps to an integer multiple and smooths only the remainder](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering).
8. **Fix hover on touch.** `hover-anim` is effectively invisible on phones. For touch input, [`pointerenter` fires just before `pointerdown` and `pointerleave` fires just after `pointerup`](https://www.w3.org/TR/pointerevents3/), so the hover animation lasts only as long as the finger is down. Gate it on `pointerType === 'mouse'` or `(hover: hover)`, and give touch users an explicit alternative (a tap plays it once).
9. **Expose one shared clock to page code.** Let pages move sprites with the same `dt` the runtime uses to step frames. Today `flock.html` runs its own rAF loop with a 50 ms clamp (`flock.html:168`) while the runtime clamps at 100 ms (`pixel-sprite.js:22`). After a long frame (more than 50 ms), the legs advance more than the body moves, so the feet slide.
10. **Share decoded images and the IntersectionObserver.** Decode once per (bundle, variant), ideally into an `ImageBitmap` ([`createImageBitmap`](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap): Chrome 50, Firefox 42, Safari 15). Use one `IntersectionObserver` for all sprites, and read the **last** entry per target, not `[e]` (`:87`). The spec delivers every entry queued since the last callback ([IO §3.2.5](https://w3c.github.io/IntersectionObserver/)).

### P2: polish and scale

11. Listen for `prefers-reduced-motion` changes (`MediaQueryList` `change`: Safari 14+). Under reduced motion, still fire `spriteend` for one-shot animations so consumers don't hang.
12. Treat `alt=""` as decorative (`aria-hidden="true"`). Today it falls back to the bundle name (`:118`).
13. Prefer frame rates that divide 30, 60 and 120 (6, 10, 15, 30 fps). At 12 fps, frames show for an uneven 2–3 refreshes under iOS Low Power Mode's 30 Hz cap ([WebKit bug 215745](https://bugs.webkit.org/show_bug.cgi?id=215745)).
14. Keep one `<canvas>` per element up to roughly 100 small sprites. For crowd scenes, add an optional single-canvas "stage" (2D, or one WebGL context). Never create one WebGL context per sprite: Chromium allows [16 active contexts and drops the oldest](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp).
15. Document CSP requirements. Data-URL sheets need `img-src data:`, and fetched bundles need `connect-src`. Offer separate PNG files as the CSP-strict option.

The recommended architecture is in [§4](#4-recommended-architecture) and the device test plan is in [§6](#6-test-plan-for-real-devices).

---

## 2. Findings

### 2.1 Rendering approach trade-offs

| Approach | How it animates | Per-frame cost | 1 sprite | 50+ sprites | Pixel-art gotchas |
|---|---|---|---|---|---|
| CSS `background-position` + `steps()` | Declarative, no JS | `background-position` is not compositor-only, so it repaints every frame. [Only `transform` and `opacity` skip layout and paint](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count). | Good, and works without JS once styled | Many independent paints; no shared clock or events | Hard to switch animations or fire end events; scaling depends on `image-rendering` on a background |
| `<img>` sheet inside an `overflow:hidden` box, moved with `transform` + `steps()` | Compositor-only | Cheap per frame, but each animated element may get its own layer. [Every layer costs memory and management](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count). | Good | Layer count grows with sprites | Sub-pixel translate can resample; crispness of a transformed layer is browser-dependent **(unverified)** |
| One canvas 2D per element (ours) | JS `drawImage` when the frame changes | One small blit at about 6–12 fps per sprite; a canvas is a separate composited surface | Good | Fine at our sizes up to about 100. Chromium historically does not GPU-accelerate small 2D canvases (perf tests assume a [256×257 threshold](https://chromium.googlesource.com/chromium/src/+/0a6ac2ed880f1d0ee96368cc19cb115b9218662b/third_party/blink/perf_tests/canvas/draw-static-canvas-2d-to-hw-accelerated-canvas-2d.html)), which is fine for tiny blits. | Backing store vs CSS size vs DPR; `imageSmoothingEnabled=false` |
| One shared canvas (2D or WebGL) for a scene | One loop draws every actor | Best for hundreds of sprites; one surface | Overkill | Best | You do your own hit-testing, accessibility and layout. Per-element WebGL hits the [16-context limit](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp) ([2013 design review](https://codereview.chromium.org/14217005/)). Rive recommends a [shared offscreen WebGL2 context for multiple instances](https://rive.app/docs/runtimes/web/rive-parameters). |
| `ImageBitmap` as the draw source | Decode once, draw many | `drawImage(bitmap)` avoids decoding on first draw | n/a | Shared across elements | `createImageBitmap`: Chrome 50, Firefox 42, Safari 15 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/_globals/createImageBitmap.json)) |

**Conclusion:** keep canvas-per-element as the default. It is DOM-friendly, accessible, styleable and fine at our sizes. Make it cheap by drawing only on frame changes (we already do), sharing decoded bitmaps and the scheduler, and avoiding extra layers (don't set `will-change` on every sprite). Offer a single-canvas stage only for crowd scenes.

**Sub-pixel positions.** Canvas [supports sub-pixel rendering with no way to turn it off](https://web.dev/articles/canvas-performance) (an older article, from about 2011–12). Draw at integer coordinates. For DOM-positioned sprites, snap translate values to the *device*-pixel grid: `Math.round(x * dpr) / dpr`, not `Math.round(x)` as in `flock.html:187`.

### 2.2 Integer scaling, `image-rendering` and devicePixelRatio

- `image-rendering: pixelated` is supported in Chrome 41, Firefox 93 and Safari 10. `crisp-edges` is supported in Firefox 65 (earlier with `-moz-`), Safari 7 and **Chrome 148** (earlier as `-webkit-optimize-contrast`) ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/properties/image-rendering.json)). Per [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering), `pixelated` scales by nearest neighbour to the nearest integer multiple, then smooths the rest. `crisp-edges` is pure nearest neighbour. **For non-integer factors, `pixelated` looks better: uniform blocks with soft edges, instead of mixed 5- and 6-px columns.** Our CSS lists `crisp-edges` second, so it wins wherever it is supported.
- `devicePixelRatio` is physical px per CSS px. It [changes with browser zoom (not pinch-zoom) and when a window moves between displays](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio). Listen with a `(resolution: Xdppx)` media query, re-created on each change (MDN example).
- [DPR can be fractional, and browsers snap fractional physical pixels differently](https://web.dev/articles/device-pixel-content-box), which causes blur or moiré. The exact fix is `ResizeObserver` with `box: 'device-pixel-content-box'`. Support: Chrome 84, Firefox 108 (93–107 returned wrong values), **not Safari** ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/ResizeObserverEntry.json)). Use it as a progressive enhancement. The fallback is `round(cssSize * dpr)`.
- **What this means for us:** at DPR 2.625 (the example DPR from the brief; per-device values not verified), `k = 2` CSS px per sprite pixel becomes 5.25 device px. Choose the scale in device pixels instead: `m = max(1, round(k * dpr))` device px per sprite pixel, CSS size `= frame * m / dpr`. The element then ends up a fraction of a CSS pixel off the requested `size`, but every sprite pixel is exactly `m` device px wide, provided the element's origin sits on the device grid. Origin alignment depends on layout and is not guaranteed in normal flow **(unverified across engines)**. `device-pixel-content-box` reports the snapped size where it is supported.
- Phaser's `pixelArt: true` [sets `antialias: false` and `roundPixels: true`](https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig). Integer positions plus no smoothing is the established recipe.

### 2.3 Timing

- rAF [generally matches the display refresh rate (60/75/120/144 Hz). Progress must be computed from the timestamp, or animations run faster on high-refresh screens. All callbacks in one frame receive the same timestamp](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). That shared timestamp is why one loop and one `now` should drive both frame stepping and page movement.
- **Background tabs and hidden iframes:** [rAF is paused in most browsers](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). Chromium also throttles rendering and rAF in [off-screen cross-origin iframes (since 2015)](https://groups.google.com/a/chromium.org/g/scheduler-dev/c/_SRHebxivJs), extended in 2023 to all cross-origin `display:none` or off-viewport frames ([PSA](https://groups.google.com/a/chromium.org/g/blink-dev/c/op-z7fMMmWY); [Edge 116+](https://learn.microsoft.com/en-us/deployedge/edge-learnmore-iframe-throttling-display)). iOS reportedly caps rAF at 30 fps in cross-origin iframes until the user interacts ([Popmotion blog, secondary source](https://popmotion.io/blog/20180104-when-ios-throttles-requestanimationframe)) **(unverified against WebKit)**. Expect large `dt` gaps when playback resumes. Clamp them, or use absolute time.
- **iOS Low Power Mode:** rAF is capped at 30 fps. WebKit says this is ["intentional. In fact the behavior in iOS 13 was a bug"](https://bugs.webkit.org/show_bug.cgi?id=215745) (iOS 14+).
- **120 Hz ProMotion in Safari:** WebKit [bug 173434 "Support for 120Hz requestAnimationFrame"](https://lists.webkit.org/pipermail/webkit-unassigned/2024-May/1165518.html) has been open since 2017. A 2025 WebKit bug states that [Safari renders at 120 Hz when the "Prefer Page Rendering Updates near 60fps" feature flag is off, and that the flag does not affect WKWebView](https://bugs.webkit.org/show_bug.cgi?id=294338). Assume 60 Hz by default on iOS, but write code that is correct at any rate.
- **Fixed timestep or frame dropping?** Our animations run at 6–12 fps, far below the refresh rate. Accumulating `dt` and dropping frames is right. An even simpler and drift-free option is **absolute time**: `frame = floor((now − t0) · fps / 1000) mod frames`. Established runtimes:
  - **PixiJS** `Ticker`: one shared, auto-started ticker. `deltaMS` is clamped by `minFPS` (default max 100 ms), and `maxFPS` skips early frames while keeping a steady cadence ([source](https://raw.githubusercontent.com/pixijs/pixijs/dev/src/ticker/Ticker.ts)). It has no visibility handling.
  - **Phaser** `TimeStep`: smooths deltas over a 10-frame history, enforces a "panic" cooldown (`panicMax` 120 frames) after focus or resume, and shifts `startTime` by the pause duration on resume ([source](https://raw.githubusercontent.com/phaserjs/phaser/master/src/core/TimeStep.js)).
  - **lottie-web** `AnimationManager`: **one shared rAF loop** for all animations. It runs only while `playingAnimationsNum > 0` and offers `freeze()` and `unfreeze()`. It has no visibility handling ([source](https://raw.githubusercontent.com/airbnb/lottie-web/master/player/js/animation/AnimationManager.js)).
- **Cadence under throttling:** 12 fps is a whole number of frames at 60 and 120 Hz (5 and 10 refreshes) but not at 30 Hz (2.5), so Low Power Mode alternates 66 ms and 100 ms frames. 6, 10 and 15 fps divide all of 30, 60 and 120. The goose bundles use 6, 10 and 12 fps.
- **Keeping movement in sync:** gait `speed` is in units/s and is converted to CSS px/s ([docs/runtime.md](../../packages/pixel-studio/docs/runtime.md#moving-a-walking-sprite-across-the-page)). Feet stay planted only if the body moves by `speed · dt` with the **same `dt`** used to advance frames, so the clamp must match. Today the runtime clamps at 100 ms and `flock.html` at 50 ms.

### 2.4 Memory, decode and delivery

- **Canvas limits:** most browsers allow more than 10,000×10,000 px, but [iOS limits canvases to 4,096×4,096](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/canvas), and a canvas over the limit becomes unusable. iOS Safari also has a **total canvas memory** cap. Reports put it at [256–288 MB (2018)](https://bugs.webkit.org/show_bug.cgi?id=190280) and [384 MB](https://bugs.webkit.org/show_bug.cgi?id=195325). The workaround is to set `width = height = 0` before dropping a canvas. Current limits are **unverified**. Our canvases are at most 64×64 backing store, about 16 KB each, so 1,000 sprites use about 16 MB. Low risk, but zeroing canvases on `disconnectedCallback` costs almost nothing. If we later render at device resolution (§4), 64×5 = 320 px squares are about 400 KB each, still fine at 100 sprites (40 MB) but worth a budget.
- **Max texture size:** not a concern at 640×320 sheets, which are far below any mobile GPU texture limit we would expect. The exact per-device minimums were not verified, and at our scale we don't need them.
- **Decode:** [`img.decode()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode) (Chrome 64, Firefox 68, Safari 11.1) resolves when the image is safe to add to the DOM. It rejects with `EncodingError` if the request fails, the data is corrupt, or `src` changes. MDN does not promise the image *stays* decoded. `createImageBitmap` produces a ready bitmap you hold onto (Safari 15+). We currently create a new `Image` and decode it **per element** (`:140–142`), and twice per upgraded element. The demo index page shows `pip` six times.
- **Data URLs vs files (measured):** base64 adds about 33%, but gzip recovers most of it. `pip.bundle.json` is 22.5 KB raw and 16.3 KB gzipped, against 16.5 KB of raw PNG bytes inside it. One JSON request per character is a good default. Downsides: the JSON must be parsed as a string, the sheets can't be cached or prioritized separately, and CSP must allow `data:`. Separate PNGs (the bundle already allows relative URLs, `bundle.js:3`) get normal [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) and work under a strict `img-src 'self'`. WebP-lossless and AVIF savings for tiny indexed-colour PNGs are **unverified**. Benchmark before switching, since the gain is likely small at 2–17 KB per sheet.
- **Bundle cache:** the module-level `Map` caches fetches per URL for the page lifetime. It should not keep rejected promises.

### 2.5 Lifecycle

- **Off-screen:** `IntersectionObserver` (Safari 12.1+). Callbacks receive all queued entries, possibly several for one target ([spec §3.2.5–3.2.6](https://w3c.github.io/IntersectionObserver/)). Use the last one. `rootMargin` is ignored for cross-origin targets. dotLottie exposes [`freezeOnOffscreen`](https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/advanced/performance), and its Vue wrapper uses IO with `threshold: 0` plus `visibilitychange` ([source](https://github.com/LottieFiles/dotlottie-web/blob/main/packages/vue/src/dotlottie.ts)). Rive only offers manual [`stopRendering()`](https://rive.app/docs/runtimes/web/rive-parameters). The Spine player keeps redrawing while paused and has no visibility gating ([source](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-player/src/Player.ts)). Our per-element IO is already better than Spine and Rive. Share one observer.
- **Page Visibility:** [most browsers stop rAF for background tabs](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). `visibilitychange`: Chrome 62, Firefox 56, Safari 14.1. Older Safari versions don't fire it on navigation, so also listen for `pagehide` ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Document.json)). On `visible`, reset the clock so nothing catches up.
- **bfcache:** [JS is paused and timers are held. `pageshow.persisted` is `true` on restore. `unload` listeners and `Cache-Control: no-store` block bfcache, and in-flight fetches can too](https://web.dev/articles/bfcache). We add no `unload` listener, which is good. On `pageshow` with `persisted`, reset the clock.
- **Reduced motion:** `prefers-reduced-motion` is supported in Chrome 74, Firefox 63 and Safari 10.1. Listening for changes via `MediaQueryList` `change` needs Safari 14 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/MediaQueryList.json)). WCAG 2.3.3 targets [motion triggered by interaction](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html), which is exactly what our hover and click animations are.
- **OffscreenCanvas / workers:** `OffscreenCanvas` 2D is available in Chrome 69, Firefox 105 and **Safari 16.4**; WebGL in OffscreenCanvas from Safari 17 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/OffscreenCanvas.json)). dotLottie offers a worker renderer for heavy vector work. For 6–12 fps blits of tiny bitmaps, a worker adds messaging overhead and complexity for no gain. **Not recommended.**
- **Battery and thermal:** no web API exposes thermal state (**unverified** that none exists in any engine). The levers are fewer wakeups (one loop, stopped when idle, which we already do), draws only on frame change, nothing running off-screen, and respecting the browser's own throttling.

### 2.6 Input on touch devices

- Pointer events on touch fire `pointerover`/`pointerenter` **before** `pointerdown` and `pointerout`/`pointerleave` **after** `pointerup` ([Pointer Events 3](https://www.w3.org/TR/pointerevents3/)). `click` follows. With our handlers, a tap starts `hover-anim`, cancels it on lift, and only then delivers `click`. On a sprite that has only `hover-anim`, the hover animation is invisible on phones.
- `pointerenter` is supported in Safari 13 and Chrome 55. Use the `(hover: hover)` / `(any-hover: hover)` media features (Safari 9). Note: [on some Samsung devices `(hover: hover)` can match incorrectly](https://crbug.com/41445959) ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/media.json)). Prefer the per-event `e.pointerType === 'mouse'`.
- iOS "sticky hover", where `:hover` stays applied after a tap, would make `this.matches(':hover')` at `:181` return to `hover-anim` after a click animation on phones **(unverified)**. Tracking hover from mouse pointer events avoids the question entirely.
- **Passive listeners:** we use only `pointer*` and `click`, never `touchstart`, `touchmove` or `wheel`, so [passive-listener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#using_passive_listeners) scroll blocking does not apply. Don't add `touch-action: none` to sprites, or scrolling stops when a finger starts on a sprite. Rive exposes [`isTouchScrollEnabled`](https://rive.app/docs/runtimes/web/rive-parameters) for this reason.
- **Tap targets:** the [WCAG 2.5.8 minimum is 24×24 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Small interactive sprites (for example, the 28 px button sprite in `demo/index.html`) pass only because of their wrapper. Because `pickVariant` rounds, the displayed size can differ from `size` (`size="24"` displays at 32 px). Document that interactive sprites should get padding to at least 24 px, or 44 px for comfortable touch.

### 2.7 Robustness

- **Upgrade timing:** see P0-2. The spec also says [`connectedCallback` can run more than once, so one-time initialization needs a guard](https://html.spec.whatwg.org/multipage/custom-elements.html#concept-upgrade-an-element). Moving a sprite in the DOM currently re-runs `_load()` and restarts the animation.
- **No-JS / before-definition fallback:** offer a light-DOM poster, for example `<pixel-sprite …><img src="fox-poster.png" alt="A fox" width="128" height="128"></pixel-sprite>`. It shows without JS and before upgrade, and our shadow root hides it once we render (no `<slot>`). Plus a documented `pixel-sprite:not(:defined){display:inline-block;width:…;height:…}` rule to reserve space.
- **CSP:** a `data:` sheet loads only if `img-src` (or `default-src`) allows it, because resources load only when they match a listed source expression ([MDN img-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src)). `fetch(src)` is governed by `connect-src`. Inline `<script type="application/json">` is not executed, so `script-src` does not apply **(unverified; derived from the fact that the script type isn't JavaScript)**. On violation, `decode()` rejects with `EncodingError`, which we currently only log.
- **Failure modes to handle:** HTTP errors, invalid JSON, a wrong `format`, a missing variant or animation, a decode failure, a CSP block, and a slow network. Each should end in a defined state: poster or fallback visible, an `error` event dispatched, a `state` attribute set (`loading` / `ready` / `error`), and retry possible.

---

## 3. Audit of `src/runtime/pixel-sprite.js`

Line numbers refer to the current file (204 lines; `demo/assets/pixel-sprite.js` is identical).

| # | Line(s) | Severity | Gap / bug | Fix |
|---|---|---|---|---|
| 1 | 21–25, 29 | **P0** | rAF is re-requested only after all `_advance` calls. One throw leaves `rafId ≠ 0`, the loop is dead, and `schedule()` never restarts it. **Reproduced:** all other sprites froze. | Request the next frame first, wrap each subscriber in `try/catch` and report errors, and set `rafId = 0` in `finally` if nothing is scheduled. |
| 2 | 101–103, 78–90 | **P0** | During an upgrade, `attributeChangedCallback('src')` and `connectedCallback` both call `_load()`. **Reproduced:** 2 × `ready`, 2 × decode. `anim`/`size` callbacks also run before init. | Ignore attribute callbacks until the first connect has initialized. Make `_load()` idempotent for the same source. |
| 3 | 66–71, 147–148 | **P0** | The canvas defaults to 300×150 CSS px until the variant is chosen, and forever on failure. **Reproduced.** Causes layout shift and blank boxes. | Set the canvas to 0×0 in the constructor and size `:host` from `size` at once (`width/height` from attribute). Show the poster slot. |
| 4 | 33–40 | **P0** | Rejected fetch promises are cached forever. No timeout or abort. | Delete the cache entry on rejection. Allow `el.reload()`. |
| 5 | 112–125 | **P0** | Errors only go to `console.error`. There is no `error` event, no state, and no fallback. Errors from `_pickVariant` when it is called from `attributeChangedCallback` (`:105`) are unhandled rejections. | `try/catch` in every async path. Dispatch `error` with `detail`. Set `state="error"` and show the fallback. |
| 6 | 112–120, 132–145 | **P0** | `src` changes race: there is no generation token, so an older load can finish last. `_bundle` is swapped before `_anim` is reset, so a tick in that window throws (`:168–169`) and triggers #1. | Build `{bundle, variant, image}` fully, check `token === this._loadToken`, then commit atomically and play. |
| 7 | 87 | P1 | `([e]) =>` uses the **first** of possibly several queued entries for the target, which may be stale ([IO spec](https://w3c.github.io/IntersectionObserver/)). One observer per element. | Use one shared observer and process the last entry per target. Optionally add a `rootMargin` of about 50 px to start just before scroll-in. |
| 8 | 69 | P1 | `crisp-edges` overrides `pixelated` in Chrome 148+, Firefox and Safari. It is uneven at non-integer device scales. | Put `pixelated` last (or alone). Draw at device resolution so the property barely matters. |
| 9 | 134, 146–148 | P1 | Scale is an integer in CSS px and ignores DPR, so it is uneven or blurred at DPR 2.625 or 1.5, and at browser zoom. Nothing re-runs when DPR changes. | Compute in device px (§4). Listen for `(resolution)` changes. |
| 10 | 80–85, 181 | P1 | Hover on touch: `pointerenter` and `pointerleave` bracket a tap, so `hover-anim` flashes or never shows. `:hover` may stick on iOS **(unverified)**. | Handle hover only for `pointerType === 'mouse'`. On touch, a tap with no `click-anim` plays `hover-anim` once. Track hover state yourself. |
| 11 | 140–143 | P1 | Each element decodes its own `Image`; there is no cross-element sharing. | Module-level `Map<bundle,res → Promise<ImageBitmap \| HTMLImageElement>>`, using `createImageBitmap` when available. |
| 12 | 22 | P1 | The 100 ms clamp is private, so page code can't share `dt` (`flock.html` uses 50 ms, which makes the feet slide during jank). | Export a shared clock or ticker (§4). |
| 13 | 32, 163 | P2 | `matchMedia` is called on every `_sync`, with no `change` listener. Under reduced motion a one-shot never fires `spriteend`, so consumers awaiting it hang. | Use one shared `MediaQueryList` with a `change` listener that re-syncs all sprites. Under reduced motion, show the one-shot's representative frame and fire `spriteend` after its nominal duration (or at once). |
| 14 | 118 | P2 | `alt=""` is falsy, so it falls back to `bundle.name` and decorative sprites are announced. | `hasAttribute('alt') && alt === ''` → `aria-hidden="true"` and no role. |
| 15 | 93–99 | P2 | Disconnect doesn't cancel an in-flight load (the callback still runs) or release the canvas. Reconnect restarts the animation. | Cancel via token. Optionally zero the canvas size (iOS memory workaround, [WebKit 195325](https://bugs.webkit.org/show_bug.cgi?id=195325)). Resume rather than restart on reconnect. |
| 16 | 154 | P2 | `play()` with the current animation restarts it. Re-entering hover restarts the walk cycle. | Add a `{restart:false}` option, or no-op if it is already playing and not `once`. |
| 17 | 116 | P2 | No `format` check on a bundle, and no validation of animation or variant shape. | Validate `format === 'pixel-sprite/1'` and fail with a clear error. |
| 18 | 169 | P2 | `getAttribute('fps')` is called per element per tick. | Cache it via `observedAttributes`. |
| 19 | (missing) | P2 | No `visibilitychange` or `pageshow` handling. The 100 ms clamp hides the gap, but absolute-time playback would need an explicit clock reset. | Handled in the shared scheduler. |
| 20 | (missing) | P2 | No poster or fallback for no-JS, pre-upgrade or error states. No `:not(:defined)` guidance in the docs. | Light-DOM `<img>` poster (§2.7). |

**Related issues in `demo/flock.html`** (it shows the patterns users will copy):

- `:166–190` runs a second, never-stopping rAF loop. It keeps running while the lawn is off-screen. Its clamp (50 ms) differs from the runtime's (100 ms).
- `:187` rounds positions to CSS px, not device px.
- `:188` writes `zIndex` every frame, and `choose()` reads `lawn.clientWidth` after style writes in the same frame. That can force a style or layout flush **(not measured)**. Cache the lawn size on `ResizeObserver` instead.
- `:182` uses `SIZE / 100` for px per unit. It is correct only while the displayed height equals `SIZE`, which DPR-aware sizing would change. Read the displayed size from the element instead (expose `el.displaySize`).

---

## 4. Recommended architecture

```
pixel-sprite.js
├── clock      one rAF loop, shared by sprites AND page code
├── assets     bundle cache (fetch → validate) + bitmap cache (decode once per variant)
├── observe    one IntersectionObserver, one reduced-motion MQL, one DPR MQL, visibility/pageshow
└── <pixel-sprite>  state machine: idle → loading → ready | error; draws only on frame change
```

1. **Shared clock (scheduler).**
   - One rAF loop, running only while there are subscribers (as lottie-web and PixiJS do).
   - On each frame, compute `now` once, `dt = min(now − last, MAX_DT)` (default 100 ms, configurable), and call every subscriber with `(dt, now)` inside `try/catch`. Request the next frame *before* calling subscribers.
   - Export it as `PixelSprite.clock.add(fn)` / `remove(fn)`, so page code like the flock moves sprites with the same `dt`. Use it from `flock.html`.
   - Reset `last` on `visibilitychange` → visible and on `pageshow` with `persisted`, as Phaser's `resetDelta` does.
2. **Time-based frames.** Each sprite stores `animStart` (in clock time) and an accumulated pause offset. `frame = floor(elapsed · fps / 1000)`, clamped or looped. Draw only when `frame` changes. This is drift-free at 30, 60 or 120 Hz, keeps several sprites of the same animation in phase if wanted, and makes `spriteend` timing exact. Advancing a clamped `dt` (as today) is equivalent if the same clamp drives page movement. Choose one and document it.
3. **Assets.**
   - `bundleCache: Map<url, Promise<bundle>>`, with the entry deleted on rejection and the bundle validated.
   - `bitmapCache: Map<bundle-variant, Promise<ImageBitmap|HTMLImageElement>>`. Use `createImageBitmap(blob)` when available (decode off the main thread); fall back to `img.decode()`.
   - Each element holds only references. Commit `{bundle, variant, image}` atomically, guarded by a load token.
4. **DPR-aware integer scaling.**
   - `pickVariant` still chooses `k ≥ 2` in CSS px. Then compute `m = max(1, round(k · dpr))` device px per sprite pixel.
   - Set the canvas backing store to `frameW·m × frameH·m`, draw with `imageSmoothingEnabled = false` at integer coordinates, and set CSS size `= frameW·m/dpr`. Each sprite pixel is then exactly `m` device px, independent of the browser's `image-rendering` implementation.
   - Re-run when the DPR media query changes. Where supported (Chrome and Firefox, not Safari), refine with `ResizeObserver` `device-pixel-content-box`.
   - Keep `image-rendering: pixelated` as a safety net. Cap the backing store (for example `m ≤ 8`) to bound memory.
5. **Lifecycle and observers.** One IO (last entry wins, `rootMargin` about 50 px). One reduced-motion MQL with a listener. Visibility and pageshow feed the clock. Zero the canvas on disconnect; resume on reconnect.
6. **Interaction.** `hover-anim` only for mouse pointers. Touch tap → `click-anim`, or else `hover-anim` played once. Never call `preventDefault` on pointer events, and never set `touch-action: none`.
7. **Layout, fallback and errors.** Reserve the box from `size` immediately (`:host` width and height). A light-DOM `<img>` poster shows without JS, before upgrade and on error. A `state` attribute (`loading`/`ready`/`error`) for CSS hooks. `ready` and `error` events. Documented CSP (`img-src data:` or use file sheets; `connect-src` for bundles).
8. **Optional `<pixel-stage>` for crowds** (later). One canvas, one draw pass per frame for N actors, integer positions, and the same clock. Use only if measurement shows per-element canvases costing too much at 100+ sprites. If WebGL, use a single context ([16-context limit](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp)).

---

## 5. Prioritized change list

| Order | Change | Fixes (audit #) | Effort |
|---|---|---|---|
| 1 | Harden the loop: request rAF first, `try/catch` per subscriber | 1 | XS |
| 2 | Single load path with token, init guard for upgrades, atomic commit, no cached rejections, `error` event + `state` attr | 2, 4, 5, 6, 15 | S |
| 3 | Reserve the box from `size` before load; 0×0 canvas default; light-DOM poster fallback; docs for `:not(:defined)` and CSP | 3, 20 | S |
| 4 | Shared bitmap cache (`createImageBitmap` fallback `decode`) | 11 | S |
| 5 | Shared IO (last entry), reduced-motion `change` listener, `spriteend` under reduced motion | 7, 13 | S |
| 6 | Touch-aware hover | 10 | S |
| 7 | DPR-aware device-pixel scaling + DPR change listener; `pixelated` last | 8, 9 | M |
| 8 | Export the shared clock; make `flock.html` use it; device-pixel snapping helper; `el.displaySize` | 12, flock items | M |
| 9 | Small items: `alt=""` decorative, `play` no-restart option, `format` validation, cached `fps` | 14, 16, 17, 18 | XS each |
| 10 | Docs: recommend fps of 6/10/15; tap-target padding | — | XS |
| 11 | (If measurements demand) `<pixel-stage>` single-canvas renderer | — | L |

---

## 6. Test plan for real devices

### 6.1 Automated (CI, before real devices)

- **Node unit tests** with a fake clock: scheduler order, error isolation (a throwing subscriber doesn't stop others), clamp, reset on visibility, frame index at given times for 30/60/120 Hz tick sequences, `spriteend` timing, and `pickVariant` plus the new device-pixel scale `m` for DPR ∈ {1, 1.25, 1.5, 2, 2.625, 3}.
- **Playwright** ([emulation docs](https://playwright.dev/docs/emulation)), Chromium, WebKit and Firefox:
  - The upgrade path dispatches exactly one `ready` and one decode (the check used for this report).
  - Box size equals the size reserved from `size` before load and after a 404.
  - `error` event on 404, bad JSON and a CSP-blocked `data:` (serve with `Content-Security-Policy: img-src 'self'`).
  - `deviceScaleFactor: 2.625` and `1.5` screenshots: sample one sprite row and assert every sprite pixel run has equal device-px width.
  - `hasTouch: true` tap on a `hover-anim`-only sprite plays the animation once.
  - `emulateMedia({ reducedMotion: 'reduce' })` toggled at runtime stops playback without a reload.

### 6.2 Device matrix (real devices; BrowserStack/Sauce or in-house)

| Device class | Browser | Why |
|---|---|---|
| iPhone with ProMotion (13 Pro or later), iOS current and current−1 | Safari; also an in-app WKWebView | 60 Hz default vs 120 Hz flag; Low Power Mode 30 Hz; WKWebView differences |
| Older iPhone (SE 2nd gen / A13), iOS current−1 | Safari | Low-end CPU, DPR 2 |
| Pixel (DPR 2.625 per brief; verify on device) | Chrome stable | Fractional DPR crispness |
| Low-end Android (2–3 GB RAM, Android Go class) | Chrome | CPU and memory; DPR 1.5–2 |
| Samsung Galaxy mid-range | Samsung Internet + Chrome | `(hover)` quirk, fractional DPR |
| Windows laptop at 125%/150% scaling | Chrome, Edge, Firefox | Fractional desktop DPR, zoom changes |
| MacBook Pro ProMotion | Safari, Chrome | 120 Hz desktop |

### 6.3 Scenarios and what to measure

| Scenario | Measure | How |
|---|---|---|
| Stress page with 1 / 10 / 50 / 200 sprites (mixed sizes) | Main-thread time per frame in the clock (`performance.measure` around the tick), dropped frames, long tasks, layer count, memory | Chrome DevTools Performance with [CPU throttling 4×/6×](https://developer.chrome.com/docs/devtools/performance/reference), the Rendering panel's frame rendering stats and Layers panel; Android via [remote debugging](https://developer.chrome.com/docs/devtools/remote-debugging); iOS via [Safari Web Inspector](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) Timelines (JavaScript and Events, Rendering Frames, CPU, Memory) |
| Frame cadence accuracy | Log `(now, frame)` on each frame change; compare to the ideal `t0 + i·1000/fps`; report jitter p50/p95 at 120, 60 and 30 Hz (Low Power Mode on) | In-page instrumentation flag (`?ps-debug`) that writes a ring buffer you can dump from the console |
| Feet sliding (flock) | Ground-contact foot x in page px across a planted phase should stay constant (±1 device px) | Record at 60 fps on device, or log computed foot position from the rig; inject jank (busy-loop 80 ms) to test clamp parity |
| Crispness | Sprite pixel run widths in device px are all equal | Device screenshot → script measures run lengths; also at browser zoom 110%/125% (DPR change listener) |
| Off-screen / background / bfcache | No clock callbacks while scrolled out, in a background tab, or after navigating away; resumes without a frame jump; `pageshow.persisted` restores playing state | Counters on the debug overlay; DevTools Application → Back/forward cache tester |
| Touch | Hover-only sprites do something sensible on tap; scrolling starting on a sprite still scrolls; click target size | Manual on iOS/Android; Playwright `hasTouch` |
| Failure | 404, slow 3G (poster visible, no layout shift), CSP-blocked `data:`, corrupt PNG | DevTools network throttling and blocking; a CSP test server; measure CLS with the Performance panel |
| Reduced motion | Toggle the OS setting while the page is open; playback stops and resumes; `spriteend` still fires | iOS Settings → Accessibility → Motion; Android Remove animations; DevTools Rendering emulation |
| Thermal / battery soak | CPU % and energy over 10 min with 50 sprites, page in the foreground | Safari Web Inspector CPU timeline (energy impact); Android `adb shell dumpsys gfxinfo` / battery historian **(tooling details unverified)** |

**Pass criteria (proposal):**

- 50 sprites: under 1 ms main-thread clock time per frame on a low-end Android at 4× throttle.
- Zero clock callbacks while hidden.
- Cadence p95 error under one refresh interval.
- Zero layout shift from sprites.
- No unequal pixel runs at DPR 1, 1.5, 2, 2.625 and 3.

---

## 7. Open questions and unverified items

- Whether the iOS 30 fps cap in cross-origin iframes is current (secondary source only).
- iOS sticky `:hover` after a tap on non-link elements (not checked against a WebKit source).
- Current iOS total-canvas-memory limit (bug reports are from 2018–2020).
- Whether layout reliably places an inline element's origin on the device-pixel grid at fractional DPR in each engine. Measure this on devices; it decides whether device-pixel sizing alone is enough.
- Size and decode gains of WebP-lossless or AVIF over our small PNGs.
- Exact Chromium GPU-acceleration threshold for 2D canvases today.
