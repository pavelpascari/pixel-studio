# Pixel Studio character spec (agent brief)

You describe a character as **JSON geometry + materials + animation tracks**. You never paint pixels:
the engine rasterizes your shapes into pixel art at any resolution (16, 32, 64 px ...) and applies
shading, texture, dithering and outlines according to the **detail level**. One spec → every size.

## Coordinate system

- Canvas is `size` units, default `[100, 100]`. Origin top-left, **x right, y down**.
- Rotation is in degrees, **positive = clockwise** on screen.
- Keep the character inside roughly x 15..85, y 8..94 so the 1-px outline is not clipped.
  Feet on y ≈ 92 reads as "standing on the bottom".
- At 16 px, 1 pixel ≈ 6 units; at 32 px ≈ 3 units; at 64 px ≈ 1.5 units. Features smaller than
  ~3 units only resolve at higher detail, so gate them with `minDetail` (see below).

## Top level

```json
{
  "name": "Pip",
  "size": [100, 100],
  "materials": { ... },
  "parts": [ ... ],
  "animations": { ... },
  "style": { "outline": "selective", "light": -45 }
}
```

Optional: `figure` (start from a skeleton), `points`, `ground`, `skins`, `states` (all below), `description`.

## Materials

```json
"materials": {
  "skin":  { "color": "#f2b58c" },
  "fur":   { "color": "#c8692e", "texture": "fur" },
  "armor": { "color": "#8a9bb0", "texture": "metal", "shine": 0.8 },
  "eye":   { "color": "#22182c", "flat": true },
  "glow":  { "color": "#fff3a0", "flat": true, "outline": false }
}
```

| field | meaning |
|---|---|
| `color` | base hex colour (required). The engine builds a hue-shifted ramp (cool shadows, warm highlights) around it. Pick mid-value, fairly saturated colours. |
| `texture` | `noise` `fur` `scales` `stripes` `checker` `cloth` `bricks` `spots` `metal`. Shown at detail 2+ only. |
| `textureStrength` | 0..1, default 0.35 |
| `textureScale` | integer ≥ 1, feature size in pixels, default 1 |
| `shine` | 0..1 specular highlight (metal, glass, slime, eyes) |
| `flat` | no lighting: always the exact colour (eyes, mouths, emissive bits) |
| `outline` | `false` to skip outline/inner lines next to this material (glints, glows, blush) |
| `tones` | force the ramp length (2..6) regardless of detail level |

A material may also be just a hex string: `"skin": "#f2b58c"`.

## Parts

Parts are rigid groups of shapes that animate together, like bones. Order of drawing is by `z`
(higher = in front), then array order.

```json
{ "id": "armFront", "parent": "body", "pivot": [37, 56], "z": 6, "shade": 0,
  "shapes": [
    { "type": "capsule", "x1": 37, "y1": 56, "x2": 33, "y2": 68, "r": 4, "material": "tunic" },
    { "type": "circle", "cx": 33, "cy": 70, "r": 4, "material": "skin" }
  ] }
```

| field | meaning |
|---|---|
| `id` | unique name (animation tracks refer to it) |
| `parent` | optional part id. Children inherit the parent's motion (head follows body bob). |
| `pivot` | `[x, y]` the point the part rotates **and scales** around (put it at the feet for a ground-anchored squash) — **shoulder for an arm, hip for a leg, neck for a head**. Default canvas centre. |
| `z` | draw order (default = array index) |
| `shade` | brightness offset, e.g. `-0.35` for the far arm/leg (classic depth cue) |
| `x` `y` `rot` `sx` `sy` | optional rest transform |

All shape coordinates are in canvas units **at rest**; transforms are applied on top.

## Shapes

| type | fields |
|---|---|
| `circle` | `cx cy r` |
| `ellipse` | `cx cy rx ry` (+ `rot`) |
| `rect` | `x y w h` (+ `r` corner radius, `rot`) |
| `capsule` | `x1 y1 x2 y2 r` (+ `r2` for a tapered end) — limbs, tails, ears, mouths, brows |
| `polygon` | `points: [[x,y], ...]` (+ `r` to round it) — hair, capes, spikes, beaks |

Common shape fields:

| field | meaning |
|---|---|
| `material` | material name (required unless `op: "cut"`) |
| `op` | `"cut"` erases what earlier shapes of the **same part** drew (crescents, mouths, holes) |
| `minDetail` / `maxDetail` | only draw at detail levels in range (1 icon, 2 sprite, 3 portrait). Use `minDetail: 2` for blush, buttons, belt buckles; `minDetail: 3` for eye glints, mouths, eyebrows, tiny accessories. Use `maxDetail: 1` for a simplified stand-in (e.g. a single bigger eye at icon size). |
| `profile` | lighting profile: `dome` (default, rounded), `flat` (bevelled edge only — belts, plates, signs), `none` |
| `shade` | brightness offset for this shape only |

Shapes thinner than a pixel are kept 1 pixel wide automatically, so eyes never vanish.

## Animations

```json
"animations": {
  "idle": { "frames": 8, "fps": 8, "tracks": {
    "body": { "y": { "wave": 1.2 } },
    "head": { "y": { "wave": 0.8, "phase": 0.3 } },
    "eyes": { "show": [1, 1, 1, 1, 1, 1, 0, 1] }
  }},
  "walk": { "frames": 8, "fps": 10, "tracks": {
    "body": { "y": { "wave": 2.5, "shape": "bounce" } },
    "legL": { "rot": { "wave": 25 } },
    "legR": { "rot": { "wave": -25 } }
  }}
}
```

- `frames` 1..64, `fps` 1..60, `loop` default `true` (set `false` for one-shot actions like `jump`, `attack`).
- Track properties: `x`, `y` (units, added to rest), `rot` (degrees, added), `sx`, `sy` (multiplied), `show` (1/0).
  `sx`/`sy` waves oscillate around 1 (`{"wave": 0.06}` = 0.94..1.06); arrays/numbers are absolute scale factors.
- Track values:
  - number — constant
  - array — keyframes spread evenly over the loop, linear: `[0, -3, 0, 3]`. An array with exactly
    `frames` entries gives one value per frame.
  - `{"keys": [0, 10, 0], "ease": "smooth" | "linear" | "step"}`
  - `{"wave": amplitude, "phase": 0..1, "cycles": 1, "offset": 0, "shape": "sin" | "tri" | "square" | "bounce"}`
    — `bounce` is `-|sin|` with two bumps per cycle: perfect for a walk-cycle body bob.
- `show` is stepped: use it for blinking (`[1,1,1,1,1,1,0,1]`), mouth shapes, or swapping props.
- Motion is pixel-snapped per resolution, so tiny motions (< ~1/3 pixel) disappear at icon size. That is
  intentional; make important motions ≥ 6 units if they must read at 16 px.
- `holds`: `{"3": 2}` shows frame 3 twice as long (a multiple of the frame time, > 0 and ≤ 16). Use it to hold a key
  pose: the contact frame of a punch, the top of a honk. Each frame keeps its own duration in the bundle.
- `events`: `[{"frame": 3, "name": "honk", "data": {...}}]` marks moments a page can react to (a sound, a speech
  bubble, a camera shake). Pages get them as `spriteevent`. Motion models add `footstep`, `land`, `launch` and
  `takeoff` by themselves; `"events": false` on a motion turns those off.

### Attachment points and the foot line

```json
"points": { "beak": {"part": "head", "at": "tip"}, "hand": {"part": "armR", "at": [67, 70]} },
"ground": 92
```

- `points` names places on parts that pages may need: where a speech bubble starts, where a held item goes. `at` is
  `[x, y]` in the rest pose, or `"tip"` / `"pivot"` of a bone. The bundle records each point's position in every frame.
  Figures already define useful ones (goose `beak`, `head`, `tail`; human `head`, `handNear`, `handFar`; …), and yours
  add to them.
- `ground` is the y of the line the feet stand on. Figures compute it (the lowest toe); set it only for hand-rigged
  characters. Pages use it to stand the character exactly on top of an element.

### Skins

```json
"skins": {
  "party":   { "materials": {"hat": "#ff5fa2"}, "parts": [{"id": "hat", "parent": "head", "shapes": [ ... ]}] },
  "redteam": { "materials": {"hoodie": {"color": "#8e2b3a"}} }
}
```

A skin is a patch like a variant (`parts`, `materials`, `materialMap`, `style`; see Variants below) that every animation
shares. The bundle carries each skin; a page picks one with `<pixel-sprite skin="party">`. Each skin adds about as much
to the bundle as the default look. Preview one with `pixel preview spec.json --skin party`.

### Transition clips

```json
"mixes": { "waddle>idle": {"frames": 3}, "idle>waddle": {"frames": 2, "ease": "linear"} }
```

A mix bakes a few in-between frames from the end of one animation into the start of another (poses are blended, not
pixels). The runtime plays `waddle>idle` when the goose switches from waddle to idle at a natural boundary: on the
waddle's first frame (where a loop ends) or after a one-shot finished. `frames` 1..8 (default 2), `ease` `smooth`
(default) or `linear`. Use them for stops and starts that would otherwise pop.

### State machine

`"states"` lets the page set intent (`speed`, a `honk` trigger) while the character chooses its animations. See
[runtime.md](runtime.md#state-machines) for the full format. In short: `inputs` with starting values (or `"trigger"`),
`nodes` naming an `anim` (with `then` for one-shots and `random` fidgets), `transitions` with
`when` conditions (`speed > 60 && !tired`) and `at` (`now`, `end`, `sync` to keep the stride, or an event name like
`footstep` to stop with the feet together), and `interactions` (`click`, `enter`, `leave` → `fire` or `set`).
Validation checks every node, animation, input and condition.

### Reach: put a point exactly where it needs to be

Hand-tuning rotations to land a beak on a keyboard, a hand on a sword or a foot on a step is slow and
fragile. Instead, add `reach` constraints to an animation; the engine rotates the chain for you, per frame:

```json
"hack": { "frames": 8, "tracks": { "jaw": { "rot": [0, 6, 0, 0] } },
  "reach": [{
    "chain": ["neck", "neckUp", "head"],
    "tip": [84, 26],
    "target": [[80, 83, 79, 84], [46.5, 44, 46.5, 43.5]],
    "aim": [44, 36, 44, 34],
    "limits": { "neck": [-40, 40] }
  }] }
```

| field | meaning |
|---|---|
| `chain` | parts to rotate, root first. Each must be the end part or one of its ancestors. |
| `end` | part that carries the tip (default: last part of `chain`) |
| `tip` | the point on `end` that should reach the target, in **rest-pose canvas units** (the beak tip as drawn) |
| `target` | `[x, y]` in canvas units. Each coordinate is a track value, so it can be keyframed or a wave. |
| `aim` | optional track value: world rotation of `end` in degrees (0 = as drawn). With `aim` the end part keeps that angle and the rest of the chain does the reaching. |
| `limits` | optional `{ "partId": [minRot, maxRot] }` |

Track `rot` values for chain parts are only the starting guess. If a target cannot be reached, validation says
by how much and in which frames: move the target, relax `aim`/`limits`, or add a part to the chain.
Use `node bin/pixel.mjs where spec.json --anim hack --frame 0` to read world positions of pivots (or of any
point with `--part head --point 84,26`) when choosing targets.

## Figures: start from a skeleton that already moves well

`figures/` is a library of skeletons ("dots and lines") with realistic motion models. Run
`node bin/pixel.mjs figures` to list them, `node bin/pixel.mjs preview goose` to see one, or open
`studio/figures.html`. **For any animal, person, robot or blob, start from a figure** instead of
rigging and keyframing by hand.

| figure | bones (dress these ids) | motions |
|---|---|---|
| `goose` | body tail legNear/shinNear/footNear legFar/… neck neckUp head jaw wing | idle walk run sneak jump fall sit duck peek climb |
| `human` | hips spine neck head armNear/forearmNear/handNear thighNear/shinNear/footNear (+ Far) | idle walk run jump fall sit duck peek climb |
| `dog` | body tail tail2 neck head jaw ear, thigh/shin/hock/paw HindNear·HindFar, arm/forearm/pastern/paw ForeNear·ForeFar | idle walk trot jump fall duck peek |
| `chibi` | **front-facing** big-head biped: body legL/footL legR/footR armL armR head | idle walk run jump fall sit duck peek |
| `blob` | soft body (slime, jelly, ghost): shadow body top (`top` jiggles) | idle hop travel fall peek |

The motions after `walk`/`run` exist so characters can live on a web page (`<pixel-stage>`, see
[stage.md](stage.md)): list the ones you want in your animations (`"jump": {"motion": "jump"}`).

Examples dressed on figures: `goose-*` (goose), `fox` (dog, fitted), `pip` and `robot` (chibi, robot fitted with
`bones`), `slime` (blob).

Every bone has a joint (`from`, its pivot) and a `to` point. Coordinates are in the figure's 100×100 canvas.

```json
{
  "figure": "goose",
  "materials": { "feather": "#ece6da", "beak": "#f0862a" },
  "parts": [
    {"id": "head", "shapes": [ {"type": "circle", "cx": 64, "cy": 25, "r": 8.5, "material": "feather"} ]},
    {"id": "eye", "bone": "head", "pivot": [67, 23], "z": 7, "shapes": [ ... ]}
  ],
  "animations": {
    "idle":  {"motion": "idle", "tracks": {"eye": {"show": [1, 1, 1, 1, 1, 1, 0, 1]}}},
    "walk":  {"motion": "walk"},
    "creep": {"motion": "walk", "stride": 8, "crouch": 3, "fps": 6},
    "honk":  {"motion": "pose", "frames": 10, "loop": false, "tracks": {"body": {"rot": [0, 4, 6, 4, 0]}, "head": {"rot": [0, -20, -30, -20, 0]}}}
  }
}
```

- **Dress a bone** with a part whose `id` is the bone id: its shapes ride that bone (draw them in the
  figure's rest pose). Other fields (`z`, `shade`, `sx`, `pivot` …) apply to the bone too.
- **Attach a layer** with `"bone": "<id>"`: a new part parented to that bone (pivot defaults to the bone's joint).
  Use it for eyes, hats, straps, gear. Bones you do not dress are invisible.
- **Fit the figure** to your character with `"figure": {"use": "goose", "bones": {"neck": {"to": [61, 47]}}, "scale": 0.9, "offset": [0, 4]}`.
- With **no `parts`** you get the bare skeleton drawn as dots and lines. With **no `animations`** you get
  every motion in the figure's library.

### Motions

`{"motion": "<name>"}` uses a preset from the figure; any field next to it overrides the preset. The models:

- **`gait`** (walk, run, trot, sneak). The feet follow real paths: planted during stance, lifted and swung forward.
  IK keeps every planted foot exactly on its spot. The hips rise and fall with the legs, and a four-legged figure's back
  pitches between its front and hind legs. The head holds its gaze steady, arms swing against the legs, and the tail sways.
  Each gait has a **`speed`** in units/second, which is exported in the bundle. Move the sprite at that speed
  (`px/s = speed × displayed size / 100`) and the feet do not slide.
- **`idle`**: breathing, weight shifting over planted feet, the head looking around.
- **`pose`**: no motion of its own. Your tracks drive the body and the feet stay planted. Use it for
  honks, attacks and gestures.
- **`hop`**: a ballistic hop. Landing squash, recovery, an anticipation crouch, a push-off stretch, then a
  gravity parabola. Squash and stretch keep the volume (`sx = 1/√sy`), a `lean` tips into the jump and drives the
  follow-through, and the figure's `shadow` bone stays on the ground and shrinks as the body rises. With a
  `stride` it travels, and its `speed` keeps the body still on the ground between hops.
- **`jump`** (one-shot, for legged figures): a crouch, the launch, legs tucked in the air (wings flap), a landing dip.
  It jumps in place (`height` 0) so a page can carry the sprite along its own arc between the `launch` and `land`
  events; give it a `height` for a jump that rises inside the sprite.
- **`climb`**: scrambling up a wall in front of the character. The feet hold the wall and sweep down while the page moves
  the sprite up at `speedY` (exported, like `speed`), the body pitches up (`lean`, negative), arms reach (`armReach`).
- **`fall`**: legs dangling and kicking, arms up (`armsUp`), a wobble; loop it while the sprite drops.
- **`sit`**: sitting on an edge. The hips lower to the foot line (`lower`) and the legs stick out over the edge
  (`legsForward`, `legsUp`) and swing (`kick`).
- `duck` and `peek` are `idle` presets (crouched with the head low; standing tall and looking around) for hiding.

**Front-facing figures** (`chibi`, `"view": "front"` in the rig) walk toward the viewer. There is no stride and the
speed is 0. The hips shift over the standing foot (`shift`) and roll with it (`rock`). A lifted leg foreshortens
as its knee comes toward you, the foot keeps its size, and the arms swing as pendulums that foreshorten when
forward.

| param | meaning |
|---|---|
| `frames`, `fps`, `loop` | as for any animation |
| `stride` (or `speed`) | how far a planted foot sweeps per step (units); `speed` = stride ÷ (duty × cycle time) |
| `duty` | fraction of the cycle each foot is on the ground: walk 0.6–0.65, trot 0.45, run 0.35–0.4 |
| `lift` | foot clearance in swing (units) |
| `bob`, `bounce` | hip rise and fall (units). `"vault"` (walk) is highest at mid-stance; `"spring"` (run/trot) is lowest at mid-stance |
| `crouch`, `lean`, `rock` | lower the hips (units), pitch forward (deg), rock per step (deg, the waddle) |
| `toeOff`, `toeCurl` | heel lift at the end of stance (deg); toes/paws folding during swing (deg) |
| `armSwing`, `elbow` | arm swing (deg) and elbow bend (deg) for figures with arms |
| `tail` | tail sway (deg) |
| `head` | `{"steady": 0..1, "offset": [dx, dy], "tilt": deg, "nod": deg, "look": units, "hold": 0..1}`. `steady` = how much the head ignores body motion; `hold` = bird head-bob (hold still, then thrust) |
| `shift` | front view: sideways weight shift over the standing foot (units) |
| `height`, `squash`, `stretch` | hop: apex height (units), squash at landing and anticipation (0.24 = 24% shorter), stretch at take-off |
| `pulse` | idle: breathing as squash and stretch (0.05 = ±5%), for soft bodies |
| `dip`, `tuck`, `anticipate`, `air` | jump: crouch depth, how far the feet pull up in the air (units), when it launches and how long it flies (fractions of the animation) |
| `wall`, `rise`, `footAim`, `armReach` | climb: the wall's distance in front of the toes, the stroke's height, the feet's angle on the wall, arms reaching up (deg) |
| `kick`, `drop`, `wobble`, `armsUp` | fall: leg kick, how far legs hang, body wobble (deg), arms up (deg) |
| `lower`, `legsForward`, `legsUp` | sit: how far the hips drop, where the feet go |
| `flap`, `wingsUp` | figures with `wings`: flap amplitude while jumping, falling or climbing (deg) |
| `phases` | per-leg timing keyed by the leg's first bone, e.g. a trot moves diagonal pairs together |
| `reach` | how straight a planted leg may get (default 0.97 of its length) |

The complete parameter list (including `breathe`, `sway`, `pulse`, `shadowFade` and the fitting option `origin`)
is in [figures.md](figures.md#parameters).

**Your `tracks` layer on top of the motion.** Tracks on the root bone (body or hips) are applied *before* the feet
are solved, so the feet stay planted. Tracks on the neck or head replace the head stabilization. Everything
else adds: `rot`, `x` and `y` add, and `sx`/`sy` multiply. If a stride is too long for the legs, validation says
which foot misses its mark and in which frame.

### Follow-through

`"follow": 1` (or `{"freq": 3, "damping": 0.3, "amount": 1, "max": 40}`) on a part or bone turns it into a damped
spring hanging from its pivot. It lags behind, overshoots and settles as its parent moves. Use it for tails, ears, hoods,
straps, pompoms and antennae. Lower `freq` gives a heavier, slower swing; lower `damping` gives more wobble. It works
with any animation, not only motions.

## Variants: `extends`

A family of characters (a flock, a team, outfits, enemy tiers) should share one rig. A variant names its base
and lists only the differences:

```json
{
  "extends": "goose-base.json",
  "name": "phreak",
  "materials": { "feather": { "color": "#9a9284" }, "mask": { "color": "#2c2b38", "texture": "cloth" } },
  "materialMap": { "plumage": "hoodie" },
  "parts": [
    { "id": "glasses", "remove": true },
    { "id": "head", "addShapes": [ { "type": "circle", "cx": 59, "cy": 15, "r": 3, "material": "mask" } ] },
    { "id": "wing", "shade": -0.3 },
    { "id": "disk", "parent": "head", "pivot": [80, 30], "shapes": [ ... ] }
  ],
  "animations": { "idle": { "tracks": { "eye": null } }, "sneak": { "frames": 8, "tracks": { ... } } }
}
```

- `materials`: merged per material and per field (`{"color": ...}` keeps the base texture). `null` removes.
- `materialMap`: re-points every shape using one material to another (`"plumage": "hoodie"`).
- `parts`: an entry with an existing `id` patches it (fields replace; `shapes` replaces the list; `addShapes`
  appends); `"remove": true` deletes it **and its children** (and their tracks); a new `id` adds a part.
- `animations`: `null` removes; an existing animation merges (fields replace; tracks merge per part and property,
  `null` removes); a new name adds one.
- Base materials that the variant leaves unused are dropped automatically.
- `extends` paths are relative to the variant file. `node bin/pixel.mjs resolve variant.json` prints the merged spec.

Make the base a plain, accessory-free character with the shared animations; put each personality in a variant.

## Style (optional)

```json
"style": { "outline": "selective", "light": -45, "ambient": 0.15, "curvature": 0.8 }
```

| key | type | meaning |
|---|---|---|
| `outline` | `none` \| `dark` \| `selective` | silhouette outline; selective is tinted by the neighbouring material |
| `outlineColor` | hex | colour for `dark` outlines (default `#1b1424`) |
| `light` | degrees | light azimuth: 0 = from above, -45 = top-left (default), 90 = from the right |
| `elevation` | degrees | light height, default 50 |
| `ambient` | -0.3..0.8 | lifts everything toward the base tone (default 0.15) |
| `curvature` | 0..1 | 0 = flat shapes, 1 = full spheres (default 0.8) |
| `tones` | 2..6 | ramp length per material |
| `texture` | 0..1.5 | texture intensity multiplier |
| `dither` | bool | ordered dithering between tones |
| `innerLines` | bool | dark line where a front part overlaps a back part |
| `contactShadow` | bool | 1-px shadow cast by front parts onto back parts |
| `hueShift` | 0..2 | strength of cool-shadow / warm-highlight hue drift (default 1) |
| `snap` | bool | pixel-snap part motion (default true) |

The detail presets set `tones`, `texture`, `dither`, `outline`, `innerLines` and `contactShadow`; a key in
`style` overrides the preset at **every** detail level. Unknown keys anywhere in the spec produce a warning.

## Detail levels

| level | name | default at | tones | texture | dither | extras |
|---|---|---|---|---|---|---|
| 1 | icon | ≤ 20 px | 2 | off | off | dark outline |
| 2 | sprite | 21–40 px | 3 | 60% | off | selective outline, contact shadows |
| 3 | portrait | > 40 px | 5 | 100% | on | inner lines between overlapping parts |

## Craft tips that matter

1. **Silhouette first.** Readable at 16 px means big simple masses: chunky head (chibi: head ≈ 35–45%
   of height), clear limbs, a distinctive feature (hat, ears, tail, scarf).
2. **Contrast between neighbouring materials** — adjacent parts with similar values merge into mush.
3. **Rig with pivots at joints.** Arms pivot at the shoulder, legs at the hip, head at the neck, tails at
   the base. Make limbs children of the body so they follow its bob.
4. **Far limbs** go behind the body (`z` lower) with `shade: -0.3`.
5. **Eyes are separate parts** (child of head) so they can blink via `show` or squash via `sy`. Give small
   eyes a `flat` material with `"outline": false`; otherwise the outline reads as a heavy eyelid.
6. **Gate detail** with `minDetail` instead of drawing everything at every size.
7. **Small features are at the mercy of the pixel grid.** A 3–6 unit shape covers only 1–2 pixels at 32 px,
   so its exact position decides its shape. For crisp eyes or lights, use rects whose edges sit on the grid
   (multiples of 100/res units, e.g. 3.125 at 32 px). Avoid small head *rotations* on faces (±2° makes the eyes
   flicker between widths); bob with `y` instead.
8. Shapes of the **same material in the same part** are lit as one surface, so overlapping them is seamless.
   Use different materials (or separate parts) where you want a visible edge.
9. There is no transparency or glow; "glowing" means a bright `flat` colour with `"outline": false`.
10. **Long limbs/necks bend better in two segments** (`neck` → `neckUp`, `upperArm` → `forearm`). One rigid
   capsule cannot curve toward a target; two can, and `reach` will use both.
11. **Prefer a figure's motions over hand-made walk cycles.** They plant the feet, time the body bob to the legs
   and stabilize the head, which hand keyframes rarely get right. Keep hand tracks for gestures (`pose`).
12. Idle: subtle (body ±1–2 units, a blink). For a front-facing character use the `chibi` figure, fitted to
   your proportions with `"figure": {"use": "chibi", "bones": {...}}`. Never rotate its legs sideways to fake a step.

## Agent workflow

```
node bin/pixel.mjs figures                   # the skeleton library: start every creature from one of these
node bin/pixel.mjs validate spec.json        # errors with JSON paths; warnings for clipped parts and missed reach targets
node bin/pixel.mjs preview  spec.json --out preview.png   # look at it: every animation × 16/32/64 px
node bin/pixel.mjs preview  spec.json --res 32 --cell 384 --out face.png  # zoom into one tier
node bin/pixel.mjs ascii    spec.json --res 24 --anim idle --frame 0   # text view if you can't see images
node bin/pixel.mjs where    spec.json --anim hack --frame 0            # world positions of pivots (pick reach targets)
node bin/pixel.mjs resolve  variant.json                               # a variant merged with its base
node bin/pixel.mjs bundle   spec.json --out site/hero.bundle.json      # ship it
```

Iterate: draw → preview → critique silhouette, proportions, contrast, motion → adjust → preview again.
Treat validation warnings as bugs: "goes 8 units past the right edge in frames 2–7" means the sprite will be
clipped there. Fix by shrinking the motion, moving the pose, or using `reach` to keep the part where you want it.

## Output contract (when asked to produce a spec)

Respond with exactly one JSON object (no prose around it, no comments inside it).
