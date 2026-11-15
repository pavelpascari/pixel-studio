# JavaScript API reference

This is the reference for the Pixel Studio engine's JavaScript API: every export of
`src/core/index.js`, plus `encodePNG` from `src/node/png.js`. The web runtimes (`pixel-studio/runtime`,
`pixel-studio/stage`) are documented in [runtime.md](runtime.md) and [stage.md](stage.md).

- The engine is plain ES modules with zero dependencies. The same code runs in Node (≥ 20, per
  `package.json` `engines`) and in modern browsers.
- Import it by path, or by package name when it is installed (`package.json` has an `exports` map:
  `pixel-studio`, `pixel-studio/runtime`, `pixel-studio/stage`, `pixel-studio/node/png`). It is not
  published to npm yet; install it from GitHub with `npm i github:pavelpascari/pixel-studio` (see
  [getting-started.md](getting-started.md)).

  ```js
  import { validate, compile, renderSheet } from './src/core/index.js';  // engine (browser + Node)
  import { encodePNG } from './src/node/png.js';                         // Node only (uses node:zlib)
  // or, installed: import { compile } from 'pixel-studio'; import { encodePNG } from 'pixel-studio/node/png';
  ```

- The character spec format (materials, parts, shapes, animations, `reach`, figures, `extends`, `style`)
  is documented in [SPEC.md](SPEC.md). This page documents the functions that consume it and does not
  repeat the format.
- Related docs: [runtime.md](runtime.md) (the `<pixel-sprite>` component and the bundle format it plays),
  [stage.md](stage.md) (the `<pixel-stage>` runtime that lets characters roam a page),
  [cli.md](cli.md) (`bin/pixel.mjs`, which is a thin wrapper over this API),
  [architecture.md](architecture.md) (how the modules fit together) and [figures.md](figures.md) (the
  figure library and figure JSON).

**Stability.** The project is at version 0.1.0. Nothing here carries a compatibility promise yet. The
functions in the [typical pipeline](#typical-pipeline) are the intended entry points. Functions marked
**low-level** expose engine internals (pose sampling, IK, motion generation) and are the most likely
to change.

Units and conventions used throughout:

| Quantity | Convention |
|---|---|
| Coordinates | Canvas units (the spec's `size`, default `[100, 100]`). Origin top-left, x right, y down. |
| Rotation | Degrees, positive = clockwise on screen. |
| Resolution (`res`) | Output height in pixels. Width is `round(res × size[0] / size[1])`. |
| Detail level (`lod`) | `1` icon, `2` sprite, `3` portrait. See [`lodForRes`](#lodforres). |
| Colours | Hex strings (`"#f2b58c"`) in specs; `[r, g, b]` arrays of 0–255 in colour helpers; RGBA bytes in images. |

## Contents

- [Typical pipeline](#typical-pipeline)
- [Data shapes](#data-shapes)
- [Spec and compile](#spec-and-compile): `validate`, `compile`, `TRACK_PROPS`
- [Resolution: extends and figures](#resolution-extends-and-figures): `resolveSpec`, `resolveExtends`, `mergeVariant`, `resolveFigure`, `expandFigure`
- [Rendering and styles](#rendering-and-styles): `resolveStyle`, `lodForRes`, `DETAIL_PRESETS`, `DETAIL_NAMES`, `renderFrame`, `renderAnimation`, `renderSheet`, `animationMeta`
- [Images and ASCII](#images-and-ascii): `createImage`, `blit`, `contactSheet`, `frameToAscii`
- [Animation sampling](#animation-sampling): `sampleValue`, `frameTime`, `samplePose`, `samplePoseAt`, `followOffsets`
- [Rig maths and IK](#rig-maths-and-ik): `worldMatrices`, `solveReach`, `overflowForPose`
- [Lint](#lint): `checkBounds`
- [Motion](#motion): `generateMotion`, `MOTION_MODELS`, `LEGGED_MODELS`
- [Bundles](#bundles): `buildBundle`, `bakePoints`, `BUNDLE_FORMAT`
- Transition clips: [`buildMixes`](#buildmixes)
- [Plug-ins](#plug-ins): `registerShape`, `registerTexture`, `registerMotion`, `registeredPlugins`, `usePlugin`
- [Game-engine export](#game-engine-export): `exportSheet`
- [Colours and constants](#colours-and-constants): `parseHex`, `toHex`, `buildRamp`, `TEXTURES`, `SHAPE_TYPES`
- [Node: PNG encoding](#node-png-encoding): `encodePNG`, and the host-neutral `pngBytes` and `paletteOf`
- [Internal helpers](#internal-helpers)

## Typical pipeline

```
raw spec ──resolveSpec──▶ plain spec ──validate──▶ {errors, warnings}
                                      ──compile───▶ compiled spec ──checkBounds──▶ warnings
                                                                  ──renderFrame / renderAnimation / renderSheet──▶ pixels
                                                                  ──buildBundle──▶ bundle JSON for <pixel-sprite>
                                                                  ──exportSheet──▶ sheet + Aseprite JSON (Phaser, PixiJS)
```

1. **`resolveSpec`** merges `extends` variants onto their base and expands `figure` (bones and
   motions) into ordinary parts and tracks. You supply the file loaders, so the engine never touches
   the file system. Skip this step only for specs that use neither `extends` nor `figure`.
2. **`validate`** reports structural errors (with JSON paths and did-you-mean hints) and warnings.
   It does not throw.
3. **`compile`** normalises the spec (fills defaults, compiles shapes to distance functions). It
   throws if `validate` finds errors.
4. **`checkBounds`** (optional) poses every frame and warns about parts leaving the canvas and
   `reach` targets that are missed.
5. **Render**: a single frame, one animation, or a sprite sheet; **`buildBundle`** for the web
   component; or **`exportSheet`** for a game engine.

A complete Node script. It loads a variant (`goose-sudo.json` extends `goose-base.json`, which uses the
`goose` figure), checks it, writes a 32 px sprite sheet PNG plus its metadata, and writes a web bundle.
Run it from the repository root.

```js
// pipeline.mjs — run with: node pipeline.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSpec, validate, compile, checkBounds, renderSheet, buildBundle } from './src/core/index.js';
import { encodePNG } from './src/node/png.js';

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));

// 1. Resolve "extends" and "figure". Both loaders may be sync or async.
const spec = await resolveSpec(readJSON('examples/goose-sudo.json'), {
  loadRef: (ref) => readJSON(join('examples', ref)),           // every base lives in examples/
  loadFigure: (name) => readJSON(join('figures', `${name}.json`)),
  warn: (path, message) => console.warn(`motion note ${path}: ${message}`),
});

// 2. Validate.
const { errors, warnings } = validate(spec);
for (const w of warnings) console.warn(`warning ${w.path}: ${w.message}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e.path}: ${e.message}`);
  process.exit(1);
}

// 3. Compile, 4. lint.
const compiled = compile(spec);
for (const w of checkBounds(compiled)) console.warn(`warning ${w.path}: ${w.message}`);

// 5a. A 32 px sprite sheet: one row per animation, one column per frame.
mkdirSync('out', { recursive: true });
const sheet = renderSheet(compiled, 32);
writeFileSync('out/sudo.32.png', encodePNG(sheet.width, sheet.height, sheet.rgba));
writeFileSync('out/sudo.32.json', JSON.stringify(sheet.meta, null, 2));

// 5b. A bundle for <pixel-sprite>, with PNG data URLs inlined.
const encode = (w, h, rgba) => 'data:image/png;base64,' + encodePNG(w, h, rgba).toString('base64');
const bundle = await buildBundle(compiled, { resolutions: [16, 32, 64], encode });
writeFileSync('out/sudo.bundle.json', JSON.stringify(bundle));

console.log(`${compiled.name}: ${Object.keys(compiled.animations).join(', ')}`);
console.log(`sheet ${sheet.width}x${sheet.height}, bundle variants ${bundle.variants.map((v) => v.res).join('/')}`);
```

`loadRef` above resolves every reference against `examples/`. To resolve each `extends` path relative
to the file that names it, use the `from` argument; see [`resolveExtends`](#resolveextends).

## Data shapes

These shapes are referenced by the function entries below.

### Raw spec and plain spec

A **raw spec** is the JSON an author writes ([SPEC.md](SPEC.md)). It may contain `extends` and
`figure`. A **plain spec** is a raw spec after [`resolveSpec`](#resolvespec): the same format with no
`extends`, no `figure` and no `motion` keys. [`validate`](#validate) and [`compile`](#compile) accept
only plain specs; they report `figure` and `motion` as errors.

### Validation issue and thrown errors

Validation results and structured errors use one shape:

```ts
{ path: string, message: string }   // path is JSON-path-like: "$.parts[2].shapes[0].material"
```

Functions that throw on bad input (`compile`, `resolveSpec`, `resolveExtends`, `mergeVariant`,
`resolveFigure`, `expandFigure`) throw an ordinary `Error` whose `message` summarises the problem and
whose `errors` property holds an array of these issues. Other functions throw a plain `Error` with a
readable message for the common mistakes (unknown animation, missing `res` or `encode`, `lod` out of range);
other malformed input can still surface as a `TypeError`. This is noted per function.

### Compiled spec

Returned by [`compile`](#compile) and accepted by every rendering, sampling, lint and bundle function.
It contains functions (`shape.sdf`), so it is not JSON-serialisable. Treat it as read-only. Some
functions cache derived data keyed by its objects.

```ts
{
  name: string,                       // spec.name ?? "character"
  size: [w, h],                       // spec.size ?? [100, 100]
  style: object,                      // spec.style ?? {} (as written; merged by resolveStyle)
  materials: { [name]: CompiledMaterial },
  parts: CompiledPart[],              // spec order
  animations: { [name]: CompiledAnimation },
  points: { [name]: { part: string, at: [x, y] } },   // spec.points with "tip"/"pivot" resolved to rest-pose points; {} if none
  ground: number | null,              // spec.ground (y of the foot line, units), or null
  skins: { [name]: CompiledSpec } | null,   // each skin compiled as a whole character (see below), or null
  states: object | null,              // spec.states as written (the state machine), or null
}
```

Each skin is `compile(skinSpec(spec, patch))`: the spec without its `skins` and `states`, patched with
the skin like a variant (`mergeVariant`). A compiled skin therefore has the same animations, its own
parts and materials, `skins: null` and `states: null`.

`CompiledMaterial` (a hex-string material becomes `{ color: hex }` first):

| Field | Type | Default |
|---|---|---|
| `name` | string | the key |
| `color` | string (hex) | required |
| `texture` | string \| null | `null` |
| `textureScale` | number | `1` |
| `textureStrength` | number | `0.35` |
| `shine` | number | `0` |
| `flat` | boolean | `false` |
| `outline` | boolean | `true` (only `outline: false` turns it off) |
| `tones` | number \| null | `null` (use the detail level's tone count) |

`CompiledPart`:

| Field | Type | Default / meaning |
|---|---|---|
| `id` | string | |
| `index` | number | position in `spec.parts` (tie-breaker for draw order) |
| `parent` | string \| null | `null` |
| `pivot` | `[x, y]` | canvas centre `[w/2, h/2]` |
| `z` | number | `index` |
| `tip` | `[x, y]` \| null | `null`; bones expanded from a figure carry their end point here |
| `follow` | `{freq, damping, amount, max}` \| null | `null`. A number `n` becomes `{amount: n}`; missing fields default to `freq 3`, `damping 0.3`, `amount 1`, `max 40`. `0` becomes `null`. |
| `base` | `{x, y, rot, sx, sy, show}` | rest transform, defaults `0, 0, 0, 1, 1, 1` |
| `shade` | number | `0` |
| `shapes` | `CompiledShape[]` | |

`CompiledShape`: `{ sdf(x, y), R, bbox, type, op, material, minDetail, maxDetail, profile, shade }`.
`sdf` is a signed distance function in rest-pose canvas units (negative inside). `R` is the shape's
thickness (largest inner distance, at least 0.01). `bbox` is `[x0, y0, x1, y1]`. `op` is `"add"` or
`"cut"`; `material` is `null` for cuts; `minDetail` defaults to `1`, `maxDetail` to `3`, `profile` to
`"dome"`, `shade` to `0`.

`CompiledAnimation`:

| Field | Type | Default |
|---|---|---|
| `name` | string | the key |
| `frames` | number | required (integer 1..64) |
| `fps` | number | `8` |
| `loop` | boolean | `true` (only `loop: false` turns it off) |
| `tracks` | `{ [partId]: { [prop]: TrackValue } }` | `{}`; values kept exactly as written in the spec |
| `reach` | array | `[]`; constraints kept as written |
| `speed` | number | `0`; units per second the sprite should travel sideways |
| `speedY` | number | `0`; units per second the sprite should climb (positive is up) |
| `wall` | number \| null | `null`; x of the climbed wall in units (climb motions set it) |
| `events` | `{ frame, name, data? }[]` | `[]`; sorted by `frame` |
| `holds` | `{ [frameIndex: number]: multiple }` \| null | `null`; frame `f` shows `multiple` times as long |

If the spec has no animations, `compile` adds
`still: { name: "still", frames: 1, fps: 1, loop: true, tracks: {}, reach: [], speed: 0, speedY: 0, events: [], holds: null }`
(this synthetic animation has no `wall` field).

### Pose

Returned by [`samplePose`](#sampleposecompiled-anim-f) and [`samplePoseAt`](#sampleposeat). A `Map`
from part id to that part's local transform for one moment:

```ts
Map<string, { x: number, y: number, rot: number, sx: number, sy: number, show: boolean }>
  & { reachMiss: number[] }
```

| Field | Meaning |
|---|---|
| `x`, `y` | Offset in canvas units: `base.x + track` (and `base.y + track`). |
| `rot` | Degrees around the part's pivot: `base.rot + track`, then adjusted by `reach` solving and follow-through. |
| `sx`, `sy` | Scale around the pivot: `base.sx × track` (and `base.sy × track`). |
| `show` | `(track ?? base.show) >= 0.5`. A part is drawn only if it and all its ancestors show. |
| `reachMiss` | A property on the Map itself (not an entry): for each `reach` constraint of the animation, the remaining distance in units between tip and target after solving. |

Transforms are local (relative to the parent part). Use [`worldMatrices`](#worldmatrices) to get
canvas-space matrices.

### Frame and image

[`renderFrame`](#renderframe) returns a **frame**:

```ts
{
  w: number, h: number,         // pixels
  rgba: Uint8ClampedArray,      // w*h*4 bytes, row-major; alpha is 0 (empty) or 255
  ids: Int16Array,              // per pixel: index into `materials`, -1 empty, -2 outline
  materials: string[],          // Object.keys(compiled.materials), in that order
}
```

An **image** is the subset `{ w, h, rgba }`. [`createImage`](#createimage), [`blit`](#blit) and
[`contactSheet`](#contactsheet) work on images, and every frame is also an image.

### Resolved style

Returned by [`resolveStyle`](#resolvestyle) and accepted by `renderFrame`. A flat object of shader
settings:

| Key | Built-in default | Meaning |
|---|---|---|
| `light` | `-45` | light azimuth in degrees; 0 = from above, negative = from the left |
| `elevation` | `50` | light height in degrees |
| `outlineColor` | `"#1b1424"` | colour of `"dark"` outlines |
| `snap` | `true` | pixel-snap part offsets |
| `hueShift` | `1` | strength of the hue drift in tone ramps |
| `ambient` | `0.15` | brightness lift |
| `curvature` | `0.8` | 0 = flat shapes, 1 = full domes |
| `flip` | `false` | mirror the frame horizontally (lighting is mirrored to match) |
| `tones`, `texture`, `dither`, `outline`, `innerLines`, `contactShadow`, `ambientBoost` | from [`DETAIL_PRESETS`](#detail_presets)`[lod]` | |
| `lod` | see `resolveStyle` | detail level 1, 2 or 3 |

### Sheet

Returned by [`renderSheet`](#rendersheet). Note `width`/`height` here versus `w`/`h` on images.

```ts
{
  width: number, height: number,          // pixels: (max frames) × frameW, (animation count) × frameH
  rgba: Uint8ClampedArray,                // width*height*4; cells past an animation's last frame are transparent
  meta: {
    res: number, lod: 1 | 2 | 3,
    frameW: number, frameH: number,
    animations: { [name]: { row: number, ...AnimationMeta } },
  },
}
```

`AnimationMeta` is what [`animationMeta`](#animationmeta) returns: `frames`, `fps`, `loop`, and the
optional `speed`, `speedY`, `wall`, `events`, `durations` and `mix`.

### Bundle

Returned by [`buildBundle`](#buildbundle); consumed by `<pixel-sprite>` ([runtime.md](runtime.md)).

```ts
{
  format: "pixel-sprite/1",
  name: string,
  size: [w, h],                       // the spec canvas in units (speed → px/s)
  ground: number,                     // y of the foot line in units
  animations: { [name]: { row, frames, fps, loop, speed?, speedY?, wall?, events?, durations?, mix? } },  // sheet meta.animations
  skins?: string[],                   // skin names, when the spec has skins
  states?: object,                    // the state machine, when the spec has one
  points?: { [point]: { [anim]: [x, y, rotDeg][] } },  // per frame, in units (see bakePoints)
  skinPoints?: { [skin]: { [point]: { [anim]: [x, y, rotDeg][] } } },  // only skins whose points differ
  variants: [ { res, lod, frameW, frameH, image?: string, skin?: string, recolor?, overlay? } ],  // image is always set on default-look variants
}
```

A skin variant may have no `image` and instead describe a change to the default variant of the same
`res`: `recolor: [["rrggbbaa", "rrggbbaa"], ...]` (each default colour swapped for the skin's) and/or
`overlay` (an image whose opaque pixels replace those under them). `buildBundle` writes this form when it
is smaller, which for a recolour or a hat is most of the time (root's two skins: 290 KB → 10 KB);
`<pixel-sprite>` rebuilds the sheet once, on load.

`variants` lists the default look in ascending `res`, then, for each skin, the same resolutions again
with `skin` set. Every variant uses the same sheet layout, so `animations` serves them all. `ground`
is `compiled.ground` when the spec (or its figure) has one; otherwise it is the bottom of the lowest
opaque row in the first frame of the first animation of the largest sheet, converted to units (or
`size[1]` if that frame is empty).

## Spec and compile

### `validate`

```ts
validate(spec: object): { errors: Issue[], warnings: Issue[] }
```

Checks a plain spec. Never throws. Errors block `compile`; warnings are hints.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | A plain spec (after `resolveSpec`). |

**Returns** `{ errors, warnings }`, each an array of [`{ path, message }`](#validation-issue-and-thrown-errors).

What it reports, from `src/core/spec.js`:

- **Errors**: non-object spec; a `figure` key or an animation `motion` key (resolve first); bad `size`;
  empty or malformed `materials`, bad hex colours, unknown `texture`, `shine` outside 0..1; empty
  `parts`, missing or duplicate ids, bad `pivot`/`z`/`tip`/`follow`, unknown or cyclic `parent`; parts
  without shapes (except figure bones, which have a `tip`); unknown shape types, missing required
  shape fields, polygons with fewer than 3 points, bad `op`/`profile`, missing or unknown `material`;
  `frames` not an integer 1..64, `fps` not in 1..60, non-numeric `speed`, `speedY` or `wall`; events
  that are not `{frame, name}` with `frame` inside the animation; `holds` keys that are not frame
  indices or values not in (0, 16]; tracks on unknown parts, unknown track properties, malformed track
  values; malformed `reach` constraints; unknown `style.outline`.
- **Errors for the page-facing keys**: `points` on unknown parts, or `at` that is not `[x, y]`,
  `"pivot"` or `"tip"` (`"tip"` only on bones); `ground` outside `0..size[1]`; `skins` that are not
  objects, that change anything but `parts`, `materials`, `materialMap` and `style`, or whose patched
  spec does not validate (its errors are reported under `$.skins.<name>`); a `states` machine with no
  `nodes`, nodes playing unknown animations, a node `rate` that is neither a speed in (0, 4] nor an
  input name, `random` fidgets that are not an array or name unknown animations, `then` naming an
  unknown node, unknown `initial`, transition `from`/`to` nodes, a transition `at` that is not a
  string, `when` conditions that cannot be read or name unknown inputs, and interactions whose `on` is
  not `click`/`enter`/`leave`/`burst`/`calm` or that `fire`/`set` unknown inputs.
- **Errors for `mixes`**: `mixes` not an object; a key that is not `"from>to"`, names an unknown
  animation, or names the same animation twice; a value that is not an object; `frames` not a whole
  number 1..8; `ease` not `linear`/`smooth`; `fps` not in 1..60.
- **Warnings**: unknown keys at any level (with a did-you-mean suggestion when one is close),
  materials no shape uses, and shapes lying entirely outside the canvas at rest (checked only while
  there are no errors yet).
- Not checked here: parts that leave the canvas during an animation and missed `reach` targets. Those
  need poses; use [`checkBounds`](#checkbounds) on the compiled spec.

```js
import { validate } from './src/core/index.js';

const { errors, warnings } = validate({
  materials: { skin: { color: '#f2b58c', textur: 'fur' } },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 20, material: 'skn' }] }],
});
console.log(errors);
// [ { path: '$.parts[0].shapes[0].material', message: 'unknown material "skn" — did you mean "skin"?' } ]
console.log(warnings.map((w) => w.path));
// [ '$.materials.skin.textur', '$.materials.skin' ]   (unknown key; material never used)
```

### `compile`

```ts
compile(spec: object): CompiledSpec
```

Validates, then normalises a plain spec into the [compiled spec](#compiled-spec) the renderer uses.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | A plain spec. |

**Returns** a [compiled spec](#compiled-spec). The input is not modified.

**Throws** `Error` if `validate(spec)` has errors. `message` is `"invalid spec:"` followed by one
`  path: message` line per error, and `error.errors` holds the issue array. Warnings are not
reported; call `validate` yourself to see them.

```js
import { compile } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', pivot: [50, 90], shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
});
console.log(c.name, c.size, Object.keys(c.animations));  // character [ 100, 100 ] [ 'still' ]
console.log(c.materials.skin.textureStrength, c.parts[0].z); // 0.35 0

try {
  compile({ materials: {}, parts: [] });
} catch (e) {
  console.log(e.errors.map((x) => x.path));                // [ '$.materials', '$.parts' ]
}
```

### `TRACK_PROPS`

```ts
TRACK_PROPS: ['x', 'y', 'rot', 'sx', 'sy', 'show']
```

The animatable part properties. Any other key under `animations.<name>.tracks.<part>` is a validation
error.

## Resolution: extends and figures

These functions turn a raw spec into a plain spec. All of them return new objects and do not modify
their inputs. The engine does no I/O: loaders are callbacks you supply, and they may return a value
or a promise.

### `resolveSpec`

```ts
resolveSpec(spec: object, options?: { loadRef?, loadFigure?, warn? }): Promise<object>
```

Resolves `extends` (via [`resolveExtends`](#resolveextends)), then `figure` (via
[`resolveFigure`](#resolvefigure)). A spec that has neither is returned as is.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | A raw spec. |
| `options.loadRef` | `(ref: string, from: string \| null) => object \| Promise<object>` | a loader that throws `no loader for "extends"` | Returns the spec named by an `extends` reference. See `resolveExtends` for `from`. |
| `options.loadFigure` | `(name: string) => object \| Promise<object>` | a loader that throws `no loader for figures` | Returns the figure JSON for a name such as `"goose"` (in this repository, `figures/<name>.json`). |
| `options.warn` | `(path: string, message: string) => void` | ignore | Receives motion-generation notes, such as a foot that cannot reach its mark. |

The default loaders throw only if they are needed, so a spec without `extends` needs no `loadRef`.

**Returns** a promise of a plain spec.

**Throws** (rejects with) an `Error` with `.errors` for any failure in `resolveExtends` or
`resolveFigure`, including loader failures.

```js
import { readFileSync } from 'node:fs';
import { resolveSpec, compile } from './src/core/index.js';

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const notes = [];
const spec = await resolveSpec({ figure: 'goose' }, {     // no parts: the bare skeleton
  loadFigure: (name) => readJSON(`figures/${name}.json`),
  warn: (path, message) => notes.push(`${path}: ${message}`),
});
console.log(spec.name, Object.keys(spec.animations));     // goose skeleton [ 'idle', 'walk', 'run', 'sneak', 'jump', 'fall', 'sit', 'duck', 'peek', 'climb', 'rush', 'flap', 'honk', 'fly' ]
console.log(compile(spec).animations.walk.speed);         // 23.21 (units per second)

try {
  await resolveSpec({ extends: 'base.json' });
} catch (e) {
  console.log(e.message);                                 // cannot load "base.json": no loader for "extends"
}
```

### `resolveExtends`

```ts
resolveExtends(spec: object, load: Function, options?: { from?, depth? }): Promise<object>
```

Follows a spec's `extends` chain and merges each variant onto its resolved base with
[`mergeVariant`](#mergevariant). The result has no `extends` key. A `figure` key, if any, is kept (a
variant may also set or replace it); resolve it afterwards with `resolveFigure`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | The variant. If it is not an object or has no `extends`, it is returned unchanged. |
| `load` | `(ref: string, from: string \| null) => object \| Promise<object>` | required | Returns the spec named by `ref`. `from` is the `extends` string of the spec that contains `ref` (`null` for the top-level spec). It is the reference string, not a resolved path; keep your own map from reference to path if bases live in different directories (the CLI does this). |
| `options.from` | string \| null | `null` | Passed to `load` as `from` for this spec's own reference. Used by the recursion. |
| `options.depth` | number | `0` | Recursion depth. Used by the recursion. |

**Returns** a promise of the merged spec.

**Throws** (rejects with) an `Error` with `.errors = [{ path: '$', message }]` when:

- `extends` is not a string (`"extends" must be a file name like "goose-root.json"`);
- the chain is more than 8 levels deep, which is also how a cycle shows up
  (`"extends" chain is too deep (cycle?) at "<ref>"`);
- `load` throws or rejects (`cannot load "<ref>": <loader message>`);
- `mergeVariant` throws.

```js
import { resolveExtends } from './src/core/index.js';

const files = {
  'base.json': { name: 'base', materials: { a: '#ff0000' },
    parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 20, material: 'a' }] }] },
};
const seen = [];
const out = await resolveExtends({ extends: 'base.json', name: 'red variant' }, (ref, from) => {
  seen.push([ref, from]);
  return files[ref];
});
console.log(out.name, 'extends' in out, seen);   // red variant false [ [ 'base.json', null ] ]
```

### `mergeVariant`

```ts
mergeVariant(base: object, variant: object): object
```

Merges one variant onto a base that is already fully resolved (no `extends`), following the rules in
[SPEC.md, Variants](SPEC.md#variants-extends). It does not look at the variant's `extends` value. In
summary:

- Top-level keys other than `extends`, `materials`, `parts`, `animations`, `style`, `materialMap`,
  `points` and `skins` replace the base value; `null` deletes the key.
- `materials` merge per material and per field; `null` removes a material or a field.
- `parts`: an entry with an existing `id` patches that part (`null` deletes a field, `shapes`
  replaces the list, `addShapes` appends); `remove: true` deletes the part and its descendants; an
  entry with a new `id` is appended (its `addShapes` are appended to its `shapes`).
- `materialMap` re-points every shape's `material`, including the variant's own shapes.
- Materials the base used and the merged spec no longer uses are dropped, unless the variant names
  them in `materials`.
- `animations`: `null` removes; an existing animation merges field by field, with `tracks` merged per
  part and per property (`null` removes); a new name is added. Tracks and `reach` constraints that
  refer to removed parts are dropped.
- `style` merges per key; `style: null` removes it.
- `points` and `skins` merge by name: a variant entry replaces the base entry of that name, `null`
  removes one, and `points: null` / `skins: null` removes them all.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `base` | object | required | Resolved base spec. Not modified (it is deep-cloned via JSON). |
| `variant` | object | required | The variant's differences. |

**Returns** the merged spec.

**Throws** an `Error` with `.errors = [{ path: '$', message }]` when a part entry has `remove: true`
but the base has no part with that id (`parts: cannot remove "<id>": the base has no such part`).

```js
import { mergeVariant } from './src/core/index.js';

const base = {
  materials: { fur: '#c8692e', eye: '#000000' },
  parts: [
    { id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 60, r: 25, material: 'fur' }] },
    { id: 'eye', parent: 'body', shapes: [{ type: 'circle', cx: 58, cy: 50, r: 3, material: 'eye' }] },
  ],
  animations: { idle: { frames: 4, tracks: { body: { y: { wave: 1 } }, eye: { show: [1, 1, 0, 1] } } } },
};
const merged = mergeVariant(base, {
  name: 'no eyes',
  materials: { fur: { color: '#3355aa' } },
  parts: [{ id: 'eye', remove: true }],
});
console.log(merged.materials);                         // { fur: { color: '#3355aa' } }   ("eye" became unused)
console.log(merged.parts.map((p) => p.id));            // [ 'body' ]
console.log(Object.keys(merged.animations.idle.tracks)); // [ 'body' ]
```

### `resolveFigure`

```ts
resolveFigure(spec: object, loadFigure: Function, options?: { warn? }): Promise<object>
```

Expands a spec's `figure` into a plain spec with [`expandFigure`](#expandfigure). Run it after
`extends` is resolved. A spec without `figure` is returned unchanged.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | Spec with a `figure` key. |
| `loadFigure` | `(name: string) => object \| Promise<object>` | required | Returns figure JSON by name. |
| `options.warn` | `(path, message) => void` | no-op | Motion notes; see `expandFigure`. |

`spec.figure` may be:

| Form | Meaning |
|---|---|
| `"goose"` | Load the figure by name, no fitting. |
| `{ "use": "goose", "bones": {...}, "scale": n, "offset": [dx, dy], "origin": [x, y] }` | Load by name and fit it (see `expandFigure`'s `fit`). |
| An object with a `bones` array | An inline figure. It is used as is; fitting keys on it are not applied. |

**Views.** A spec may also have `views`: the same character seen from other angles, each dressing its
own figure, for example `{ "front": { "figure": "goose-front", "parts": [...], "animations": {...},
"look": { "part": "head", "replaces": "head" } } }` (see `examples/goose-root.json`). A view name is a
word such as `front` or `back` (not `side`, the main view). Each view's figure is expanded like the main
one with the main `size`; its parts join the spec with the view name in front (`front.body`) and are
hidden except in that view's animations. `resolveFigure` adds, per view:

- `<animation>@<view>` for each of the view's animations (`idle@front`; without `animations`, one per
  motion of the view's figure);
- `turn@<view>`, a 4-frame one-shot at 12 fps from the side to the view, and `unturn@<view>`, the same
  turn reversed;
- with `look`, `look@<view>`: the side `idle` with the view's part (and its children) shown in place of
  the side part `replaces`, a three-quarter view. The turns then pass through it.

The figure's `points` on a view become `<point>@<view>`, which [`bakePoints`](#bakepoints) uses for that
view's animations. The result has no `views` key. View errors (no `figure`, no `parts`, a bad `look`)
are reported under `$.views.<name>`.

**Returns** a promise of a plain spec.

**Throws** (rejects with) an `Error` with `.errors`:

- `[{ path: '$.figure', message: 'cannot load figure "<name>": ...' }]` when `loadFigure` fails;
- `[{ path: '$.figure', message: 'figure must be a name like "goose", ...' }]` when the figure is not
  a name, a `{use}` object or an object with `bones`;
- any error from `expandFigure`;
- errors in `views`, under `$.views`.

```js
import { readFileSync } from 'node:fs';
import { resolveFigure } from './src/core/index.js';

const loadFigure = (name) => JSON.parse(readFileSync(`figures/${name}.json`, 'utf8'));
try {
  await resolveFigure({ figure: 'goose', animations: { swim: { motion: 'swim' } } }, loadFigure);
} catch (e) {
  console.log(e.errors[0].path);   // $.animations.swim.motion
  console.log(e.errors[0].message); // unknown motion "swim" (this figure has: idle, walk, run, sneak, jump, fall, sit, duck, peek, climb, rush, flap, honk, fly; models: gait, idle, pose, hop, jump, climb, fall, sit)
}
```

### `expandFigure`

```ts
expandFigure(spec: object, figure: object, fit?: object, warn?: Function): object
```

The synchronous core of `resolveFigure`, for when you already hold the figure object. Note that
`warn` is the fourth positional argument here, not an option.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `spec` | object | required | The character spec. Its `figure` key is dropped from the result. |
| `figure` | object | required | Figure JSON: `{ name, size?, bones: [{id, parent?, from, to, z?, side?, limits?, follow?}], rig, motions, ground?, points? }`. See [figures.md](figures.md). Not modified. |
| `fit` | object | `{}` | Fitting: `bones` (`{ [boneId]: fieldsToOverride }`, applied after scaling), `scale` (default `1`), `offset` (default `[0, 0]`), `origin` (scale origin, default `[size[0] / 2, size[1]]`, the bottom centre). |
| `warn` | `(path, message) => void` | no-op | Called once per motion note, with path `$.animations.<name>` and a message ending in `: shorten the stride or lower "reach"`. |

`size` is `spec.size ?? figure.size ?? [100, 100]`.

What it produces:

- **Bones become parts**, in figure order, with `pivot = from`, `tip = to`, `z = bone.z ?? index`,
  `parent`, `follow`, and `shade: -0.3` for `side: "far"` bones. Their `shapes` start empty.
- **Spec parts** whose `id` matches a bone dress it: their fields (shapes, `z`, `shade`, `pivot`, ...)
  are assigned onto the bone part. A part with `"bone": "<id>"` becomes a new part with
  `parent: <id>`, `pivot: bone.from` and `z: (bone.z ?? 0) + 0.5` unless it sets them. Other parts are
  appended unchanged.
- **No `parts`** (missing or empty): each bone is drawn as a capsule plus joint dots, with materials
  `bone` and `joint`, `style` defaults to `{ outline: "dark" }` and `name` to `"<figure name> skeleton"`.
- **Animations**: without `spec.animations`, one animation per figure motion (`{ motion: <name> }`).
  An animation with `motion` is generated by [`generateMotion`](#generatemotion): `motion` names a
  preset in `figure.motions` or a model in `MOTION_MODELS`; other fields override the preset.
  Author `tracks` are layered on top (`x`/`y`/`rot` add, `sx`/`sy` multiply, `show` replaces); root
  `x`/`y`/`rot` tracks are applied inside the motion, before the feet are solved. The result is
  `{ frames, fps, tracks, loop?: false, speed?, speedY?, wall?, reach?, events?, holds? }` with tracks
  sampled at 4 values per frame. Animations without `motion` pass through unchanged.
- **Events**: the model's events (see [`generateMotion`](#generatemotion)) become frame numbers: an
  event at normalised time `u` fires on the first frame at or after it (`ceil(u × frames) mod frames`
  when looping, `ceil(u × (frames − 1))` for one-shots). The animation's own `events` are appended as
  written and the list is sorted by frame; `"events": false` drops the model's events. `holds` is
  copied as written.
- **Ground**: unless the spec sets `ground`, it is the figure's `ground` (fitted like the bones), or
  else the lowest toe of the rig's legs, else the line of `rig.shadow`, else the lower end of the root
  bone; rounded to 0.01.
- **Points**: the figure's `points` (on bones that exist; `[x, y]` points are fitted) are merged with
  the spec's `points`, which win by name; a spec point set to `null` removes a figure point.

**Returns** a plain spec.

**Throws** an `Error` with `.errors` collecting every problem: unknown bone in `fit.bones`
(`$.figure.bones.<id>`), unknown `bone` reference (`$.parts[i].bone`), unknown motion
(`$.animations.<name>.motion`), unknown motion model, or a figure whose `rig` lacks `root` (or `legs`,
for the models in [`LEGGED_MODELS`](#legged_models)).

```js
import { readFileSync } from 'node:fs';
import { expandFigure, validate } from './src/core/index.js';

const goose = JSON.parse(readFileSync('figures/goose.json', 'utf8'));
const spec = expandFigure({
  materials: { feather: '#ece6da', beak: '#f0862a' },
  parts: [
    { id: 'body', shapes: [{ type: 'ellipse', cx: 46, cy: 64, rx: 20, ry: 12, material: 'feather' }] },
    { id: 'head', shapes: [{ type: 'circle', cx: 64, cy: 28, r: 7, material: 'feather' }] },
    { id: 'beak', bone: 'head', shapes: [{ type: 'capsule', x1: 70, y1: 28, x2: 80, y2: 27, r: 2, material: 'beak' }] },
  ],
  animations: { walk: { motion: 'walk', stride: 10 } },
}, goose, { scale: 0.9 });

const beak = spec.parts.find((p) => p.id === 'beak');
console.log(beak.parent, beak.z);                       // head 6.5
console.log(spec.animations.walk.frames, spec.animations.walk.speed); // 8 17.86
console.log(validate(spec).errors.length);              // 0
console.log(spec.animations.walk.events);               // [ { frame: 0, name: 'footstep', data: { leg: 'legNear' } }, { frame: 4, ... legFar } ]
console.log(spec.ground, Object.keys(spec.points));     // 91.45 [ 'beak', 'head', 'tail' ]   (from the figure, fitted)
```

## Rendering and styles

### `lodForRes`

```ts
lodForRes(res: number): 1 | 2 | 3
```

The default detail level for a resolution: `1` (icon) for `res <= 20`, `2` (sprite) for `res <= 40`,
`3` (portrait) above.

```js
import { lodForRes, DETAIL_NAMES } from './src/core/index.js';
console.log([16, 20, 32, 40, 64].map((r) => DETAIL_NAMES[lodForRes(r)]).join(' '));
// icon icon sprite sprite portrait
```

### `DETAIL_PRESETS`

Shader settings per detail level. [`resolveStyle`](#resolvestyle) layers `spec.style` and overrides on
top of these.

| Key | 1 (icon) | 2 (sprite) | 3 (portrait) |
|---|---|---|---|
| `tones` | 2 | 3 | 5 |
| `texture` | 0 | 0.6 | 1 |
| `dither` | false | false | true |
| `outline` | `"dark"` | `"selective"` | `"selective"` |
| `innerLines` | false | false | true |
| `contactShadow` | false | true | true |
| `ambientBoost` | 0.25 | 0 | 0 |

### `DETAIL_NAMES`

```ts
DETAIL_NAMES: { 1: 'icon', 2: 'sprite', 3: 'portrait' }
```

### `resolveStyle`

```ts
resolveStyle(compiled: CompiledSpec, res: number, overrides?: object): ResolvedStyle
```

Computes the shader settings for one resolution. Precedence, lowest first: built-in defaults <
`DETAIL_PRESETS[lod]` < `compiled.style` < `overrides`. Keys whose value is `undefined`, `null` or `""`
in `compiled.style` or `overrides` are skipped, so you can pass optional CLI-style values directly.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | Supplies `compiled.style`. |
| `res` | number | required | Output height in pixels; picks the level via `lodForRes` unless `overrides.lod` is set. |
| `overrides` | object | `{}` | Any [resolved style](#resolved-style) key, plus `lod`. |

`lod` is `Number(overrides.lod) || lodForRes(res)`; a `lod` key in `compiled.style` is ignored.
A falsy `overrides.lod` (`0`, `undefined`) means "not set".

**Throws** `Error('lod must be 1, 2 or 3 (got <lod>)')` for any other `overrides.lod`. Other
overrides follow the rules of a spec's `style` and throw a readable error when they do not, for
example `tones must be a whole number 2..6 (got 0)`: `tones` a whole number 2..6; `light`,
`elevation`, `ambient`, `curvature`, `texture` and `hueShift` finite numbers; `outline` `none`, `dark`
or `selective`; `dither`, `innerLines`, `contactShadow`, `snap` and `flip` booleans.

**Returns** a [resolved style](#resolved-style).

```js
import { compile, resolveStyle } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  style: { light: 30 },
});
const st = resolveStyle(c, 16, { lod: 3, tones: 4, outline: undefined });
console.log(st.lod, st.tones, st.outline, st.light, st.dither); // 3 4 selective 30 true
```

### `renderFrame`

```ts
renderFrame(compiled: CompiledSpec, options?: { res?, anim?, frame?, style? }): Frame
```

Rasterises one frame: samples the pose (tracks, `reach`, follow-through), snaps part offsets to whole
pixels (if `style.snap`), then shades, textures, dithers and outlines.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `options.res` | number | `32` | Output height in pixels. |
| `options.anim` | string \| CompiledAnimation | first animation | Animation name or object. |
| `options.frame` | number | `0` | Frame index (non-negative integer). Wraps modulo the animation's frame count. |
| `options.style` | ResolvedStyle | `resolveStyle(compiled, res)` | A complete resolved style, not a partial override object. To override some keys, pass `resolveStyle(compiled, res, overrides)`. |

**Returns** a [frame](#frame-and-image) of `round(res × size[0] / size[1])` × `round(res)` pixels
(each at least 1).

**Errors**: an unknown animation name throws `Error: unknown animation "<name>" (have: ...)`.

```js
import { compile, renderFrame, resolveStyle } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { bob: { frames: 4, tracks: { body: { y: { wave: 6 } } } } },
});
const fr = renderFrame(c, { res: 24, anim: 'bob', frame: 1, style: resolveStyle(c, 24, { outline: 'none' }) });
console.log(fr.w, fr.h, fr.materials, fr.ids.includes(-2));  // 24 24 [ 'skin' ] false
```

### `renderAnimation`

```ts
renderAnimation(compiled: CompiledSpec, animName: string, res: number, overrides?: object):
  { anim: CompiledAnimation, style: ResolvedStyle, frames: Frame[] }
```

Renders every frame of one animation with one resolved style.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `animName` | string | required | Animation name. |
| `res` | number | required | Output height in pixels. (If omitted, the style resolves to level 3 and frames render at 32 px.) |
| `overrides` | object | `{}` | Passed to `resolveStyle`. |

**Returns** `{ anim, style, frames }`, with `frames.length === anim.frames`.

**Throws** `Error('unknown animation "<name>" (have: a, b, ...)')`, `Error('res must be 1..512 pixels (got <res>)')`
for a `res` outside 1..[`MAX_RES`](#constants), and the [`resolveStyle`](#resolvestyle) errors for bad overrides.

```js
import { compile, renderAnimation } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { bob: { frames: 6, fps: 12, tracks: { body: { y: { wave: 4 } } } } },
});
const { anim, style, frames } = renderAnimation(c, 'bob', 16);
console.log(anim.fps, style.lod, frames.length, frames[0].w);  // 12 1 6 16

try { renderAnimation(c, 'walk', 16); } catch (e) { console.log(e.message); } // unknown animation "walk" (have: bob)
```

### `renderSheet`

```ts
renderSheet(compiled: CompiledSpec, res: number, overrides?: object, animNames?: string[]): Sheet
```

A sprite sheet: one row per animation (in `animNames` order), one column per frame.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `res` | number | required | Output height in pixels. |
| `overrides` | object | `{}` | Passed to `resolveStyle`. |
| `animNames` | string[] | `Object.keys(compiled.animations)` | Animations to include, in row order. Must not be empty. |

**Returns** a [sheet](#sheet).

**Throws** the `renderAnimation` error for an unknown name, and `renderSheet needs at least one
animation` for an empty `animNames` array.

```js
import { compile, renderSheet } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: {
    idle: { frames: 4, tracks: { body: { y: { wave: 2 } } } },
    jump: { frames: 6, fps: 12, loop: false, tracks: { body: { y: [0, -20, 0] } } },
  },
});
const sheet = renderSheet(c, 32);
console.log(sheet.width, sheet.height);   // 192 64
console.log(sheet.meta);
// { res: 32, lod: 2, frameW: 32, frameH: 32,
//   animations: { idle: { row: 0, frames: 4, fps: 8, loop: true }, jump: { row: 1, frames: 6, fps: 12, loop: false } } }
```

### `buildMixes`

```ts
buildMixes(compiled: CompiledSpec, mixes: { [ "from>to" ]: { frames?, ease?, fps? } }): string[]
```

Adds a transition clip to `compiled.animations` for each mix, named `"from>to"`, and returns the names. `compile` calls
it for a spec's `mixes`, after the animations they blend. Each clip has `frames` frames (default 2) that interpolate every
part's `x`, `y`, `rot` (the short way round), `sx` and `sy` from the pose in the last frame of `from` (frame 0 for a loop)
to the pose in frame 0 of `to`, with `ease` `smooth` (default) or `linear`; `show` switches halfway. Clips are
`loop: false`, carry `mix: { from, to }` and `follow: false` (their end poses already include follow-through), and play
at `to`'s fps unless `fps` is given.

### `animationMeta`

```ts
animationMeta(anim: CompiledAnimation): AnimationMeta
```

The playback description of one compiled animation, as sheets, bundles and `render` JSON carry it.

**Returns** `{ frames, fps, loop }` plus, only when they apply:

| Field | When | Value |
|---|---|---|
| `speed` | `anim.speed` is non-zero | units per second, sideways |
| `speedY` | `anim.speedY` is non-zero | units per second, upward |
| `wall` | `anim.wall` is not null | x of the climbed wall, in units |
| `events` | `anim.events` is non-empty | a copy of `[{ frame, name, data? }]` |
| `durations` | `anim.holds` has entries | ms per frame: `1000 / fps × (holds[f] ?? 1)`, rounded to 0.01 |
| `mix` | the animation is a transition clip | `{ from, to }` |

```js
import { compile, animationMeta } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { jump: { frames: 6, fps: 12, loop: false, tracks: { body: { y: [0, -20, 0] } },
    events: [{ frame: 2, name: 'boing' }], holds: { 0: 2 } } },
});
console.log(animationMeta(c.animations.jump));
// { frames: 6, fps: 12, loop: false, events: [ { frame: 2, name: 'boing' } ],
//   durations: [ 166.67, 83.33, 83.33, 83.33, 83.33, 83.33 ] }
```

## Images and ASCII

### `createImage`

```ts
createImage(w: number, h: number, fill?: [r, g, b, a] | null): Image
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `w`, `h` | number | required | Size in pixels. |
| `fill` | `[r, g, b, a]` \| null | `null` | Fill colour; `null` leaves every byte 0 (transparent). |

**Returns** `{ w, h, rgba: Uint8ClampedArray }`.

### `blit`

```ts
blit(dst: Image, src: Image, dx: number, dy: number, k?: number): void
```

Draws `src` onto `dst` at `(dx, dy)`, scaled up by an integer factor with nearest-neighbour sampling.
Colour channels are alpha-blended (`src × a + dst × (1 − a)`); the destination alpha becomes the
larger of the two. Fully transparent source pixels are skipped and pixels outside `dst` are clipped.
Modifies `dst`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `dst` | Image | required | Target, modified in place. |
| `src` | Image | required | Source (a frame works). |
| `dx`, `dy` | number | required | Top-left position in `dst` pixels. |
| `k` | number | `1` | Integer scale factor. |

```js
import { compile, renderFrame, createImage, blit } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
});
const fr = renderFrame(c, { res: 16 });
const canvas = createImage(80, 80, [255, 255, 255, 255]);
blit(canvas, fr, 8, 8, 4);                          // 16 px frame drawn at 4x
const centre = (40 * 80 + 40) * 4;
console.log([...canvas.rgba.slice(centre, centre + 4)]); // [ 242, 181, 140, 255 ]  (the base skin tone)
```

### `contactSheet`

```ts
contactSheet(blocks: Block[], options?: { cellH?, gap?, bg? }): Image
```

Builds a review image: one block per resolution, stacked vertically; inside a block, one row per
animation and one column per frame. Each frame is upscaled by the integer factor
`max(1, floor(cellH / block.res))` and drawn over a light checkerboard so that transparency is visible.
Row names are not drawn.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `blocks` | `{ res: number, rows: { name: string, frames: Image[] }[] }[]` | required | Every block needs at least one row with one frame; the first frame's size sets the cell size of the block. |
| `options.cellH` | number | `128` | Target display height of a cell in pixels. |
| `options.gap` | number | `8` | Spacing in pixels. |
| `options.bg` | `[r, g, b, a]` | `[40, 36, 52, 255]` | Background. |

**Returns** an [image](#frame-and-image).

```js
import { compile, renderAnimation, contactSheet } from './src/core/index.js';
import { encodePNG } from './src/node/png.js';
import { writeFileSync } from 'node:fs';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { bob: { frames: 4, tracks: { body: { y: { wave: 4 } } } } },
});
const blocks = [16, 32, 64].map((res) => ({
  res,
  rows: Object.keys(c.animations).map((name) => ({ name, frames: renderAnimation(c, name, res).frames })),
}));
const img = contactSheet(blocks, { cellH: 128 });
writeFileSync('preview.png', encodePNG(img.w, img.h, img.rgba));
console.log(img.w, img.h);   // 552 464
```

### `frameToAscii`

```ts
frameToAscii(frame: Frame): { text: string, legend: { [material: string]: string } }
```

Renders a frame as text, for agents that cannot see images. `.` is an empty pixel, `#` an outline
pixel, and each material gets one character: the first character of its lower-cased name that is
`a`–`z` or `0`–`9` and not already taken, falling back to the first free character of
`abcdefghijklmnopqrstuvwxyz0123456789`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `frame` | Frame | required | Needs `w`, `h`, `ids` and `materials`. |

**Returns** `{ text, legend }`. `text` has `h` lines of `w` characters joined by `\n`. `legend` maps
every material of the compiled spec to its character, including materials not visible in this frame.

```js
import { compile, renderFrame, frameToAscii } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c', shirt: '#3355aa' },
  parts: [
    { id: 'body', shapes: [{ type: 'rect', x: 30, y: 50, w: 40, h: 40, material: 'shirt' }] },
    { id: 'head', shapes: [{ type: 'circle', cx: 50, cy: 30, r: 18, material: 'skin' }] },
  ],
});
const { text, legend } = frameToAscii(renderFrame(c, { res: 12 }));
console.log(legend);   // { skin: 's', shirt: 'h' }
console.log(text);
// .....##.....
// ....#ss#....
// ...#ssss#...
// ...#ssss#...
// ...#ssss#...
// ....#ss#....
// ...#hhhh#...
// ...#hhhh#...
// ...#hhhh#...
// ...#hhhh#...
// ...#hhhh#...
// ....####....
```

## Animation sampling

All functions in this section are **low-level**. The renderer and `checkBounds` call them for you;
use them directly to inspect poses (as `pixel where` does) or to build tools.

### `sampleValue`

```ts
sampleValue(v: TrackValue, t: number, loop: boolean, isStep: boolean, defaultOffset?: number): number
```

Evaluates one track value at normalised time `t` (0..1). The track value forms are described in
[SPEC.md, Animations](SPEC.md#animations).

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `v` | TrackValue | required | Number, keyframe array, `{keys, ease}` or `{wave, phase, cycles, offset, shape}`. |
| `t` | number | required | Normalised time. Use [`frameTime`](#frametime) to convert a frame index. |
| `loop` | boolean | required | Looping keyframes spread `n` keys over `n` segments and wrap from the last back to the first; non-looping keyframes use `n − 1` segments and hold the last key. |
| `isStep` | boolean | required | Stepped sampling (used for `show`): keyframes take the previous key, and a wave returns `1` where it is ≥ 0 and `0` elsewhere. |
| `defaultOffset` | number | `0` | Centre of a wave without an explicit `offset`. The engine passes `1` for `sx`/`sy`. |

Evaluation, from `src/core/animate.js`:

- number → itself; array → linear (or stepped) keyframes; `{keys}` → keyframes with `ease`
  `"linear"` (default), `"smooth"` (smoothstep) or `"step"`; an unrecognised `ease` behaves as linear.
- `{wave}` → `offset + wave × w(x)` with `x = (t × cycles + phase) mod 1`; `cycles` defaults to 1,
  `phase` to 0. `shape` is `"sin"` (default, also used for unknown values), `"tri"`, `"square"` or
  `"bounce"` (`−|sin(2πx)|`, two bumps per cycle).
- Anything else → `0`.

**Returns** a number.

```js
import { sampleValue } from './src/core/index.js';

console.log(sampleValue([0, 10], 0.25, true, false));                    // 5   (0→10→0 over the loop)
console.log(sampleValue([0, 10], 0.25, false, false));                   // 2.5 (0→10 once)
console.log(sampleValue({ keys: [0, 10], ease: 'step' }, 0.75, true, false)); // 10
console.log(sampleValue({ wave: 0.1 }, 0.25, true, false, 1));           // 1.1
console.log(sampleValue({ wave: 1 }, 0.75, true, true));                 // 0   (stepped: sin < 0)
```

### `frameTime`

```ts
frameTime(anim: { frames: number, loop: boolean }, f: number): number
```

Normalised time of frame `f`: `0` for a one-frame animation, `f / frames` for a looping animation (the
last frame stops one step short of 1, so the loop is seamless), `f / (frames − 1)` otherwise (the last
frame lands on 1).

```js
import { frameTime } from './src/core/index.js';
console.log(frameTime({ frames: 4, loop: true }, 3), frameTime({ frames: 4, loop: false }, 3)); // 0.75 1
```

### `samplePose(compiled, anim, f)`

```ts
samplePose(compiled: CompiledSpec, anim: CompiledAnimation, f: number): Pose
```

The pose the renderer draws for frame `f`: tracks at `frameTime(anim, f)`, then `reach` constraints,
then follow-through offsets (added to `rot`).

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `anim` | CompiledAnimation | required | An animation object from `compiled.animations`, not a name. Passing `undefined` throws a `TypeError`. |
| `f` | number | required | Frame index, `0 ≤ f < anim.frames`. |

**Returns** a [pose](#pose). A new Map on every call.

```js
import { compile, samplePose } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', pivot: [50, 80], shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { sway: { frames: 4, tracks: { body: { rot: [0, 10], show: [1, 1, 1, 0] } } } },
});
const pose = samplePose(c, c.animations.sway, 1);
console.log(pose.get('body'));  // { x: 0, y: 0, rot: 5, sx: 1, sy: 1, show: true }   (t = 0.25: halfway from 0 to 10)
console.log(pose.reachMiss);    // []
```

### `samplePoseAt`

```ts
samplePoseAt(compiled: CompiledSpec, anim: CompiledAnimation | null, t: number): Pose
```

The pose at normalised time `t`, with tracks and `reach` constraints but **without** follow-through.
Follow-through is a simulation over the whole animation and is only defined per frame; see
[`followOffsets`](#followoffsets).

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `anim` | CompiledAnimation \| null | required | `null` gives the rest pose. |
| `t` | number | required | Normalised time, 0..1. |

**Returns** a [pose](#pose).

### `followOffsets`

```ts
followOffsets(compiled: CompiledSpec, anim: CompiledAnimation): Map<string, number[]> | null
```

**Low-level.** Simulates follow-through for every part with `follow`: each is a damped angular spring
hanging from its pivot, pushed by the acceleration of its pivot and its parent's angular
acceleration. The simulation runs 8 substeps per frame; looping animations are simulated for four
cycles and only the last is recorded, so the loop is seamless.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `anim` | CompiledAnimation | required | |

**Returns** `null` if no part has `follow` or the animation has fewer than 2 frames; otherwise a Map
from part id to an array of `anim.frames` rotation offsets in degrees (rounded to 0.01, clamped to
±`follow.max`). `samplePose` adds `offsets[f]` to `rot`.

**Caching**: results are cached per `anim` object (a `WeakMap`). A later call with the same
animation object returns the cached value even if you pass a different compiled spec or have
mutated the animation. Compile again rather than mutating a compiled spec.

```js
import { compile, followOffsets } from './src/core/index.js';

const c = compile({
  materials: { fur: '#c8692e' },
  parts: [
    { id: 'body', pivot: [50, 70], shapes: [{ type: 'circle', cx: 50, cy: 60, r: 15, material: 'fur' }] },
    { id: 'tail', parent: 'body', pivot: [36, 60], follow: 1,
      shapes: [{ type: 'capsule', x1: 36, y1: 60, x2: 20, y2: 50, r: 3, material: 'fur' }] },
  ],
  animations: { hop: { frames: 8, tracks: { body: { y: { wave: 8, shape: 'bounce' } } } } },
});
const offs = followOffsets(c, c.animations.hop);
console.log([...offs.keys()], offs.get('tail').length);  // [ 'tail' ] 8
```

## Rig maths and IK

**Low-level.** Matrices are 2D affine transforms as 6-element arrays `[a, b, c, d, e, f]`, mapping
`(x, y)` to `(a·x + c·y + e, b·x + d·y + f)`. A part's local matrix is
`T(pivot + (x, y)) · R(rot) · S(sx, sy) · T(−pivot)`; its world matrix is its parent's world matrix
times its local matrix. World matrices map rest-pose canvas coordinates (as the shapes are written)
to posed canvas coordinates.

### `worldMatrices`

```ts
worldMatrices(parts: CompiledPart[], pose: Pose, adjust?: (t) => void):
  { world: Map<string, number[]>, visible: Map<string, boolean> }
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `parts` | CompiledPart[] | required | Usually `compiled.parts`. Each needs `id`, `pivot` and `parent`. |
| `pose` | Pose | required | Must have an entry for every part. |
| `adjust` | `(t) => void` | none | Called with a copy of each part's transform before its matrix is built; modify it in place. The renderer uses this for pixel snapping. The pose itself is not changed. |

**Returns** `{ world, visible }`: the world matrix of every part, and whether the part and all its
ancestors have `show` true.

```js
import { compile, samplePose, worldMatrices } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [
    { id: 'arm', pivot: [50, 50], shapes: [{ type: 'capsule', x1: 50, y1: 50, x2: 70, y2: 50, r: 3, material: 'skin' }] },
    { id: 'hand', parent: 'arm', pivot: [70, 50], shapes: [{ type: 'circle', cx: 72, cy: 50, r: 3, material: 'skin' }] },
  ],
  animations: { raise: { frames: 1, tracks: { arm: { rot: -90 } } } },
});
const { world, visible } = worldMatrices(c.parts, samplePose(c, c.animations.raise, 0));
const [a, b, cc, d, e, f] = world.get('hand');
const at = ([x, y]) => [a * x + cc * y + e, b * x + d * y + f].map((v) => Math.round(v * 100) / 100);
console.log(at([70, 50]), visible.get('hand'));  // [ 50, 30 ] true   (the wrist, rotated up)
```

### `solveReach`

```ts
solveReach(parts: CompiledPart[], pose: Pose, r: object, target: [x, y], aim?: number | null): number
```

Solves one `reach` constraint in place: rotates the parts of `r.chain` (and orients `r.end` when
`aim` is given) so that the point `r.tip` on the end part lands on `target`. It uses cyclic
coordinate descent (32 iterations, stopping early within 0.05 units) and, if the first attempt misses
by more than 0.05 units, retries from four perturbed starting rotations and keeps the best result.
`samplePoseAt` calls it for every constraint of the animation.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `parts` | CompiledPart[] | required | `compiled.parts`. |
| `pose` | Pose | required | Modified in place: the `rot` of chain parts (and `end`). Current rotations are the starting guess. |
| `r.chain` | string[] | required | Part ids, root first. |
| `r.end` | string | last of `chain` | The part carrying the tip. |
| `r.tip` | `[x, y]` | required | Point on `end`, in rest-pose canvas units. |
| `r.limits` | `{ [partId]: [min, max] }` | none | Clamp for that part's pose `rot` in degrees (absolute value, including its base `rot`). |
| `target` | `[x, y]` | required | World point in canvas units (already sampled; not a track value). |
| `aim` | number \| null | none | World rotation of `end` in degrees. With it, `end` keeps that angle and only the other chain parts move. |

**Returns** the remaining distance in units between tip and target.

```js
import { compile, samplePoseAt, solveReach } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [
    { id: 'upper', pivot: [30, 50], shapes: [{ type: 'capsule', x1: 30, y1: 50, x2: 50, y2: 50, r: 3, material: 'skin' }] },
    { id: 'lower', parent: 'upper', pivot: [50, 50], shapes: [{ type: 'capsule', x1: 50, y1: 50, x2: 70, y2: 50, r: 3, material: 'skin' }] },
  ],
});
const pose = samplePoseAt(c, null, 0);
const miss = solveReach(c.parts, pose, { chain: ['upper', 'lower'], tip: [70, 50] }, [55, 30]);
console.log(miss < 0.05);  // true
console.log(Math.round(pose.get('upper').rot), Math.round(pose.get('lower').rot)); // -2 -74
```

### `overflowForPose`

```ts
overflowForPose(compiled: CompiledSpec, pose: Pose, margin?: number):
  { part: string, edge: 'left' | 'right' | 'top' | 'bottom', amount: number }[]
```

How far each visible part sticks out of the canvas in one pose. Shapes are approximated by points
sampled just inside their outline (every 0.75 units); `cut` shapes and hidden parts are ignored.
`minDetail`/`maxDetail` are not considered (every shape counts).

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `pose` | Pose | required | |
| `margin` | number | `0` | Only overflows larger than this (units) are reported. |

**Returns** one entry per part and edge whose overflow exceeds `margin`; `amount` is in units.

```js
import { compile, samplePoseAt, overflowForPose } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'ball', x: 30, shapes: [{ type: 'circle', cx: 80, cy: 50, r: 10, material: 'skin' }] }],
});
console.log(overflowForPose(c, samplePoseAt(c, null, 0)));
// [ { part: 'ball', edge: 'right', amount: 19.5 } ]   (centre at x 110, radius 10; samples lie just inside the outline)
```

## Lint

### `checkBounds`

```ts
checkBounds(compiled: CompiledSpec, options?: { margin? }): Warning[]
```

Poses every frame of every animation (with [`samplePose`](#sampleposecompiled-anim-f)) and reports
parts that leave the canvas (they would be clipped in the sheet) and `reach` constraints whose tip
misses its target by more than 1 unit.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `options.margin` | number | `0.5` | Overflow in units to tolerate. |

**Returns** an array of warnings. Each has `path` and `message` (so it can be printed like a
`validate` issue) plus structured fields:

| Kind | Fields |
|---|---|
| Overflow, one per animation, part and edge | `{ path: "$.animations.<anim>", message, anim, part, edge, frames: number[], amount }`; `amount` is the largest overflow over those frames. |
| Reach miss, one per constraint | `{ path: "$.animations.<anim>.reach[<i>]", message, anim, reach: i, frames: number[], amount }`; `amount` is the largest miss. |

Overflow messages read like `"head" goes 8.2 units past the right edge in frames 2–7 (it will be clipped)`
(or `in every frame`). Reach messages suggest moving the target, relaxing limits/aim or adding a part
to the chain.

```js
import { compile, checkBounds } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'ball', shapes: [{ type: 'circle', cx: 80, cy: 50, r: 10, material: 'skin' }] }],
  animations: { roll: { frames: 4, tracks: { ball: { x: [0, 20, 0, 0] } } } },
});
for (const w of checkBounds(c)) console.log(w.path, w.frames, w.message);
// $.animations.roll [ 1 ] "ball" goes 9.5 units past the right edge in frame 1 (it will be clipped)
```

## Motion

### `MOTION_MODELS`

```ts
MOTION_MODELS: ['gait', 'idle', 'pose', 'hop', 'jump', 'climb', 'fall', 'sit']
```

The motion models a figure animation can use, by name or through a preset's `model`. See
[SPEC.md, Motions](SPEC.md#motions) and [figures.md](figures.md).

### `LEGGED_MODELS`

```ts
LEGGED_MODELS: ['gait', 'pose', 'jump', 'climb', 'sit']
```

The models that need `rig.legs`. `expandFigure` reports an error when a figure without legs uses one.

### `generateMotion`

```ts
generateMotion(parts: object[], rig: object, m: object):
  { tracks: object, speed: number, speedY: number, wall: number | undefined, events: object[], notes: string[] }
```

**Low-level and unstable.** Generates the tracks for one motion. `expandFigure` calls it for every
animation with `motion`; most callers should write `{ "motion": ... }` in a spec instead. The
character walks in place ("on a treadmill"); feet are planted with IK so that a sprite moved at
`speed` does not slide.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `parts` | object[] | required | Expanded parts: `{ id, parent, pivot, tip, limits?, base: {x, y, rot, sx, sy, show} }`. Bones in leg, neck and head chains need `tip`. `limits` (`[min, max]`) are relative to `base.rot`. |
| `rig` | object | required | The figure's rig roles: `root` (required; must be a part id), `legs: [{ chain, phase?, group? }]` (the last chain entry is the foot), `neck?: string[]`, `head?: string`, `arms?: [{ chain: [upper, lower?], phase? }]`, `tail?: string[]`, `wings?: string[]` (raised and flapped in `fall`, `jump` and `climb`), `shadow?: string`, `view?: "front"`. |
| `m` | object | required | Motion parameters (below). |

Parameters read from `m`, with the defaults applied in `src/core/motion.js`. Their meaning is
described in [SPEC.md, Motions](SPEC.md#motions); those not listed there are marked *.

| Key | Default | Notes |
|---|---|---|
| `model` | `"gait"` | One of `MOTION_MODELS`. `pose` behaves like `idle` but never stabilises the head. |
| `frames`, `fps`, `loop` | `8`, `8`, `true` | |
| `input` | `{}` | Author tracks (`{ [partId]: { [prop]: TrackValue } }`). Root `x`/`y`/`rot` are applied before the feet are solved; any `rot` track on the neck or head turns off head stabilisation. |
| `duty` | `0.6` (`hop`: `0.4`, `climb`: `0.7`) | |
| `stride` | `0` (`climb`: `8`) | Ignored when `speed` is given (`stride = speed × duty × frames / fps`). Forced to 0 for `view: "front"`, except in `climb`. |
| `speed` | derived | |
| `phases` | per-leg `phase`, else `i / legs.length` | Keyed by a leg's first bone id or by leg index. |
| `lift` | `3` | Also how far a climbing foot pulls off the wall. |
| `toeOff`, `toeCurl` | `0` | |
| `bob` | `0` (`fall`: `0.6`) | |
| `bounce` | `"vault"` | Any other value behaves as `"spring"`. |
| `crouch`, `lean`, `rock`, `shift` | `0` (`jump`: `lean` 8) | |
| `breathe` * | `0` | `idle`: vertical breathing amplitude of the hips (units). |
| `sway` * | `0` | `idle`: sideways sway of the body (units), with a matching body and arm rotation. |
| `pulse` | `0` | `idle`: breathing as squash and stretch. |
| `reach` | `0.97` | |
| `head` | `{}` | `steady` (default `0.5`), `offset`, `hold`, `look`, `tilt`, `nod`. |
| `armSwing`, `elbow`, `tail` | `0` | |
| `shadowFade` * | `40` | Height (units) over which the `rig.shadow` part shrinks; it never goes below 30% width. |
| `height`, `squash`, `stretch` | `16`, `0.22`, `0.15` | `hop` only. |
| `phase` * | `0` | `hop` only: shifts the hop cycle. |
| `anticipate`, `air` * | `0.3`, `0.42` | `jump`: launch time and airborne duration as fractions of the animation (landing is capped at 0.92). |
| `dip`, `tuck`, `toePoint` * | `6`, `4`, `25` | `jump`: crouch depth, how far the feet pull up in the air, toe angle in the air. |
| `height` (jump) * | `0` | `jump`: arc height inside the frame; 0 jumps in place so the page moves the sprite between `launch` and `land`. |
| `wall`, `rise`, `footAim`, `armReach` * | `4`, `stride / 2`, `-60`, `150` | `climb`: gap from the front toe to the wall, centre of the foot stroke above the rest toe, foot angle, arm reach (degrees). |
| `kick`, `drop`, `toePoint`, `armsUp`, `wobble` * | `2`, `1.5`, `30`, `140`, `4` | `fall`: leg kick, how far the legs hang, toe angle, arm raise, body wobble. |
| `kick`, `lower`, `legsForward`, `legsUp`, `toePoint` * | `1.5`, `8`, `6`, `6`, `20` | `sit`: leg swing, hip drop to the edge, how far the legs reach out and up, toe angle. |
| `flap`, `wingsUp` * | `40`, `20` | Wing flap amplitude and resting raise for `rig.wings`. |

**Returns** `{ tracks, speed, speedY, wall, events, notes }`:

- `tracks`: `{ [partId]: { [prop]: number | number[] } }` for the parts the motion moves. Arrays have
  `frames × 4` samples (looping) or `(frames − 1) × 4 + 1` (non-looping); a property that never changes
  is a single number. `x`/`y`/`rot` are offsets from the base; `sx`/`sy` are factors. Values are
  rounded to 0.01.
- `speed`: units per second (rounded to 0.01). Non-zero for `gait` with a stride and for `hop`.
- `speedY`: units per second upward (rounded to 0.01). Non-zero for `climb` only.
- `wall`: for `climb`, the x of the wall the feet hold, in units; `undefined` for other models.
- `events`: `[{ u, name, data? }]` with `u` the normalised time (0..1). `gait` and `climb` emit a
  `footstep` per leg at its touchdown (`data: { leg: <first bone of the leg> }`); `hop` emits `land`
  and `takeoff`; `jump` emits `launch` and `land`. `idle`, `pose`, `fall` and `sit` emit none.
- `notes`: up to 6 distinct messages such as `legNear: foot misses its mark by 13.0 units at frame 0.00`.

**Errors**: none of its own. A `rig.root` that is not in `parts` throws a `TypeError`.

```js
import { readFileSync } from 'node:fs';
import { generateMotion } from './src/core/index.js';

const goose = JSON.parse(readFileSync('figures/goose.json', 'utf8'));
const parts = goose.bones.map((b) => ({
  id: b.id, parent: b.parent ?? null, pivot: b.from, tip: b.to, limits: b.limits,
  base: { x: 0, y: 0, rot: 0, sx: 1, sy: 1, show: 1 },
}));
const { tracks, speed, events, notes } = generateMotion(parts, goose.rig, { ...goose.motions.walk });
console.log(speed, tracks.body.y.length, notes); // 23.21 32 []
console.log(events); // [ { u: 0, name: 'footstep', data: { leg: 'legNear' } }, { u: 0.5, name: 'footstep', data: { leg: 'legFar' } } ]
```

## Bundles

### `BUNDLE_FORMAT`

```ts
BUNDLE_FORMAT: 'pixel-sprite/1'
```

The value of `format` in every bundle `buildBundle` produces.

### `buildBundle`

```ts
buildBundle(compiled: CompiledSpec, options: { resolutions?, overrides?, encode, views?, deltas? }): Promise<Bundle>
```

Renders one sprite sheet per resolution (and per resolution again for each skin in
`compiled.skins`) and packs them, with the animation table, `size`, `ground`, baked `points`
([`bakePoints`](#bakepoints)), skin names and `states`, into a [bundle](#bundle) for `<pixel-sprite>`. The bundle format and how the component picks a variant are
described in [runtime.md](runtime.md).

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | |
| `options` | object | `{}` | |
| `options.resolutions` | number[] | `[16, 32, 64]` | Sheet heights in pixels. Rendered and listed in ascending order. Duplicates are not removed. |
| `options.overrides` | object | `{}` | Passed to `resolveStyle` for every resolution. |
| `options.encode` | `(w, h, rgba) => string \| Promise<string>` | required | Turns a sheet into the `image` string: a PNG data URL, or a URL if you store sheets as separate files. Awaited. [`pngBytes`](#pngbytes) makes small (indexed) PNGs in any host. |
| `options.views` | string[] \| false | all | Which extra views to ship (`["front"]`); `[]` or `false` leaves only the main (side) view. Their animations (`idle@back`, `turn@back`, …) are dropped before rendering. Each view adds about a full set of animations to the sheets. |
| `options.deltas` | boolean | `true` | Store a skin as a change to the default sheet (`recolor`, `overlay`) when that is smaller than its own sheet. See [Bundle](#bundle). |

**Returns** a promise of a bundle. `animations` comes from the smallest resolution's sheet meta. `skins`, `states` and `points` are present only when the compiled spec has them. `skinPoints` holds the baked points of each skin whose table differs from the default one (a skin that moves the parts points ride on); it is absent when no skin does.

**Errors**: a missing `encode` rejects immediately with `buildBundle needs an encode(w, h, rgba) function ...`.
Rendering errors propagate.

In Node, encode with [`encodePNG`](#encodepng):

```js
import { compile, buildBundle, BUNDLE_FORMAT } from './src/core/index.js';
import { encodePNG } from './src/node/png.js';

const c = compile({
  name: 'dot',
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: { idle: { frames: 4, tracks: { body: { y: { wave: 2 } } } } },
});
const encode = (w, h, rgba) => 'data:image/png;base64,' + encodePNG(w, h, rgba).toString('base64');
const bundle = await buildBundle(c, { resolutions: [64, 16], encode });
console.log(bundle.format === BUNDLE_FORMAT, bundle.name, bundle.animations);
// true dot { idle: { row: 0, frames: 4, fps: 8, loop: true } }
console.log(bundle.size, bundle.ground);   // [ 100, 100 ] 81.25   (no ground in the spec: scanned from the pixels)
console.log(bundle.variants.map(({ res, lod, frameW, frameH }) => [res, lod, frameW, frameH]));
// [ [ 16, 1, 16, 16 ], [ 64, 3, 64, 64 ] ]
```

In a browser there is no `encodePNG`; a canvas does the job. This is the approach `studio/app.js`
uses (browser only, so it is not part of the Node-tested examples):

```js
// Browser only.
const encode = (w, h, rgba) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return canvas.toDataURL('image/png');
};
const bundle = await buildBundle(compiled, { encode });
```

### `bakePoints`

```ts
bakePoints(compiled: CompiledSpec): { [point]: { [anim]: [x, y, rotDeg][] } } | null
```

**Low-level.** Poses every frame of every animation (with [`samplePose`](#sampleposecompiled-anim-f))
and records where each of `compiled.points` is: its world position in canvas units and the world
angle of its part in degrees, rounded to 0.01. One entry per frame. Returns `null` when the spec has
no points. `buildBundle` stores the result as `bundle.points`, and `exportSheet` turns it into
slices. Positions are in units, so one table serves every resolution; `<pixel-sprite>` scales them
with `el.point(name)` ([runtime.md](runtime.md)).

```js
import { compile, bakePoints } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'arm', pivot: [50, 50], shapes: [{ type: 'capsule', x1: 50, y1: 50, x2: 70, y2: 50, r: 3, material: 'skin' }] }],
  points: { hand: { part: 'arm', at: [70, 50] } },
  animations: { raise: { frames: 3, loop: false, tracks: { arm: { rot: [0, -90] } } } },
});
console.log(JSON.stringify(bakePoints(c)));
// {"hand":{"raise":[[70,50,0],[64.14,35.86,-45],[50,30,-90]]}}
```

`buildBundle` also bakes each skin (`compiled.skins.<name>`) and stores the tables that differ from
the default one under `bundle.skinPoints`.

## Game-engine export

### `exportSheet`

```ts
exportSheet(compiled: CompiledSpec, res: number, options?: { image?, overrides? }):
  { width: number, height: number, rgba: Uint8ClampedArray, json: object }
```

Renders a sprite sheet (as [`renderSheet`](#rendersheet), same layout) and describes it in Aseprite's
"hash" sheet JSON, which Phaser 3 loads with `load.aseprite` + `anims.createFromAseprite` and PixiJS v8
loads with `Assets.load`. `pixel export` ([cli.md](cli.md#export)) writes the two files.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `compiled` | CompiledSpec | required | A compiled spec, or one of `compiled.skins`. |
| `res` | number | required | Frame height in pixels. |
| `options.image` | string | `"sheet.png"` | File name written to `meta.image`; save the PNG under this name next to the JSON. |
| `options.overrides` | object | `{}` | Passed to `resolveStyle`. |

**Returns** the sheet pixels (`width`, `height`, `rgba`; encode them yourself, e.g. with `encodePNG`)
and `json`:

| Key | Content |
|---|---|
| `frames` | One entry per frame, keyed by its running index over all animations (`"0"`, `"1"`, ...), as Aseprite writes with `--filename-format {frame}`: `frame` (rectangle on the sheet), `rotated: false`, `trimmed: false`, `spriteSourceSize`, `sourceSize`, `duration` (ms, rounded; from `durations` when the animation has holds, else `1000 / fps`). |
| `animations` | PixiJS: animation name → its frame keys in order. |
| `meta.frameTags` | One tag per animation: `{ name, from, to, direction: "forward", color }`, plus `repeat: "1"` when the animation does not loop. Phaser ignores `repeat`. |
| `meta.slices` | One per attachment point: `{ name, color, keys: [{ frame, bounds: { x, y, w: 1, h: 1 } }] }`, one key per frame, bounds in frame pixels (from [`bakePoints`](#bakepoints)). |
| `meta.pixelStudio` | `{ name, res, lod, size, ground, animations: { [name]: { fps, loop, speed?, speedY?, wall?, events? } } }`. `ground` is `compiled.ground`, or, when the spec has none, the bottom of the lowest opaque row of the first frame, in units (the same fallback as `buildBundle`). |
| `meta` (other) | `app`, `version`, `image`, `format: "RGBA8888"`, `size: { w, h }`, `scale: "1"`, `layers: []`. |

```js
import { compile, exportSheet } from './src/core/index.js';

const c = compile({
  materials: { skin: '#f2b58c' },
  parts: [{ id: 'body', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, material: 'skin' }] }],
  animations: {
    idle: { frames: 4, tracks: { body: { y: { wave: 2 } } } },
    jump: { frames: 6, fps: 12, loop: false, tracks: { body: { y: [0, -20, 0] } } },
  },
});
const { width, height, json } = exportSheet(c, 16, { image: 'blob.png' });
console.log(width, height, json.animations);
// 96 32 { idle: [ '0', '1', '2', '3' ], jump: [ '4', '5', '6', '7', '8', '9' ] }
console.log(json.meta.frameTags[1]);
// { name: 'jump', from: 4, to: 9, direction: 'forward', color: '#000000ff', repeat: '1' }
```

## Colours and constants

### `parseHex`

```ts
parseHex(hex: string): [r, g, b] | null
```

Parses `#rgb` or `#rrggbb` (the `#` is optional, surrounding whitespace is ignored, case-insensitive).
Returns `null` for anything else.

```js
import { parseHex, toHex } from './src/core/index.js';
console.log(parseHex('#f2b58c'), parseHex('abc'), parseHex('red'));  // [ 242, 181, 140 ] [ 170, 187, 204 ] null
console.log(toHex([242, 181.4, 140]));                                // #f2b58c
```

### `toHex`

```ts
toHex(rgb: [r, g, b]): string
```

Formats a colour as `#rrggbb`, rounding each channel. Channels are not clamped, so pass values in
0..255.

### `buildRamp`

```ts
buildRamp(hex: string, n: number, options?: { hueShift? }): [r, g, b][]
```

Builds the tone ramp the shader quantises into: `n` colours from dark to light, with the base colour
unchanged at index `n ≤ 2 ? 1 : ceil((n − 1) / 2)` (so 2 tones are `[shadow, base]`, 3 are
`[shadow, base, light]`, 5 have the base in the middle). Shadows lose value, gain saturation and drift
toward blue-violet; highlights gain value, lose saturation and drift toward yellow. Near-grey colours
(saturation below 0.08) keep almost no hue.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `hex` | string | required | Base colour. An unparsable value falls back to magenta `#ff00ff`. |
| `n` | number | required | Number of tones. `n ≤ 1` returns `[base]`. |
| `options.hueShift` | number | `1` | Scales the hue drift (the `hueShift` style key). |

**Returns** an array of `n` `[r, g, b]` arrays with integer channels.

```js
import { buildRamp, toHex } from './src/core/index.js';
console.log(buildRamp('#c8692e', 3).map(toHex));                    // [ '#742817', '#c8692e', '#ecac76' ]
console.log(buildRamp('#c8692e', 5, { hueShift: 0 }).map(toHex)[2]); // #c8692e
```

### Constants

| Export | Value | Meaning |
|---|---|---|
| `TEXTURES` | `['noise', 'fur', 'scales', 'stripes', 'checker', 'cloth', 'bricks', 'spots', 'metal']` | Valid material `texture` names. |
| `SHAPE_TYPES` | `['rect', 'ellipse', 'circle', 'capsule', 'polygon']` | Valid shape `type` values. |
| `TRACK_PROPS` | `['x', 'y', 'rot', 'sx', 'sy', 'show']` | Animatable part properties. |
| `MOTION_MODELS` | `['gait', 'idle', 'pose', 'hop', 'jump', 'climb', 'fall', 'sit']` | Motion models. |
| `LEGGED_MODELS` | `['gait', 'pose', 'jump', 'climb', 'sit']` | Motion models that need `rig.legs`. |
| `DETAIL_PRESETS` | see [above](#detail_presets) | Shader settings per detail level. |
| `DETAIL_NAMES` | `{ 1: 'icon', 2: 'sprite', 3: 'portrait' }` | Detail level names. |
| `BUNDLE_FORMAT` | `'pixel-sprite/1'` | Bundle format tag. |
| `MAX_RES` | `512` | The largest frame height `renderAnimation` (and so `renderSheet`, `buildBundle`, `exportSheet`) renders. |

These are plain arrays and objects; they are not frozen. Do not modify them: `validate` and the
renderer read the same objects.

## Node: PNG encoding

### `encodePNG`

```ts
import { encodePNG } from './src/node/png.js';
encodePNG(w: number, h: number, rgba: Uint8ClampedArray | Uint8Array | Buffer): Buffer
```

[`pngBytes`](#pngbytes) with `node:zlib` (deflate level 9): an indexed PNG when the image has at most
256 colours (pixel art nearly always), otherwise 8-bit RGBA with per-row filters. Node only; it is not
exported from `src/core/index.js`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `w`, `h` | number | required | Image size in pixels. |
| `rgba` | typed array | required | At least `w × h × 4` bytes, row-major. It must be a typed array or `Buffer`: the encoder reads `rgba.buffer` and `rgba.byteOffset`, so a plain `Array` fails. |

**Returns** a `Buffer` with the PNG file bytes.

**Errors**: no validation of its own. A plain array (not a typed array or `Buffer`) throws a `TypeError`.

```js
import { writeFileSync } from 'node:fs';
import { createImage } from './src/core/index.js';
import { encodePNG } from './src/node/png.js';

const img = createImage(4, 4, [255, 0, 0, 255]);
const png = encodePNG(img.w, img.h, img.rgba);
writeFileSync('red.png', png);
console.log(png.subarray(1, 4).toString('ascii'), png.length);  // PNG 83 (one colour: indexed)
```


### `pngBytes`

```ts
import { pngBytes } from './src/core/index.js';
pngBytes(w: number, h: number, rgba: Uint8Array, deflate: (raw: Uint8Array) => Uint8Array | Promise<Uint8Array>): Uint8Array | Promise<Uint8Array>
```

The encoder behind `encodePNG`, for any host: you supply zlib. Writes an indexed PNG (palette, tRNS,
1/2/4/8 bits per pixel) when the image has at most 256 RGBA colours, else RGBA8 with the smallest
filter per row. Returns synchronously when `deflate` does, a promise when it returns one. In a browser:

```js
const deflate = async (raw) => new Uint8Array(await new Response(
  new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const png = await pngBytes(sheet.width, sheet.height, sheet.rgba, deflate);
```

Sheets come out 35–45% smaller than with `canvas.toDataURL()` (which writes RGBA). The studio uses
this for its bundles.

### `paletteOf`

```ts
paletteOf(rgba: Uint8Array | Uint8ClampedArray): { colours: number[], idx: Uint8Array } | null
```

**Low-level.** The palette `pngBytes` uses for indexed PNGs. `colours` are the image's distinct colours
as `0xRRGGBBAA` numbers, with every fully transparent pixel counted as one colour (`0`) and colours that
are not fully opaque listed first; `idx` holds each pixel's index into `colours`. Returns `null` when
the image has more than 256 colours.

```js
import { createImage, paletteOf } from './src/core/index.js';

const img = createImage(3, 1, [255, 0, 0, 255]);
img.rgba.set([0, 0, 0, 0], 4);                 // middle pixel transparent
const { colours, idx } = paletteOf(img.rgba);
console.log(colours.map((c) => c.toString(16).padStart(8, '0')), idx);
// [ '00000000', 'ff0000ff' ] Uint8Array(3) [ 1, 0, 1 ]
```

## Internal helpers

The source modules export more than `src/core/index.js` re-exports. These are internal: they are not
part of the public API and may change or disappear without notice.

| Module | Internal exports |
|---|---|
| `rig.js` | `mul`, `invert`, `localMatrix`, `apply`, `angleOf`, `ccd` |
| `shapes.js` | `compileShape`, `sdEllipse`, `sdRoundRect`, `sdCapsule`, `sdPolygon` |
| `textures.js` | `sampleTexture`, `hash2` |
| `color.js` | `rgbToHsl`, `hslToRgb`, `rgbToHsv`, `hsvToRgb`, `baseIndex`, `darken` |
| `image.js` | `checker` |
| `motion.js` | `OVERSAMPLE` (4 samples per frame in generated tracks) |
| `shapes.js` (tables) | `SHAPE_REQUIRED` (required numeric keys per shape type) and `SHAPE_KEYS` (other allowed keys per type); plug-in shapes are added to both |
| `bundle.js` | `keepViews(compiled, views)` (the compiled spec without the views not listed; `buildBundle`'s `views` option), `skinDelta(base, skin)` (a skin sheet as `recolor` + `overlay`, or `null`), `groundFromPixels(sheet, size)` (the fallback foot line used by `buildBundle` and `exportSheet`) |
| `spec.js` | `skinSpec(spec, patch)`: the plain spec a skin produces (the spec without `skins` and `states`, merged with the patch by `mergeVariant`); `compile` and `validate` use it |

## Plug-ins

Add shapes, textures and motion models without changing the engine. Registrations are process-wide and must happen
before specs that use them are validated. Bundles stay pure data, so pages need nothing extra.

```ts
registerShape(type: string, { required?: string[], keys?: string[], compile(shape): { sdf(x, y): number, R: number, bbox: [x0, y0, x1, y1] }, describe?: string }): void
registerTexture(name: string, fn: (x: number, y: number, scale: number) => number, { describe?: string }?): void
registerMotion(name: string, { generate(ctx): { tracks, speed?, speedY?, wall?, events?: { u, name, data? }[] }, legged?: boolean, describe?: string }): void
registeredPlugins(): { kind: 'shape' | 'texture' | 'motion', name, describe, ... }[]
usePlugin(module: { default: (api) => void } | ((api) => void)): Promise<void>
```

- **Shapes.** `required` keys must be numbers; `keys` are other allowed keys (unknown ones get did-you-mean warnings).
  `compile` returns a signed distance in part-local units (negative inside), the thickness `R` used for lighting, and a
  bounding box that contains the shape.
- **Textures** return a brightness offset of about −1..1 (clamped to ±1.5) for integer part-local pixel coordinates;
  `scale` is the material's `textureScale` in pixels per feature.
- **Motions** get `{ parts, rig, params, samples, loop, frames, fps }` and return tracks keyed by part id with `x`, `y`,
  `rot` (added to the rest pose) and `sx`, `sy` (multiplied), each a number or an array of exactly `samples` values
  (`frames × 4` for loops, `(frames − 1) × 4 + 1` otherwise). Events use normalized time `u` (0..1) and become frame
  numbers like the built-in models' events. `legged: true` requires `rig.legs`.
- Names start with a letter and use letters, digits, `_` or `-`; reusing a name throws.

```js
import { usePlugin, resolveSpec, compile } from 'pixel-studio';
await usePlugin(await import('./examples/plugins/extras.mjs'));   // star shape, feathers texture, float motion
```

