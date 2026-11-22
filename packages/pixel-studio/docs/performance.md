# Performance: what characters cost a page

Measured numbers for deciding whether to put Pixel Studio characters on a site: what a page downloads, what that does
to loading, what playing costs per frame, and how much memory it takes. Every number here comes from a script in
[`scripts/bench/`](../../../scripts/bench/), with the command to rerun it next to each table.

- [In short](#in-short)
- [Download size](#download-size)
- [Load impact](#load-impact)
- [Cost per frame](#cost-per-frame)
- [Touch scrolling](#touch-scrolling)
- [Memory](#memory)
- [Keeping it small](#keeping-it-small)
- [How it was measured](#how-it-was-measured)

## In short

- **Download:** 14 KB of script for `<pixel-sprite>`, 42 KB for `<pixel-stage>` (brotli; 16 and 48 KB gzip), plus
  one bundle per character: 9 to 43 KB for the five non-goose examples, 75 to 105 KB for a goose with every view and
  resolution, 55 KB for the same goose as `pixel bundle` builds it by default (the side view only), and 14 KB with
  `--res 32` (4 KB with only the three animations a page plays, `--anims idle,waddle,honk`).
- **Loading:** no measurable change to LCP or TBT on a throttled mobile profile. One sprite causes a small layout
  shift (CLS 0.03) unless its box is reserved in CSS.
- **Playing:** under 0.1 ms of main thread per frame for one sprite, 0.4 ms for 50, 0.3 ms for a stage with three
  actors (under 7% of a frame for 50 sprites with the CPU slowed down four times). Off-screen, paused and
  reduced-motion sprites cost nothing measurable per frame; a playing stage keeps moving its characters off-screen.
- **Memory:** the decoded sprite sheet is the large part: 0.1 to 2 MB at 32 px for most characters, and about
  8 MB for a goose at 64 px (20 MB for the greylag, whose longest animation has almost three times as many frames).
  It is shared by every sprite of that character.
- **Below the fold:** by default a sprite fetches and decodes its bundle as soon as it is in the page, even far
  below the fold. On long pages, [`loading="lazy"`](#keeping-it-small) waits until it comes near.

## Download size

A page with characters downloads the runtime once and one bundle per character (a JSON file with the sprite sheets as
PNG data URLs). Sprites that share a bundle URL share one fetch and one decoded sheet. Rerun with
`node scripts/bench/sizes.mjs` (after `npm run build:demo`). The tables below are generated from it (`npm run docs:gen`
in `website/`), and the website build fails when they no longer match the files in the repository. KB = 1024 bytes;
gzip at level 9, brotli at quality 11.

The runtime, as published in `@pixel-studio/runtime` (readable source with comments, not minified). `pixel-stage.js`
imports `pixel-sprite.js`, so a page with a stage loads both.

<!-- gen:sizes table=runtime -->
| File | Raw | gzip | brotli |
|---|--:|--:|--:|
| `pixel-sprite.js` | 48.6 KB | 16.1 KB | 14.1 KB |
| `pixel-stage.js` | 99.7 KB | 31.9 KB | 27.8 KB |
| both (a page with `<pixel-stage>`) | 148.3 KB | 48.0 KB | 41.9 KB |
<!-- /gen -->

The example characters as built for the demos (16, 32 and 64 px, every view, every skin: `buildBundle`'s defaults, or
`pixel bundle --views all`).
Bundles are mostly PNG data, which is already compressed: gzip and brotli save 30 to 45% (mostly the base64
overhead), not the two thirds they save on script. A sprite decodes only the one sheet it shows, as RGBA in memory:
the last two columns (see [Memory](#memory)).

<!-- gen:sizes table=bundles -->
| Bundle | Animations | Raw | gzip | brotli | Decoded 32 px sheet | Decoded 64 px sheet |
|---|--:|--:|--:|--:|--:|--:|
| `fox` | 9 | 61.1 KB | 43.6 KB | 42.7 KB | 0.4 MB | 1.7 MB |
| `goose-base` | 41 | 134.8 KB | 89.5 KB | 87.8 KB | 1.9 MB | 7.7 MB |
| `goose-greylag` | 41 | 146.7 KB | 93.5 KB | 91.0 KB | 5.1 MB | 20.5 MB |
| `goose-kiddie` | 40 | 120.6 KB | 77.3 KB | 75.5 KB | 1.9 MB | 7.5 MB |
| `goose-phreak` | 42 | 146.6 KB | 98.4 KB | 96.6 KB | 2.0 MB | 7.9 MB |
| `goose-root` | 42 | 160.2 KB | 104.9 KB | 102.8 KB | 2.0 MB | 7.9 MB |
| `goose-sudo` | 42 | 158.8 KB | 107.2 KB | 105.4 KB | 2.0 MB | 7.9 MB |
| `moss` | 12 | 17.3 KB | 9.8 KB | 9.6 KB | 0.8 MB | 3.0 MB |
| `pip` | 9 | 36.1 KB | 24.7 KB | 23.9 KB | 0.4 MB | 1.7 MB |
| `robot` | 3 | 13.5 KB | 9.4 KB | 9.1 KB | 0.1 MB | 0.6 MB |
| `slime` | 5 | 21.3 KB | 15.5 KB | 15.1 KB | 0.2 MB | 0.9 MB |
<!-- /gen -->

The geese carry front and back views (`idle@front`, `turn@back`, …, used by `<pixel-stage>` to face the viewer) and,
for `goose-root`, two skins: that is most of their weight. The same goose built with other options ("gzip saved" is
against the first row, the demo build; `pixel bundle` without `--views` ships the side view only):

<!-- gen:sizes table=goose -->
| `pixel bundle goose-root.json` with | Animations | Raw | gzip | brotli | gzip saved | Largest sheet decoded |
|---|--:|--:|--:|--:|--:|--:|
| `--views all` (as built for the demos) | 42 | 160.2 KB | 104.9 KB | 102.8 KB |  | 7.9 MB (64 px) |
| (default: `--res 16,32,64`, side view only) | 17 | 83.4 KB | 56.8 KB | 55.3 KB | 46% | 3.2 MB (64 px) |
| `--anims stage` | 14 | 68.6 KB | 47.0 KB | 45.7 KB | 55% | 2.6 MB (64 px) |
| `--anims idle,waddle,honk` | 5 | 24.2 KB | 16.4 KB | 15.8 KB | 84% | 0.8 MB (64 px) |
| `--views all --anims stage` | 37 | 138.7 KB | 91.1 KB | 89.2 KB | 13% | 6.9 MB (64 px) |
| `--res 32 --views all` | 42 | 48.4 KB | 25.2 KB | 23.5 KB | 76% | 2.0 MB (32 px) |
| `--res 32` | 17 | 25.0 KB | 15.0 KB | 13.7 KB | 86% | 0.8 MB (32 px) |
| `--res 32 --anims idle,waddle,honk` | 5 | 7.4 KB | 4.6 KB | 4.2 KB | 96% | 0.2 MB (32 px) |
| `--res 32 --external` | 17 | 19.5 KB | 12.7 KB | 12.2 KB | 88% | 0.8 MB (32 px) |
<!-- /gen -->

The `--external` row counts the JSON and the one PNG a page downloads (the 32 px sheet); PNG files are served as they
are, without further compression. A stage actor built without `--views` cannot turn to face the reader; everything
else works. `--anims stage` keeps what a stage actor plays (here everything but `flap`, `fly` and `hack`).

## Load impact

What adding characters does to a small page's Core Web Vitals, with Lighthouse's mobile profile (slow 4G, a CPU four
times slower than the test machine). LCP and TBT are given twice: with Lighthouse's default simulated throttling,
and with the throttling applied in the browser, which times what really happens. Rerun with
`node scripts/bench/browser.mjs --only load` ([how](#how-it-was-measured)).

| Page | LCP, simulated | LCP, applied | TBT, simulated | TBT, applied | CLS | Transferred | Requests |
|---|--:|--:|--:|--:|--:|--:|--:|
| Plain page (no characters) | 622 ms | 686 ms | 0 ms | 0 ms | 0.000 | 1.3 KB | 2 |
| 1 sprite | 626 ms | 695 ms | 0 ms | 0 ms | 0.031 | 60.6 KB | 5 |
| 1 sprite, box reserved in CSS | 628 ms | 703 ms | 0 ms | 0 ms | 0.003 | 60.7 KB | 5 |
| Stage with 3 actors | 1085 ms | 700 ms | 0 ms | 0 ms | 0.000 | 191.1 KB | 10 |

The sprite is the 64 px fox (`fox.bundle.json`, built with the defaults); the stage has a goose, Pip and a slime.
Requests include the page and a favicon request.

- **LCP.** The runtime is a module script, which does not block rendering: the page's text paints first. With
  applied throttling the characters move LCP by 10 to 20 ms, within the spread between runs. Lighthouse's
  simulation adds 460 ms for the stage, because it counts the requests that start before the first paint (here the
  two runtime files) as if they delayed it; that is the number a Lighthouse report shows by default.
- **TBT.** 0 ms in every run. No task over 50 ms comes from the runtime: the few long tasks Lighthouse saw (50 to
  90 ms) appear on the plain page too.
- **CLS.** 0.03 for one sprite: before its script runs the element has no size, then takes its box and pushes the
  content below down. The CSS rule in [Keeping it small](#keeping-it-small) brings it to 0.003; a poster image with
  `width` and `height` also reserves the box from the first paint. What is left is the device pixel ratio of the
  profile's phone, 1.75: whole device pixels per sprite pixel make the 64 px fox 73 px tall once it has loaded
  ([why](runtime.md#device-pixels-and-scaling)). At a device pixel ratio of 1, 2 or 3 the same page shifts by 0.000
  (measured in Chrome 156 with a `layout-shift` `PerformanceObserver`, which gives the same 0.031 and 0.003 at 1.75).
  The stage adds no shift: its characters are drawn in a layer above the page.
- **Bytes.** The 1-sprite page transfers the runtime (15 KB gzip) and the fox's bundle (44 KB gzip); the stage page
  the two runtime files (44 KB) and three bundles (145 KB, 105 KB of it the goose).

## Cost per frame

Main-thread time per rendered frame, in Chrome, with every character on screen and animating. "Added" is what the
characters add to the same page without them, and its share of a 60 Hz frame (16.7 ms). The 4x CPU columns slow
the same machine down four times, roughly a mid-range phone. Every case held 60 frames per second and had no long
tasks (over 50 ms) while playing. Rerun with `node scripts/bench/browser.mjs --only runtime` ([how](#how-it-was-measured)).

| Case | Characters on screen | Per frame | Added (share of a frame) | Per frame, 4x CPU | Added, 4x CPU |
|---|--:|--:|--:|--:|--:|
| Plain page | 0 | 0.15 ms | | 0.21 ms | |
| 1 sprite | 1 | 0.21 ms | 0.06 ms (0.4%) | 0.29 ms | 0.09 ms (0.5%) |
| 10 sprites | 10 | 0.33 ms | 0.17 ms (1.0%) | 0.61 ms | 0.40 ms (2.4%) |
| 50 sprites | 50 | 0.59 ms | 0.43 ms (2.6%) | 1.24 ms | 1.03 ms (6.2%) |
| 50 sprites, all off-screen | 0 | 0.17 ms | 0.02 ms (0.1%) | 0.22 ms | 0.01 ms (0.1%) |
| 50 sprites, reduced motion | 50 | 0.17 ms | 0.02 ms (0.1%) | 0.26 ms | 0.05 ms (0.3%) |
| Stage with 3 actors walking | 3 | 0.46 ms | 0.31 ms (1.9%) | 1.13 ms | 0.92 ms (5.5%) |

The sprites are 64 px foxes sharing one bundle, half walking and half trotting. The stage has a goose (80 px), Pip
(72 px) and a slime (56 px) wandering, climbing and sitting on three cards; a stage costs more per character than a
sprite because it also moves the characters across the page and decides what each does next.

- **Off-screen and reduced motion cost nothing measurable.** Sprites off-screen (one shared `IntersectionObserver`)
  or under `prefers-reduced-motion` leave the shared frame loop, and the loop stops when it is empty. A paused sprite
  (`paused`, `pause()`) leaves the loop the same way, and so does a paused stage (its button, `stage.pause()`).
  A playing stage keeps moving its characters while they are off-screen (they go on wandering), so a stage is not
  free when scrolled away; that case was not measured.
- **The cost grows with the number of characters drawing**, at about 0.007 ms per sprite per frame on this machine
  (0.016 ms with 4x CPU), on top of a fixed cost for the loop and the first sprite.
- These are main-thread numbers. Compositing the canvases takes GPU and compositor time as well, which is not
  included.

## Touch scrolling

So that a finger can pick a character up, a stage with `grab="on"` (the default) keeps one non-passive `touchmove`
listener on the document. It does nothing unless a character is held, but the browser has to wait for it before a
swipe can start scrolling. Measured on `demo/stage.html` in Chrome (headless, Pixel 7 profile, real touch input),
15 swipes per case that start off the characters, interleaved: time from `touchstart` to the first `scroll` event,
and frames over 50 ms during the fling that follows.

| Case | Swipe to first scroll (median) | 4x CPU | Long frames in the fling |
|---|--:|--:|--:|
| Stage, `grab="on"` (touch listener) | 66 ms | 64 ms | 0 |
| Stage, `grab="off"` (no touch listener) | 49 ms | 47 ms | 0 |
| Same page without a stage | 32 ms | 31 ms | 0 |

- The touch listener makes a swipe start scrolling one frame later (16 ms, with or without CPU throttling); the
  fling that follows is not affected. A paused stage, `prefers-reduced-motion`, `grab="mouse"` and `grab="off"`
  register no touch listener and do not pay it.
- The rest of the stage (its pointer listeners and per-frame work) accounts for one more frame against a page with no
  stage at all.
- The listener cannot wait for a hold to begin: Chrome honours one added mid-gesture, but WebKit (by its design; not tested here) decides when a
  touch starts whether its moves can be cancelled, so on iPhones the page would scroll away under a held character.
- The test driver sends each touch point and waits for the browser to acknowledge it, so these are upper bounds
  measured in whole frames; a real finger's swipe overlaps them. The script is not in `scripts/bench/` yet.

## Memory

Rerun with `node scripts/bench/browser.mjs --only runtime`. Measured after a forced garbage collection, as the
difference from the plain page.

| Case | JS heap | All browser processes |
|---|--:|--:|
| 1 sprite | +0.3 MB | +10 MB |
| 10 sprites | +0.3 MB | +12 MB |
| 50 sprites | +0.4 MB | +23 MB |
| 50 sprites, all off-screen | +0.3 MB | +12 MB |
| 50 sprites, reduced motion | +0.3 MB | +12 MB |
| Stage with 3 actors | +0.9 MB | +30 MB |

"All browser processes" is the resident memory of every Chrome process (the page, the GPU process, the browser); it
moves by a few MB between runs, so read it to the nearest 5 MB. Most of it is not JavaScript:

- **The decoded sheet.** A sprite decodes only the sheet it shows, once per bundle and resolution, shared by every
  sprite that uses it. In memory it is width × height × 4 bytes, much more than the PNG: the last two columns of
  the [bundles table](#download-size). A 64 px goose sheet with front and back views is about 8 MB decoded; the
  [goose table](#download-size) shows how leaving out views, animations and resolutions shrinks it. A 32 px sheet is a quarter of
  the 64 px one.
- **One canvas per sprite**, the displayed size in device pixels × 4 bytes: 256 KB for a 128 × 128 px sprite on a 2x screen.
- Off-screen sprites keep their decoded sheet and canvas: the 50 off-screen sprites above hold the same memory as
  10 visible ones. A sprite with `loading="lazy"` that has not yet come near holds neither (and has downloaded
  nothing).

## Keeping it small

- **Ship only the resolutions you show.** A sprite at `size` 64 uses the 32 px sheet, at 128 the 64 px one
  ([how the variant is chosen](runtime.md#how-the-resolution-variant-is-chosen)). `pixel bundle --res 32` drops the
  others: three quarters of a goose's bundle. Keep two resolutions if the same character appears at very different
  sizes, or on a page that changes `size`.
- **Bundle only the animations you use.** A `<pixel-sprite>` that idles, waddles on hover and honks on click needs
  three of a goose's fourteen animations: `pixel bundle goose.json --anims idle,waddle,honk` is under a third of the
  side-view bundle. For a `<pixel-stage>` actor, `--anims stage` keeps what the stage plays (one animation per role:
  idle, walk, run, jump, fall, sit, duck, peek, climb, …). Transition clips between kept animations stay, and a state
  machine loses the nodes whose animation is gone ([details](cli.md#bundle)).
- **Ship views only for a stage that turns.** Front and back views are for `<pixel-stage>` turning a character to
  face the reader, and they double a goose. `pixel bundle` leaves them out unless you ask: `--views all` (or
  `--views front`) for a stage actor that should turn.
- **Keeping several resolutions? Use `--external`.** The sheets become PNG files next to the bundle and a page downloads
  only the one it shows. Put them on the same origin, or send `Access-Control-Allow-Origin` ([details](runtime.md#loading-errors-and-fallbacks)).
- **Share one bundle.** Ten sprites of the same character with the same `src` make one request and decode one sheet.
  Ten different characters make ten of each.
- **Serve with compression.** Static hosts and CDNs usually compress `.js` and `.json`; check that yours does. The
  runtime files shrink to a third (they are readable source with comments, not minified). If you bundle your site's
  JavaScript, your bundler can minify them too.
- **Reserve the box before the script runs.** The element is reserved at `size` × `size` once its script has run;
  before that it is an unknown inline element with no size, and the content below it moves when it appears (CLS 0.03
  for one 64 px sprite in the [load test](#load-impact)). A CSS rule removes it (0.003 on a phone with a fractional
  device pixel ratio, 0 otherwise), with one line per `size` you use:

  ```css
  pixel-sprite:not(:defined) { display: inline-block; vertical-align: bottom; width: 128px; height: 128px; }
  pixel-sprite:not(:defined)[size="64"] { width: 64px; height: 64px; }
  ```

  `vertical-align: bottom` matches the element's own style; without it a sprite in a line of text still shifts it
  a little (0.002) when the script runs. For no shift at all after load, use a `size` that is a whole multiple of
  the sheet it shows (64 for the 32 px sheet, 128 for the 64 px one). A poster image with `width` and `height` inside the element ([fallbacks](runtime.md#loading-errors-and-fallbacks))
  reserves the space too, and shows the character before the bundle arrives and when JavaScript is off.
- **Reduced motion and the pause button cost nothing per frame.** They stop drawing, which is where the cost is. The stage's
  pause button is on by default; for sprites that loop for more than five seconds, give readers a way to call
  `pause()` (WCAG 2.2.2, see [accessibility](runtime.md#accessibility)).
- **Load characters far down the page lazily.** By default a sprite fetches its bundle and decodes its sheet as
  soon as it is in the document, even when it is far below the fold; only the drawing waits until it scrolls into
  view. On a long page with characters near the bottom, add `loading="lazy"`:

  ```html
  <pixel-sprite src="fox.bundle.json" size="64" alt="A fox" loading="lazy"></pixel-sprite>
  ```

  It waits, with its box reserved, until it is within one viewport of being seen, then loads
  ([details](runtime.md#lazy-loading)). Until then it costs no request, no download (the fox's 44 KB gzip, a goose's
  75 to 105 KB), no decoded sheet (0.4 MB for the fox at `size` 64; 2 MB for a goose at 64, 8 MB at 128) and no canvas.
  Sprites that share a bundle with one already loaded have nothing left to save. Stage actors always load at once;
  for a stage, add the `<pixel-stage>` element (or its script) once the page has loaded, for example in a `load`
  event listener.

## How it was measured

Machine: MacBook Pro with an Intel Core i9-9980HK (8 cores, 2.4 GHz), 64 GB, macOS 26.6; Google Chrome 156,
headless; Node 24. Medians of 5 runs; each run starts a fresh browser. Measured on 2026-11-22 at the commit that added
this page. Your numbers will differ with the machine; the differences between rows are the useful part.

- **Sizes** (`node scripts/bench/sizes.mjs`, Node only): the runtime files from `packages/runtime/src/`, the bundles
  from `demo/assets/` (`npm run build:demo`), gzip level 9 and brotli quality 11 from `node:zlib`. The goose rows
  build `goose-root.json` in process with the same `buildBundle` options as the `pixel bundle` flags in each row. "Decoded" is the PNG's
  width × height × 4.
- **Load and runtime** (`scripts/bench/browser.mjs`): a small static page (a heading, three paragraphs, three
  cards; [`scripts/bench/page.html`](../../../scripts/bench/page.html)) with nothing, sprites or a stage added as
  plain markup, served from the repository root by the script itself with gzip, like a static host.
  - Load: Lighthouse 13 (performance category, default mobile profile: Moto G Power screen, slow 4G at 150 ms RTT
    and 1.6 Mbit/s, 4x CPU slowdown), once with its default simulated throttling and once with throttling applied
    in the browser (`throttlingMethod: 'devtools'`).
  - Runtime: Playwright drives Chrome at 1280 × 900, device pixel ratio 1. After the characters are ready and 1.5 s
    of warm-up, the main thread's busy time (Chrome's `TaskDuration` metric over the DevTools protocol) is summed
    over 4 s and divided by the frames rendered in that time (counted with `requestAnimationFrame`, on every page,
    the plain one too). Then the same with the CPU slowed down four times (`Emulation.setCPUThrottlingRate`). Long
    tasks are counted with a `PerformanceObserver`. Memory: the JS heap after a forced garbage collection, and the
    resident memory (`ps`) of every Chrome process.

Lighthouse and Playwright are not dependencies of this project. To rerun everything:

```sh
npm run build:demo
mkdir /tmp/bench && cd /tmp/bench && npm i lighthouse playwright-core
node /path/to/pixel-studio/scripts/bench/browser.mjs --runs 5          # about 25 minutes; --only load or --only runtime
node /path/to/pixel-studio/scripts/bench/browser.mjs --serve           # just serve the test pages, to profile them by hand
```

It uses the installed Google Chrome; `--chrome <path>` (or `CHROME_PATH`) picks another Chromium.

Not measured: Firefox and Safari (the runtime numbers use a Chrome-only protocol; the runtime is checked for
behaviour in both, see [runtime.md](runtime.md#testing-on-devices)), real phones, and a stage whose actors are
all off-screen.
