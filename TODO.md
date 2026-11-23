# To do

Open work on the website, the studio and the runtime, most valuable first within each group. When something here is
done, remove it in the same pull request.

## Performance

Measured in [docs/performance.md](packages/pixel-studio/docs/performance.md); rerun with `scripts/bench/`.

Items marked *(release)* change the published packages, so they ship with the next Pixel Studio release.

- [ ] **Reserve the box.** Give a sprite its size before the element upgrades (a size hint, or the documented CSS
      rule), so it causes no layout shift: CLS 0.031 for one sprite now, 0.003 with the `:not(:defined)` rule.
- [ ] **Minified runtime.** Ship minified `pixel-sprite.js` and `pixel-stage.js` in `@pixel-studio/runtime`, beside
      the readable source: about 40% smaller (brotli 13.3 → 7.6 KB for the sprite, 38 → about 24 KB with the stage).
      Remove the pre-0.2 event names ("legacy name, remove after 0.2.0-alpha") at the same time. *(release)*
- [ ] **Idle stage.** Stop a stage's frame loop while every actor is off-screen and none keeps itself in view.
      Measure that case first: it is the one gap in the benchmark.
- [ ] **Measure more.** Firefox, Safari and real phones.

## Landing page

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

- [ ] **Deploys from CI.** Cloudflare secrets for the website workflow, so production no longer depends on a local
      `wrangler deploy`.
- [ ] **Page title.** A shorter title for the site.
- [ ] **Template beta.8.** Release astro-project-site 0.1.0-beta.8 (compact header search, blog heading links) and
      move the site to it; then remove the "Section titled" workaround from `website/src/styles/theme.css`.
- [ ] **A post on working with Claude.** How the site, the studio and the posts were made with Claude Code.
