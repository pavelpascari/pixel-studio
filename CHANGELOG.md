# Changelog

What changed in Pixel Studio, written for the people who use it: the npm packages `@pixel-studio/core` (the
engine, the `pixel` CLI and the example characters) and `@pixel-studio/runtime` (`<pixel-sprite>`, `<pixel-stage>`
and `<pixel-actor>`), and the studio, playground and website at [pixel-studio.sh](https://pixel-studio.sh), which
change between releases. This page is also at [pixel-studio.sh/changelog](https://pixel-studio.sh/changelog/), with an
[RSS feed](https://pixel-studio.sh/changelog/rss.xml).

Each entry starts with the part it concerns:

- **Runtime**: `@pixel-studio/runtime`, the web components that play characters on a page.
- **Engine**: `@pixel-studio/core` in code: the spec format, figures, motion, bundles and the JavaScript API.
- **CLI**: the `pixel` command.
- **Examples**: the characters that ship with `@pixel-studio/core`.
- **Packages**: installing, package names, what the packages contain.
- **Studio**: the studio, playground, figure library and goose workbench on pixel-studio.sh.
- **Docs** and **Website**: the documentation and the rest of pixel-studio.sh.

**Upgrading** lists what to change in your code or commands when you update. The studio and the website are
deployed as they change; their entries are listed under the release that follows.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0, minor versions may change the spec format, and pre-releases
(`-alpha`) may change anything; each such change is listed under Upgrading.

## [Unreleased]

### Upgrading
- **CLI:** `pixel bundle` now writes the side view only. If a page turns a character towards the reader (a
  `<pixel-stage>` character's `face('viewer')`, its glances at the reader, or an animation such as `idle@front`),
  rebuild its bundle with `--views all`, or name the views it needs (`--views front`). Bundles made in code with
  `buildBundle()` still keep every view. A view name the character does not have is now an error.

### Added
- **Runtime:** `<pixel-sprite loading="lazy">` (and `el.loading`) waits to download and unpack a character until it
  is about one screen away from being seen, like `<img loading="lazy">`. A character far down a long page costs
  nothing until the reader gets near it (a goose is up to 105 KB to download and 8 MB or more of memory once
  unpacked). The default stays eager; `<pixel-actor>` always loads at once, because the stage needs its size to
  place it.
  [Runtime docs](https://pixel-studio.sh/docs/reference/runtime/)
- **Runtime:** pick up and throw `<pixel-stage>` characters on touch screens. Press and hold one for 400 ms, carry it
  with your finger, and let go to throw it. A quick tap still shoos it, and a swipe that starts on a character still
  scrolls the page. On Android the pick-up gives a short buzz. Mice and pens can use the same hold, or drag at once
  as before.
- **Runtime:** new actor events `pixel-grab` and `pixel-throw` (in scenes: `grab` and `throw`), and `pointerType` in
  `pixel-tap` and `pixel-burst`, so a page can tell how a character was touched and react the same way on every
  device.
- **Runtime:** `<pixel-sprite>` state machines work on touch screens: a tap counts as hovering, then a click, and the
  hover ends 3 s after the last tap. Hover states such as goose-root's are now reachable on a phone.
- **CLI:** `pixel bundle --anims idle,waddle,honk` makes a bundle with only those animations, plus what they need to
  play (their views and turns, and the transitions between them). `--anims stage` keeps what `<pixel-stage>` uses.
  A goose with three animations is 16 KB instead of 57 KB. An unknown name is an error that lists the character's
  animations. In code: `buildBundle(character, {animations: [...]})`.
  [CLI docs](https://pixel-studio.sh/docs/reference/cli/)
- **Studio:** open any example from a link, in a simple view:
  `/apps/studio/?c=goose-root&skin=party&anim=waddle` shows the character large, with a few animations, its looks
  and four sizes, then Customise (the full editor), Create with Claude or Export. `&edit` opens the full editor
  directly, and "Simple view" in the toolbar goes back. An example opened this way does not replace the character
  saved in your browser until you edit it.
- **Studio:** looks (skins). The full editor has a picker for a character's looks, the preview and sheets show the
  look picked, and the export snippets include it (`skin="party"`).
- **Studio:** the export dialog can leave out animations and front and back views, like `pixel bundle --anims` and
  `--views` (views are off by default).
- **Studio:** every studio page (studio, playground, figure library, goose workbench) links back to the website, its
  docs and this changelog.
- **Docs:** a [performance page](https://pixel-studio.sh/docs/reference/performance/): the download size of the
  runtime and of every example, the effect on page load, the time each frame takes for 1, 10 and 50 characters and on
  a stage, memory, and how to keep each one small.
- **Docs:** an [interactions table](https://pixel-studio.sh/docs/reference/stage/) for mouse, pen, touch and keyboard:
  what each input does to a sprite and a stage character, and what to offer keyboard and screen reader users.
- **Docs:** lazy loading, and a CSS rule that reserves a sprite's space before its script runs, so the page does not
  move when it appears. It is in [getting started](https://pixel-studio.sh/docs/reference/getting-started/).
- **Website:** a new home page that starts with a character to direct: pick a goose, a fox or Pip, make it walk,
  jump and hide on a small page, then change its look, copy its embed, see how characters react to the reader, open
  it in the studio ("Customize this goose"), and see real download sizes. One button pauses every character on the
  page.
- **Website:** this changelog at [/changelog](https://pixel-studio.sh/changelog/), with an RSS feed, linked from the
  footer, the docs and the studio.

### Changed
- **Runtime:** while a finger or pen rests on a stage character, the page's text selection, callout and context menu
  are held off. A cancelled touch drops a held character where it is instead of leaving it hanging. A throw uses
  the last 100 ms of movement, so resting before letting go drops the character rather than throwing it. A quick
  tap elsewhere just after touching a character now reaches the page.
- **Examples:** the fox's ears swap places: the near ear is drawn in front, with its cream inner; the far ear is
  shaded, behind the head.
- **Examples:** goose-root's `party` hat sits on the crown of the head instead of over the shades.
- **Website:** the [examples](https://pixel-studio.sh/gallery/) have posters cropped to the characters, and the site
  takes the studio's colours. The header is shorter: Examples, Docs, Blog, Studio.

### Fixed
- **Engine:** a bundle whose state machine played a view that was left out (`--views`) was rejected by the runtime.
  States whose animation is not in the bundle are now dropped, with the transitions to them, and `pixel bundle` names
  them.

## [0.2.0-alpha.2] - 2026-11-21

### Upgrading
- **Packages:** the engine is now **`@pixel-studio/core`**, next to `@pixel-studio/runtime`. Replace the package:
  `npm uninstall pixel-studio && npm i @pixel-studio/core`, and the imports: `pixel-studio` becomes
  `@pixel-studio/core` (likewise `/internal`, `/runtime`, `/stage` and `/node/png`). Paths to the examples become
  `node_modules/@pixel-studio/core/examples/`. The `pixel` command is unchanged.

### Deprecated
- **Packages:** `pixel-studio` on npm stays at 0.2.0-alpha.1 and is deprecated, pointing to `@pixel-studio/core`.

## [0.2.0-alpha.1] - 2026-11-21

### Upgrading
- **Packages:** the web components have their own package. A site that only plays characters can install
  `@pixel-studio/runtime` alone (no dependencies) and import `@pixel-studio/runtime` and
  `@pixel-studio/runtime/stage`. Imports of `pixel-studio/runtime` and `pixel-studio/stage` keep working. If you
  linked the files directly, they are now `src/pixel-sprite.js` and `src/pixel-stage.js` in the runtime package
  (they were `src/runtime/` in `pixel-studio`).

### Added
- **Packages:** Pixel Studio is on npm: `pixel-studio` (the engine, the `pixel` CLI, figures, examples, motion
  references and the reference docs) and `@pixel-studio/runtime` (`<pixel-sprite>`, `<pixel-stage>` and
  `<pixel-actor>`). Both always have the same version, and the engine depends on exactly that runtime. Releases are
  built from a signed tag by CI and each one is approved by a maintainer with two-factor authentication.
- **Docs:** the [Guide](https://pixel-studio.sh/docs/guide/) on pixel-studio.sh: nine topics, each live example
  running next to its code, and each editable character redrawn by the engine as you type.

### Removed
- **Packages:** the research notes are no longer in the package; they stay in the repository.
- **Website:** the P/P site sketch (`demo/pp.html`), a personal site rather than a Pixel Studio demo.

## [0.2.0-alpha.0] - 2026-11-15

The first alpha: characters that live on a page with `<pixel-stage>`, scenes, state machines, skins, front and back
views, motion measured from real animals and people, much smaller bundles, and a stricter, smaller API. It was
installed from GitHub: `npm i github:pavelpascari/pixel-studio#v0.2.0-alpha.0`.

### Upgrading
- **Runtime:** every event is now named `pixel-<name>`, and every one bubbles and crosses shadow roots. The details
  are unchanged. The old names still fire for now (see Deprecated).
  - `<pixel-sprite>`: `ready` → `pixel-ready`, `error` → `pixel-error`, `statechange` → `pixel-statechange`,
    `spriteend` → `pixel-end`, `spriteevent` → `pixel-event`, `spriteburst` → `pixel-burst`, `spritecalm` →
    `pixel-calm`.
  - `<pixel-actor>`: `tap`, `burst`, `calm`, `enter`, `exit`, `land`, `arrive`, `drop`, `pickup`, `deliver`,
    `catchup` → `pixel-tap`, `pixel-burst`, …; `actorstate` → `pixel-activity`.
  - `<pixel-stage>`: `sceneevent`, `scenestep`, `sceneend`, `scrollsettle`, `fastscroll` → `pixel-sceneevent`, ….
  - Scenes keep the short names (`"waitFor": "tap"`). Because events bubble, `"on": "stage"` now hears every
    character's events, and a listener on an actor hears each burst once.
- **Runtime:** a sprite's load status is the `status` attribute and `el.status` (`loading`, `ready`, `error`), and an
  actor's behaviour is `actor.activity`. The word "state" now only means the state machine.
- **Engine:** internal building blocks moved to `pixel-studio/internal` (now `@pixel-studio/core/internal`), which
  carries no compatibility promise: `createImage`, `blit`, `bakePoints`, `samplePose`, `samplePoseAt`, `sampleValue`,
  `frameTime`, `followOffsets`, `worldMatrices`, `solveReach`, `overflowForPose`, `resolveExtends`, `mergeVariant`,
  `expandFigure`, `paletteOf` and `buildMixes`. `pngBytes` stays public.
- **Engine:** `SHAPE_TYPES`, `TEXTURES`, `MOTION_MODELS` and `LEGGED_MODELS` are replaced by the functions
  `shapeTypes()`, `textures()`, `motionModels()` and `leggedModels()`. `TRACK_PROPS`, `DETAIL_PRESETS` and
  `DETAIL_NAMES` are frozen.
- **Engine:** specs are checked more strictly, so a typo fails with its JSON path instead of rendering blank. A spec
  that rendered before may now be rejected: part `x`, `y`, `rot` and `shade` must be numbers, `sx`/`sy` within ±16,
  shape sizes at least 0, `minDetail`/`maxDetail` 1, 2 or 3, coordinates within 4 canvas sizes, `size` at most 1000
  units, renders at most 512 px, and names such as `toString` or `constructor` are not allowed.
- **Engine:** walks, trots, runs and goose head-bobs are re-timed from measurements of real animals and people (see
  Changed), so characters on the dog, goose and human figures move at different speeds. Pages that move them with
  `pxPerSecond` or the bundle's `speed` follow automatically.

### Added
- **Runtime:** `<pixel-stage>`: characters that live on the page. They walk along `data-pixel-surface` elements,
  drop and jump between them, climb, sit on edges, duck and peek behind elements, pass behind cut-outs and avoid
  areas you mark. Tap one to shoo it; drag and throw it with a mouse or pen. Moving surfaces carry them. A pause
  button is remembered, and reduced motion is respected. [Stage docs](https://pixel-studio.sh/docs/reference/stage/)
- **Runtime:** actors you can direct: `goTo`, `hideBehind`, `say` (a speech bubble above the head), `face`, `shoo`,
  `perform`, `pickUp` and `drop` (carry an element in the beak or hand), `exit` and `enter` (by the screen's edge),
  `hurry`, `catchUp`, and `run(action)`, which returns a promise. A `directed` mode stops wandering between orders.
- **Runtime:** scenes: short scripts as JSON, played with `stage.playScene()` or `<pixel-stage scene="#intro">`, with
  steps that move, talk, wait for events, run in parallel and loop. A scene can have a `trigger` (a click, a form
  submit, an element scrolled into view, a tap on a character), and `<script type="application/json"
  data-pixel-scene>` scenes are armed when the page loads. Scenes are checked first, with JSON paths in the errors.
- **Runtime:** reactions to the reader: bursts of quick clicks (`pixel-burst`, `pixel-calm`) speed a character up and
  make stage characters panic; fast scrolls (`pixel-fastscroll`, `pixel-scrollsettle`) make `keep-in-view` characters
  catch up. A `rate` attribute sets the playback speed.
- **Runtime:** `<pixel-sprite>`: state machines, skins (`skin="party"`), attachment points (`el.point(name)`), events
  from animations (`pixel-event`, such as footsteps), `el.topAt()`, `el.pxPerSecond()`, `el.displaySize`,
  `el.currentAnim`, `el.frame`, `el.reload()`, a shared `clock`, fallback content (such as a poster image) before
  load, and sharp scaling in whole device pixels at any pixel density.
- **Engine:** front and back views: a spec's `views` dress the same character on other figures, with generated turns
  and a three-quarter `look`. Stage characters turn to the reader (`actor.face('viewer')`) and now and then glance
  at them. New figure `goose-front`.
- **Engine:** state machines (`states`: inputs, nodes, random fidgets, transitions on conditions and events, click
  and hover), skins (`skins`), attachment points (`points`), frame holds (`holds`), animation events (`events`) and
  transition clips (`mixes`) that blend one animation into the next, so stops and starts no longer pop.
- **Engine:** new motion models `jump`, `climb`, `fall` and `sit`, `duck` and `peek` presets, a `wings` rig role, and
  motions measured from photographs and studies: `dog.gallop`, `human.sprint`, `human.sitDown`, `human.standUp` and
  `goose.fly`. Each value is credited in `references/` (and `references/CREDITS.md`, in the package).
- **Engine:** plug-ins: `registerShape`, `registerTexture` and `registerMotion` add shapes, textures and motion models
  that validate, render and animate like the built-in ones. CLI: `--plugin`.
- **CLI:** `pixel export` writes a PNG sheet with Aseprite-format JSON and a PixiJS animations map (loaded by PixiJS
  8.6 and Phaser 3.88). `pixel bundle --views` and `--external` (sheets as separate PNG files, so a page downloads
  only the size it shows). `pixel preview --anim a,b`. `--skin` and `--plugin`. `pixel help`.
- **Examples:** Moss, a moss-green shield beetle with twelve hand-keyed animations, and greylag, a natural greylag
  goose. Every goose has front and back views and flies; the fox gallops.
- **Studio:** the playground (`/apps/studio/play.html`): one character set up entirely by its link, with panels for
  colours, textures and style, and a Copy link button. Agents can drive it: see the
  [playground docs](https://pixel-studio.sh/docs/reference/playground/).
- **Studio:** the goose workbench: the goose large, every part switchable, realistic features to try on, a rendering
  panel, every view, exported as a spec.
- **Studio:** the studio, the figure library and the workbench work on phones and tablets.
- **Docs:** a [getting started guide](https://pixel-studio.sh/docs/reference/getting-started/) and a guide of live
  examples (sprites, events, state machines, moving, the stage, writing a character, motions, exporting to game
  engines).
- **Website:** demos: the stage demo with scenes and a newsletter form the goose delivers, Fox Trail (an endless
  runner played by the fox), and the P/P site sketch.

### Changed
- **Engine:** bundles are much smaller: sheets are written as indexed PNGs (35–45% smaller), and skins are stored as
  the difference from the default look (root's two skins: 290 KB → 10 KB). All demo bundles together went from
  1.6 MB to 0.85 MB.
- **Engine:** motion re-timed from published measurements: dogs walk with real strides and trot at a real trot,
  geese bob their heads and keep a foot down when they run, people take real-length steps.
- **Examples:** the geese have transition clips, `flap`, `rush` and `climb`, and every example gained `jump`, `fall`,
  `sit`, `duck` and `peek` where they make sense.
- **Runtime:** on touch screens a sprite's `hover-anim` no longer flashes during a tap; a tap plays it once when
  there is no `click-anim`.
- **CLI:** errors print as one `error:` line with exit code 1 (`PIXEL_DEBUG=1` adds the stack). `--frame -1` is the
  last frame.

### Deprecated
- **Runtime:** the old event names (`ready`, `spriteend`, `tap`, `actorstate`, …), the `state` attribute of
  `<pixel-sprite>` and `actor.state` still work, and will be removed in a later release.

### Fixed
- **Runtime:** one sprite that failed stopped every sprite on the page.
- **Runtime:** before load, or after a failure, a sprite was 300 × 150 px; its space is now reserved from `size`.
- **Runtime:** changing `src` quickly could show the wrong character; a failed download was never retried
  (`reload()` retries).
- **Runtime:** `alt=""` was read out with the bundle's name; it now marks the sprite as decorative.
- **Runtime:** under reduced motion, or off-screen, a one-shot animation never ended.
- **Runtime:** a looping scene whose steps all finished at once froze the tab.
- **Runtime:** a bundle URL that serves an HTML page now gets an error that says so, and sheets from another origin
  load.

## [0.1.0] - 2026-11-08

First public version.

### Added
- **Engine:** the JSON character spec: materials, parts with pivots and parents, shapes (rect, ellipse, circle,
  capsule, polygon) and animation tracks, with validation that gives JSON paths and did-you-mean.
- **Engine:** a pixel-art renderer at any resolution with three levels of detail: hue-shifted colour ramps, lighting,
  textures, dithering, selective outlines, inner lines and contact shadows.
- **Engine:** sprite sheets, contact sheets, ASCII frames and self-contained web bundles; reach constraints (IK) and
  variants that extend another spec.
- **Engine:** figures `goose`, `human`, `dog`, `chibi` and `blob`, and motion models `gait`, `idle`, `pose` and `hop`,
  with planted feet, squash and stretch, follow-through for tails and ears, and a `speed` for moving on a page
  without sliding.
- **CLI:** `pixel` with `validate`, `preview`, `ascii`, `render`, `bundle`, `resolve`, `where`, `figures` and `brief`.
- **Runtime:** `<pixel-sprite>`: one tag that plays a bundle, with sizes, hover and click animations, reduced motion
  and pausing off-screen.
- **Studio:** the studio, with live editing, a rig overlay, the levels of detail side by side and an Agent tab, and a
  figure viewer.
