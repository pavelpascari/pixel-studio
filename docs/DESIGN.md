# Pixel Studio — PoC design (working backwards)

## 1. Start from the end: what does a website need?

A character animation that lives on a web page has to be:

| Need on the page | Consequence for the system |
|---|---|
| Crisp at any CSS size, no blur | Integer-scaled pixels, `image-rendering: pixelated`, canvas sized to the sprite's native resolution |
| Tiny and fast (hero, buttons, 404 pages, docs) | Bake to a sprite sheet (PNG) + a few hundred bytes of metadata; one small runtime file (`pixel-sprite.js`, about 15 KB gzipped); no framework |
| Drop-in embed | One custom element: `<pixel-sprite src="fox.bundle.json" anim="idle">` |
| Interactive | Named animations + `hover-anim` / `click-anim`, a `play()` API, `spriteend` events |
| Responsive | Several resolutions per character (like `srcset`): the runtime picks the one that fits the rendered size |
| Polite | Honours `prefers-reduced-motion`, pauses off-screen |

So the **output artifact** is a *bundle*: `{ animations, variants: [{res, image(PNG)}, ...] }`.

## 2. One step back: what produces a bundle?

A renderer that takes a **character description** and a **render setting** (resolution, detail level,
texture, outline, light) and emits frames. The key question is: *what is the character description?*

### Why not "agents paint pixels"?

LLM agents are bad at long 2D pixel grids: coordinates drift, symmetry breaks, a 64×64 frame is 4096
cells, and every animation frame has to be repainted consistently. Hand-painted grids also don't give
you levels of detail for free: a 16px and a 64px version are two separate drawings.

### What agents *are* good at

Structured, semantic, compositional descriptions: "a head is an ellipse here, the arm is a capsule from
the shoulder to the hand, it swings ±25° over the walk cycle". That is a scene graph, and it is
resolution-independent.

### Decision: agents author a semantic rig, the engine rasterizes it into pixel art

```
 Agent ──writes──▶ Character spec (JSON)
                    materials · parts (shapes, pivots, z, parent) · animations (tracks per part)
                          │
                          ▼
                 Rasterizer (per frame, per resolution)
                    SDF shapes → coverage at pixel centres → material/part/normal per pixel
                          │
                          ▼
                 Pixel-art shader (the "detail & texture" knobs)
                    tone ramps with hue shifting · lighting quantized to ramp ·
                    procedural textures in part space · ordered dither · outlines/selout ·
                    inner lines
                          │
                          ▼
                 Frames → sprite sheet → bundle  ──▶  <pixel-sprite> on a website
```

Because geometry is rasterized fresh for every frame and every resolution:

- **LOD is free**: the same spec renders at 16, 32, 64 px. Shapes can opt in/out per detail tier
  (`minDetail`) so a 16px icon drops eyebrows and buttons instead of turning them into noise.
- **Animation is cheap to author**: tracks move/rotate/scale parts; rotation doesn't smear pixels
  (we never rotate a bitmap).
- **Texture moves with the body**: procedural textures are evaluated in each part's local space, so
  fur/scales/cloth stick to the limb instead of swimming.

## 3. What "levels of detail and texture" means concretely

Three detail tiers, each a preset of shader knobs (all overridable):

| Tier | Typical res | Tones per material | Texture | Dither | Outline | Inner lines | Shapes |
|---|---|---|---|---|---|---|---|
| 1 · icon | ≤ 20 px | 2 | off | off | dark | off | `minDetail ≤ 1 ≤ maxDetail` |
| 2 · sprite | 21–40 px | 3 | 60% | off | selective | off | `minDetail ≤ 2 ≤ maxDetail` |
| 3 · portrait | > 40 px | 5 | 100% | on | selective | on | `minDetail ≤ 3 ≤ maxDetail` |

Texture vocabulary (per material): `noise, fur, scales, stripes, checker, cloth, bricks, spots, metal`.
Materials also carry `shine` (specular), `flat` (no shading — eyes, emissive bits) and `outline: false`.

Pixel-art craft baked in, so agents don't need to know it:
- **hue-shifted ramps** (shadows drift cool, highlights drift warm) instead of plain darken/lighten
- **selective outline** (outline tinted by the neighbouring material) instead of pure black
- **thin-feature preservation**: a shape thinner than a pixel still gets 1 px instead of vanishing
- **pixel-snapped motion**: part offsets snap to whole pixels at each resolution
- **far-side shading**: `part.shade: -0.3` for the far arm/leg (figures set it automatically) (classic depth cue)

## 4. The agent loop (the "studio for agents" part)

An agent needs to *see* what it drew. The PoC gives three loops:

1. **CLI (any coding agent, e.g. Claude Code)** — `node bin/pixel.mjs validate|preview|ascii|render|export|bundle|resolve|where|figures|brief`
   (see [cli.md](cli.md)).
   `preview` writes a contact sheet PNG (all animations × LOD tiers) the agent can look at;
   `ascii` prints a frame as text for agents without vision. Validation errors carry JSON paths.
2. **Studio UI (human + agent)** — live JSON editor, animated preview, LOD strip, sprite sheet,
   shader knobs, export.
3. **In-studio Claude loop** — describe a character → Claude writes the spec → the studio renders a
   contact sheet → sends the image back to Claude to critique and revise. (Needs your API key.)

`docs/SPEC.md` is the single source of truth for the format and doubles as the agent system prompt.

## 5. Non-goals for the PoC

- Frame-by-frame hand editing / pixel painting tools (a later "touch-up layer" could store per-frame
  pixel overrides on top of the rig).
- Mesh deformation, tweened easing curves editor. (Skeletal IK and palette-swap skins were on this list; IK now exists
  as `reach` constraints and the figure motion models, see [figures.md](figures.md), and skins as patches of
  materials and parts stored as recolours in the bundle, see [SPEC.md](SPEC.md#skins).)
- Server, accounts, storage. Everything is static files + Node with zero dependencies.

## 6. Open questions for after the PoC

- ~~Is the rig expressive enough for non-humanoids (wings, tails, tentacles) — add chains/bones?~~ Resolved: figures
  are bone chains with `wings`, `tail` and four-legged roles, `follow` springs for trailing parts, and plug-in motion
  models ([figures.md](figures.md)).
- Should agents get a **touch-up pass** (pixel overrides per LOD tier) for faces, where geometry
  rasterization is weakest at 16px?
- Palette constraints per site (brand palettes, limited global palette across characters)?
- ~~Export targets beyond the web component~~ Partly resolved: `pixel export` writes a sheet PNG with Aseprite JSON
  (Phaser, PixiJS) and `pixel render` a plain sheet with metadata. GIF/APNG, a CSS `steps()` sprite and Lottie-like JSON
  remain open.
