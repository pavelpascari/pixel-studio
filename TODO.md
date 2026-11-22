# To do

Open work on the website, the studio and the runtime, most valuable first within each group. When something here is
done, remove it in the same pull request.

## Performance

Measured in [docs/performance.md](packages/pixel-studio/docs/performance.md); rerun with `scripts/bench/`.

- [ ] **Lazy loading.** A `loading="lazy"` option on `<pixel-sprite>` that waits to fetch and decode the bundle until
      the sprite is near the viewport (the existing `IntersectionObserver`). Today a sprite far below the fold still
      downloads its bundle and holds 1 to 20 MB of decoded sheet.
- [ ] **Reserve the box.** Give a sprite its size before the element upgrades, so it causes no layout shift
      (CLS 0.031 for one sprite now; 0.003 with the `:not(:defined)` rule the performance page documents).
- [ ] **Minified runtime.** Ship minified `pixel-sprite.js` and `pixel-stage.js` in `@pixel-studio/runtime`, beside
      the readable source: about 40% smaller (brotli 13.3 → 7.6 KB for the sprite, 38 → about 24 KB with the stage).
      Remove the pre-0.2 event names ("legacy name, remove after 0.2.0-alpha") at the same time.
- [ ] **Bundle only what a page uses.** A `pixel bundle --anims idle,waddle,honk` option (and a `stage` preset for
      the roles a stage needs), and build the website's own characters with the resolutions and views they use.
- [ ] **Views off by default.** `pixel bundle` without front and back views unless asked for: a goose bundle halves.
- [ ] **Idle stage.** Stop a stage's frame loop while every actor is off-screen and none keeps itself in view.
- [ ] **Measure more.** Firefox, Safari and real phones; a playing stage whose actors are all off-screen.

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
