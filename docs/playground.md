# Playground

`studio/play.html` shows one character, animated, and keeps its whole setup in the URL: which character,
view, animation, skin and size (the query), and any changes to its colours, textures, style or parts (the
payload in `#spec=`). Change something on the page and the address bar follows; share the link and the
other side sees the same thing.

This page is written for people and for agents. Everything an agent needs is here and in
[`studio/play.schema.json`](../studio/play.schema.json) (every field of the payload, with types and ranges).
The full character format is [SPEC.md](SPEC.md).

## The URL

```
/studio/play.html?c=goose-root&view=front&anim=waddle&skin=party&res=64#spec=<payload>
```

| option | values | default |
|---|---|---|
| `c` | `goose-base` `goose-root` `goose-sudo` `goose-phreak` `goose-kiddie` `goose-greylag` `moss` `fox` `pip` `robot` `slime` | `goose-base` |
| `view` | `side`, and when the character has them `front`, `back`, `look` (¾ glance toward the reader) | `side` |
| `anim` | an animation of that view; the page lists them (`playground.options().animations`). The geese side view: `idle waddle run rush honk jump fall sit duck peek climb flap fly` (`goose-kiddie` has no `climb`), plus `hack` for root, `headbang` for sudo, `sneak` for phreak; their front and back views have no `rush`, `climb` or `fly`. `walk` and `waddle` stand in for each other | `idle` |
| `skin` | a skin of the character (`goose-root`: `party`, `redteam`) | none |
| `res` | sprite height in pixels, any positive number (the menu offers 16–192) | `64` |
| `lod` | detail level `1` icon, `2` sprite, `3` portrait (the menu says "rich") | from `res` |
| `frame` | show this frame (0-based), paused | plays |
| `zoom` | screen pixels per sprite pixel | fits the page |
| `bg` | background: a hex colour without `#` (`fff`, `1b1424`) or a CSS colour name | checkerboard |
| `ui` | `0` shows only the character (for screenshots) | panels on |

Unknown values never break the page: it falls back and says so under **Messages** (and in
`playground.warnings`). Textures only show from detail 2 (about 21 px and up).

## The payload

`#spec=` holds a JSON object, written either way:

- **Readable**: URL-encoded JSON, starting with `{` (`%7B`). Easiest to write by hand:
  `#spec=%7B%22materials%22%3A%7B%22feather%22%3A%7B%22color%22%3A%22%23336699%22%7D%7D%7D`.
  Most browsers also accept the raw characters: `#spec={"materials":{"feather":{"color":"#336699"}}}`
  (encode `#` as `%23` inside the JSON if a tool chokes on it).
- **Compressed**: deflate-raw, then base64url (no padding). What the page writes into the address bar and the
  **Copy link** button; about a third of the readable length. In a browser:
  `new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()`;
  in Node: `zlib.deflateRawSync(json).toString('base64url')`.

The page tells them apart by the first character (`{` means JSON).

### A change to the character (usual)

Without `extends`, `figure` or `size`, the payload is a change to the character picked with `c`, merged the way
[variants](SPEC.md#variants-extends) are:

```json
{
  "materials": {
    "feather": { "color": "#3a6ea5" },
    "hoodie": { "color": "#2f6b4f", "texture": "scales", "textureStrength": 0.6 },
    "beak": { "color": "#ffd23f", "shine": 0.6 },
    "lens": { "texture": null }
  },
  "style": { "outline": "dark", "light": 30, "dither": true },
  "parts": [
    { "id": "server", "remove": true },
    { "id": "head", "addShapes": [ { "type": "circle", "cx": 60, "cy": 22, "r": 1.5, "material": "beak" } ] },
    { "id": "crest", "parent": "head", "pivot": [64, 18], "z": 8,
      "shapes": [ { "type": "polygon", "points": [[60, 21], [66, 21], [62, 12]], "material": "beak" } ] }
  ]
}
```

(For `c=goose-root`: its materials are `feather beak leg hoodie string shades lens laptop code rack vent ledG
ledR`; `server` is the rack it hacks on.)

- `materials` merge per material and per field: `{"color": …}` keeps the base texture. `null` as a field
  removes it (`"texture": null`); `null` as the whole material removes the material. New names add materials
  for your new shapes.
- `style` merges per key; each key overrides the detail preset at every size.
- `parts`: an existing `id` patches that part (fields replace, `shapes` replaces the list, `addShapes` appends);
  `"remove": true` deletes it and its children; a new `id` adds a part. Coordinates are the 100 × 100 canvas
  the character is drawn on, at rest.
- A part added or patched by id lives in the **side** view. The front and back views have their own parts
  (`front.head`, `back.body`, … in `options().parts`); change those under `views`:
  `"views": {"front": {"parts": [{"id": "head", "addShapes": [ … ]}]}}` (ids without the `front.` prefix).
  The same goes for skins: `goose-root`'s party hat sits on the side head only.
- `skins`, `animations` and `views` work as in [SPEC.md](SPEC.md) and the [schema](../studio/play.schema.json).

To see what you can change, ask the page (`playground.options()`) or read **This character** at the bottom of
the page: the current materials (with their values), part ids, views, animations per view, skins and textures.

### A whole character

A payload with its own `figure` or `size` and no `extends` is a complete spec (as in [SPEC.md](SPEC.md)); `c` is
then ignored. A full goose is about 2 KB compressed, well within what a link can carry.

## Values at a glance

| what | values |
|---|---|
| material fields | `color` (hex), `texture` (`noise` `fur` `scales` `stripes` `checker` `cloth` `bricks` `spots` `metal`), `textureStrength` 0–1, `textureScale` ≥ 1, `shine` 0–1, `flat` bool, `outline` bool, `tones` 2–6 |
| style keys | `outline` (`none` `dark` `selective`), `outlineColor` hex, `light` degrees (0 above, −45 top-left, 90 right), `elevation` degrees, `ambient` −0.3–0.8, `curvature` 0–1, `tones` 2–6, `texture` 0–1.5, `dither`, `innerLines`, `contactShadow`, `snap` (bools), `hueShift` 0–2 |
| shapes | `circle` cx cy r · `ellipse` cx cy rx ry · `rect` x y w h · `capsule` x1 y1 x2 y2 r · `polygon` points; plus `material`, `op: "cut"`, `minDetail`/`maxDetail`, `profile`, `shade` |

## Driving it from a browser

An agent with a browser (Playwright, Chrome) can skip the URL and call the page:

```js
await playground.ready;                       // {ok, errors, warnings} of the first build
playground.options();                         // what this character has
await playground.set({ c: 'goose-sudo', view: 'front', anim: 'honk', res: 96 });
await playground.set({ merge: { materials: { feather: { color: '#3a6ea5' } }, style: { outline: 'dark' } } });
// → {ok, errors, warnings, link}
await playground.set({ spec: { ... } });      // replace the payload
await playground.set({ frame: 3 });           // pause on frame 3 (frame: null plays again)
playground.frame({ scale: 4 });               // the frame showing now as a PNG data URL
await playground.link();                      // compressed link; link({readable: true}) for JSON
playground.state;                             // the current setup
playground.errors; playground.warnings;       // messages from the last build
playground.docs;                              // {guide, schema, spec}: URLs of this page's docs
```

`merge` merges `materials` per field and `style` per key, appends `parts`, and replaces any other key.

`document.body.dataset.state` is `ready` or `error` after each build.

## A loop that works

1. Open the character as it is (`?c=goose-root&res=96`) and read its materials and parts.
2. Change a few colours or textures in the payload; check **Messages** (errors name the field, e.g.
   `$.materials.feather.textureStrength`).
3. Look at it at the size it will be used (`res`), in each view it has, and with `frame=` on a key pose.
4. Share the link (or `playground.link()`); turn a look you like into a spec file or a skin by pasting the
   payload into `examples/` with an `extends` line.
