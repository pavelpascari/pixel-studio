# Contributing

Thanks for helping. Pixel Studio is small on purpose: plain ES modules, no dependencies, no build step.

## Setup

```bash
node --version          # 20 or newer
npm install             # links the two packages to each other; there are no third-party dependencies
npm test                # both packages: engine, rig, figure, plug-in, reference and runtime tests (node:test)
npm run build:demo      # the demo's bundles and posters (generated, not committed)
npm run studio          # http://localhost:5173/studio/ , /studio/figures.html , /demo/
```

`npm run studio` serves the repository on 127.0.0.1 only (set `HOST`/`PORT` to change).

## Where things are

| Path | What |
|---|---|
| `packages/pixel-studio/` | The `@pixel-studio/core` package: the engine (`src/core`, `src/node`), the `pixel` CLI (`bin/`), figures, examples, motion references, the user docs (`docs/`) and their tests (`test/`). |
| `packages/runtime/` | The `@pixel-studio/runtime` package: `<pixel-sprite>` and `<pixel-stage>` (`src/`), no imports from the engine, and their tests. |
| `studio/`, `demo/` | The studio and playground, and the demo pages. Served from the repository root by `npm run studio`. |
| `website/` | pixel-studio.sh, including the guide (`src/content/docs/docs/guide/`: live examples and editable characters) (Astro, [astro-project-site](https://github.com/pavelpascari/astro-project-site)). Its own `npm install`; `npm run deploy` there. |
| `docs/research/` | Research notes behind the design. Not shipped in the packages. |
| `scripts/` | The dev server, the demo build, version and browser checks. |

Read [docs/architecture.md](packages/pixel-studio/docs/architecture.md) first: it maps every module and walks the pipeline from
JSON spec to pixels. The other references:

| doc | for |
|---|---|
| [docs/SPEC.md](packages/pixel-studio/docs/SPEC.md) | the character spec (also the brief given to agents) |
| [docs/figures.md](packages/pixel-studio/docs/figures.md) | figures, motion models, follow-through, writing a new figure |
| [docs/api.md](packages/pixel-studio/docs/api.md) | the JavaScript API |
| [docs/cli.md](packages/pixel-studio/docs/cli.md) | the `pixel` CLI |
| [docs/runtime.md](packages/pixel-studio/docs/runtime.md) | the `<pixel-sprite>` element and the bundle format |
| [docs/stage.md](packages/pixel-studio/docs/stage.md) | `<pixel-stage>`: characters living on a page |
| [docs/performance.md](packages/pixel-studio/docs/performance.md) | measured sizes, load and frame costs (`scripts/bench/`) |
| [docs/playground.md](packages/pixel-studio/docs/playground.md) | the URL-driven playground page |
| [docs/DESIGN.md](packages/pixel-studio/docs/DESIGN.md) | why the format looks the way it does |

## Rules the code keeps

- **No dependencies.** Not at runtime, not for tests, not for building. (`@pixel-studio/core` depends on
  `@pixel-studio/runtime`, its sibling in this repository, and nothing else.)
- **`src/core` is isomorphic.** No DOM, no Node APIs. Node-only code goes in `src/node`, `bin`, `scripts`;
  browser-only code in `packages/runtime` and `studio`.
- **The runtime never imports the engine.** It plays finished bundles, so a site can install it alone.
- **Two packages, one version.** `@pixel-studio/core` and `@pixel-studio/runtime` are always released together with the
  same version, and `@pixel-studio/core` depends on exactly that runtime version. `npm run version:set -- <version>`
  sets all three; a test fails if they drift.
- **Deterministic.** The same spec renders the same pixels on every machine. No `Math.random`, no clocks.
- **Everything reduces to a plain spec.** `extends`, figures and motions expand into ordinary parts and tracks
  before validation, so every tool (validator, linter, renderer, studio) understands the result.
- **Errors point at the problem.** Validation messages carry a JSON path and, for typos, a suggestion. Prefer
  a helpful error or warning to silently doing something odd.
- **Agents are users.** Anything an agent must learn to use a feature goes into `packages/pixel-studio/docs/SPEC.md` (it is the brief),
  short and with an example.

## Making a change

1. Add or change a test in the package's `test/` (`node:test`, `assert/strict`). Rendering tests compare pixels or
   pixel-derived facts; motion tests check physical facts (planted feet do not move, volume is preserved).
2. Make the change. Keep functions small and comments about *why*.
3. `npm test` passes. For anything visual, also look at it:
   `node packages/pixel-studio/bin/pixel.mjs preview packages/pixel-studio/examples/<name>.json --out /tmp/x.png`.
4. If you changed a format or behaviour, update `packages/pixel-studio/docs/` (and `docs/SPEC.md` there if agents
   need to know).
   If example output changed, run `npm run build:demo` (and `npm run previews`).
5. Add an entry to `CHANGELOG.md` under *Unreleased* if users will notice the change (see below).

### Changelog entries

`CHANGELOG.md` is for the people who use Pixel Studio: it is published at
[pixel-studio.sh/changelog](https://pixel-studio.sh/changelog/) (and its RSS feed), becomes the GitHub release notes,
and is read by people deciding whether to update. Write each entry so they can act on it:

- **Say what users can now do, or what changed for them**, not how it was built. "`<pixel-sprite loading="lazy">`
  waits to download a character until it is near the screen" rather than "a second IntersectionObserver". Name the
  attribute, option, command or page, and link the docs with a full `https://pixel-studio.sh/docs/...` URL (it
  works on GitHub, on npm and on the site).
- **Start with the part it concerns**, in bold with a colon: `**Runtime:**`, `**Engine:**`, `**CLI:**`,
  `**Examples:**`, `**Packages:**`, `**Studio:**`, `**Docs:**` or `**Website:**` (the list at the top of the file
  says what each covers; the site shows them as labels, and its build fails on an entry without one).
- **Pick the Keep a Changelog section**: Added, Changed, Deprecated, Removed, Fixed or Security. If users must change
  their code, commands or files when they update, also add an entry under **Upgrading** (the first section) that
  says exactly what to do, with the old and new spelling.
- **Leave out what users don't see**: refactors, tests, CI, the benchmark scripts' internals, the site's styling,
  TODO.md. Studio and website changes count when they change what visitors can do (a new page, a new tool, a new
  option in the studio), not when they restyle it.
- One entry per change, a few lines at most; continuation lines are indented by two spaces. Don't add headings
  other than `## [version] - YYYY-MM-DD` and the `###` sections: the release workflow and the site read them.

New figures, examples and motion presets are very welcome: see "Writing a new figure" in
[docs/figures.md](packages/pixel-studio/docs/figures.md). Characters you contribute must be your own designs, not
recreations of existing characters or games.

## Releasing

Both packages are released together, from one signed tag, with the same version.

1. `npm run version:set -- <version>` (for example `0.2.0-alpha.2`): sets both versions, pins `@pixel-studio/core`'s
   dependency on exactly that runtime, moves the changelog's *Unreleased* notes under the version, and refreshes
   the lockfile. It commits nothing.
2. Review `git diff`; commit it signed: `git commit -S -am "Release <version>"`.
3. Tag it signed and push both: `git tag -s v<version> -m "Pixel Studio <version>"`, then
   `git push origin main v<version>`.
4. The tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): it checks the tag against both
   versions, runs the tests, packs both packages, creates the GitHub release (with both tarballs, their SHA-256 and
   the changelog section) and **stages** both on npm (pre-releases under their label, `alpha`, `beta`, `rc`).
5. Approve them with your npm 2FA, **`@pixel-studio/runtime` first** (`@pixel-studio/core` depends on exactly that
   version): `npm stage list`, then `npm stage approve <stage-id> --otp=<code>` for each (npm 11.15.0+), or from the
   packages' pages on npmjs.com. The workflow cannot publish on its own: its trusted publisher may only stage.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

## Browser checks

`test/browser/runtime.html` checks the runtime in a real browser (open it on any device while `npm run studio` runs).
To run it, and every page of the website's guide, in Firefox and WebKit, serve both (`npm run studio` here, and
`npm run build && npm run preview` in `website/`), install Playwright anywhere outside the project and run the script
from there:

```bash
mkdir /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install firefox webkit
node /path/to/pixel-studio/scripts/browser-check.mjs   # --browsers firefox,webkit,chromium  --base http://localhost:5173  --site http://localhost:4321
```

