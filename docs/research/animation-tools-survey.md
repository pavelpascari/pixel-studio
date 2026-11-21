# Survey: what established 2D animation tools offer, and what Pixel Studio should take

*Research date: 2026-11-08. Sources are primary: official docs, format specs, changelogs and runtime source.
Where a claim could not be checked against a primary source, the text says so. Versions and dates are given
for recently added features.*

**Question.** Which features and extension points of established 2D animation tools and runtimes fit Pixel
Studio's model? That model is a JSON spec written by an agent, rigid SDF parts on bones, a pixel-art bake to
16/32/64 px sheets, and a ~2 KB `<pixel-sprite>` runtime.

**The constraint that shapes every recommendation.** Every tool surveyed except Aseprite, Phaser and Pixi's
flipbook path *evaluates the skeleton at runtime*. Pixel Studio deliberately does not: its look comes from
re-rasterizing SDF geometry with the pixel-art shader at bake time (see [DESIGN.md](../../packages/pixel-studio/docs/DESIGN.md)). So each
runtime feature has to be one of three things:

- **(a)** baked into frames,
- **(b)** baked into per-frame metadata that the tiny runtime reads, or
- **(c)** cheap frame-selection logic in the runtime.

Runtime pose blending, the core of Spine, Rive, Godot and Unity, has to become *baked transitions*.

---

## 1. Summary: ranked recommendations

Effort: **S** about 1–3 days, **M** about 1–2 weeks, **L** more than that. Value is for the stated goal:
agents author characters that pages play.

| # | Feature | What it would look like here | Value | Effort |
|---|---|---|---|---|
| 1 | **Animation events / markers** (`footstep`, `contact`, `release`) | spec `events`, bundle `events`, runtime `spriteevent`. Gait and hop emit them automatically | High | S |
| 2 | **Attachment points (sockets), baked per frame** | spec `points`, bundle per-frame `[x, y, rot]`, runtime `el.point('beak')` in page coordinates | High | S–M |
| 3 | **Declarative state machine in the bundle** (inputs, transitions, pointer interactions) | spec `states` modelled on dotLottie's state machine, runtime `el.set()` / `el.fire()` / `statechange`. Replaces hover-anim / click-anim | High | M |
| 4 | **Baked transitions** (Spine "mix" done at bake time) and sync-on-switch | spec `transitions: {"idle>walk": {frames: 3}}`; engine renders in-between clips; runtime plays them on the switch | High | M |
| 5 | **Interop export** in Aseprite-style JSON (frameTags, slices with pivot, per-frame duration) plus a Pixi `animations` map | `pixel export --format aseprite` | High (reach) | S |
| 6 | **Skins: bake-time attachment swapping** with runtime skin selection | spec `skins` (Spine/Unity category→label model on top of `extends`), bundle `variants[].skin`, `<pixel-sprite skin="winter">` | Medium–High | M |
| 7 | **Per-frame durations / holds, ping-pong and repeat counts** | track `hold`, animation `direction`, `repeat`, bundle `durations[]` | Medium | S |
| 8 | **Extension points**: registries for shapes, textures and motion models, plus custom constraints | `registerMotion(name, fn)`, `registerShape`, `registerTexture`; figures already serve as data-only extensions | Medium (high for contributors) | S–M |
| 9 | **Hit areas** | spec `hitAreas`, baked per-frame bboxes or polygons, runtime `pointerdown` detail `{area}`, and state-machine guards | Medium | S (shares #2) |
| 10 | **Richer physics** on `follow` (gravity, wind, translation springs, chains) | extend `follow` with Spine 4.2 / Godot Jiggle parameters | Medium | S–M |
| 11 | **Runtime queue / priority / chain** | `el.queue(name)`, Live2D-style priorities for idle < hover < click < forced | Medium | S (folds into #3) |
| 12 | **Pose parameters / sliders** (Spine 4.3 Slider, Rive Joystick, Live2D parameters) | spec `params: {mouthOpen: {tracks...}}` to drive many tracks from one named value; baked as discrete frames | Low–Medium | M |

**Top 8 in one line each:**

1. Animation events (`footstep`, `contact`), authored or emitted by the motion models, delivered as `spriteevent`.
2. Baked attachment points, so pages can ask where the hand, beak or muzzle is on the current frame.
3. A dotLottie-style declarative state machine in the bundle (inputs, guards, pointer interactions, at-end transitions).
4. Baked transition clips between animations, with phase-synced switching, instead of runtime blending.
5. Aseprite-compatible JSON export, so Phaser, Pixi, Godot and Unity importers can use Pixel Studio sheets.
6. Skins as named attachment sets (Spine/Unity-style), baked per skin and switched by an attribute.
7. Per-frame durations / holds, ping-pong and repeat counts, matching Aseprite tags.
8. Plug-in registries for shapes, textures, motion models and constraints, with figures staying the data-only extension.

**Deliberately not worth copying** (details in [§4](#4-deliberately-not-worth-copying)):

- Mesh deformation and weighted skinning
- Runtime skeletal evaluation and WASM runtimes
- Runtime alpha crossfades between frames
- Per-key bezier handle editing
- Path constraints, clipping masks, 14 blend modes and two-colour tint
- A general scripting VM inside bundles
- Rive-style data binding of arbitrary properties
- Full Mecanim-style layers with avatar masks

---

## 2. Recommendations in detail

### R1. Animation events / markers (High, S)

**Precedent**

| Tool | How it does events |
|---|---|
| Spine | Event definitions carry `int`, `float`, `string`, `audio`, `volume`, `balance`; timeline keys override them; `AnimationState` dispatches them to listeners as `event` ([SkeletonJson.ts 4.2](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/SkeletonJson.ts), [AnimationState.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/AnimationState.ts)) |
| Unity | `AnimationEvent` has `functionName`, `time` and one float/int/string/object parameter ([ref](https://docs.unity.com/en-us/engine/current/script-reference/unityengine/animationevent)) |
| Godot | Method-call tracks ([Animation](https://docs.godotengine.org/en/stable/classes/class_animation.html)); named **markers** since 4.4 ([4.4 release](https://godotengine.org/releases/4.4/)) |
| Live2D | motion3.json `UserData[{Time, Value}]`, fired through `setEventCallback` ([spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/motion3.json.md)) |
| DragonBones | `frameEvent` / `soundEvent` with `ints/floats/strings` ([DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)) |
| Lottie | `markers: [{cm, tm, dr}]` ([spec](https://lottie.github.io/lottie-spec/)); lottie-web parses `cm` as JSON or `key:value` lines ([AnimationItem.js](https://github.com/airbnb/lottie-web/blob/master/player/js/animation/AnimationItem.js)) |
| Unity's Aseprite importer | Turns Aseprite cel user data into animation events (1.0.0-pre.3, 2023-03-23, [changelog](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@7.0/changelog/CHANGELOG.html)) |

**Why it fits.** Events are pure metadata, so baking costs nothing. The motion models already *know* when
a foot plants (stance begins at `s = 0` per leg), when a hop takes off and when it lands. No other tool can
emit `footstep` automatically from physics-correct gait timing.

**Sketch**

```json
"walk": { "motion": "walk", "events": [ {"frame": 5, "name": "wink"} ] }
"hop":  { "motion": "hop" }   // auto: "takeoff", "land"
"walk": { "motion": "walk" }  // auto: "footstep" {leg: "legNear"} at each touchdown
"honk": { "motion": "pose", "events": [ {"frame": 3, "name": "honk", "data": {"volume": 0.8}} ] }
```

- **Bundle:** `animations.walk.events = [{frame: 2, name: "footstep", data: {leg: "legNear"}}, ...]`.
- **Runtime:** `spriteevent` (bubbles, `detail: {anim, frame, name, data}`) when the frame is *entered*.
  Spine queues events and dispatches them at the end of `apply()` ([AnimationState.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/AnimationState.ts)).
  The runtime should likewise fire every event of every frame skipped in a catch-up tick (it already caps
  the step at 100 ms).
- **Markers.** A named sub-range, `markers: {"windup": [0, 3]}` (Godot 4.4, Lottie `dr`), lets
  `play('attack', {from: 'windup'})` work, and is the hook for R3's `segment`.

### R2. Attachment points / sockets baked per frame (High, S–M)

**Precedent**

| Tool | Mechanism |
|---|---|
| Spine | `PointAttachment`: "a single point with a rotation", cheaper than a bone, for spawning projectiles or particles; `computeWorldPosition` / `computeWorldRotation` ([PointAttachment.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/attachments/PointAttachment.ts)); also `findBone` → `worldX/worldY`, `localToWorld` ([Bone.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/Bone.ts)) |
| Rive | Bone and node positions only through the low-level API (`artboard.bone(name).worldTransform()`); the high-level `Rive` class has none ([low-level API](https://rive.app/docs/runtimes/web/low-level-api-usage.md)) |
| Aseprite | Slices are keyed per frame with `bounds` and `pivot` ([slice API](https://github.com/aseprite/api/blob/main/api/slice.md)) |
| PixiJS | Per-frame `anchor` in `SpritesheetData` ([Spritesheet.ts](https://github.com/pixijs/pixijs/blob/dev/src/spritesheet/Spritesheet.ts)) |

**Why it fits.** `pixel where` already computes world positions of pivots per frame. Moving that into the
bundle as `points` gives pages "where is the beak *now*", which is useful for:

- speech bubbles,
- a cursor the goose pecks at,
- particles out of a muzzle,
- a held item rendered as a separate `<pixel-sprite>`,
- aligning a sprite on a ledge by its feet.

**Sketch**

```json
"points": {
  "beak":  {"part": "head", "at": [86, 24]},          // in rest-pose canvas units, carried by the part
  "handR": {"part": "handNear", "at": [40, 70], "rot": true},
  "feet":  {"at": "ground"}                             // built-in: centre of planted feet
}
```

- **Bundle:** `points: {beak: {walk: [[x, y, rotDeg], ...per frame], ...}}`. Store values in *spec units*
  (resolution-independent, one table for every variant) and let the runtime convert them, as it already
  does for `speed`. Six numbers per frame is a few hundred bytes for a typical bundle.
- **Runtime:** `el.point('beak')` returns `{x, y, rot}` in client coordinates for the current frame, with
  `flip` and integer scaling applied. `spriteframe` (opt-in, not bubbling) lets pages track a point every
  frame.
- **Pixel-snap honesty.** Return the position of the *snapped* part (what is drawn), not the continuous one,
  so a page overlay lines up with the pixels.

### R3. Declarative state machine in the bundle (High, M)

**Precedent**

- **dotLottie** (v2 spec) is the closest in shape to Pixel Studio: a JSON state machine file inside the
  container ([dotLottie 2.0 spec](https://dotlottie.io/spec/2.0/)). It has:
  - states with `animation`, `loop`, `segment` (a marker), `mode`, `entryActions`, `exitActions`;
  - transitions with `guards` on Numeric, String, Boolean or Event inputs;
  - interactions `PointerDown/Up/Enter/Exit/Move/Click` (optional `layerName` hit-test) and
    `OnComplete`/`OnLoopComplete`;
  - actions such as `SetNumeric`, `Toggle`, `Fire`, `SetTheme` and `OpenUrl`.

  Shipped in dotlottie-web 0.25.0 (2024-06-20, [releases](https://github.com/LottieFiles/dotlottie-web/releases)).
  Its runtime API is `stateMachineLoad`, `stateMachineStart`, `stateMachineFireEvent`, `stateMachineSet*Input`
  and `stateMachinePostPointer*Event`, with events such as `stateMachineTransition`.
- **Rive** state machines ([states](https://rive.app/docs/editor/state-machine/states.md),
  [transitions](https://rive.app/docs/editor/state-machine/transitions.md),
  [listeners](https://rive.app/docs/editor/state-machine/listeners.md)) have:
  - layers;
  - transitions with exit time, duration, conditions and **Randomize Exit** with weights;
  - listeners for pointer, keyboard and focus.

  Rive has since deprecated Inputs in favour of data binding ([inputs](https://rive.app/docs/editor/state-machine/inputs)).
- **Godot** transitions use `switch_mode` IMMEDIATE / SYNC / AT_END and `advance_condition` or
  `advance_expression` ([transition ref](https://docs.godotengine.org/en/stable/classes/class_animationnodestatemachinetransition.html)).
  `travel()` path-finds through the graph ([playback](https://docs.godotengine.org/en/stable/classes/class_animationnodestatemachineplayback.html)).
- **Unity** transitions have Has Exit Time, conditions on Float/Int/Bool/Trigger and auto-resetting
  triggers ([transitions](https://docs.unity.com/en-us/engine/current/manual/animation-section/animation-mecanim/animation-animator-controller/animation-state-machines/class-transition),
  [parameters](https://docs.unity3d.com/Manual/AnimationParameters.html)).
- **Godot's discrete blend space** picks the nearest point's animation and is documented as suited to
  frame-by-frame 2D. This is how a baked runtime does "blend spaces", for example 4- or 8-direction walk
  chosen by a vector ([BlendSpace2D](https://docs.godotengine.org/en/stable/classes/class_animationnodeblendspace2d.html)).

**Why it fits.** `hover-anim` and `click-anim` are already a two-state machine. Agents write JSON graphs
well. A page then sets *intent* (`speed`, `mood`, `fire('honk')`) and the character sorts out the
choreography: wind-up, the at-end switch, returning to idle, random idle fidgets. All of that is frame
selection, so the runtime stays small, likely ~1 KB more, though that is unmeasured.

**Sketch** (spec → copied into the bundle unchanged)

```json
"states": {
  "inputs": {"speed": 0, "honk": "trigger", "hovered": false},
  "initial": "idle",
  "nodes": {
    "idle":  {"anim": "idle", "random": [{"anim": "preen", "weight": 1, "every": [4, 9]}]},
    "walk":  {"anim": "walk", "rate": "speed"},
    "run":   {"anim": "run"},
    "honk":  {"anim": "honk", "then": "previous"}
  },
  "transitions": [
    {"from": "idle", "to": "walk", "when": "speed > 0"},
    {"from": "walk", "to": "run",  "when": "speed > 60", "at": "sync"},
    {"from": "*",    "to": "honk", "when": "honk", "at": "now"},
    {"from": "walk", "to": "idle", "when": "speed == 0", "at": "footstep"}
  ],
  "interactions": [{"on": "click", "fire": "honk"}, {"on": "enter", "set": {"hovered": true}}]
}
```

- **`at`** takes `now`, `end` (Godot AT_END / Unity exit time 1), `sync` (Godot SYNC: keep normalized phase,
  so walk → run does not restart the stride), or **an event name from R1** (switch on the next `footstep`).
  The last option means a walk only stops with the feet together. No surveyed tool offers this directly;
  it is the payoff of combining R1 with R3.
- **Conditions** are a tiny comparison grammar (`input op literal`), not an expression language. That
  matches dotLottie's guard model.
- **Runtime API:** `el.set('speed', 40)`, `el.fire('honk')`, `el.state`, and a `statechange` event
  (`detail: {from, to}`). The `hover-anim` / `click-anim` attributes compile to a default machine.
- `speed`-driven walk rate: `rate` scales fps so feet do not slide at a varying ground speed. This extends
  the existing `speed` contract in [figures.md](../../packages/pixel-studio/docs/figures.md#speed).

### R4. Baked transitions and sync switching (High, M)

**Precedent.** Every skeletal runtime crossfades poses at runtime:

- Spine: `AnimationStateData.setMix(from, to, d)` and `setDefaultMix`; `TrackEntry.holdPrevious`; 4.3
  improves dip-free crossfades ([applying animations](https://esotericsoftware.com/spine-applying-animations),
  [4.3 release](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
- Godot: `xfade_time`.
- Unity: Transition Duration / Offset.
- Phaser does it for flipbooks *without* blending: `anims.addMix(a, b, delayMs)` only delays the switch
  (3.50, [AnimationManager.js](https://github.com/phaserjs/phaser/blob/master/src/animations/AnimationManager.js)).

**Why bake.** Pose interpolation is trivial for rigid parts (lerp `rot`, `x`, `y`, `sx`, `sy`, with IK
re-solved so feet stay planted). Doing it on *pixels* means alpha ghosting. So the engine renders
**transition clips**: sample the end pose of A (or the pose at the sync phase) and the start pose of B,
interpolate for `frames` frames with an ease, re-run follow-through over the joined motion (so tails
overshoot on the stop), and rasterize with the shader.

```json
"transitions": {
  "idle>walk": {"frames": 2},
  "walk>idle": {"frames": 3, "ease": "smooth"},
  "*>honk":    {"frames": 1}
}
```

- **Bundle:** extra sheet rows named `idle>walk`, plus `animations["walk"].from = {"idle": "idle>walk"}`.
- **Runtime:** when R3 (or `play`) switches A → B and a clip exists, it plays the clip first. Cost is a few
  extra frames per pair, so make it opt-in per pair, never all pairs.

### R5. Interop export: Aseprite-style JSON (High reach, S)

**Precedent.** The Aseprite sheet JSON is the de-facto exchange format:

- `frames[].duration` in ms,
- `meta.frameTags[{name, from, to, direction, repeat}]` (`repeat` is written as a string, only when > 0),
- `meta.slices[{name, keys:[{frame, bounds, center, pivot}]}]`.

All verified in [doc_exporter.cpp](https://github.com/aseprite/aseprite/blob/main/src/app/doc_exporter.cpp)
and the [CLI docs](https://www.aseprite.org/docs/cli/).

Importers differ in how much they read:

| Consumer | What it uses |
|---|---|
| Phaser | `load.aseprite` + `anims.createFromAseprite` (3.50) consume it directly but ignore `repeat` and `pingpong_reverse` ([AnimationManager.js](https://github.com/phaserjs/phaser/blob/master/src/animations/AnimationManager.js)) |
| PixiJS | `Spritesheet` builds animations only from an `animations` name → frame-names map; it does not read `frameTags` or `duration` ([Spritesheet.ts](https://github.com/pixijs/pixijs/blob/dev/src/spritesheet/Spritesheet.ts)) |
| Unity | `com.unity.2d.aseprite` imports `.aseprite` files, not the JSON ([manual](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@7.0/manual/index.html)) |

**Sketch.** `pixel export fox.json --format aseprite --res 32` writes a PNG and JSON with:

- `frames` (hash), with `duration` from fps and holds (R7),
- `meta.frameTags` (one per animation),
- `meta.slices` (R2 points as 1×1 slices with `pivot`, R9 hit areas as bounds),
- a Pixi `animations` map.

Events (R1) can go into tag/slice `data` or `properties`. Aseprite's `properties` maps date from v1.3-rc1
([properties](https://github.com/aseprite/api/blob/main/api/properties.md)).

### R6. Skins / attachment swapping (Medium–High, M)

**Precedent**

| Tool | Mechanism |
|---|---|
| Spine | Skins hold attachments per slot plus skin-only bones and constraints; *skin placeholders* let one animation serve every skin; runtime combines skins with `new Skin()`, `addSkin(...)` and `setSkin` ([skins](https://esotericsoftware.com/spine-skins), [runtime skins](https://esotericsoftware.com/spine-runtime-skins)) |
| Unity | Sprite Library Category/Label, Sprite Resolver `SetCategoryAndLabel`; a library *variant* inherits from a Main Library and overrides labels ([resolver](https://docs.unity3d.com/Packages/com.unity.2d.animation@17.0/manual/SL-Resolver.html), [main library](https://docs.unity3d.com/Packages/com.unity.2d.animation@17.0/manual/SL-Main-Library.html)) |
| Rive | Solos (one child visible, keyable) ([solos](https://rive.app/docs/editor/manipulating-shapes/solos.md)) |
| Toon Boom | Drawing substitution ([Harmony 22](https://docs.toonboom.com/help/harmony-22/essentials/cut-out-animation/about-swap-drawing.html)) |
| Moho | Switch layers ([manual](https://www.lostmarble.com/moho/manual/switch_layers.html)) |
| DragonBones | `factory.replaceSkin`, `slot.replaceDisplay` ([DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)) |
| Lottie / dotLottie | Theming through slots: properties with `sid` plus theme `rules` ([lottie-spec](https://github.com/lottie/lottie-spec/tree/main/schema), [dotLottie 2.0](https://dotlottie.io/spec/2.0/)) |

**What Pixel Studio has.** `extends` already gives Unity-style library inheritance at the *character*
level. `show` tracks give in-animation swaps (mouth shapes).

**What is missing:**

1. Named *sets* of swaps that an agent can toggle without a new file.
2. One bundle carrying several looks, picked by the page.

**Sketch**

```json
"skins": {
  "default": {},
  "winter":  {"parts": [{"id": "scarf", "parent": "neck", "shapes": [ ... ]}], "materials": {"feather": "#dfe6ee"}},
  "party":   {"parts": [{"id": "hat", "bone": "head", "shapes": [ ... ]}]}
}
```

- A skin is an `extends`-style patch (same merge rules), so there is no new concept for agents.
- **Bake:** one sheet set per skin (`variants[].skin`). **Runtime:** a `skin` attribute picks the variant
  set. Cost is linear in the number of skins; that is fine for a handful.
- **Do not** composite skin layers at runtime. Outlines, selective outlines, inner lines and contact
  shadows depend on what overlaps, so layering pre-shaded bitmaps would break the shader's look.
- **Palette themes** (a material-colour remap) are the cheap special case. They could later be done at
  runtime by baking an indexed sheet, but that is a separate design question (DESIGN.md §6 already asks
  about palettes).

### R7. Per-frame durations / holds, direction, repeat (Medium, S)

**Precedent**

- **Aseprite:** per-frame `duration` (ms); tag `aniDir` FORWARD / REVERSE / PING_PONG / PING_PONG_REVERSE;
  tag `repeats` (both new in v1.3-rc1) ([tag API](https://github.com/aseprite/api/blob/main/api/tag.md),
  [Changes.md](https://github.com/aseprite/api/blob/main/Changes.md)).
- **Godot** `SpriteFrames` frames carry a relative duration
  ([SpriteFrames](https://docs.godotengine.org/en/stable/classes/class_spriteframes.html)).
- **Phaser** frames carry `duration`, plus `yoyo`, `repeat` and `repeatDelay`
  ([Animation typedef](https://github.com/phaserjs/phaser/blob/master/src/animations/typedefs/Animation.js)).
- **Pixi** `AnimatedSprite` accepts `{texture, time}` frame objects
  ([AnimatedSprite.ts](https://github.com/pixijs/pixijs/blob/dev/src/scene/sprite-animated/AnimatedSprite.ts)).

**Why.** Holds on key poses (the contact frame of a punch, the top of a hop) are basic pixel-art timing.
Today agents have to fake them by duplicating keyframes inside a fixed fps. Ping-pong halves the sheet
rows for symmetric loops such as breathing.

**Sketch**

- Spec: `"holds": {"3": 2, "7": 3}` (frame index → multiples of the base frame time), `"direction": "pingpong"`,
  `"repeat": 3`.
- Bundle: `durations` (ms array, omitted when uniform), `direction` and `repeat`.
- Runtime: a few lines.
- **Engine detail:** follow-through simulation must use the real frame times, so tails do not jump across
  a hold.

### R8. Extension points (Medium; High for contributors, S–M)

**Precedent**

| Tool | Extension mechanism |
|---|---|
| Godot | Custom IK/physics modifiers by overriding `SkeletonModification2D._execute` (experimental, [ref](https://docs.godotengine.org/en/stable/classes/class_skeletonmodification2d.html)); custom blend-tree nodes through `AnimationNodeExtension` (new in 4.4, experimental, [ref](https://docs.godotengine.org/en/stable/classes/class_animationnodeextension.html)); `EditorImportPlugin` ([import plugins](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/import_plugins.html)) |
| Unity | Custom IK solver by subclassing `Solver2D`, which then shows up in IKManager2D ([2D IK](https://docs.unity3d.com/Packages/com.unity.2d.animation@14.0/manual/2DIK.html)) |
| Spine | `AttachmentLoader` (custom attachment construction, [source](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/attachments/AttachmentLoader.ts)); no scripting system was found in the runtimes |
| Rive | Luau scripting with protocols Node, Layout, Converter, Path Effect, Transition Conditions, Listener Actions and others ([protocols](https://rive.app/docs/scripting/protocols/overview.md), [why Luau, 2025-11-20](https://rive.app/blog/why-scripting-runs-on-luau)) |
| Aseprite | Lua plugins (`plugin:newCommand`, `newFileFormat`, v1.2.18+), events, and a WebSocket client ([plugin](https://github.com/aseprite/api/blob/main/api/plugin.md), [websocket](https://github.com/aseprite/api/blob/main/api/websocket.md)) |

**State in Pixel Studio.** Shapes (`compileShape` in `src/core/shapes.js`), textures (`sampleTexture` in
`src/core/textures.js`) and motion models (`generateMotion` in `src/core/motion.js`) are closed `switch`
statements.

**Sketch.** Build-time JS registries, used by the CLI, the studio and Node. Bundles stay data only.

```js
import { registerMotion, registerShape, registerTexture, registerConstraint } from 'pixel-studio';
registerShape('star', { compile: (s) => ({ sdf, bbox, R }), schema: {cx: 'number', cy: 'number', r: 'number', points: 'int'} });
registerTexture('feathers', (x, y, scale) => value01);
registerMotion('swim', { params: {...}, generate(parts, rig, m) { return { tracks, speed, events } } });
registerConstraint('lookAt', { solve(world, pose, c, t) { ... } });  // Godot LookAt / Unity Solver2D analogue
```

- Each registration carries a **schema**, so `validate` keeps its JSON paths and did-you-mean messages, and
  `pixel brief` can document plug-ins for agents automatically.
- Load plug-ins with `pixel.config.mjs` or `--plugin ./swim.mjs`.
- Keep **figures** as the agent-facing, data-only extension: an agent can already ship an inline figure. A
  plug-in is for humans adding a new capability.

### R9. Hit areas (Medium, S given R2)

**Precedent**

- Spine `BoundingBoxAttachment` + `SkeletonBounds.containsPoint` ([SkeletonBounds.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/SkeletonBounds.ts)).
- Live2D `HitAreas[{Name, Id}]` in model3.json ([spec](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).
- DragonBones `armature.containsPoint` ([DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)).
- dotLottie pointer interactions with `layerName` ([dotLottie 2.0](https://dotlottie.io/spec/2.0/)).

**Sketch**

- Spec: `"hitAreas": {"head": ["head", "jaw"], "belly": ["body"]}`.
- Bake: per-frame pixel bboxes per area, at each resolution. They are cheap and exact because the
  rasterizer knows which part owns each pixel.
- Runtime: `click` and `pointerdown` detail gets `{area}`, and R3 interactions accept `"area": "head"`.
- A per-pixel alternative is to test the sheet's alpha at the pointer. Transparent-pixel click-through is
  itself a nice default, but it needs `getImageData` on a same-origin image.

### R10. Richer physics on `follow` (Medium, S–M)

**Precedent**

- **Spine 4.2 physics constraints** (4.2.00, 2024-04-16, [changelog](https://esotericsoftware.com/spine-changelog))
  act on `x, y, rotate, scaleX, shearX` with `inertia, strength, damping, mass, wind, gravity, limit, fps`,
  and resets can be keyed ([physics constraints](https://esotericsoftware.com/spine-physics-constraints)).
  4.3 adds volume-preserving scale and skeleton-level wind and gravity
  ([4.3 release](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
- **Godot Jiggle** has stiffness / mass / damping / gravity per joint, with colliders
  ([ref](https://docs.godotengine.org/en/stable/classes/class_skeletonmodification2djiggle.html)).
- **Live2D physics** uses pendulum chains mapping input parameters to output parameters, with global gravity
  and wind ([physics3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/physics3.json.md)).
- **Cascadeur AutoPhysics** corrects keyed motion toward physically plausible motion
  ([AutoPhysics](https://cascadeur.com/help/tools/physics_tools/autophysics)).

**Gap.** `follow` covers rotational lag from pivot acceleration and parent turn. It lacks:

- **gravity**: a droopy ear that hangs down when the head tilts;
- **translation springs**: belly or cheek jiggle on landing, which pairs with hop squash;
- **wind** for idle flags and scarves;
- **chain coupling**: tail2 driven by tail's simulated angle, which is currently per-part.

**Sketch.** `"follow": {"freq": 3, "damping": 0.3, "gravity": 0.4, "wind": {"amount": 0.2, "freq": 0.5}, "move": 0.5}`.

- `move` adds an x/y spring.
- Ordering children after parents in the simulation gives chain coupling.
- Everything stays baked and deterministic. Looping still works through the existing "simulate four cycles,
  record the last" approach.

### R11. Runtime queue / priority (Medium, S)

**Precedent**

- Spine `addAnimation(track, name, loop, delay)`.
- Phaser `chain()`, `playAfterDelay`, `playAfterRepeat`, `stopOnFrame`
  ([AnimationState.js](https://github.com/phaserjs/phaser/blob/master/src/animations/AnimationState.js)).
- Live2D `startMotionPriority` with sample priorities Idle=1 < Normal=2 < Force=3 and a reserve slot
  ([cubismmotionmanager.ts](https://github.com/Live2D/CubismWebFramework/blob/develop/src/motion/cubismmotionmanager.ts),
  [lappdefine.ts](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/TypeScript/Demo/src/lappdefine.ts)).

**Sketch.** `el.play('honk', {once: true, priority: 2})` is ignored while a higher-priority one-shot is
running. `el.queue('wave')` plays after the current one ends. Most of this disappears into R3, so build it
only if R3 slips.

### R12. Pose parameters (Low–Medium, M)

**Precedent**

- **Live2D** animates abstract parameters, and the parameters drive the deformers
  ([deformer tutorial](https://docs.live2d.com/en/cubism-editor-tutorials/deformer/); seen only via search
  excerpts, not verified in full). Expressions blend `Add` / `Multiply` / `Overwrite`
  ([exp3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/exp3.json.md)).
- **Spine 4.3 Slider** constraint (4.3.15-beta, 2025-04-27) applies a frame of an animation chosen by a value
  or by a control bone ([4.3 release](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
- **Rive Joysticks** scrub timelines by X/Y ([joysticks](https://rive.app/docs/editor/manipulating-shapes/joysticks.md)).

**Fit.** Named "expressions" (`happy`, `angry`) as reusable track patches, layered on any animation, are
cheap for agents and reduce duplication. Continuous runtime parameters are not possible with baked frames.
Each value would have to become a baked discrete variant (as Godot discrete blend spaces do), so keep this
bake-time only.

---

## 3. Per-tool notes

### Spine (Esoteric Software)

Versions: 4.2.00 shipped 2024-04-16 and 4.3.00 stable 2026-05-14
([changelog](https://esotericsoftware.com/spine-changelog)).

- **Rig**
  - Bones (`length, x, y, rotation, scale, shear, inherit`) with inherit modes
    `normal / onlyTranslation / noRotationOrReflection / noScale / noScaleOrReflection`.
  - Slots (`bone, color, dark, attachment, blend`).
  - Attachments: `region, mesh, linkedmesh, boundingbox, path, point, clipping`, plus `sequence` for
    flipbooks on a region or mesh ([SkeletonJson.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/SkeletonJson.ts)).
  - Skins can own bones and constraints ([skins](https://esotericsoftware.com/spine-skins)).
- **Constraints**
  - IK (`softness, compress, stretch, bendPositive`), transform, path.
  - **Physics** (4.2): `inertia, strength, damping, mass, wind, gravity, limit, fps`.
  - **Slider** (4.3).
  - 4.3 transform constraints can map any property to any other, with clamping
    ([4.3](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
- **Animation**
  - Timelines for every bone, slot, constraint and physics property, plus Event and DrawOrder.
  - Curves are linear, `stepped` or 4-value bezier ([Animation.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/Animation.ts)).
- **Mixing**
  - `AnimationState` tracks (higher tracks layer over lower).
  - `setAnimation`, `addAnimation(track, name, loop, delay)`, `setEmptyAnimation` / `addEmptyAnimation`
    to mix from or to the setup pose.
  - Per-pair mix durations and `TrackEntry.alpha`.
  - `MixBlend.add` for additive layering.
  - Listeners `start / interrupt / end / dispose / complete / event`
    ([applying animations](https://esotericsoftware.com/spine-applying-animations)).
- **Runtime access**
  - `findBone`, `findSlot`, `setSkin`, `setAttachment`, `getBounds`.
  - `Bone.worldX/worldY/localToWorld`.
  - `SkeletonBounds.containsPoint`.
  - `physicsTranslate` / `physicsRotate` so physics reacts to the skeleton moving in the world
    ([Skeleton.ts](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/spine-ts/spine-core/src/Skeleton.ts)).
- **Formats**
  - JSON or binary `.skel` plus a text `.atlas` ([export](https://esotericsoftware.com/spine-export)).
  - The current [JSON format page](https://esotericsoftware.com/spine-json-format) still shows 3.8 key names
    and is out of date; read `SkeletonJson.ts` instead.
- **Pixel art**
  - Image export with smoothing 0 means nearest neighbour ("useful for pixel art").
  - The texture packer has nearest filtering ([texture packer](https://esotericsoftware.com/spine-texture-packer)).
  - 4.2 added a "Pixels" mode that snaps region attachments to screen pixels, and a Highlight Pixels hotkey
    (4.2 blog, [physics revolution](https://esotericsoftware.com/blog/Spine-4.2-The-physics-revolution)).
  - Snapping meshes is a known limitation, but that comes from a forum thread, not docs
    ([forum](https://esotericsoftware.com/forum/d/13922)).
- **Extension points**
  - `AttachmentLoader`.
  - No scripting.
  - **Directly comparable:** 4.3 ships `spine-webcomponents`, a `<spine-skeleton atlas skeleton animation skin>`
    element designed for "dozens of skeletons per page" ([4.3](https://en.esotericsoftware.com/blog/Spine-4.3-released)).
    It is the skeletal counterpart to `<pixel-sprite>`.
- **Takeaways for Pixel Studio:** events (R1), point attachments (R2), skins with placeholders (R6), physics
  parameter set (R10). Its mixing model is the reference for R4, but done at bake time.

### Rive

- **Rig**
  - Bones (root has X/Y; children have length and rotation) bound rigidly, to path vertices, or to weighted
    mesh vertices ([bones](https://rive.app/docs/editor/manipulating-shapes/bones.md),
    [meshes](https://rive.app/docs/editor/manipulating-shapes/meshes.md)).
  - Constraints: IK (strength animatable for FK/IK blending), Distance, Transform, Translation, Scale,
    Rotation, Follow Path ([constraints](https://rive.app/docs/editor/constraints/constraints-overview.md)).
  - Joysticks, Solos, and Components (nested artboards that can be swapped through data binding)
    ([components](https://rive.app/docs/editor/fundamentals/components.md)).
- **State machine**
  - Layers run in parallel.
  - States: single animation, 1D blend, additive blend.
  - Transitions: duration, exit time, conditions, randomized weighted exits, actions.
  - Listeners for pointer, keyboard, gamepad and focus events (links in R3).
- **Events:** Open URL, Audio and General (General is deprecated). The docs call runtime communication
  through events "legacy" ([events](https://rive.app/docs/editor/events/overview.md),
  [general events](https://rive.app/docs/editor/events/general-events.md)).
- **Data binding / View Models**
  - 12 property types: number, string, boolean, color, trigger, enum, image, font, blob, artboard, nested
    view model, list ([property types](https://rive.app/docs/editor/data-binding/property-types.md)).
  - Core objects arrived in rive-wasm 2.23.0 (2024-10-31) ([CHANGELOG](https://github.com/rive-app/rive-wasm/blob/master/CHANGELOG.md)).
  - No single launch announcement was found.
  - Inputs, `onStateChange` and runtime events are deprecated in the web runtime (v2.41.0, 2026-08-26)
    ([state machines (web)](https://rive.app/docs/runtimes/web/state-machines.md)).
- **Web API**
  - `new Rive({src, canvas, stateMachine, layout, autoplay, autoBind, ...})`, then `play`, `pause`, `stop`,
    `reset` ([parameters](https://rive.app/docs/runtimes/web/rive-parameters.md)).
  - View model instances are read with `.number(name).value` and `.trigger()`
    ([data binding (web)](https://rive.app/docs/runtimes/web/data-binding.md)).
- **Scripting:** Luau. "Scripting begins!" appears in 2.25.2 (2024-12-17) and "scripting in editor" in
  2.30.2 (2025-07-14) ([CHANGELOG](https://github.com/rive-app/rive-wasm/blob/master/CHANGELOG.md)).
- **Size**
  - Not documented by Rive.
  - A sub-agent measured `@rive-app/canvas@2.49.4` from the npm package: rive.wasm ≈ 931 KB gzipped, and
    `canvas-lite` ≈ 349 KB. These are unofficial measurements.
- **Pixel art**
  - Image filter `nearest` exists in the scripting API ([ImageFilter](https://rive.app/docs/scripting/api-reference/image/image-filter.md)).
  - Asset sampler options appear in 2.40.0 (2026-08-14).
  - No editor docs page was found that confirms nearest sampling. A community request reports fuzzy pixel
    art ([forum](https://rive.app/community/forums/feature-requests/fsyCzA4A9Yar/preserve-pixel-art-fidelity-in-artboards/ftfaODJY1O9p)).
- **Takeaways for Pixel Studio:** randomized weighted exits for idle fidgets (R3), listener-to-interaction
  mapping (R3). The **trend away from inputs toward typed view models** is a reason to keep R3's input
  surface typed and small.

### Lottie / dotLottie

- **Governance**
  - The Lottie Animation Community became a Linux Foundation project on 2024-01-30
    ([announcement](https://www.linuxfoundation.org/press/announcing-lottie-animation-community)).
  - Spec 1.0 was announced 2024-09-17 ([v1.0](https://linuxfoundation.org/press/lottie-animation-community-announces-lottie-v1.0-specification));
    1.0.1 followed on 2025-06-26 ([releases](https://github.com/lottie/lottie-spec/releases)).
- **Format**
  - Layers: precomp, solid, image, null, shape, with `ind`/`parent` parenting.
  - Shapes and modifiers (trim, round corners, pucker-bloat, dash).
  - `markers {cm, tm, dr}`.
  - `slots` for theming.
  - Expressions are **not** in the spec ([schema](https://github.com/lottie/lottie-spec/tree/main/schema)).
- **lottie-web**
  - `loadAnimation`, `playSegments`, `goToAndPlay(markerName)` (a marker with a duration plays its segment),
    `setDirection`, `setSpeed`.
  - Events `complete`, `loopComplete`, `enterFrame`, `segmentStart`, `DOMLoaded`
    ([README](https://github.com/airbnb/lottie-web),
    [AnimationItem.js](https://github.com/airbnb/lottie-web/blob/master/player/js/animation/AnimationItem.js)).
- **dotLottie 2.0** ([spec](https://dotlottie.io/spec/2.0/); no publication date given)
  - A ZIP container with `manifest.json`, `a/` animations, `t/` themes, `s/` state machines, `i/` images.
  - The state machine JSON is summarized in R3.
  - Runtime support: dotlottie-rs added interactivity in v0.1.23 (2024-06-19) and cross-platform state
    machines in v0.1.40 (2025-04-16) ([releases](https://github.com/LottieFiles/dotlottie-rs/releases)).
  - The dotlottie-web player wasm measured ≈ 491 KB gzipped (unofficial, measured from npm 0.82.1).
- **Pixel art:** no primary-source mention of nearest-neighbour rendering was found. Vector Lottie is a poor
  fit for pixel art.
- **Takeaways for Pixel Studio:** the **state machine JSON is the template for R3**. Markers with durations
  are the template for R1's markers. Slots and themes inform R6's palette themes. DESIGN.md §6's
  "Lottie-like JSON export" idea is not recommended: Lottie is vector, so the pixel-art shader would be lost.

### DragonBones

- **Status**
  - The DragonBonesJS runtime reports `VERSION = "5.7.000"` and reads data formats up to 5.6.
  - `master` was idle from 2020 until a 2025-05-24 "add pixi 8 runtime" commit.
  - The README now recommends a successor, LoongBones ([repo](https://github.com/DragonBones/DragonBonesJS)).
  - The status of the original DragonBones Pro editor could not be verified.
- **Rig:** armature → bones → slots → displays (`Image, Armature` (nested), `Mesh, BoundingBox, Path`),
  with IK and path constraints.
- **Animation:** layered, grouped fading with `fadeIn(name, time, playTimes, layer, group, fadeOutMode)`,
  additive states, and bone masks.
- **Events:** `start, loopComplete, complete, fadeIn(Complete), fadeOut(Complete), frameEvent, soundEvent`.
- **Runtime API:** `getBone`, `getSlot`, `containsPoint`, `replaceDisplay`, `replaceSkin`.
- **Format:** `*_ske.json` + `*_tex.json`; the 5.0 format spec is in Chinese
  ([5.0 format](https://github.com/DragonBones/DragonBonesJS/blob/master/docs/DragonBones_5.0_data_format_zh.md)).
- **Takeaway for Pixel Studio:** confirms the Spine-like feature set (events, skins, hit tests). Nothing
  unique beyond layer/group fade arbitration.

### Live2D Cubism

- **Model**
  - ArtMeshes inside warp and rotation deformers, driven by **parameters** (for example `ParamArm` with a
    range of −30 to 30); animations key parameters, not bones
    ([deformers](https://docs.live2d.com/en/cubism-editor-tutorials/deformer/); seen only via search excerpts).
  - model3.json holds `Groups` (EyeBlink, LipSync), `HitAreas`, `Motions` by group with fade times, and
    `Expressions` ([model3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).
- **Motion**
  - motion3.json curves with segment types linear / bezier / stepped / inverse-stepped.
  - `UserData` events ([motion3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/motion3.json.md)).
- **Expressions:** `Add` / `Multiply` / `Overwrite` ([exp3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/exp3.json.md)).
- **Physics:** pendulum chains with gravity and wind ([physics3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/physics3.json.md)).
- **Pose groups:** mutually exclusive parts ([pose3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/pose3.json.md)).
- **SDK**
  - Motion priorities through `startMotionPriority`.
  - Procedural `CubismEyeBlink` and `CubismBreath`.
  - Lip sync, and `hitTest(areaName, x, y)` in the sample app
    ([lappmodel.ts](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/TypeScript/Demo/src/lappmodel.ts)).
- **Takeaways for Pixel Studio**
  - Priorities (R11), hit areas (R9), and expressions as additive patches (R12).
  - *Procedural always-on behaviours* (blink, breath) are a pattern Pixel Studio partly has (`idle`). A baked
    "random blink" needs R3's random fidget states, because a baked loop blinks on a fixed beat.
  - Deformer meshes do not fit (§4).

### Aseprite

Versions: v1.3 stable 2023-11-27; latest v1.3.18.6 (2026-09-22), per GitHub releases.

- **Tags**
  - Direction forward / reverse / ping-pong / ping-pong-reverse and `repeats`; ping-pong-reverse and repeat
    are new in v1.3-rc1.
  - `data` and `properties` ([tag](https://github.com/aseprite/api/blob/main/api/tag.md)).
- **Frames and cels**
  - Per-frame durations.
  - Linked cels ([linked cels](https://www.aseprite.org/docs/linked-cels/)).
- **Slices**
  - Keyed per frame with `bounds`, 9-slice `center` and `pivot`
    ([slices](https://www.aseprite.org/docs/slices/)).
- **User data:** colour, text, and since v1.3-rc1 typed `properties` maps namespaced per extension
  ([properties](https://github.com/aseprite/api/blob/main/api/properties.md)).
- **Tilemaps** (v1.3) ([tilemap](https://www.aseprite.org/docs/tilemap/)).
- **Export:** CLI `--sheet --data --format json-hash|json-array --list-tags --list-slices --list-layers
  --split-layers --split-tags --trim --extrude --merge-duplicates --filename-format`
  ([CLI](https://www.aseprite.org/docs/cli/)); JSON structure in R5.
- **Scripting**
  - Lua API: Sprite, Layer, Cel, Tag, Slice, Image, Dialog, Timer.
  - Events `sitechange`, `beforecommand`/`aftercommand`, and sprite `change`. There is no `afterchange`
    event ([app](https://github.com/aseprite/api/blob/main/api/app.md),
    [sprite](https://github.com/aseprite/api/blob/main/api/sprite.md)).
  - Plugins via `package.json` → `.aseprite-extension` (v1.2.18) ([plugin](https://github.com/aseprite/api/blob/main/api/plugin.md)).
  - WebSocket client (v1.2.30) ([websocket](https://github.com/aseprite/api/blob/main/api/websocket.md)).
- **Takeaways for Pixel Studio**
  - The export JSON (R5) and tag timing semantics (R7).
  - Slices as the exchange form for points and hit areas (R2, R9).
  - A future **touch-up layer** (DESIGN.md §6) could round-trip through Aseprite: export a baked frame as an
    `.aseprite` file, let a human fix pixels, and import the overrides. The Lua + WebSocket API makes a live
    bridge feasible. This is speculative and not evaluated here.

### Godot 4

The stable docs resolve to 4.7.

- **Rig**
  - `Skeleton2D`, `Bone2D` (rest, auto length).
  - `Polygon2D` weight-painted skinning ([2D skeletons](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html);
    the page warns it is not updated for 4.7).
  - `RemoteTransform2D` attaches a node to a bone ([ref](https://docs.godotengine.org/en/stable/classes/class_remotetransform2d.html)).
    It is Godot's attachment point.
- **Modifiers**
  - `SkeletonModificationStack2D` with CCDIK, FABRIK, TwoBoneIK, LookAt, Jiggle and PhysicalBones, all marked
    **experimental** ([stack](https://docs.godotengine.org/en/stable/classes/class_skeletonmodificationstack2d.html)).
  - 4.4's new procedural nodes (`LookAtModifier3D`, `SpringBoneSimulator3D`) are 3D only
    ([4.4](https://godotengine.org/releases/4.4/)).
- **Animation**
  - Value, method, bezier, audio and animation-playback tracks ([Animation](https://docs.godotengine.org/en/stable/classes/class_animation.html)).
  - `AnimationMixer` base class since 4.2 ([4.2 ref](https://docs.godotengine.org/en/4.2/classes/class_animationmixer.html)).
  - Markers and `play_section_with_markers` since 4.4 (released 2025-03-03).
- **AnimationTree**
  - State machine (switch modes, advance conditions and expressions, `travel()` with A*).
  - BlendSpace1D/2D with a **discrete** mode for frame-by-frame 2D.
  - OneShot (blend or add mix) (links in R3).
- **Flipbooks:** `AnimatedSprite2D` / `SpriteFrames` with relative per-frame durations, and the signals
  `animation_finished`, `animation_looped`, `frame_changed` ([AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html)).
- **Pixel art:** viewport stretch with integer scaling ([multiple resolutions](https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html)).
  Default texture filter and snap settings were not verified.
- **Extension points**
  - `@tool` scripts.
  - `EditorImportPlugin`.
  - `AnimationNodeExtension` (4.4, experimental).
  - A built-in Aseprite importer does not appear to exist; this was not verified from a primary source.
- **Takeaways for Pixel Studio**
  - Transition switch modes (R3 `at: now | end | sync`).
  - Discrete blend spaces (R3 directional selection).
  - Markers (R1).
  - Custom modifier and node hooks (R8).

### Unity 2D Animation / Sprite Library / 2D IK

- **Package:** 2D Animation 17.0.2 (2026-10-08). IK was merged into it in 5.0.0
  ([changelog](https://docs.unity3d.com/Packages/com.unity.2d.animation@17.0/changelog/CHANGELOG.html)).
- **Rig:** bones and Sprite Skin deformation, built from a PSD Importer prefab "actor"
  ([manual](https://docs.unity3d.com/Packages/com.unity.2d.animation@17.0/manual/index.html)).
- **Sprite Library / Resolver**
  - Category/Label swap; animating the resolver needs constant tangents because it is a hash
    ([sprite swap 8.0](https://docs.unity3d.com/Packages/com.unity.2d.animation@8.0/manual/SpriteSwapIntro.html)).
  - Library variants inherit from a Main Library (links in R6).
- **2D IK:** `IKManager2D` with Limb (two bones plus effector), CCD and FABRIK solvers; custom solvers by
  extending `Solver2D` ([2D IK](https://docs.unity3d.com/Packages/com.unity.2d.animation@14.0/manual/2DIK.html)).
- **Animator**
  - Parameters Float/Int/Bool/Trigger.
  - Transitions with exit time, duration, offset and interruption sources.
  - Layers (override/additive, avatar masks, sync).
  - Blend trees (1D, 2D simple / freeform directional, freeform cartesian, direct)
    ([2D blending](https://docs.unity.com/en-us/engine/current/manual/animation-section/animation-mecanim/animation-animator-controller/animation-state-machines/animation-blend-trees/blend-tree-2dblending)).
  - Sub-state machines.
  - `StateMachineBehaviour` callbacks ([ref](https://docs.unity.com/en-us/engine/current/script-reference/unityengine/statemachinebehaviour)).
  - API: `SetTrigger`, `SetFloat`, `Play`, `CrossFade` ([Animator](https://docs.unity.com/en-us/engine/current/script-reference/unityengine/animator)).
- **Aseprite Importer:** `com.unity.2d.aseprite` 1.0.0 shipped 2023-05-17; 7.0.1 (2026-10-08) is current. It
  generates a read-only Animator Controller and turns cel user data into events (links in R1/R5).
- **Takeaways for Pixel Studio:** the category/label skin model (R6), auto-resetting triggers (R3 `fire`),
  state enter/exit callbacks (R3 `statechange`), and solver subclassing (R8).

### Phaser

Phaser 4.0.0 was released 2026-04-10; the last 3.x was v3.90.0 (2025-05-23), per GitHub releases.

- **Animation config**
  - `anims.create({key, frames, frameRate, duration, delay, repeat, repeatDelay, yoyo, showOnStart, hideOnComplete, randomFrame})`.
  - Per-frame `duration` ([Animation typedef](https://github.com/phaserjs/phaser/blob/master/src/animations/typedefs/Animation.js)).
- **Mixes and Aseprite (3.50):** `addMix` (a delay, not a blend), `createFromAseprite`, and `load.aseprite`
  ([AsepriteFile.js](https://github.com/phaserjs/phaser/blob/master/src/loader/filetypes/AsepriteFile.js)).
- **Sprite `AnimationState`:** `chain`, `playAfterDelay`, `playAfterRepeat`, `stopOnFrame`, `playReverse`,
  `timeScale`.
- **Events:** `ANIMATION_START/UPDATE/REPEAT/RESTART/STOP/COMPLETE` and `animationcomplete-<key>`
  ([events](https://github.com/phaserjs/phaser/tree/master/src/animations/events)).
- **Pixel art:** `pixelArt: true` turns off antialiasing and turns on `roundPixels`
  ([RenderConfig.js](https://github.com/phaserjs/phaser/blob/master/src/core/typedefs/RenderConfig.js)).
- **Spine:** Esoteric also maintains Spine runtimes for Phaser. Not researched in detail here.
- **Takeaways for Pixel Studio:** R5 export compatibility, R11 queue and chain API, and per-key completion
  events (`spriteend` already carries `anim`).

### PixiJS v8

v8.0.0 shipped 2024-03-05; v8.22.0 (2026-10-01) is current, per GitHub releases.

- **Spritesheet**
  - `SpritesheetData` frames with `anchor` and 9-slice `borders`, plus an `animations` map
    ([Spritesheet.ts](https://github.com/pixijs/pixijs/blob/dev/src/spritesheet/Spritesheet.ts)).
  - It does not use Aseprite tags or durations.
- **`AnimatedSprite`**
  - `animationSpeed`, `loop`, `updateAnchor`.
  - `onComplete`, `onFrameChange`, `onLoop`.
  - `{texture, time}` per-frame timing ([AnimatedSprite.ts](https://github.com/pixijs/pixijs/blob/dev/src/scene/sprite-animated/AnimatedSprite.ts)).
- **Pixel art:** `TextureStyle.scaleMode = 'nearest'` ([TextureStyle.ts](https://github.com/pixijs/pixijs/blob/dev/src/rendering/renderers/shared/texture/TextureStyle.ts))
  and `roundPixels`.
- **Spine:** the official spine-pixi-v8 runtime was released 2024-11-07, merged with the community
  pixi-spine ([blog](https://esotericsoftware.com/blog/spine-pixi-v8-runtime-released),
  [spine-pixi](https://en.esotericsoftware.com/spine-pixi)).
- **Takeaways for Pixel Studio:** emit the Pixi `animations` map and per-frame `anchor` alongside the
  Aseprite JSON (R5). `updateAnchor` shows the value of per-frame pivots (R2).

### Optional: Cascadeur, Creature, Moho, Toon Boom, procedural references

- **Cascadeur**
  - AutoPhysics shows a physically corrected ghost of keyed motion, with ballistic and fulcrum intervals;
    "Snap to AutoPhysics" applies it ([AutoPhysics](https://cascadeur.com/help/tools/physics_tools/autophysics)).
  - AutoPosing drives a full pose from a few controllers ([AutoPosing](https://cascadeur.com/help/tools/animation_tools/autoposing)).
  - Relevance: a *lint* that checks agent-keyed `pose` motions for plausibility (centre of mass over the
    support feet) fits Pixel Studio's "warnings, not magic" style. This is an idea, not a ranked item.
- **Creature (Kestrel Moon)**
  - Bone and mesh "motors" generate walk cycles and flapping procedurally
    ([info](http://www.creature.kestrelmoon.com/more_info_1.html)).
  - The CreaturePack export keeps only deformed points, with no skeleton
    ([Phaser runtime](https://www.kestrelmoon.com/creaturedocs/Game_Engine_Runtimes_And_Integration/Phaser_Runtimes%20.html)).
  - Its current product status could not be established.
  - It is the closest precedent to Pixel Studio's motion models; CreaturePack is the closest precedent to
    "bake, don't ship the rig".
- **Moho:** switch layers ([manual](https://www.lostmarble.com/moho/manual/switch_layers.html)) and bone
  dynamics springs (torque / spring / damping, [tutorial](https://lostmarble.com/moho/manual/tut03/03/index.html)).
  Smart Bones could not be verified from a primary page.
- **Toon Boom Harmony:** drawing substitution, plus bone / curve / envelope / free-form deformers
  ([deformation](https://docs.toonboom.com/help/harmony-22/premium/getting-started/deformation.html)).
- **Procedural references**
  - David Rosen, "Animation Bootcamp: An Indie Approach to Procedural Animation", GDC 2014
    ([GDC Vault](https://gdcvault.com/play/1020049/Animation-Bootcamp-An-Indie-Approach)).
  - t3ssel8r, "Giving Personality to Procedural Animations using Math"
    ([YouTube](https://www.youtube.com/watch?v=KPoeNZZ6H4s)). Only the title is verified. The commonly cited
    content (a second-order f / ζ / r system) comes from secondary sources and is unverified.
  - If accurate, its `r` (initial response / anticipation) parameter would be a natural addition to `follow`
    (R10).

---

## 4. Deliberately not worth copying

| Feature | Seen in | Why not, for Pixel Studio |
|---|---|---|
| **Mesh deformation / weighted skinning** | Spine meshes, Rive meshes, Godot Polygon2D, Unity Sprite Skin, Live2D warp deformers, Toon Boom deformers | These tools deform *bitmaps*. Pixel Studio re-rasterizes *SDF geometry* every frame, so it can already bend smoothly by changing geometry; and at 16–64 px a weighted mesh's sub-pixel stretching produces exactly the jaggies and pixel swimming that pixel art avoids (Spine's own users report meshes can't be pixel-snapped, [forum, not docs](https://esotericsoftware.com/forum/d/13922)). The cheaper analogue that fits: **smooth-union between a part and its parent at the joint** (an SDF `smin` across the joint), hiding seams without vertex weights. Agents also cannot paint weights. |
| **Runtime skeletal evaluation / WASM runtimes** | Rive (≈931 KB gz wasm, unofficial measurement), dotLottie (≈491 KB gz, unofficial), Spine web components | Pixel Studio's look *is* the bake-time shader (hue-shifted ramps, selective outline, inner lines, dither). A runtime rig would need the whole shader at runtime and would break the ~2 KB promise. Spine 4.3's `<spine-skeleton>` serves that niche already. |
| **Runtime alpha crossfades / pose blending of frames** | Spine mix, Godot xfade, Unity CrossFade | Blending two pixel frames gives semi-transparent ghosts, which is anti-pixel-art. Use baked transitions (R4) and sync switching (R3) instead. |
| **Bezier handle editing per key** | Spine curves, Lottie, Live2D segments | Agents are poor at tuning handle pairs, and at 8–12 fps the curve shape is mostly invisible. Named eases (`smooth`, `linear`, `step`) plus holds (R7) cover pixel-art timing. A small set of named eases (`in`, `out`, `back`, `bounce`) is the most worth adding. |
| **Path constraints, clipping attachments, 14 blend modes, two-colour tint, draw-order timelines** | Spine, DragonBones | Low value at sprite sizes. `z` plus `show` tracks cover draw-order swaps. Blend modes and tint conflict with the hue-shifted ramp shader. |
| **A general scripting VM in the deliverable** | Rive Luau, AE expressions in lottie-web | Size, security (bundles are data a page loads) and determinism. Extension belongs at build time (R8), where it runs once and bakes. |
| **Rive-style data binding of arbitrary properties** | Rive View Models (colors, text, images, lists) | Baked frames cannot bind continuous values. The parts that survive are R3's typed inputs and R6's discrete skins and themes. |
| **Full Mecanim-style layers with avatar masks / additive runtime layers** | Unity, Spine tracks, DragonBones groups | Layering needs a runtime pose. Bake-time layering already exists (author tracks over a motion; `reach` over tracks), and R12 adds reusable patches. Runtime layering would need composited part layers, which breaks outlines (see R6). |
| **Lottie as an export target** (DESIGN.md §6) | Lottie | Vector output discards the pixel-art shader. Aseprite JSON (R5) and possibly GIF/APNG are better targets. |
| **Live2D parameter-space rigging as the core model** | Live2D | Powerful for faces, but it means authoring deformers per parameter: high friction for agents and a different paradigm. Keep only the "named expression patch" idea (R12). |

---

## 5. Comparison table

Legend: ✔ yes · ◐ partial / limited · ✘ no · — not applicable. "PS" is Pixel Studio today.

| Capability | Spine | Rive | Lottie / dotLottie | DragonBones | Live2D | Aseprite | Godot 4 | Unity 2D | Phaser | PixiJS | **PS today** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bone hierarchy | ✔ | ✔ | ◐ layer parenting | ✔ | ◐ deformers / params | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ |
| Mesh deformation | ✔ | ✔ | ✘ | ✔ | ✔ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ (rigid SDF, by design) |
| Skins / swaps | ✔ skins | ◐ solos, components | ◐ slots / themes | ✔ | ◐ pose groups | ◐ layers | ◐ | ✔ Sprite Library | ✘ | ✘ | ◐ `extends`, `show` |
| IK | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ◐ experimental | ✔ | ✘ | ✘ | ✔ `reach` + gait IK |
| Physics / springs | ✔ 4.2 | ◐ (via scripting) | ✘ | ✘ | ✔ pendulums | ✘ | ◐ Jiggle (exp.) | ✘ built-in 2D | ✘ | ✘ | ◐ `follow` (rotational) |
| Procedural locomotion | ✘ | ✘ | ✘ | ✘ | ◐ breath / blink | ✘ | ✘ | ✘ | ✘ | ✘ | **✔ gait / idle / hop** |
| Timeline events / markers | ✔ | ✔ (legacy) | ✔ markers | ✔ | ✔ UserData | ◐ tag / user data | ✔ method tracks, markers | ✔ | ◐ lifecycle only | ◐ lifecycle only | ✘ (only `spriteend`) |
| Runtime mixing / crossfade | ✔ | ✔ | ◐ tweened transitions | ✔ | ✔ fades | — | ✔ | ✔ | ◐ delay-only mix | ✘ | ✘ |
| Additive layers | ✔ | ✔ | ✘ | ✔ | ✔ expressions | — | ✔ | ✔ | ✘ | ✘ | ◐ bake-time track layering |
| State machine | ✘ (code) | ✔ | ✔ dotLottie | ✘ | ◐ priorities | ✘ | ✔ | ✔ | ✘ | ✘ | ◐ hover / click attributes |
| Pointer hit-testing | ✔ bounds | ✔ listeners | ✔ (dotLottie) | ✔ | ✔ HitAreas | — | engine | engine | engine | engine | ◐ whole element |
| Bone / point access from code | ✔ | ◐ low-level API | ✘ | ✔ | ◐ params | ◐ slices pivot | ✔ RemoteTransform2D | ✔ | — | ◐ anchor | ◐ CLI `where` only |
| Per-frame duration | — (curves) | — | — | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ (uniform fps) |
| Extension API | ◐ AttachmentLoader | ✔ Luau | ◐ expressions | ✘ | ✘ | ✔ Lua plugins | ✔ | ✔ | ✔ | ✔ | ✘ (closed switches) |
| Pixel-art handling | ◐ Pixels mode, nearest | ◐ nearest (unverified in editor) | ✘ | ✘ | ✘ | ✔ native | ✔ integer scale | ◐ | ✔ `pixelArt` | ✔ nearest | **✔ shader, LOD tiers** |
| Web runtime size | ◐ (not measured) | ✘ ~931 KB gz* | ◐ lottie-web JS / ~491 KB gz wasm* | ◐ | ◐ | — | — | — | ✘ (engine) | ✘ (engine) | **✔ ~2 KB** |

\* Unofficial measurements of npm packages, not vendor-documented.

---

## 6. Suggested sequencing

1. **R1 events + R2 points + R9 hit areas.** All three are per-frame metadata computed in one bake pass.
   They share bundle plumbing and the runtime frame hook, and need no new rendering. `pixel where` already
   does most of R2's math.
2. **R7 holds / direction + R5 Aseprite export.** Timing becomes part of the format, so it has to come
   before the state machine. Export is a second view of the same data.
3. **R3 state machine.** Built on R1 (switch on `footstep`), R7 timing, and R9 areas as interaction targets.
   Fold R11 into it.
4. **R4 baked transitions.** These are most useful once R3 exists to trigger them.
5. **R6 skins, R10 physics, R8 registries.** These are independent and can run in parallel.

## 7. Open questions

- **Bundle size budget for metadata.** Points and hit areas per frame per animation are small, but R6 skins
  multiply the image payload. Should skins be separate bundle files that share metadata?
- **Should the state machine live in the spec, the bundle, or the page?** This survey recommends spec →
  bundle, so agents can author behaviour. A page-level override (`<pixel-sprite machine="...">`) may still be
  wanted.
- **Unverified items** (flagged inline):
  - Rive editor nearest sampling.
  - The dotLottie 2.0 spec publication date.
  - Full Live2D deformer docs.
  - The t3ssel8r second-order dynamics details.
  - Godot texture filter and snap settings.
  - Moho Smart Bones.
  - DragonBones Pro editor status.
