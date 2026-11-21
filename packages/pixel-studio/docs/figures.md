# Figures and motion models

A **figure** is a reusable skeleton: bones drawn as dots and lines, the roles those bones play (root, legs,
arms, head, tail), and a library of **motions** that move them realistically. A character spec picks a figure,
dresses its bones with shapes, and gets planted feet, steady heads and follow-through without writing a single
keyframe.

This document covers using figures in a character, the motion models and their parameters, and writing a new
figure. For the rest of the spec format see [SPEC.md](SPEC.md); for how expansion fits in the pipeline see
[architecture.md](architecture.md).

- [The library](#the-library)
- [Using a figure](#using-a-figure)
- [Motions](#motions)
- [Motion models in detail](#motion-models-in-detail)
- [Follow-through](#follow-through)
- [Writing a new figure](#writing-a-new-figure)
- [Limits](#limits)

## The library

| figure | view | bones | motions |
|---|---|---|---|
| `goose` | side, facing right | body tail legNear/shinNear/footNear legFar/shinFar/footFar neck neckUp head jaw wing | idle walk run rush sneak · jump fall sit duck peek climb · flap honk fly |
| `human` | side, facing right | hips spine neck head armNear/forearmNear/handNear thighNear/shinNear/footNear (+ `Far` copies) | idle walk run sprint · jump fall sit duck peek climb · sitDown standUp |
| `dog` | side, facing right | body tail tail2 neck head jaw ear, thigh/shin/hock/paw `HindNear`·`HindFar`, arm/forearm/pastern/paw `ForeNear`·`ForeFar` | idle walk trot gallop · jump fall duck peek |
| `goose-front` | front (dress it the other way round for the back) | body tail shinL/footL shinR/footR neck neckUp head jaw wingL wingR | idle walk run · jump fall sit duck peek · flap honk |
| `chibi` | front | body legL footL legR footR armL armR head | idle walk run · jump fall sit duck peek |
| `blob` | any (no limbs) | shadow body top | idle hop travel · fall peek |

The motions after the dot are for characters that live on a web page ([stage.md](stage.md)): jumping between cards,
falling, sitting on an edge, ducking and peeking behind things, climbing a card's side.

Each figure also defines **attachment points** (`points`: goose `beak` `head` `tail`; human `head` `handNear` `handFar`;
dog `nose` `head` `tail`; goose-front `beak` `head`; chibi `head` `handL` `handR`; blob `top`), baked per frame into bundles, and its **foot line**
(`ground`: the lowest toe, or the shadow's line), so pages can stand a character exactly on an element.

```bash
node bin/pixel.mjs figures          # list figures, bones and motions
node bin/pixel.mjs preview dog      # contact sheet of the bare skeleton, every motion
npm run studio                      # then open http://localhost:5173/studio/figures.html
```

The figure viewer (`studio/figures.html`) plays each motion smoothly between frames, scrolls the ground at
the motion's speed, leaves trails where the feet touch down (a planted foot leaves a dotted line that moves
away with the ground at exactly the ground's speed), and can overlay every frame (onion skin).

Every example in `examples/` is built on a figure: the geese on `goose` (with `goose-front` for their front and back
views; `goose-greylag` fitted to its own proportions), `fox` on `dog`, `pip` and `robot` on `chibi`, `slime` on
`blob`, and `moss` on an inline figure of its own.

## Using a figure

```json
{
  "name": "Ember the fox",
  "figure": {"use": "dog", "bones": {"neck": {"from": [60, 57], "to": [64, 49]}}},
  "materials": {"fur": {"color": "#e0702a", "texture": "fur"}},
  "parts": [
    {"id": "body", "shapes": [{"type": "ellipse", "cx": 46, "cy": 63, "rx": 21, "ry": 11, "material": "fur"}]},
    {"id": "eye", "bone": "head", "pivot": [72, 42], "shapes": [{"type": "circle", "cx": 72, "cy": 42, "r": 2.6, "material": "fur"}]}
  ],
  "animations": {
    "idle": {"motion": "idle", "tracks": {"eye": {"show": [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1]}}},
    "walk": {"motion": "walk"},
    "creep": {"motion": "walk", "stride": 8, "crouch": 3, "fps": 6}
  }
}
```

### `figure`

| form | meaning |
|---|---|
| `"dog"` | use the figure as it is |
| `{"use": "dog", ...fit}` | use it, fitted to this character (below) |
| `{"bones": [...], "rig": {...}, "motions": {...}}` | an inline figure object (same format as a figure file) |

Fitting options:

| key | default | meaning |
|---|---|---|
| `scale` | `1` | scale every bone about `origin` |
| `origin` | `[size[0]/2, size[1]]` (bottom centre) | the fixed point for `scale` |
| `offset` | `[0, 0]` | move every bone |
| `bones` | `{}` | per-bone patches, applied after scale/offset: `{"neck": {"from": [60, 57], "to": [64, 49]}}`. Any bone field can be patched (`from`, `to`, `z`, `limits`, `follow`, …). An unknown bone id is an error. |

Patching a bone moves only that bone. Its children keep their own `from`/`to`, so when you move a joint, move
the bones attached to it too (the robot in `examples/robot.json` patches every bone of `chibi`).

### Dressing bones

Every bone becomes a part with the bone's id, its joint as `pivot` and an empty shape list. A part in your
spec with the **same id** dresses the bone: its fields are merged into the bone's part. Draw its shapes in the
figure's rest pose, in canvas coordinates (not relative to the bone). Fields you set win over the bone's
(`z`, `shade`, `pivot`, `follow`, `x`, `y`, `sx`, `sy`, `show`). Bones you do not dress are invisible but still
move, so their children still follow them.

A part with **`"bone": "<id>"`** is a new layer attached to that bone: its `parent` is the bone, its `pivot`
defaults to the bone's joint (`from`) and its `z` to the bone's `z + 0.5`. Use layers for eyes, hats, gear,
scarves and anything that should move or be shown separately. Plain parts (no `bone`, id not a bone) pass
through unchanged, so a layer can also hang from another layer with `"parent"`.

With **no `parts`** the bare skeleton is drawn: every bone as a line with dots at its joints (materials
`bone` and `joint`). This is what `pixel preview <figure>` shows.

Side-view figures name limbs `Near` (toward the viewer) and `Far`. Far bones get `shade: -0.3` automatically, and the
library gives them a lower `z`, so they read as behind the body.

### Animations

`{"motion": "<name>"}` uses one of the figure's motions. Any key next to it overrides that motion's
parameters (`frames`, `fps`, `stride`, `crouch`, `head`, …). `"motion"` can also be a model name
(`"gait"`, `"idle"`, `"pose"`, `"hop"`, `"jump"`, `"climb"`, `"fall"`, `"sit"`; see [Motions](#motions)) with all
parameters given inline. With **no `animations`** the
character gets every motion of its figure.

Animations without `motion` are ordinary hand-keyed animations and are left alone.

Generated tracks are sampled four times per frame (`OVERSAMPLE = 4`). The extra samples give follow-through
smooth input and keep interpolation between frames faithful.

### Your tracks on top of a motion

`tracks` next to `motion` layer on top of the generated motion:

| track | how it combines |
|---|---|
| root `x`, `y`, `rot` (e.g. `body`, `hips`) | applied **before** the legs are solved, so feet stay planted while you move the body |
| neck/head `rot` | replaces head stabilization for that animation |
| any other `x`, `y`, `rot` | added to the generated value |
| `sx`, `sy` | multiplied |
| `show` | replaces |

A figure's library motion can carry `tracks` (and `events`, `holds`) of its own, for a move that is a model plus a
pose: the goose's `rush` is its run with the wings beating and the neck out, and `flap` and `honk` are `pose`
motions. A spec's `tracks` override the library's part by part and property by property.

The `pose` model generates nothing of its own, so it is the way to hand-key a gesture on a figure while the
feet stay planted:

```json
"honk": {"motion": "pose", "frames": 10, "loop": false, "tracks": {
  "body": {"rot": [0, 4, 6, 6, 4, 0]},
  "head": {"rot": [0, -20, -30, -30, -20, 0]}
}}
```

### Views: the same character from other angles

A side-view character can also be drawn from the front, from behind, or anything else a figure exists for. Each
view dresses its own figure (a front-view one) with the same materials:

```json
"views": {
  "front": {"figure": "goose-front", "look": {"part": "head", "replaces": "head"},
            "parts": [{"id": "body", "shapes": [...]}, {"id": "head", "shapes": [...]}, ...],
            "animations": {"idle": {"motion": "idle"}, "waddle": {"motion": "walk"}}},
  "back":  {"figure": "goose-front", "parts": [...]}
}
```

- The view's parts join the spec as `front.body`, `front.head`, … hidden except in the view's own animations,
  which are named `<animation>@<view>`: `idle@front`, `waddle@back`. Name them like the side animations (`waddle`,
  not `walk`, if the side one is `waddle`): the stage plays `idle@front` where it would play `idle`. Leave
  `animations` out to get every motion of the view's figure.
- Generated for every view: `turn@<view>` (a one-shot from the side to that view: squeeze, swap, unsqueeze) and
  `unturn@<view>` (back to the side).
- `look` copies one of the view's parts (with its children) onto the side figure in place of a side part: a head
  turned toward the viewer on a side body, the three-quarter view. It adds `look@<view>` (the side idle with the head
  turned), and the turns pass through it.
- The figure's attachment points follow the view: `beak` in `idle@front` is the front jaw's tip.
- Variants patch a view like the main spec: `"views": {"front": {"parts": [{"id": "head", "addShapes": [...]}]}}`, or
  `"back": null` to drop one. A variant's `materialMap` applies to every view. Clothes a variant adds to the side view
  are not drawn in the other views until the variant adds them there too (the flock does: root's shades, hood and
  strings, sudo's headphones and bandana, phreak's mask, kiddie's cap). Parts on the front head ride along into the
  three-quarter look.
- Top-level parts hidden by default (`"show": 0`, a prop like root's server rack) stay hidden through the turns.
- `examples/goose-base.json` has front and back views; the whole flock inherits them. `studio/goose.html` shows them,
  and its features have front and back versions.
- Views make bundles bigger: each adds about a full set of animations. Ship only the ones a page uses:
  `pixel bundle goose.json --views front` (or `--views none`), `buildBundle(c, {views: ['front']})`.

### Speed

Every travelling motion (`gait` in side view, `hop` with a `stride`) has a **speed** in canvas units per
second. It is stored on the compiled animation, written to sprite-sheet metadata and to bundles. A page that
moves the sprite at

```
pixels per second = speed × displayed size in px / 100
```

gets feet that do not slide over the ground. `demo/flock.html` moves the geese this way. Front-view walks and
in-place motions have no speed.

## Motions

The figure's motions are presets for these models (plug-ins can add more with `registerMotion`).

| model | what it makes | events |
|---|---|---|
| `gait` | walk, run, trot, sneak: feet planted with IK and swung on real paths, the body rising and falling with the legs, a steady head, arm swing, tail sway | `footstep` {leg} |
| `idle` | breathing, weight shifting over planted feet, a head that looks around (also `duck`, `peek` presets) | |
| `pose` | nothing: your tracks drive the body, the feet stay planted | |
| `hop` | anticipation squash, launch stretch, a gravity arc, landing squash, volume preserved | `land`, `takeoff` |
| `jump` | a legged jump (one-shot): crouch, launch, legs tucked and wings spread in the air, landing dip | `launch`, `land` |
| `climb` | scrambling up a wall in front: feet hold the wall and sweep down at `speedY`, body pitched up, arms reaching | `footstep` {leg} |
| `fall` | legs dangling and kicking, arms up, wings flapping, a wobble | |
| `sit` | hips lowered to the foot line, legs out over an edge and swinging | |

Events are turned into frame numbers (the first frame at or after the moment) and baked into the bundle, where pages
receive them as `pixel-event`. Add your own with `"events": [{"frame": 3, "name": "honk"}]`, or turn the model's off
with `"events": false`.

### Parameters

| param | models | default | meaning |
|---|---|---|---|
| `frames`, `fps`, `loop` | all | 8, 8, true | as for any animation |
| `stride` | gait, hop | 0 | gait: how far a planted foot sweeps per step (units). hop: distance per hop |
| `speed` | gait, hop | | alternative to `stride`: gait stride = speed × duty × cycle time |
| `duty` | gait, hop | 0.6 (hop 0.4) | fraction of the cycle a foot (or the body) is on the ground. Walk 0.6–0.65, trot 0.45, run 0.35–0.4 |
| `lift` | gait | 3 | foot clearance during swing (units) |
| `bob` | gait, fall | 0 (fall 0.6) | hip rise and fall (units); in `fall`, twice per cycle |
| `bounce` | gait | `"vault"` | `"vault"`: highest at mid-stance (walking). `"spring"`: lowest at mid-stance, highest in flight (running, trotting) |
| `crouch` | gait, idle | 0 | lower the hips (units) |
| `lean` | all | 0 (jump 8) | pitch forward (deg; negative leans back, as in `climb`). hop: how far the body tips into the jump. jump: the tip into the crouch and launch |
| `rock` | gait, idle | 0 | side view: body roll twice per cycle (the waddle). Front view: roll toward the standing foot |
| `shift` | gait (front) | 0 | sideways weight shift over the standing foot (units) |
| `toeOff` | gait | 0 | heel lift at the end of stance (deg) |
| `toeCurl` | gait | 0 | toes/paws folding during swing (deg) |
| `armSwing` | gait | 0 | arm swing amplitude (deg); front view: how much arms foreshorten |
| `elbow` | all | 0 | elbow bend (deg) |
| `tail` | all | 0 | tail sway (deg), a travelling wave down the tail chain |
| `phases` | gait | from the rig | per-leg timing, keyed by the first bone of the leg's chain: `{"thighHindNear": 0, "armForeFar": 0, ...}` |
| `reach` | gait | 0.97 | how straight a planted leg may get, as a fraction of its length; the hips are lowered if needed |
| `breathe` | idle | 0 | hip rise and fall (units) |
| `sway` | idle | 0 | sideways weight shift (units), with a matching roll and arm counter-sway |
| `pulse` | idle | 0 | breathing as squash and stretch of the root (0.05 = ±5%) |
| `height` | hop | 16 | apex height (units) |
| `squash` | hop | 0.22 | how much shorter at landing and in the anticipation crouch (0.22 = 22%) |
| `stretch` | hop | 0.15 | how much taller at take-off and landing |
| `phase` | hop | 0 | shift the cycle start |
| `shadowFade` | hop | 40 | the height (units) at which the shadow would vanish; it never gets below 30% |
| `head` | gait, idle | | head behaviour, below |

`head`:

| key | default | meaning |
|---|---|---|
| `steady` | 0.5 | 0 = the head rides the body, 1 = the head holds its place and angle in the world |
| `offset` | `[0, 0]` | move the head's target (units), e.g. `[8, 14]` for a goose sneaking with its head low and forward |
| `tilt` | 0 | constant head angle (deg) |
| `nod` | 0 | nod amplitude (deg), twice per cycle in a gait |
| `look` | 0 | idle: the head drifts around (units) |
| `hold` | 0 | bird head-bob: fraction of each step the head stays still in the world before thrusting forward |

`jump`, `climb`, `fall` and `sit`:

| param | default | meaning |
|---|---|---|
| `dip` | 6 | jump: crouch depth before launch and after landing (units) |
| `tuck` | 4 | jump: how far the feet pull up in the air (units) |
| `anticipate`, `air` | 0.3, 0.42 | jump: when it launches and how long it is airborne, as fractions of the animation (`launch` and `land` fall on those frames) |
| `height` | 0 | jump: rise inside the sprite. 0 = jump in place, the page carries the sprite along its arc |
| `toePoint` | 25 / 30 / 20 | jump, fall, sit: how far the toes point down when the feet are off the ground (deg) |
| `stride`, `duty` | 8, 0.7 | climb: vertical sweep of a planted foot (units) and stance fraction; `speedY` = stride ÷ (duty × cycle time) |
| `wall` | 4 | climb: the wall's distance in front of the rest toes (units); exported as the animation's `wall` x |
| `rise` | stride ÷ 2 | climb: how far above the rest toe the stroke is centred |
| `footAim` | -60 | climb: foot angle on the wall (deg) |
| `armReach` | 150 | climb: arms reaching up the wall (deg) |
| `kick`, `drop` | 2, 1.5 | fall: leg kick and how much lower legs hang (units). In `sit`, `kick` (default 1.5) is the leg swing |
| `wobble` | 4 | fall: body wobble (deg) |
| `armsUp` | 140 | fall: arms raised (deg; outward in front view) |
| `lower` | 8 | sit: how far the hips drop (to sit on the foot line) |
| `legsForward`, `legsUp` | 6, 6 | sit: where the feet go, relative to standing |
| `flap`, `wingsUp` | 40, 20 | figures with `wings`: flap amplitude (deg) in jump, fall and climb; extra lift while falling |

When a parameter would make a planted foot miss its mark (a stride too long for the legs), expansion reports
it as a warning on the animation, with the leg and frame: `thighHindNear: foot misses its mark by 0.8 units
at frame 3.25: shorten the stride or lower "reach"`.

## Motion models in detail

The models live in `src/core/motion.js` (`generateMotion`). They work "on a treadmill": the character stays
in its canvas and the ground moves under it, so a page moves the sprite. Each sample of the cycle is solved
from scratch in this order:

1. **Foot targets.** For each leg, its phase gives where it is in the cycle. In stance (`s < duty`) the toe
   is on the ground and moves backward at a constant rate, `stride × (0.5 − k)`, which is what makes the
   speed exact. Near the end of stance the heel rises (`toeOff`). In swing the toe travels forward on a
   minimum-jerk curve (`10k³ − 15k⁴ + 6k⁵`) and lifts on a skewed sine (`lift`), and the foot curls (`toeCurl`).
   Front view: the stride is 0, so the toe just lifts and sets down in place.
2. **Body height and pitch.** Legs belong to groups (`hind`, `fore`). Each group raises or lowers its end of
   the body by `bob` according to how much support its stance legs give (vault or spring). With two groups
   the height difference becomes body pitch, so a dog's back tips as its front and hind legs alternate.
   Then `crouch`, `rock`, `lean`, `sway`/`shift`, and hop height and squash are applied, then your root tracks.
3. **Hip lowering.** If a leg cannot reach its foot target at `reach` × its length, the hips of that group
   are lowered just enough (up to three refinements). Legs spread wide therefore bend the body down, as
   they do in life.
4. **Head stabilization.** The head's position with the neck at rest is blended toward its rest position by
   `steady`, plus `offset`, `hold` and `look`. The neck chain is solved with CCD IK so the head reaches it at
   the angle `tilt + nod`. Without a neck the head counter-rotates to stay level.
5. **Legs.**
   - Two-bone legs (thigh, shin, foot; e.g. goose, human): exact analytic IK by the law of cosines.
     The knee stays on the side it bends to in the rest pose, so human knees bend forward and bird ankles bend back.
   - Three or more bones (dog): CCD IK, 64 iterations, warm-started from the previous sample, with
     joint `limits`. If it gets stuck against a limit, it retries from a bent seed (each joint in the
     middle of its limits) and keeps the better result.
   - Front view: each leg turns to follow the hips sideways and foreshortens (`sy`) so the ankle
     lands on target. The foot keeps its rest size and angle.
6. **Arms and tail.** Side view: upper arms swing against their legs and elbows bend while swinging forward.
   Front view: arms hang plumb while the body rolls and foreshorten as they swing toward the viewer. The tail
   sways as a wave travelling down its bones.
7. **Shadow.** Hop only: the `shadow` bone follows the body sideways and shrinks with height.

The whole cycle is run twice and only the second pass is recorded, so IK that depends on its previous
solution (CCD) starts the recorded loop from where the cycle ends, and looping animations join seamlessly.
The result is ordinary tracks (`rot` per bone, `x`/`y` for the root, `sx`/`sy` where scaled), which the rest
of the engine treats like hand-written ones.

**Hop.** One cycle starts at landing. Contact (`duty` of the cycle): stretched on impact, squashed to
`1 − squash`, partly recovered, crouched again in anticipation, stretched at push-off. Flight: height
`−height × 4k(1−k)`, a parabola, which is constant gravity; stretch is proportional to vertical speed.
Width follows `sx = 1/√sy`, the volume-preserving rule for a round 3D body. `lean` tips back on landing
and forward at push-off. A travelling hop moves the body backward in the canvas during contact and forward
in flight, so with the page moving at constant speed the body is still on the ground and covers `stride` in
the air.

## Follow-through

`"follow"` on a bone or part makes it a damped angular spring hanging from its pivot. It is pushed by two
inertial effects:

- **The pivot accelerates.** The part's mass, at the area-weighted centre of its shapes (or the middle of
  the bone), lags behind: torque `r × (−a) / |r|²`.
- **The parent turns.** The part resists the turn: `−α` of the parent's world angle.

| key | default | meaning |
|---|---|---|
| `freq` | 3 | natural frequency (Hz). Lower is heavier and slower |
| `damping` | 0.3 | damping ratio. Lower wobbles longer; 1 settles without overshoot |
| `amount` | 1 | scales the driving forces |
| `max` | 40 | clamp (deg) |

`"follow": 0.6` is shorthand for `{"amount": 0.6}`.

The spring is simulated with 8 substeps per frame from the animation's own motion. Looping animations
run four cycles and record the last, so the loop is seamless. The result is cached per animation and added
to `rot` when a frame is sampled (`samplePose`). Because it reacts to the actual motion, it is zero when nothing moves and
works with hand-keyed animations as well as motions.

Good uses: tails (`tail`, `tail2` with slightly different frequencies), ears, wings at rest, scarves,
hoods, antennae, pompoms. In the library: goose tail and wing, goose-front tail and both wings, dog tail, tail2 and
ear, the human's near hand, the blob's top.

## Writing a new figure

A figure is a JSON file in `figures/`. The file name is the name used in specs.

```json
{
  "name": "chibi",
  "description": "Front-facing chibi biped (big head, short legs), walking toward the viewer. ...",
  "size": [100, 100],
  "bones": [
    {"id": "body", "from": [50, 73], "to": [50, 52], "z": 2},
    {"id": "legL", "parent": "body", "from": [44, 73], "to": [44, 86], "z": 1},
    {"id": "footL", "parent": "legL", "from": [44, 86], "to": [44, 92], "z": 1},
    ...
  ],
  "rig": {
    "view": "front",
    "root": "body",
    "legs": [{"chain": ["legL", "footL"], "phase": 0}, {"chain": ["legR", "footR"], "phase": 0.5}],
    "arms": [{"chain": ["armL"], "phase": 0.5}, {"chain": ["armR"], "phase": 0}],
    "head": "head"
  },
  "motions": {
    "idle": {"model": "idle", "frames": 12, "fps": 8, "breathe": 0.6, "sway": 0.5},
    "walk": {"model": "gait", "frames": 8, "fps": 8, "duty": 0.6, "lift": 4, "bob": 1.2, "shift": 1.4}
  }
}
```

### Bones

| field | required | meaning |
|---|---|---|
| `id` | yes | the name characters dress |
| `parent` | | parent bone (omit for the root) |
| `from` | yes | the joint: pivot of the bone, in canvas units |
| `to` | yes | the end of the bone. Child bones usually start here |
| `z` | | draw order (defaults to the bone's index) |
| `side` | | `"far"` for the limb away from the viewer: shaded and dimmed in the viewer |
| `limits` | | `[min, max]` rotation in degrees relative to the rest pose. Used by CCD (3+-bone legs, necks) |
| `follow` | | follow-through spring (see above) |

Draw the rest pose standing on the ground: in the library, toes and paws touch y ≈ 90–93 of a 100×100
canvas. The rest pose matters beyond looks:

- **Two-bone legs bend the way they bend at rest.** Give the knee (or bird ankle) a visible bend in the
  direction it should fold. A perfectly straight leg has no bend direction.
- **The foot bone runs from the ankle to the toe tip.** Its tip is the point that is planted.
- **Leg length** (joint to ankle at rest) is how far the leg can reach. `reach` (default 0.97) keeps planted
  legs from locking straight.

### Rig roles

| role | form | used for |
|---|---|---|
| `root` | bone id | the body that moves: bob, pitch, lean, sway, squash. Required |
| `legs` | `[{chain, phase, group}]` | each leg from hip to foot, foot last. `phase` 0–1 is its timing in the cycle; `group` `"hind"` or `"fore"` makes body pitch. Required for `gait`, `pose`, `jump`, `climb` and `sit` |
| `arms` | `[{chain, phase}]` | upper arm (and forearm). `phase` times the swing; give each arm the phase of the opposite leg, as people swing them |
| `neck` | `[bone ids]` | solved with IK to stabilize the head |
| `head` | bone id | the head |
| `tail` | `[bone ids]` | tail sway, root first |
| `shadow` | bone id | a ground shadow (no parent) that follows the body and shrinks with height in `hop` |
| `wings` | `[bone ids]` | wings that flap in `jump`, `fall` and `climb`; positive rotation raises a wing that points backward |
| `view` | `"side"` (default) or `"front"` | front: no stride, weight shift, foreshortening legs and arms |

Besides the rig, a figure can declare `points` (`{"beak": {"part": "head", "at": "tip"}}`; `at` may be `"tip"`,
`"pivot"` or `[x, y]`, which is fitted with the figure) and `ground` (the foot line, if the automatic one, the lowest
toe or the shadow's line, is wrong).

Leg timing for common gaits (phase of each leg in the cycle):

| gait | hind near | fore near | hind far | fore far |
|---|---|---|---|---|
| bipeds | 0 | | 0.5 | |
| four-legged walk (lateral sequence) | 0 | 0.25 | 0.5 | 0.75 |
| trot (diagonal pairs) | 0 | 0.5 | 0.5 | 0 |

Use the rig's `phase` for the figure's main gait and a motion's `phases` to override it (the dog's trot does).

### Motions

Give a figure at least `idle` and its main gait. Tune them in the viewer (`studio/figures.html` — add the
figure's name to the `FIGURES` list near the top of its script) and check:

```bash
node bin/pixel.mjs validate <name>      # errors, clipped bones, feet that miss their marks
node bin/pixel.mjs preview <name> --out /tmp/<name>.png
npm test
```

`test/figure.test.mjs` runs on every figure in `figures/`, so a new figure is tested automatically: it must
expand without warnings, keep every motion inside the canvas, and leave no foot missing its mark. Add a
dedicated test when the figure introduces a new behaviour (as the front-view and hop tests do).

Tuning hints:

- Set `stride` by eye in the viewer with foot trails on. A planted foot should leave one short dotted line.
  If a foot slides or the validator reports misses, shorten the stride or lower `reach`.
- `duty` above 0.5 always has a foot down (walking). Below 0.5 there is a flight phase (running); pair it
  with `"bounce": "spring"`.
- Keep `bob` small: 1–1.5 units for a walk, 2–3 for a run, in a 100-unit canvas.
- Give trailing parts (tails, ears) `follow` in the figure itself, so every character built on it gets them.
- Describe the figure in `description`: its view, which way it faces, how its joints bend. `pixel figures`
  prints it, and agents choose figures by it.

## Limits

- Parts are rigid. There is no mesh bending between bones, so joints should be hidden by overlapping shapes
  (round capsules at joints, a haunch ellipse over the hip).
- Side-view gaits move along x only. A character walking toward or away from the viewer in a side-view figure
  slides; use a front-view figure, which walks in place.
- In swing, two-bone legs keep their bend direction but are not held to joint limits.
- `hop` is made for limbless bodies. A legged figure's feet simply travel with the body in the air; use `jump` for
  legged figures.
- `climb` is a side-view scramble up a wall in front of the character. Front-view figures have no climb, and a fitted
  character with much shorter legs than its figure may not reach the wall (the gosling variant drops its climb).
- `sit` puts the feet out in front, not straight down: a sitting character's legs would otherwise leave the canvas.
- Motions are generated for one body size per figure. Fitting with `scale` keeps proportions; a character with
  much longer or shorter legs than its figure needs bone patches, and possibly its own `stride`.
