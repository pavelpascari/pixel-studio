# Contributing

Thanks for helping. Pixel Studio is small on purpose: plain ES modules, no dependencies, no build step.

## Setup

```bash
node --version          # 20 or newer
npm test                # engine, rig, figure, plug-in and runtime tests (node:test)
npm run studio          # http://localhost:5173/studio/ , /studio/figures.html , /demo/
```

Nothing to install. `npm run studio` serves the repository on 127.0.0.1 only (set `HOST`/`PORT` to change).

## Where things are

Read [docs/architecture.md](docs/architecture.md) first: it maps every module and walks the pipeline from
JSON spec to pixels. The other references:

| doc | for |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | the character spec (also the brief given to agents) |
| [docs/figures.md](docs/figures.md) | figures, motion models, follow-through, writing a new figure |
| [docs/api.md](docs/api.md) | the JavaScript API |
| [docs/cli.md](docs/cli.md) | the `pixel` CLI |
| [docs/runtime.md](docs/runtime.md) | the `<pixel-sprite>` element and the bundle format |
| [docs/stage.md](docs/stage.md) | `<pixel-stage>`: characters living on a page |
| [docs/playground.md](docs/playground.md) | the URL-driven playground page |
| [docs/DESIGN.md](docs/DESIGN.md) | why the format looks the way it does |

## Rules the code keeps

- **No dependencies.** Not at runtime, not for tests, not for building.
- **`src/core` is isomorphic.** No DOM, no Node APIs. Node-only code goes in `src/node`, `bin`, `scripts`;
  browser-only code in `src/runtime` and `studio`.
- **Deterministic.** The same spec renders the same pixels on every machine. No `Math.random`, no clocks.
- **Everything reduces to a plain spec.** `extends`, figures and motions expand into ordinary parts and tracks
  before validation, so every tool (validator, linter, renderer, studio) understands the result.
- **Errors point at the problem.** Validation messages carry a JSON path and, for typos, a suggestion. Prefer
  a helpful error or warning to silently doing something odd.
- **Agents are users.** Anything an agent must learn to use a feature goes into `docs/SPEC.md` (it is the brief),
  short and with an example.

## Making a change

1. Add or change a test in `test/` (`node:test`, `assert/strict`). Rendering tests compare pixels or
   pixel-derived facts; motion tests check physical facts (planted feet do not move, volume is preserved).
2. Make the change. Keep functions small and comments about *why*.
3. `npm test` passes. For anything visual, also look at it:
   `node bin/pixel.mjs preview examples/<name>.json --out /tmp/x.png`.
4. If you changed a format or behaviour, update `docs/` (and `docs/SPEC.md` if agents need to know).
   If example output changed, run `npm run build:demo` (and `npm run previews`).
5. Add a line to `CHANGELOG.md` under *Unreleased*.

New figures, examples and motion presets are very welcome: see "Writing a new figure" in
[docs/figures.md](docs/figures.md). Characters you contribute must be your own designs, not
recreations of existing characters or games.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

## Browser checks

`test/browser/runtime.html` checks the runtime in a real browser (open it on any device while `npm run studio` runs).
To run it, and every page of the docs site, in Firefox and WebKit, install Playwright anywhere outside the project and
run the script from there:

```bash
mkdir /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install firefox webkit
node /path/to/pixel-studio/scripts/browser-check.mjs        # --browsers firefox,webkit,chromium  --base http://localhost:5173
```

