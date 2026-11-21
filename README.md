# Pixel Studio

**Agents describe characters; the engine draws them as pixel art at every level of detail; websites play them with one tag.**

Docs, demos and the playground: **[pixel-studio.sh](https://pixel-studio.sh)**.

| Package | What | Install |
|---|---|---|
| [`@pixel-studio/core`](packages/pixel-studio/) | The engine, the `pixel` CLI, the figure library, examples and the reference docs. | `npm i @pixel-studio/core` |
| [`@pixel-studio/runtime`](packages/runtime/) | `<pixel-sprite>` and `<pixel-stage>`: the web components that play finished sprites on a page. No dependencies. | `npm i @pixel-studio/runtime` |

The two are always released together, with the same version; `@pixel-studio/core` depends on exactly that runtime.
Start with [getting started](packages/pixel-studio/docs/getting-started.md). Changes are in the
[changelog](CHANGELOG.md).

## This repository

| Path | What |
|---|---|
| [`packages/pixel-studio/`](packages/pixel-studio/) | The `@pixel-studio/core` package ([README](packages/pixel-studio/README.md), [docs](packages/pixel-studio/docs/README.md)). |
| [`packages/runtime/`](packages/runtime/) | The `@pixel-studio/runtime` package. |
| [`studio/`](studio/) | The studio, the figure viewer, the goose workbench and the URL-driven playground. |
| [`demo/`](demo/) | Demo pages: a landing page, a flock on a lawn, characters on cards, a tiny runner game. |
| [`website/`](website/) | pixel-studio.sh (Astro and [astro-project-site](https://github.com/pavelpascari/astro-project-site), on Cloudflare Workers). |
| [`docs/research/`](docs/research/) | Research notes behind the design. |
| [`scripts/`](scripts/) | The dev server, the demo build, the version script and browser checks. |

```bash
npm install          # links the two packages; no third-party dependencies
npm test             # both packages
npm run build:demo   # the demo's bundles and posters
npm run studio       # http://localhost:5173/studio/ , /demo/
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE). Motion data comes only from
public-domain and openly licensed sources, each credited in
[references/CREDITS.md](packages/pixel-studio/references/CREDITS.md).
