# Pixel Studio

**Agents describe characters; the engine draws them as pixel art at every level of detail; websites play them with one tag.**

```
agent ──JSON rig──▶ engine (SDF raster + pixel-art shader) ──▶ bundle (16/32/64 px sheets) ──▶ <pixel-sprite>
          ▲                                                        │
          └──────────── preview PNG / ASCII / validation errors ◀──┘
```

Zero dependencies. Plain ES modules. Node ≥ 20 for the CLI. MIT licensed. Early (0.1): the spec format may still change.

## Try it

```bash
npm run studio            # → http://localhost:5173/studio/  (/site/ for the docs with live examples, /demo/ for the example website)
npm test                  # engine + runtime tests (browser checks: /test/browser/runtime.html)
npm run build:demo        # rebuild demo/assets/*.bundle.json from examples/
```

CLI (the agent's hands and eyes):

```bash
node bin/pixel.mjs validate examples/fox.json
node bin/pixel.mjs preview  examples/fox.json --out fox.png        # every animation × 16/32/64 px
node bin/pixel.mjs ascii    examples/fox.json --res 24 --anim walk # text view for non-vision agents
node bin/pixel.mjs where    examples/goose-root.json --anim hack     # world positions of pivots, per frame
node bin/pixel.mjs resolve  examples/goose-sudo.json                 # a variant merged with its base
node bin/pixel.mjs bundle   examples/fox.json --out site/fox.bundle.json
node bin/pixel.mjs export   examples/fox.json --res 32 --out game/    # PNG + Aseprite JSON (Phaser, PixiJS)
node bin/pixel.mjs figures                                         # the skeleton library
node bin/pixel.mjs brief                                           # the agent brief / system prompt
```

On a website:

```html
<script type="module" src="pixel-sprite.js"></script>
<pixel-sprite src="fox.bundle.json" anim="idle" size="128" hover-anim="walk" click-anim="wave"></pixel-sprite>
```

Characters can also live on the page itself: walk along cards, jump between them, climb their sides, sit on edges
and hide behind things ([docs/stage.md](docs/stage.md), demo at `/demo/stage.html`):

```html
<script type="module" src="pixel-stage.js"></script>
<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<pixel-stage><pixel-actor src="goose.bundle.json" size="64"></pixel-actor></pixel-stage>
```

## Documentation

The **docs site** (`site/`, open `http://localhost:5173/site/` after `npm run studio`) shows every feature as a live
example next to its code, with spec playgrounds that render as you type. The reference docs:

| doc | covers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The character spec. It doubles as the agent brief. |
| [docs/figures.md](docs/figures.md) | Figures, motion models, follow-through, writing a new figure. |
| [docs/runtime.md](docs/runtime.md) | `<pixel-sprite>`, the bundle format, events, attachment points, state machines, skins, moving sprites on a page. |
| [docs/stage.md](docs/stage.md) | `<pixel-stage>`: characters that walk, jump, climb, sit and hide on a real page. |
| [docs/cli.md](docs/cli.md) | Every CLI command and flag. |
| [docs/api.md](docs/api.md) | The JavaScript API. |
| [docs/architecture.md](docs/architecture.md) | How the engine works inside, and how to extend it. |
| [docs/DESIGN.md](docs/DESIGN.md) | Why it is designed this way. |

## What's here

| Path | What |
|---|---|
| `docs/` | Documentation (see above); `docs/research/` holds research notes for upcoming work. |
| `figures/` | The **figure library**: goose, human, dog, chibi (front-facing), blob (soft body), with motion presets (idle, walk, run, trot, sneak, hop). |
| `src/core/figure.js`, `motion.js` | Figures → bones, motion models (gait / idle / pose with planted feet, hop with squash and stretch, front-view walking), layered author tracks. **Follow-through** springs live in `animate.js`. |
| `src/core/rig.js`, `lint.js`, `extend.js` | Rig maths and **reach** constraints (IK), **bounds/reach warnings**, **variants** (`extends`). |
| `src/core/` | Isomorphic engine: spec validation (JSON paths + did-you-mean), SDF shapes, animation tracks, rasterizer + shader (hue-shifted ramps, lighting, textures, dither, outlines, inner lines, contact shadows), sheets, bundles, ASCII. |
| `src/runtime/pixel-sprite.js` | The web component. Picks the resolution variant like `srcset`, scales in whole device pixels (crisp on phones), reserves its box and shows a poster until loaded, `ready`/`error`/`spriteend`/`spriteevent` events, attachment points and hit testing, a state machine and skins from the bundle, hover for mouse and tap for touch, reduced motion, off-screen pause, and a shared frame clock for moving sprites across a page. One failing sprite cannot stop the others. |
| `src/runtime/pixel-stage.js` | `<pixel-stage>`: characters living on a page. Reads `data-pixel-*` elements as platforms, walls and hiding spots, plans routes (walk, drop, jump, climb), cuts occluders out with `clip-path`, tap to shoo, a pause button. |
| `bin/pixel.mjs` | CLI for agents. `--plugin` loads plug-ins (shapes, textures, motion models; see `examples/plugins/`). |
| `studio/figures.html` | Figure viewer: each skeleton as dots and lines, with moving ground, foot trails and onion skin. |
| `studio/` | Studio: live JSON editor, animated stage (grid, onion skin, scrubbing), a strip showing all detail levels at once, shader knobs, sprite sheet, a live `<pixel-sprite>` preview, export, and the **Agent** tab. |
| `examples/` | `goose-base` + four variants (`goose-root`, `-sudo`, `-phreak`, `-kiddie`); `pip` (written by me); `fox`, `slime`, `robot` (written by a separate agent that only had `SPEC.md` + the CLI). |
| `demo/` | `index.html`: a fake landing page using the bundles, with a goose driven by its state machine and skins. `flock.html`: the unruly hacker geese roaming a lawn. `stage.html`: characters climbing, jumping, sitting on and hiding behind the page's cards. |

## Levels of detail and texture

The same spec renders at any resolution. The detail tier changes how it is drawn:

| tier | default at | tones | texture | dither | outline | extras |
|---|---|---|---|---|---|---|
| 1 icon | ≤ 20 px | 2 | off | off | dark | brighter ambient, only `minDetail: 1` shapes |
| 2 sprite | 21–40 px | 3 | 60% | off | selective | contact shadows |
| 3 portrait | > 40 px | 5 | 100% | on | selective | inner lines between overlapping parts |

Textures: `noise fur scales stripes checker cloth bricks spots metal`. They are evaluated in each part's local space, so they stick to moving limbs. Materials can also carry `shine`, `flat`, and `outline: false`. Every knob can be overridden per spec (`style`) or live in the studio.

## The agent loop, tested

To check the premise, I gave a fresh agent only `docs/SPEC.md` and the CLI and asked for three characters. It produced `fox`, `slime` and `robot` through about three preview-and-revise rounds each. Its friction report drove these engine fixes:

- Eyes and other detail parts cast contact shadows that looked like tears. Fixed: flat and `outline:false` materials no longer cast them.
- Seams appeared where same-material shapes overlapped. Fixed: they are now lit as one surface (union SDF).
- Typos like `minDetal` were ignored silently. Fixed: unknown keys produce warnings with did-you-mean.
- `sx`/`sy` waves centred on 0. Fixed: they now oscillate around 1.
- The icon tier was too dark. Fixed: it gets an ambient boost.
- The brief was missing several things: a style-key table, pivot = scale origin, pixel-grid alignment for tiny features, and no small head rotations.

Still open (see DESIGN.md §6): tiny features are at the mercy of the pixel grid. At 16 px, the fox's four legs merge. There is no alpha or glow.

## Authoring helpers (added while building the goose flock)

Each one came from a specific problem building the geese:

| problem | feature |
|---|---|
| Four geese were four copied 700-line files that drifted apart | **`extends` variants**: a base rig plus about 45 lines of differences per goose (patch/add/remove parts, merge materials and animations, `materialMap`) |
| Getting the beak onto the keyboard meant guessing three joint angles per frame | **`reach` constraints**: name the chain, the tip point and an animatable target (optionally the head's `aim`); the engine solves the angles each frame |
| A honk pushed the head off-canvas and I only noticed in previews | **Bounds warnings**: "`head` goes 8.2 units past the right edge in frames 2–7" from `validate`, the CLI and the studio status bar |
| Unreachable targets fail silently | **Reach warnings**: by how much, which frames, and what to relax |
| Hard to tell where a joint actually is mid-animation | `pixel where` on the CLI and the **rig** toggle in the studio (pivots, bones, reach targets turning red when missed) |

## Figures and motion models

Skeletons are dots and lines with realistic motion models. A character picks a figure (`"figure": "goose"`), dresses its bones with shapes, and gets its motions:

- **gait** (walk, run, trot, sneak). Feet are planted with IK and swing on real paths. The hips rise and fall with the legs, a four-legged figure's back pitches, and the head keeps its gaze steady. Each gait exports a `speed`, so a page that moves the sprite at that speed gets no foot sliding. The flock uses this.
- **idle**: breathing and weight shifting over planted feet.
- **pose**: your keyframes drive the body and the feet stay planted.
- **hop**: a gravity arc with volume-preserving squash and stretch, a lean into the jump, and a ground shadow that shrinks in the air.
- **Front view** (`chibi`): walking toward the viewer, the hips shift over the standing foot and lifted legs foreshorten.
- **Follow-through**: `"follow"` springs make tails, ears, hoods and straps lag, overshoot and settle.
- **For life on a page**: `jump` (crouch, launch, tuck, land), `climb` (feet holding a wall, with a `speedY`), `fall`,
  `sit` on an edge, and `duck`/`peek` presets. Motions report events (`footstep`, `launch`, `land`), and figures define
  attachment points (`beak`, `head`, hands) and the foot line, all baked into bundles.

Author tracks layer on top of the motion. **Every example is dressed on a figure:** the geese on `goose`, Ember on `dog`
(fitted: shorter neck, bushy tail), Pip and Bolt on `chibi` (Bolt fitted to its boxier proportions, with a springy antenna),
and Gloop on `blob`. phreak's sneak is the `sneak` preset plus a floppy disk, and honks, headbangs and waves are `pose` motions.

```bash
node bin/pixel.mjs figures                # list the library
node bin/pixel.mjs preview dog            # a bare figure: its skeleton, every motion
open http://localhost:5173/studio/figures.html
```

## Agent tab (Claude in the browser)

Describe a character, then **Generate**: Claude writes the spec, the studio validates it, and any validation errors go back to Claude for a fix. **Look & refine** renders a contact sheet (16/32/64 × every animation), sends the image back, and asks Claude to critique it like a pixel artist and return a revised spec.

- Your API key is stored only in `localStorage`. Requests go directly from the browser to the API (`dangerouslyAllowBrowser`), which is fine for a local prototype but not for a hosted app. A hosted version needs a small server-side proxy.
- The default model is `claude-opus-5-5`, with adaptive thinking at effort `medium`. The server-side fallback beta is on (`fallbacks: "default"`), so a safety-classifier refusal is routed to a fallback model instead of failing. To turn it off, remove `betas`/`fallbacks` in `studio/agent.js`.
- The SDK loads from esm.sh on first use, so the rest of the studio works offline.
- **This path has not been run end-to-end yet; it needs your key.** The extraction and validation-repair logic is exercised; the live API call isn't.

## Out of scope for now

Pixel-level touch-up layers, mesh deformation (parts are rigid), palette constraints across characters, GIF/APNG export, hosting and accounts. See `docs/DESIGN.md` and `docs/research/`.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Pixel Studio is released under the [MIT License](LICENSE).
The studio's optional Agent tab loads the Anthropic SDK (MIT) from esm.sh at runtime; nothing third-party is bundled.
