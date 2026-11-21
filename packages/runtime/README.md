# @pixel-studio/runtime

Play [Pixel Studio](https://pixel-studio.sh) characters on any web page. Two custom elements, plain ES modules, no
dependencies, no build step:

- **`<pixel-sprite>`** plays one character's bundle: it picks the right resolution like `srcset`, scales in whole
  device pixels, plays animations and state machines, reacts to hover and taps, respects reduced motion and pauses
  off-screen.
- **`<pixel-stage>`** and **`<pixel-actor>`** let characters live on the page itself: walk along cards, jump between
  them, climb their sides, sit on edges and hide behind things, without ever blocking a click.

The bundles come from the [`pixel-studio`](https://www.npmjs.com/package/pixel-studio) engine and CLI
(`npx pixel bundle my-goose.json --out my-goose.bundle.json`). This package never imports the engine, so a site that
only shows finished sprites installs just this. Both packages are always released with the same version.

## Use

```sh
npm i @pixel-studio/runtime
```

```html
<script type="module" src="node_modules/@pixel-studio/runtime/src/pixel-sprite.js"></script>
<pixel-sprite src="my-goose.bundle.json" anim="idle" size="128" hover-anim="waddle" click-anim="honk"></pixel-sprite>
```

Or with a bundler:

```js
import '@pixel-studio/runtime';          // registers <pixel-sprite>
import '@pixel-studio/runtime/stage';    // registers <pixel-stage> and <pixel-actor> (and <pixel-sprite>)
import { clock, checkBundle } from '@pixel-studio/runtime';
```

No npm at all: copy `src/pixel-sprite.js` (and `src/pixel-stage.js`, into the same folder) next to your page.

```html
<script type="module" src="pixel-stage.js"></script>
<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<pixel-stage><pixel-actor src="goose.bundle.json" size="64"></pixel-actor></pixel-stage>
```

## Docs

- [`<pixel-sprite>`](https://pixel-studio.sh/docs/reference/runtime/): attributes, the bundle format, events,
  attachment points, state machines, skins.
- [`<pixel-stage>`](https://pixel-studio.sh/docs/reference/stage/): surfaces, routes, hiding, scenes.
- [Getting started](https://pixel-studio.sh/docs/reference/getting-started/): from a character to a page.
- [Demos](https://pixel-studio.sh/gallery/) and the [changelog](https://github.com/pavelpascari/pixel-studio/blob/main/CHANGELOG.md).

MIT licensed.
