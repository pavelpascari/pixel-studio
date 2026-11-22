# Pixel Studio

**Agents describe characters; the engine draws them as pixel art at every level of detail; websites play them with one tag.**

```
agent ──JSON rig──▶ engine (SDF raster + pixel-art shader) ──▶ bundle (16/32/64 px sheets) ──▶ <pixel-sprite>
          ▲                                                        │
          └──────────── preview PNG / ASCII / validation errors ◀──┘
```

Plain ES modules, no build step. Node ≥ 20 for the CLI; any current browser for the runtime. MIT licensed.
Two packages, always released with the same version:

- **`@pixel-studio/core`** (this one): the engine, the `pixel` CLI, the figure library, examples and docs. Its only
  dependency is the runtime.
- **[`@pixel-studio/runtime`](https://www.npmjs.com/package/@pixel-studio/runtime)**: `<pixel-sprite>` and
  `<pixel-stage>`, the web components that play finished sprites. No dependencies; a site that only shows sprites
  installs just this.

Docs and live demos: **[pixel-studio.sh](https://pixel-studio.sh)**.

> **Status: alpha.** The engine, CLI and web components work and are tested, and every page of pixel-studio.sh runs
> on them. The spec and bundle formats may still change before 1.0; each change is listed in the
> [changelog](../../CHANGELOG.md).

## Five minutes to a goose on your page

```bash
npm i @pixel-studio/core   # brings @pixel-studio/runtime, nothing else
```

Make a character by changing an example (`my-goose.json`):

```json
{ "extends": "./node_modules/@pixel-studio/core/examples/goose-base.json",
  "name": "Marigold",
  "materials": { "feather": { "color": "#e8b04a" }, "beak": { "color": "#d94b32" } } }
```

```bash
npx pixel validate my-goose.json                          # errors with JSON paths and did-you-mean
npx pixel preview  my-goose.json --out my-goose.png       # every animation at 16, 32 and 64 px
npx pixel bundle   my-goose.json --out my-goose.bundle.json
```

```html
<script type="module" src="node_modules/@pixel-studio/runtime/src/pixel-sprite.js"></script>
<pixel-sprite src="my-goose.bundle.json" anim="idle" size="128" hover-anim="waddle" click-anim="honk"></pixel-sprite>
```

The full walk-through is [docs/getting-started.md](docs/getting-started.md).

Characters can also live on the page itself: walk along cards, jump between them, climb their sides, sit on edges
and hide behind things ([docs/stage.md](docs/stage.md)):

```html
<script type="module" src="pixel-stage.js"></script>
<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<pixel-stage><pixel-actor src="goose.bundle.json" size="64"></pixel-actor></pixel-stage>
```

## The CLI: the agent's hands and eyes

```bash
npx pixel validate examples/fox.json
npx pixel preview  examples/fox.json --out fox.png          # every animation × 16/32/64 px
npx pixel ascii    examples/fox.json --res 24 --anim walk   # text view for agents without vision
npx pixel where    examples/goose-root.json --anim honk     # world positions of pivots, per frame
npx pixel resolve  examples/goose-sudo.json                 # a variant merged with its base
npx pixel bundle   examples/fox.json --out fox.bundle.json
npx pixel export   examples/fox.json --res 32 --out game/   # PNG + Aseprite JSON (Phaser, PixiJS)
npx pixel figures                                           # the skeleton library
npx pixel brief                                             # the agent brief (system prompt)
```

(In a clone of the repository, run `node bin/pixel.mjs` from `packages/pixel-studio/` instead of `npx pixel`, and
the example paths work as written. Working on Pixel Studio itself: see
[CONTRIBUTING.md](../../CONTRIBUTING.md).)

## Documentation

Start with [docs/getting-started.md](docs/getting-started.md), or read everything on
[pixel-studio.sh](https://pixel-studio.sh/docs/). The reference docs, also in this package's `docs/`:

| doc | covers |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Install, write a character, preview, bundle, put it on a page. |
| [docs/SPEC.md](docs/SPEC.md) | The character spec. It doubles as the agent brief. |
| [docs/figures.md](docs/figures.md) | Figures, motion models, follow-through, writing a new figure. |
| [docs/runtime.md](docs/runtime.md) | `<pixel-sprite>`, the bundle format, events, attachment points, state machines, skins, moving sprites on a page. |
| [docs/stage.md](docs/stage.md) | `<pixel-stage>`: characters that walk, jump, climb, sit and hide on a real page. |
| [docs/performance.md](docs/performance.md) | What characters cost a page: sizes, load impact, time per frame, memory, measured. |
| [docs/cli.md](docs/cli.md) | Every CLI command and flag. |
| [docs/api.md](docs/api.md) | The JavaScript API. |
| [docs/playground.md](docs/playground.md) | The playground page: a character set up entirely by its URL, for people and browser agents. |
| [docs/architecture.md](docs/architecture.md) | How the engine works inside, and how to extend it. |
| [docs/DESIGN.md](docs/DESIGN.md) | Why it is designed this way. |

## What's in this package

| Path | What |
|---|---|
| `src/core/` | The isomorphic engine: spec validation (JSON paths + did-you-mean), figures and motion models, rig maths and IK, variants, SDF shapes, the rasterizer and pixel-art shader (hue-shifted ramps, lighting, textures, dither, outlines, inner lines, contact shadows), sheets, bundles, export, ASCII, plug-ins. |
| `src/node/png.js` | The Node PNG encoder the CLI uses. |
| `src/runtime.js`, `src/stage.js` | `@pixel-studio/core/runtime` and `@pixel-studio/core/stage`: re-export [`@pixel-studio/runtime`](https://www.npmjs.com/package/@pixel-studio/runtime), the web components. |
| `bin/pixel.mjs` | The CLI. `--plugin` loads plug-ins (shapes, textures, motion models; see `examples/plugins/`). |
| `figures/` | The **figure library**: `goose` (and `goose-front` for its front and back views), `human`, `dog`, `chibi` (front-facing), `blob` (soft body). |
| `examples/` | Characters: `goose-base` and its variants `goose-root`, `-sudo`, `-phreak`, `-kiddie`, `-greylag`; `pip`; `fox`, `slime`, `robot` (written by a separate agent that only had `SPEC.md` and the CLI); `moss`. |
| `references/` | Where motion data comes from: every source cited, every measured value and frame logged ([references/README.md](references/README.md), credits in [references/CREDITS.md](references/CREDITS.md)). |
| `docs/` | The reference docs above. |

The studio (live JSON editor, onion skin, all detail levels at once, an **Agent** tab), the figure viewer, the
playground and the demo pages live in the [repository](https://github.com/pavelpascari/pixel-studio) and run on
[pixel-studio.sh](https://pixel-studio.sh/gallery/).

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

Still open: tiny features are at the mercy of the pixel grid (at 16 px the fox's four legs merge), and there is no
alpha or glow.

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
npx pixel figures                # list the library
npx pixel preview dog            # a bare figure: its skeleton, every motion
```

## Agent tab (Claude in the browser)

In the studio, in the [repository](https://github.com/pavelpascari/pixel-studio) (`npm run studio`).

Describe a character, then **Generate**: Claude writes the spec, the studio validates it, and any validation errors go back to Claude for a fix. **Look & refine** renders a contact sheet (16/32/64 × every animation), sends the image back, and asks Claude to critique it like a pixel artist and return a revised spec.

- Your API key is stored only in `localStorage`. Requests go directly from the browser to the API (`dangerouslyAllowBrowser`), which is fine for a local prototype but not for a hosted app. A hosted version needs a small server-side proxy.
- The default model is `claude-opus-5-5`, with adaptive thinking at effort `medium`. The server-side fallback beta is on (`fallbacks: "default"`), so a safety-classifier refusal is routed to a fallback model instead of failing. To turn it off, remove `betas`/`fallbacks` in `studio/agent.js`.
- The SDK loads from esm.sh on first use, so the rest of the studio works offline.
- **This path has not been run end-to-end yet; it needs your key.** The extraction and validation-repair logic is exercised; the live API call isn't.

## Known limitations and out of scope

- The spec and bundle formats are not frozen until 1.0.
- Parts are rigid: no mesh deformation, no pixel-level touch-up layers, no palette constraints across characters.
- No GIF/APNG export; PNG sheets, Aseprite JSON and bundles only.
- The studio's Agent tab is a local prototype (see above).

See [docs/DESIGN.md](docs/DESIGN.md) and the research notes in the repository's [docs/research/](../../docs/research/).

## Contributing and license

See [CONTRIBUTING.md](../../CONTRIBUTING.md). Pixel Studio is released under the [MIT License](LICENSE).
Motion data comes only from public-domain and openly licensed sources (Muybridge's plates, published measurements);
each is credited in [references/CREDITS.md](references/CREDITS.md).
The studio's optional Agent tab loads the Anthropic SDK (MIT) from esm.sh at runtime; nothing third-party is bundled.
