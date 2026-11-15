# Getting started

From nothing to your own pixel-art goose walking on a web page, in five steps. You need Node 20 or newer and a
browser. Every command below was run as written.

## 1. Install

```bash
mkdir my-site && cd my-site && npm init -y
npm i github:pavelpascari/pixel-studio#v0.2.0-alpha.0
```

Pixel Studio has no dependencies, so this installs one package. The `#v0.2.0-alpha.0` pins the alpha release; leave
it off to follow `main`. (It is not on npm yet.) The package brings the engine, the `pixel` command, the web components, the figure
library and the example characters in `node_modules/pixel-studio/examples/`.

## 2. Describe a character

A character is a JSON **spec**: shapes on a skeleton, materials, animations. The quickest start is a variant of an
example: it `extends` one and changes only what differs. Save this as `my-goose.json`:

```json
{
  "extends": "./node_modules/pixel-studio/examples/goose-base.json",
  "name": "Marigold",
  "materials": {
    "feather": { "color": "#e8b04a" },
    "beak": { "color": "#d94b32" }
  }
}
```

The path in `extends` is relative to the spec file. The base goose stands on the `goose` figure, so the variant
gets every motion of it: idle, waddle, run, rush, honk, jump, fall, sit, duck, peek, climb, flap and fly.

## 3. Check it and look at it

```bash
npx pixel validate my-goose.json                                   # errors carry a JSON path and a did-you-mean
npx pixel preview  my-goose.json --anim idle,waddle --out my-goose.png
npx pixel ascii    my-goose.json --res 16 --anim idle              # the same as text, for agents without vision
```

`preview` draws every animation (or those named) at 16, 32 and 64 px, so you see each level of detail. Change the
spec, run it again. That loop is the whole authoring workflow; [SPEC.md](SPEC.md) lists everything a spec can say.

## 4. Build a bundle

```bash
npx pixel bundle my-goose.json --out my-goose.bundle.json
```

A **bundle** is one JSON file with the sprite sheets at every resolution, frame timings, events (footsteps),
attachment points (the beak) and the foot line. It is the only thing the page needs.

## 5. Put it on a page

`index.html`:

```html
<!doctype html>
<meta charset="utf-8">
<script type="module" src="node_modules/pixel-studio/src/runtime/pixel-sprite.js"></script>
<pixel-sprite src="my-goose.bundle.json" anim="idle" size="128"
              hover-anim="waddle" click-anim="honk" alt="Marigold, a yellow goose"></pixel-sprite>
```

Serve the folder (modules and `fetch` need http, not `file://`), for example `python3 -m http.server`, and open it.
The goose idles, waddles while the mouse is over it, and honks when clicked. The runtime picks the sharpest sheet
for the size and the screen, scales in whole device pixels, pauses off-screen and respects reduced motion.

In production, copy `pixel-sprite.js` and the bundle next to your page; the runtime is one file with no imports.

## Where next

| to… | read |
|---|---|
| design a character from scratch, or brief an agent to | [SPEC.md](SPEC.md) (it is also the agent brief: `npx pixel brief`) |
| choose a skeleton, tune how it walks | [figures.md](figures.md) (`npx pixel figures` lists them) |
| move a sprite across the page with its feet planted, react to events, use skins and state machines | [runtime.md](runtime.md) |
| let characters walk, climb and hide on your page's own elements | [stage.md](stage.md) |
| use the sprites in Phaser or PixiJS | [cli.md](cli.md#export) (`npx pixel export`) |
| call the engine from JavaScript | [api.md](api.md) |
| see it all live, with editable examples | clone the repository, `npm run studio`, open `http://localhost:5173/site/` |
