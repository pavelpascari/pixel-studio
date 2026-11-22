# To do

Open work on the website, the studio and the runtime, most valuable first within each group. When something here is
done, remove it in the same pull request.

## Performance

Measured in [docs/performance.md](packages/pixel-studio/docs/performance.md); rerun with `scripts/bench/`.

Items marked *(release)* change the published packages, so they ship with the next Pixel Studio release.

- [ ] **Trim the landing page's own character files.** The hero's 72 px characters need neither the 64 px sheets nor
      the front and back views: build them with `--res 16,32 --views none` (about 100 to 150 KB less on the homepage,
      no code changes). Keep the "Small" row's characters as they are: its sizes are the default build.
- [ ] **Lazy loading.** A `loading="lazy"` option on `<pixel-sprite>` that waits to fetch and decode the bundle until
      the sprite is near the viewport (the existing `IntersectionObserver`). Today a sprite far below the fold still
      downloads its bundle and holds 1 to 20 MB of decoded sheet. *(release)*
- [ ] **Reserve the box.** Give a sprite its size before the element upgrades (a size hint, or the documented CSS
      rule), so it causes no layout shift: CLS 0.031 for one sprite now, 0.003 with the `:not(:defined)` rule.
- [ ] **Minified runtime.** Ship minified `pixel-sprite.js` and `pixel-stage.js` in `@pixel-studio/runtime`, beside
      the readable source: about 40% smaller (brotli 13.3 → 7.6 KB for the sprite, 38 → about 24 KB with the stage).
      Remove the pre-0.2 event names ("legacy name, remove after 0.2.0-alpha") at the same time. *(release)*
- [ ] **Bundle only what a page uses.** `pixel bundle --anims idle,waddle,honk`, with a `stage` preset for the roles
      a stage needs (idle, walk, jump, fall, duck, peek). Document "bundle only what you use" on the performance
      page. *(release)*
- [ ] **Idle stage.** Stop a stage's frame loop while every actor is off-screen and none keeps itself in view.
      Measure that case first: it is the one gap in the benchmark.
- [ ] **Views off by default.** `pixel bundle` without front and back views unless the character is meant for a
      stage: a goose bundle halves. It changes the default output, so it goes in the changelog. *(release)*
- [ ] **Measure more.** Firefox, Safari and real phones.

## Landing page

- [ ] **Pause button on phones.** The fixed "Pause characters" button covers a corner of the hero demo: smaller, or
      docked in the demo, on narrow screens.
- [ ] **Guided edits in "Make it yours".** One change beyond skins, such as a colour picker that edits a material
      and shows the spec diff.
- [ ] **The AI section.** A real request → character → refinement → refined character, in the same scene, from a
      recorded studio session (not a mock-up).
- [ ] **A scroll moment.** One composed moment further down the page, e.g. a character on a feature card or divider
      as the reader scrolls.
- [ ] **Examples.** Re-take the figures poster mid-animation and zoomed in; label any concept example until it has a
      working demo.

## Studio

- [ ] **Entry view from the landing page.** Open with the character picked there, the preview as the main element,
      a few common actions and one next step (customise, create with Claude, export); the full spec and rendering
      controls one click away. Today only the playground link carries the choice (`?c=…&skin=…&anim=…`).

## Release and site

- [ ] **Release.** The fox's ears and the goose's party hat reach npm with the next Pixel Studio release.
- [ ] **Deploys from CI.** Cloudflare secrets for the website workflow, so production no longer depends on a local
      `wrangler deploy`.
- [ ] **Page title.** A shorter title for the site.
