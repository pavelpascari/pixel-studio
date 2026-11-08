# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).
Until 1.0, minor versions may change the spec format.

## [Unreleased]

### Stage
- Drag and throw characters with a mouse or pen (touch keeps tap-to-shoo, so scrolling is never hijacked).
- `data-pixel-surface="animated"`: moving surfaces are re-read every frame; characters ride them, and jumps onto them
  follow them in the air. The stage demo has a drifting cloud.

### Plug-ins
- `registerShape`, `registerTexture`, `registerMotion` (and `usePlugin`, `registeredPlugins`): new shapes, textures
  and motion models validate, render and animate like built-ins, and `pixel brief` lists them. CLI `--plugin`.
  Example: `examples/plugins/extras.mjs` (star shape, feathers texture, float motion) and `starfish.json`.

### Transition clips
- `mixes` in specs (`"waddle>idle": {"frames": 3}`) bake in-between frames that blend the end of one animation
  into the start of another. `<pixel-sprite>` plays them when a switch happens at a boundary (loop end or after a
  one-shot), so stops and starts no longer pop; `play(name, {mix: false})` skips them. The geese have them.

### Docs site
- `site/`: nine pages where every feature is a live example next to its code (copyable, highlighted), and spec
  playgrounds that render a character with the real engine as you edit it. Overview, sprites, events and points,
  state machines and skins, moving sprites, the stage, writing a character, figures and motions, bundles and game
  engines (with a live PixiJS example). Works on phones.
- `npm run build:demo` also writes a poster PNG per character and an exported goose sheet for the PixiJS example.

### Runtime (`<pixel-sprite>`)
- Fixed: one sprite that threw stopped every sprite on the page. The shared frame loop now requests
  the next frame first and isolates each sprite; a failing sprite goes to `state="error"`.
- Fixed: elements upgraded after parsing loaded their bundle twice.
- Fixed: before load (and after a failure) a sprite was 300 × 150 px. The box is now reserved from `size`.
- Fixed: overlapping `src` changes could race and show the wrong bundle or throw. Loads carry a token
  and commit atomically.
- Fixed: a failed fetch was cached forever. Failures are evicted; `reload()` retries.
- Fixed: `alt=""` was announced with the bundle's name. It now marks the sprite decorative.
- Fixed: under reduced motion, one-shots never fired `spriteend`. They now hold a frame and end on time,
  and the setting is watched live.
- Added: scaling in whole device pixels (even pixels at DPR 2.625, 1.5 and with zoom), re-run when the DPR changes.
- Added: `error` event and `state` attribute (`loading`/`ready`/`error`); light-DOM fallback content (a poster `<img>`).
- Added: the shared `clock` export for page code, `el.pxPerSecond(name)`, `el.displaySize`, `el.currentAnim`,
  `el.frame`, `el.reload()`, `play(name, {restart})` (re-playing the current animation no longer restarts it).
- Added: bundle validation (`checkBundle`), decoded sheets shared between sprites (`ImageBitmap`), one shared
  `IntersectionObserver`, `fps` observed.
- Changed: on touch screens `hover-anim` no longer flashes during a tap; a tap plays it once when there is no `click-anim`.
- Added: `test/browser/runtime.html`, 22 in-browser checks to run on real devices (pass in Chromium, Firefox, WebKit and iOS Safari),
  and `scripts/browser-check.mjs`, which runs them and every docs-site page in Firefox and WebKit with Playwright
  (installed outside the project; no dependency).
- Fixed: a one-shot started while off-screen never fired `spriteend`; it now ends on time, as under reduced motion.

### Bundles and specs
- Bundles record the spec canvas `size` and the foot line `ground` (units), so pages can convert `speed` to px/s and
  stand a character exactly on an element.
- Animation events: motion models emit `footstep` (with the leg), `takeoff`/`land` (hop) and `launch`/`land` (jump);
  authors add `"events": [{"frame", "name", "data"}]`. The runtime fires them as `spriteevent`.
- Attachment points: `points` in specs and figures (`beak`, `head`, hands, …), baked per frame; `el.point(name)`.
- Frame holds: `"holds": {"3": 2}` → per-frame `durations` in the bundle.
- Skins: named patches (`skins`) baked as extra variants; `<pixel-sprite skin="party">`. CLI `--skin`.
- State machines: `states` (inputs, nodes with one-shots and random fidgets, transitions with conditions and `at`
  now / end / sync / an event name, click and hover interactions). Runtime `el.set`, `el.fire`, `el.stateNode`,
  `statechange`; exported `StateMachine` and `parseCondition`.
- Validation for all of the above, with JSON paths and did-you-mean.

### Figures and motion
- New motion models: `jump` (legged, one-shot, timed by `launch`/`land`), `climb` (feet on a wall, exports
  `speedY` and the `wall` line), `fall`, `sit` (on an edge); `duck` and `peek` presets. New rig role `wings`.
- Presets for them in every figure where they make sense; examples gained `jump`, `fall`, `sit`, `duck`, `peek` and
  (geese) `climb`.
- Figures define attachment points and their foot line.

### Page interactions: `<pixel-stage>` (new)
- Characters live on a real page: walk along `data-pixel-surface` elements, drop and jump between them, climb
  `data-pixel-climbable` sides, sit on edges and `data-pixel-perch`es, duck and peek behind `data-pixel-hide`
  elements, pass behind `data-pixel-occluder`s (clip-path cut-outs), avoid `data-pixel-avoid`.
- Cost-based route planning; layout read only when the page changes; tap or click a character to shoo it (only its
  opaque pixels, and that click does not reach the page); a pause button that is remembered; reduced motion.
- `actor.goTo()`, `hideBehind()`, `say()`, `shoo()`, `actorstate` / `land` / `arrive` events.
- Demo: `demo/stage.html`. Checked in desktop Chromium and iOS 18.1 Safari (simulator).

### Export
- `pixel export` writes a PNG sheet with Aseprite-format JSON (frames named by index, frame tags, slices for points,
  per-frame durations) plus a PixiJS `animations` map. Loaded successfully by PixiJS 8.6 and Phaser 3.88.
- `pixel preview --anim a,b` limits the rows.

### Demo
- The flock moves its geese on the runtime's clock with `pxPerSecond`, snaps to device pixels, and stops while off-screen.

## [0.1.0] - 2026-11-08

First public version.

### Engine
- JSON character spec: materials, parts with pivots and parents, SDF shapes (rect, ellipse, circle, capsule,
  polygon), animation tracks (keyframes, eased keys, waves). Validation with JSON paths and did-you-mean.
- Pixel-art renderer at any resolution with three detail tiers: hue-shifted colour ramps, lighting,
  textures in part space, dithering, selective outlines, inner lines, contact shadows.
- Sprite sheets, contact sheets, ASCII frames, and self-contained web bundles (`pixel-sprite/1`).
- `reach` constraints (IK), bounds and reach warnings, `extends` variants.

### Figures and motion
- Figure library: `goose`, `human`, `dog` (side view), `chibi` (front view), `blob` (soft body).
- Motion models: `gait` (planted feet, body bob and pitch, steady head, arm swing), `idle`, `pose`, `hop`
  (gravity arc, volume-preserving squash and stretch). Front-view walking. Exported `speed` for
  slide-free movement on a page.
- Follow-through springs for tails, ears, scarves and antennae.

### Tools
- `pixel` CLI (validate, preview, ascii, render, bundle, resolve, where, figures, brief).
- Studio with live editing, rig overlay, detail-level strip and an Agent tab; figure viewer.
- `<pixel-sprite>` web component: resolution variants, hover/click animations, reduced motion, off-screen pause.
