# CLI: `pixel`

`bin/pixel.mjs` is the command-line interface to the engine. An agent (or a person) uses it to check a spec, look at it as an image or as text, find joint positions, build the bundle a web page plays, and export a sprite sheet for game engines. It needs Node 20 or later and has no dependencies.

The spec format is documented in [SPEC.md](SPEC.md) (also printed by `pixel brief`). The figure library is documented in [figures.md](figures.md). Bundles and the `<pixel-sprite>` element are documented in [runtime.md](runtime.md); the `<pixel-stage>` page runtime that plays bundles across a whole page is in [stage.md](stage.md). The JavaScript API behind these commands is in [api.md](api.md).

- [Running it](#running-it)
- [Arguments and flags](#arguments-and-flags)
- [Exit codes and output streams](#exit-codes-and-output-streams)
- Commands: [validate](#validate) · [preview](#preview) · [ascii](#ascii) · [render](#render) · [export](#export) · [bundle](#bundle) · [resolve](#resolve) · [where](#where) · [figures](#figures) · [brief](#brief) · [bare figure names](#bare-figure-names) · [help](#help)
- [Style override flags](#style-override-flags)
- [npm scripts](#npm-scripts)
- [scripts/serve.mjs](#scriptsservemjs)

## Running it

From a checkout:

```bash
node bin/pixel.mjs <command> [args]
```

`package.json` declares a `pixel` bin, so after installing the package (`npm i github:pavelpascari/pixel-studio`; it is not on npm yet, see [getting-started.md](getting-started.md)) or running `npm link` in the checkout, the same commands run as `pixel <command>` (or `npx pixel <command>`). The examples below use `node bin/pixel.mjs` and are run from the repository root. Output file paths are shortened to `$OUT/` (a scratch directory).

## Arguments and flags

- The first argument is the command. The first positional argument after it is the spec path (or a [figure name](#bare-figure-names)).
- Spec paths are read relative to the current directory. `extends` references inside a spec are resolved relative to the file that names them. Figures are always loaded from the repository's `figures/` directory.
- Flags can be written `--name value`, `--name=value`, or `--name` alone (which means `true`). A value is taken from the next argument only if that argument does not start with `--`.
- `--flip` is a pure switch and never takes the next argument, so `render --flip examples/fox.json` works. `--flip=false` turns it off.
- `--skin <name>` makes `preview`, `ascii`, `render`, `export` and `where` use one of the spec's `skins` ([SPEC.md](SPEC.md)) instead of the default look. A name the spec does not define prints `error   unknown skin "<name>" (skins: <names or none>)` and exits with 1. `bundle` ignores `--skin` because it always bakes every skin; `validate` and `resolve` ignore it too.
- `--plugin ./a.mjs[,./b.mjs]` loads plug-in modules before the command runs: their shapes, textures and motion models become valid in specs, and `brief` lists them for agents. A plug-in default-exports `setup({ registerShape, registerTexture, registerMotion })`; see [api.md](api.md#plug-ins) and `examples/plugins/extras.mjs`. A plug-in that fails to load prints `error: --plugin <path>: <message>` and exits with 1.
- Unknown flags are ignored.

## Exit codes and output streams

| Exit code | Meaning |
|---|---|
| `0` | Success, or no command given (prints help). |
| `1` | Usage error, unreadable or invalid JSON file, spec validation errors, `extends`/figure resolution errors, unknown animation (`--anim` of `preview`, `ascii`, `where`) or part (`where`), unknown `--skin`, an `export --format` other than `aseprite`, or an unknown command (prints help). Any other error (for example a bad style flag value) also exits with 1 and prints one line, `error: <message>`; set `PIXEL_DEBUG=1` to also print the stack trace. |

Fatal errors are printed to stderr as `error: <message>`:

```
$ node bin/pixel.mjs validate
error: missing <spec.json>
$ node bin/pixel.mjs validate nope.json
error: cannot read nope.json: ENOENT: no such file or directory, open 'nope.json'
```

Every command that takes a spec (except `resolve`) validates and compiles it first. Validation warnings and errors are printed as `warning <json-path>: <message>` and `error   <json-path>: <message>`. After compiling, the spec is checked for parts that leave the canvas (bounds warnings). `validate` prints all of these to **stdout**. The other commands print them to **stderr** and stop with exit code 1 if there are errors. Warnings from resolving `extends` and figures go to stderr for every command.

## validate

```
node bin/pixel.mjs validate <spec.json>
```

Checks a spec. Prints warnings, then errors, then (if there are no errors) bounds warnings and a one-line summary: name, part count, material count, and each animation as `name(frames f@fps fps)`. No flags.

Exit code: 0 if there are no errors (warnings allowed), 1 otherwise.

```
$ node bin/pixel.mjs validate examples/fox.json
ok: "Ember the fox" 24 parts, 6 materials, animations: idle(12f@8fps) walk(8f@10fps) trot(8f@16fps) gallop(6f@24fps) leap(8f@12fps) jump(10f@10fps) fall(6f@10fps) duck(8f@6fps) peek(12f@6fps)

$ node bin/pixel.mjs validate examples/goose-root.json
ok: "root (hacker goose)" 48 parts, 13 materials, animations: idle(8f@6fps) waddle(8f@10fps) run(6f@12fps) rush(6f@14fps) honk(10f@10fps) jump(10f@10fps) fall(6f@10fps) sit(12f@6fps) duck(8f@6fps) peek(12f@6fps) climb(8f@12fps) flap(8f@12fps) fly(8f@20fps) hack(8f@10fps) idle@front(8f@6fps) waddle@front(8f@10fps) run@front(6f@12fps) honk@front(10f@10fps) jump@front(10f@10fps) fall@front(6f@10fps) sit@front(12f@6fps) duck@front(8f@6fps) peek@front(12f@6fps) flap@front(8f@12fps) turn@front(4f@12fps) unturn@front(4f@12fps) look@front(8f@6fps) idle@back(8f@6fps) waddle@back(8f@10fps) run@back(6f@12fps) honk@back(10f@10fps) jump@back(10f@10fps) fall@back(6f@10fps) sit@back(12f@6fps) duck@back(8f@6fps) peek@back(12f@6fps) flap@back(8f@12fps) turn@back(4f@12fps) unturn@back(4f@12fps) waddle>idle(3f@6fps) run>idle(3f@6fps) idle>waddle(2f@10fps)
```

`goose-root` has a front and a back view (`idle@front`, `turn@back`, ...) and transition clips (`waddle>idle`); see [SPEC.md](SPEC.md).

A spec with mistakes (typos in keys, a misspelt material, a circle without a centre):

```
$ node bin/pixel.mjs validate bad.json
warning $.parts[0].shapes[0].minDetal: unknown shape property (ignored) — did you mean "minDetail"?
warning $.materials.fur: material is never used
warning $.animations.idle.fsp: unknown animation property (ignored) — did you mean "fps"?
error   $.parts[0].shapes[0].cx: circle needs numeric "cx"
error   $.parts[0].shapes[0].cy: circle needs numeric "cy"
error   $.parts[0].shapes[0].material: unknown material "furr" — did you mean "fur"?
$ echo $?
1
```

A valid spec whose part moves off the canvas:

```
$ node bin/pixel.mjs validate edge.json
warning $.animations.idle: "body" goes 9.8 units past the right edge in frame 1 (it will be clipped)
ok: "edge" 1 parts, 1 materials, animations: idle(4f@8fps)
```

## preview

```
node bin/pixel.mjs preview <spec.json> [--out file.png] [--res 16,32,64] [--cell 128] [--anim a,b] [--skin name] [style flags]
```

Writes a contact sheet PNG: one block per resolution (top to bottom), one row per animation inside each block, one column per frame. Each frame is drawn on a checkerboard at an integer zoom.

| Flag | Default | Description |
|---|---|---|
| `--out` | `<spec name>.preview.png` in the current directory | Output PNG. Parent directories are created. |
| `--res` | `16,32,64` | Comma-separated resolutions (frame heights in pixels), one block each. Every entry must be a whole number from 1 to 512; anything else is an error (see below). |
| `--cell` | `128` | Target cell height in pixels. Each block is zoomed by `max(1, floor(cell / res))`. |
| `--anim` | every animation | Comma-separated animation names: only these rows, in this order. An unknown name exits with 1 and lists the available animations. |
| `--skin` | default look | Preview one of the spec's skins (see [Arguments and flags](#arguments-and-flags)). |
| style flags | | See [Style override flags](#style-override-flags). |

Prints the output path and size, the resolution and detail tier of each block, and the row order:

```
$ node bin/pixel.mjs preview examples/fox.json
wrote fox.preview.png (1640x3728)
blocks top→bottom: 16px [icon], 32px [sprite], 64px [portrait]
rows per block: idle, walk, trot, gallop, leap, jump, fall, duck, peek

$ node bin/pixel.mjs preview examples/fox.json --res 32 --cell 384 --out $OUT/fox-32.png
wrote $OUT/fox-32.png (4712x3552)
blocks top→bottom: 32px [sprite]
rows per block: idle, walk, trot, gallop, leap, jump, fall, duck, peek

$ node bin/pixel.mjs preview examples/fox.json --anim walk,idle --res 32 --out $OUT/fox-walk.png
wrote $OUT/fox-walk.png (1640x296)
blocks top→bottom: 32px [sprite]
rows per block: walk, idle

$ node bin/pixel.mjs preview examples/fox.json --res 16,abc
error: --res must be whole numbers 1..512, e.g. 16,32,64 (got "16,abc")
```

## ascii

```
node bin/pixel.mjs ascii <spec.json> [--res 24] [--anim name] [--frame 0|all] [--skin name] [style flags]
```

Renders one frame (or every frame) as text, for agents that cannot see images. Each material gets a letter; `#` is outline and `.` is empty.

| Flag | Default | Description |
|---|---|---|
| `--res` | `24` | Frame height in pixels (one character per pixel). |
| `--anim` | first animation | Animation to render. Must exist. |
| `--frame` | `0` | Frame index, or `all` for every frame of the animation. Indices past the end wrap around. |
| `--skin` | default look | Render one of the spec's skins. |
| style flags | | See [Style override flags](#style-override-flags). |

Each frame is printed as a header line with the legend, the grid, and a blank line:

```
$ node bin/pixel.mjs ascii examples/fox.json --res 16 --anim walk --frame 3
walk frame 3 @16px  legend: f=fur c=cream s=sock e=eye n=nose g=glint #=outline .=empty
................
................
..#......###....
.#c#....#fff#...
.#cc#...#fff#...
.#fcf#..#ffff#..
.#fff#.#fffef#..
.#ffff##fffefn#.
..#ffffffccccn#.
...#fffffcccc#..
...#fffffff##...
....#fffff#.....
....#sfssf#.....
....#ssssss#....
....#ssss#ss#...
.....####.##....
```

The legend lists every material in the spec, even ones not visible in the frame (`g=glint` above).

An unknown `--anim` prints `error: no animation "<name>" (have: ...)` and exits with 1. `--frame` wraps around the animation's frame count.

## render

```
node bin/pixel.mjs render <spec.json> [--res 32] [--out dir] [--skin name] [style flags]
```

Renders the sprite sheet for **one** resolution and writes two files into `--out`:

- `<spec name>.<res>.png`: the sheet (one row per animation, one column per frame; layout in [runtime.md](runtime.md#sprite-sheet-layout));
- `<spec name>.<res>.json`: `{ name, image, res, lod, frameW, frameH, animations }`, where `image` is the PNG's file name and `animations` has the same fields as in a bundle (`row`, `frames`, `fps`, `loop`, and when they apply `speed`, `speedY`, `wall`, `events`, `durations`; see [`animationMeta`](api.md#animationmeta)).

| Flag | Default | Description |
|---|---|---|
| `--res` | `32` | A single resolution. A list such as `16,32` is an error (use `bundle` or `preview` for several). |
| `--out` | `.` | Output directory. Created if missing. |
| `--skin` | default look | Render one of the spec's skins. The file names stay `<spec name>.<res>.*`, so render each skin into its own directory. |
| style flags | | See [Style override flags](#style-override-flags). |

```
$ node bin/pixel.mjs render examples/fox.json --out $OUT/render
wrote $OUT/render/fox.32.png (384x288) + .json

$ cat $OUT/render/fox.32.json
{
  "name": "Ember the fox",
  "image": "fox.32.png",
  "res": 32,
  "lod": 2,
  "frameW": 32,
  "frameH": 32,
  "animations": {
    "idle": { "row": 0, "frames": 12, "fps": 8, "loop": true },
    "walk": { "row": 1, "frames": 8, "fps": 10, "loop": true, "speed": 51.92,
              "events": [{ "frame": 0, "name": "footstep", "data": { "leg": "thighHindNear" } }, ...] },
    ...
    "jump": { "row": 5, "frames": 10, "fps": 10, "loop": false,
              "events": [{ "frame": 3, "name": "launch" }, { "frame": 7, "name": "land" }] },
    ...
  }
}
```

(The JSON is written with two-space indentation; it is shown compacted and shortened here.)

This JSON is not a bundle. Use [`bundle`](#bundle) for `<pixel-sprite>`, or [`export`](#export) for a game engine.

## export

```
node bin/pixel.mjs export <spec.json> [--res 32] [--out dir] [--skin name] [--format aseprite] [style flags]
```

Renders the sprite sheet for **one** resolution, like `render`, but writes the JSON in Aseprite's "hash" sheet format, so game engines load it directly ([`exportSheet`](api.md#exportsheet) in the API):

- `<spec name>[.<skin>].<res>.png`: the sheet (same layout as `render`);
- `<spec name>[.<skin>].<res>.json`: the sheet description:
  - `frames`: one entry per frame, named by its index across all animations (`"0"`, `"1"`, ...), with its rectangle on the sheet and its `duration` in ms (holds included);
  - `meta.frameTags`: one tag per animation (`name`, `from`, `to`, `direction: "forward"`); a non-looping animation also gets `repeat: "1"`;
  - `animations`: a PixiJS map from animation name to its frame names;
  - `meta.slices`: one 1×1 slice per attachment point (`points` in the spec), with one key per frame giving its position in frame pixels;
  - `meta.pixelStudio`: `name`, `res`, `lod`, `size`, `ground`, and per animation `fps`, `loop` and, when present, `speed`, `speedY`, `wall`, `events`.

Phaser 3 reads it with `this.load.aseprite(key, png, json)` and `this.anims.createFromAseprite(key)` (Phaser ignores the tags' `repeat`, so choose looping per animation when you play it, for example `sprite.play({ key, repeat: -1 })`; `meta.pixelStudio.animations.<name>.loop` says which ones loop). PixiJS v8 reads it with `Assets.load(json)`; the spritesheet's `animations` then holds the frame lists for `AnimatedSprite`. Both were checked with the files this command writes (PixiJS 8.6.6, Phaser 3.88).

| Flag | Default | Description |
|---|---|---|
| `--res` | `32` | A single resolution, as for `render`. |
| `--out` | `.` | Output directory. Created if missing. |
| `--skin` | default look | Export one of the spec's skins; its name goes into the file names. |
| `--format` | `aseprite` | The only format. Any other value prints `error   --format: only "aseprite" (also read by Phaser and PixiJS)` and exits with 1. |
| style flags | | See [Style override flags](#style-override-flags). |

Prints the output path, the sheet size, and the number of frames, tags and slices:

```
$ node bin/pixel.mjs export examples/fox.json --out $OUT/export
wrote $OUT/export/fox.32.png (384x288) + .json (78 frames, 9 tags, 3 slices)

$ node bin/pixel.mjs export examples/goose-root.json --skin party --out $OUT/export
wrote $OUT/export/goose-root.party.32.png (384x1344) + .json (326 frames, 42 tags, 3 slices)
```

An excerpt of `fox.32.json`:

```json
{
  "frames": {
    "0": { "frame": { "x": 0, "y": 0, "w": 32, "h": 32 }, "rotated": false, "trimmed": false,
           "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 }, "sourceSize": { "w": 32, "h": 32 }, "duration": 125 },
    ...
  },
  "animations": { "idle": ["0", "1", ..., "11"], "walk": ["12", ..., "19"], ... },
  "meta": {
    "app": "https://github.com/pavelpascari/pixel-studio", "version": "0.1.0", "image": "fox.32.png",
    "format": "RGBA8888", "size": { "w": 384, "h": 288 }, "scale": "1", "layers": [],
    "frameTags": [
      { "name": "idle", "from": 0, "to": 11, "direction": "forward", "color": "#000000ff" },
      ...
      { "name": "jump", "from": 42, "to": 51, "direction": "forward", "color": "#000000ff", "repeat": "1" },
      ...
    ],
    "slices": [{ "name": "nose", "color": "#0000ffff", "keys": [{ "frame": 0, "bounds": { "x": 28, "y": 17, "w": 1, "h": 1 } }, ...] }, ...],
    "pixelStudio": { "name": "Ember the fox", "res": 32, "lod": 2, "size": [100, 100], "ground": 90.5,
                     "animations": { "walk": { "fps": 10, "loop": true, "speed": 51.92, "events": [...] }, ... } }
  }
}
```

## bundle

```
node bin/pixel.mjs bundle <spec.json> [--res 16,32,64] [--views front,back|none] [--external] [--out file.bundle.json] [style flags]
```

Builds a self-contained `pixel-sprite/1` bundle: every animation at every resolution, with each sprite sheet embedded as a PNG data URL. Besides the animation table and the variants, the bundle carries the canvas `size` and the foot line `ground` (both in spec units), the attachment `points` baked per animation and frame, the names of the `skins` and the `states` machine when the spec has them, and, for each skin, one extra variant per resolution tagged with `skin` (stored as a colour swap and overlay of the default sheet when that is smaller). Sheets are indexed PNGs when they have at most 256 colours. The format is described in [runtime.md](runtime.md#bundle-format-pixel-sprite1).

| Flag | Default | Description |
|---|---|---|
| `--res` | `16,32,64` | Comma-separated resolutions, one variant each. Sorted ascending in the output. |
| `--views` | every view | Which extra views to ship (`front`, `front,back`); `none` keeps only the main (side) view. Each view adds about a full set of animations. |
| `--external` | off | Write each sheet (and skin overlay) as a PNG file next to the bundle (`<name>.32.png`, `<name>.32.party.overlay.png`) instead of embedding it, so a page downloads only the size it shows. |
| `--out` | `<spec name>.bundle.json` in the current directory | Output file. Parent directories are created. |
| style flags | | Applied to every variant. `--lod` forces the same tier for all of them. See [Style override flags](#style-override-flags). |

Prints the output path, the size of the JSON in KB, and the resolution of every variant. Skin variants are listed with their skin name: `examples/goose-root.json` has two skins (`party`, `redteam`), so each resolution appears three times (default, then each skin):

```
$ node bin/pixel.mjs bundle examples/fox.json --out $OUT/fox.bundle.json
wrote $OUT/fox.bundle.json (60.3 KB, variants: 16, 32, 64)

$ node bin/pixel.mjs bundle examples/goose-root.json --res 48,24 --out $OUT/root.bundle.json
wrote $OUT/root.bundle.json (100.4 KB, variants: 24, 48, 24 (party), 48 (party), 24 (redteam), 48 (redteam))

$ node bin/pixel.mjs bundle examples/goose-root.json --views none --res 32 --external --out $OUT/web/root.bundle.json
wrote $OUT/web/root.bundle.json (10.2 KB, variants: 32, 32 (party), 32 (redteam))
$ ls $OUT/web
root.32.party.overlay.png  root.32.png  root.32.redteam.overlay.png  root.bundle.json
```

`--res` must be whole numbers from 1 to 512; anything else is an error:

```
$ node bin/pixel.mjs bundle examples/fox.json --res abc
error: --res must be whole numbers 1..512, e.g. 16,32,64 (got "abc")
```

## resolve

```
node bin/pixel.mjs resolve <spec.json> [--out full.json]
```

Prints the spec after resolving its `extends` chain (a variant merged with its base) and its `figure` (bones and motions expanded into parts and tracks). See [SPEC.md](SPEC.md#variants-extends) and [figures.md](figures.md). The result is not validated.

| Flag | Default | Description |
|---|---|---|
| `--out` | stdout | Write the JSON (two-space indent, trailing newline) to this file instead and print `wrote <file>`. The parent directory must exist. |

```
$ node bin/pixel.mjs resolve examples/goose-sudo.json | head -12
{
  "name": "sudo (canada goose, loud)",
  "description": "Plain side-view goose dressed on the goose figure (figures/goose.json). The flock (goose-root, goose-sudo, goose-phreak, goose-kiddie) extends this.",
  "size": [
    100,
    100
  ],
  "materials": {
    "feather": {
      "color": "#33313a",
      "texture": "fur",
      "textureStrength": 0.2

$ node bin/pixel.mjs resolve examples/goose-sudo.json --out $OUT/sudo.full.json
wrote $OUT/sudo.full.json
```

The full output for `goose-sudo.json` is about 15,000 lines, because the figure's motions are expanded into per-frame tracks.

## where

```
node bin/pixel.mjs where <spec.json> [--anim name] [--frame 0] [--part id [--point x,y]] [--skin name]
```

Prints where parts are in canvas units for one frame of one animation, after all motion, tracks and `reach` constraints are applied. Use it to pick `reach` targets or to check where a joint ends up mid-animation.

| Flag | Default | Description |
|---|---|---|
| `--anim` | first animation | Animation name. Unknown names exit with 1 and list the available animations. |
| `--frame` | `0` | Frame index. Wraps around the animation's frame count. |
| `--part` | none | Print only this part. Unknown ids exit with 1. |
| `--point` | the part's pivot | With `--part`: a point `x,y` in the part's rest (canvas) coordinates to transform instead of the pivot. |
| `--skin` | default look | Use one of the spec's skins (it may add, remove or move parts). |

Without `--part`, one line per part: id, rest pivot, world pivot, rotation, and `(hidden)` if the part is hidden in that frame (here the parts of goose-root's front and back views, which show only in their own animations):

```
$ node bin/pixel.mjs where examples/goose-root.json --anim hack
hack frame 0 (canvas 100x100 units)
body         pivot [44,68] → [44,68.1]  rot 3.0°
tail         pivot [27,64] → [27.2,63.2]  rot 1.0°
legFar       pivot [46,72] → [45.8,72.2]  rot -1.6°
...
head         pivot [62,30] → [61.4,34.1]  rot 17.4°
jaw          pivot [70,29] → [67.9,38.9]  rot 0.0°
...
ledsA        pivot [86,70] → [86,70]  rot 0.0°
ledsB        pivot [86,70] → [86,70]  rot 0.0°  (hidden)
laptop       pivot [86,50] → [86,50]  rot 0.0°
front.body   pivot [50,78] → [50,78]  rot 0.0°  (hidden)
...

$ node bin/pixel.mjs where examples/goose-root.json --anim hack --frame 3 --part head --point 90,20
hack frame 3 (canvas 100x100 units)
head [90,20] (rest) → [92.3,41.9]  rot 2.0°

$ node bin/pixel.mjs where examples/goose-root.json --anim nope
error: no animation "nope" (have: idle, waddle, run, rush, honk, jump, fall, sit, duck, peek, climb, flap, fly, hack, idle@front, waddle@front, run@front, honk@front, jump@front, fall@front, sit@front, duck@front, peek@front, flap@front, turn@front, unturn@front, look@front, idle@back, waddle@back, run@back, honk@back, jump@back, fall@back, sit@back, duck@back, peek@back, flap@back, turn@back, unturn@back, waddle>idle, run>idle, idle>waddle)
```

`where` does not take style flags.

## figures

```
node bin/pixel.mjs figures
```

Lists the figure library in `figures/`: for each figure, its bone count, its motions as `name(model)`, its description, and its bone ids. No flags. See [figures.md](figures.md).

```
$ node bin/pixel.mjs figures
blob     3 bones   motions: idle(idle) hop(hop) travel(hop) fall(fall) peek(idle)
         A soft body with no bones to speak of (slime, jelly, ghost). It squashes and stretches but keeps its volume, its top jiggles behind the motion, and its shadow stays on the ground and shrinks as it rises.
         bones: shadow body top
chibi    8 bones   motions: idle(idle) walk(gait) run(gait) jump(jump) fall(fall) sit(sit) duck(idle) peek(idle)
         ...
dog      23 bones   motions: idle(idle) walk(gait) trot(gait) jump(jump) fall(fall) duck(idle) peek(idle) gallop(gait)
         ...
goose-front 12 bones   motions: idle(idle) walk(gait) run(gait) jump(jump) fall(fall) sit(sit) duck(idle) peek(idle) flap(pose) honk(pose)
         ...
goose    13 bones   motions: idle(idle) walk(gait) run(gait) sneak(gait) jump(jump) fall(fall) sit(sit) duck(idle) peek(idle) climb(climb) rush(gait) flap(pose) honk(pose) fly(fall)
         Waterfowl, side view facing right. Short legs that bend backward at the ankle, webbed feet, a long two-part neck, a gaze that stays level while the body rocks.
         bones: body tail legFar shinFar footFar legNear shinNear footNear neck neckUp head jaw wing
human    16 bones   motions: idle(idle) walk(gait) run(gait) jump(jump) fall(fall) sit(sit) duck(idle) peek(idle) climb(climb) sprint(gait) sitDown(pose) standUp(pose)
         ...
```

## brief

```
node bin/pixel.mjs brief
```

Writes `docs/SPEC.md` to stdout, unchanged. It is the agent brief: give it to an agent as its system prompt or instructions. No flags.

```
$ node bin/pixel.mjs brief | head -3
# Pixel Studio character spec (agent brief)

You describe a character as **JSON geometry + materials + animation tracks**. You never paint pixels:
```

## Bare figure names

Any command that takes a spec path also accepts the name of a figure in `figures/` (for example `goose`, `dog`, `blob`). The argument is treated as a figure name when it does not end in `.json` and matches a file `figures/<name>.json`. The command then runs on the spec `{ "figure": "<name>" }`: the bare skeleton, drawn as bones and joints, with every motion of the figure.

```
$ node bin/pixel.mjs preview goose --out $OUT/goose.png
wrote $OUT/goose.png (1640x5768)
blocks top→bottom: 16px [icon], 32px [sprite], 64px [portrait]
rows per block: idle, walk, run, sneak, jump, fall, sit, duck, peek, climb, rush, flap, honk, fly

$ node bin/pixel.mjs validate dog
ok: "dog skeleton" 23 parts, 2 materials, animations: idle(12f@8fps) walk(8f@10fps) trot(8f@16fps) jump(10f@10fps) fall(6f@10fps) duck(8f@6fps) peek(12f@6fps) gallop(6f@24fps)

$ node bin/pixel.mjs ascii blob --res 12
idle frame 0 @12px  legend: b=bone j=joint #=outline .=empty
............
............
............
.....j#.....
....#bb#....
....#bb#....
.....jj.....
....#b#.....
....#b#.....
....#b#.....
.....jj##j..
.....jjbbj..
```

`goose.json` (with the extension) is read as a file path, not a figure name. Without `--out`, `preview goose` writes `goose.preview.png` to the current directory.

## Help

`pixel help` (also `--help`, `-h`, or no command at all) prints the usage summary and exits with 0. An unknown
command prints the same text and exits with 1. The summary is the comment block at the top of `bin/pixel.mjs`.

```
$ node bin/pixel.mjs help
Pixel Studio CLI — the agent's hands and eyes.

  pixel validate <spec.json>                       check a spec, print errors with JSON paths
  pixel preview  <spec.json> [--out p.png] [--res 16,32,64] [--cell 128] [--anim a,b]
                                                   contact sheet: every animation (or those named) × every LOD tier
  pixel ascii    <spec.json> [--res 24] [--anim idle] [--frame 0|all]
                                                   a frame as text (for agents without vision)
  pixel render   <spec.json> [--res 32] [--out dir] [--lod 1|2|3] [--tones n] [--texture 0..1] ...
                                                   sprite sheet PNG + JSON metadata
  pixel export   <spec.json> [--res 32] [--out dir] [--format aseprite]
                                                   sheet PNG + Aseprite JSON (Phaser, PixiJS)
  pixel bundle   <spec.json> [--res 16,32,64] [--views front,back|none] [--external] [--out file.bundle.json]
                                                   self-contained web bundle for <pixel-sprite> (all skins);
                                                   --external writes the sheets as PNG files beside it
  pixel resolve  <variant.json> [--out full.json]   print a variant ("extends") merged with its base
  pixel where    <spec.json> [--anim a] [--frame f] [--part id --point x,y]
                                                   world positions of part pivots (or of a point on a part)
  pixel figures                                    list the figure library (skeletons + motions)
  pixel preview goose                              any command takes a bare figure name instead of a spec

  --skin <name> (preview, ascii, render, export, where): use one of the spec's skins
  style flags (preview, ascii, render, export, bundle): --lod 1|2|3 --tones n --texture 0..1 --dither true|false
                                                        --outline dark|selective|none --light deg --flip
  pixel brief                                      print the agent brief (spec format docs)
  pixel help                                       this text

  --plugin ./a.mjs,./b.mjs (any command): register plug-in shapes, textures and motion models first
  errors print as one line and exit 1; PIXEL_DEBUG=1 adds the stack trace
```

## Style override flags

`preview`, `ascii`, `render`, `export` and `bundle` accept flags that override the shader settings. The order of precedence is: detail-tier preset < the spec's `style` < these flags. The settings themselves are described in [SPEC.md](SPEC.md#style-optional) and [SPEC.md](SPEC.md#detail-levels).

| Flag | Value | Effect |
|---|---|---|
| `--lod` | `1`, `2` or `3` | Force the detail tier (icon, sprite, portrait) instead of choosing it from the resolution (≤ 20 px → 1, 21–40 → 2, > 40 → 3). |
| `--tones` | `2`..`6` | Number of tones in each colour ramp. |
| `--texture` | `0`..`1` | Texture strength. `--texture 0` turns texture off. |
| `--dither` | `true` / `false` | Ordered dithering. Any value other than `false` (including the bare flag) turns it on. |
| `--outline` | `none`, `dark`, `selective` | Silhouette outline mode. Required value. |
| `--light` | degrees | Light azimuth: 0 = from above, negative = from the left (default -45). |
| `--flip` | switch | Render mirrored horizontally (`--flip=false` turns it off). For web pages, prefer the `flip` attribute of `<pixel-sprite>`. |

`--lod 0` is treated as "not set". Other bad values stop the command with exit code 1: `--lod 4` prints `error: lod must be 1, 2 or 3 (got 4)`, `--tones 0` prints `error: tones must be a whole number 2..6 (got 0)`, and a non-numeric `--texture` or `--light` prints `error: <flag> must be a number (got null)`.

```
$ node bin/pixel.mjs render examples/fox.json --res 64 --lod 1 --tones 2 --texture 0 --dither false --outline dark --light 45 --flip --out $OUT/render
wrote $OUT/render/fox.64.png (768x576) + .json
```

## npm scripts

Defined in `package.json`:

| Script | Command | What it does |
|---|---|---|
| `npm run studio` | `node scripts/serve.mjs` | Starts the static server (see below). Studio at `http://localhost:5173/studio/`, docs site at `http://localhost:5173/site/`, demo pages at `http://localhost:5173/demo/`. |
| `npm test` | `node --test test/*.test.mjs` | Runs the test suite (engine, figure, rig, runtime, plug-in and reference-registry tests) with Node's built-in test runner. |
| `npm run build:demo` | `node scripts/build-demo.mjs` | Copies `src/runtime/pixel-sprite.js` and `src/runtime/pixel-stage.js` to `demo/assets/`, and builds `demo/assets/<name>.bundle.json` (16, 32 and 64 px) and `demo/assets/<name>.poster.png` (the first frame at 64 px, a fallback image for `<pixel-sprite>`) for every `examples/*.json`, plus a 32 px game-engine sheet for `goose-root` (`demo/assets/goose-root.32.png` and `.32.json`, as [`export`](#export) writes). Prints one line per bundle: path, size in KB, animation names. Writes into the repository. |
| `npm run previews` | `node scripts/build-demo.mjs --previews` | Everything `build:demo` does, plus a contact sheet per example in `previews/<name>.png` (16/32/64 px blocks, 96 px cells). |

`build-demo.mjs` resolves `extends` and figures the same way as the CLI, but it does not validate the specs or print bounds warnings, and it does not take style flags.

`package.json` also declares:

- `"bin": { "pixel": "bin/pixel.mjs" }`: the `pixel` command described on this page.
- `"exports"`: `"."` → `src/core/index.js` (the engine API, see [api.md](api.md)), `"./runtime"` → `src/runtime/pixel-sprite.js` (the web component, see [runtime.md](runtime.md)), `"./stage"` → `src/runtime/pixel-stage.js` (the page runtime, see [stage.md](stage.md)), `"./node/png"` → `src/node/png.js` (the Node PNG encoder the CLI uses), and `"./package.json"`.
- `"engines": { "node": ">=20" }`.

## scripts/serve.mjs

A zero-dependency static file server for the studio, the docs site (`site/`) and the demo pages. It serves the repository root.

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `5173` | Port to listen on. |
| `HOST` | `127.0.0.1` | Address to bind. Local-only by default. Set `HOST=0.0.0.0` to serve your network; note that it then serves **every file in the repository** to anyone who can reach it. |

```bash
npm run studio
PORT=8080 npm run studio
HOST=0.0.0.0 npm run studio
```

On start it prints:

```
Pixel Studio  → http://localhost:5173/studio/
Docs site     → http://localhost:5173/site/
Demo website  → http://localhost:5173/demo/
```

Behaviour:

- `/` redirects (302) to `/studio/`.
- A directory serves its `index.html`.
- Paths that resolve outside the repository root get 403. Missing files get 404 (`not found`).
- Responses are sent with `cache-control: no-store`. Content types are set for `.html`, `.js`, `.mjs`, `.css`, `.json`, `.md`, `.png`, `.svg` and `.ico`; other files are sent as `application/octet-stream`.
- `HEAD` requests get headers without a body.
