// Re-take the website gallery's posters (website/src/content/gallery/*.jpg): 1280×720 JPEGs of the demo and studio
// pages, each cropped to the part worth seeing at card size (the characters, not the whole page). Each shot is a
// 16:9 clip of the page taken at whatever device scale makes it exactly 1280 px wide, so the pixel art is drawn
// at that size by the browser rather than upscaled afterwards. Dark colour scheme, in WebKit.
//
// Playwright is not a dependency of this project: install it in any folder and run this script from there, with
// the demo assets built (npm run build:demo) and the dev server running (npm run studio):
//
//   mkdir /tmp/pw && cd /tmp/pw && npm i playwright-core && npx playwright install webkit
//   node /path/to/pixel-studio/scripts/gallery-posters.mjs [--base http://localhost:5173] [--only demo-flock,studio-goose]
//        [--webkit /path/to/webkit/executable]
//
// The characters move, so every run frames them a little differently: look at each image, re-take any that came
// out badly with --only, and update the entry's posterAlt (in its .yaml) if what it shows has changed.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:5173');
const ONLY = arg('only', '').split(',').filter(Boolean);
const OUT = resolve(fileURLToPath(new URL('../website/src/content/gallery/', import.meta.url)));
const require = createRequire(join(process.cwd(), 'x.js'));
let pw;
try { pw = require('playwright-core'); } catch {
  try { pw = require('playwright'); } catch { console.error('playwright not found: run this from a folder where it is installed'); process.exit(2); }
}

const W = 1280;   // poster width in px; the height follows from 16:9
let FIXED = 0;    // on the second pass, the clip width measured on the first (the device scale was chosen from it)

const box = (page, sel) => page.locator(sel).first().boundingBox().then((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
/** The visible part of the page, to keep a clip inside. */
const viewport = (page) => ({ x: 0, y: 0, w: page.viewportSize().width, h: page.viewportSize().height });
/** Boxes of the drawn canvases of the <pixel-sprite>s / <pixel-actor>s matching `sel` (their hosts can measure 0×0). */
const spriteBoxes = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
  while (el.shadowRoot?.querySelector('canvas, pixel-sprite')) el = el.shadowRoot.querySelector('canvas, pixel-sprite');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}).filter((b) => b.w > 0), sel);

/**
 * A 16:9 clip centred on the union of `boxes` (grown by `pad`, then shifted by dx/dy), at least `width` CSS px wide and
 * wide enough to hold the union, moved to stay inside `within`. On the second pass its width is the first pass's.
 */
function frame(boxes, { width = 0, pad = 0, within, dx = 0, dy = 0 } = {}) {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  const w = FIXED || Math.max(width, x1 - x0, (y1 - y0) * 16 / 9), h = w * 9 / 16;
  let x = (x0 + x1) / 2 - w / 2 + dx, y = (y0 + y1) / 2 - h / 2 + dy;
  if (within) {
    x = Math.min(Math.max(x, within.x), within.x + within.w - w);
    y = Math.min(Math.max(y, within.y), within.y + within.h - h);
  }
  return { x, y, width: w, height: h };
}

/** Wait until every <pixel-sprite>/<pixel-actor> on the page has loaded its bundle. */
const spritesReady = (page) => page.waitForFunction(() =>
  [...document.querySelectorAll('pixel-sprite, pixel-actor')].every((el) => el.getAttribute('status') !== 'loading' && el.shadowRoot?.querySelector('canvas')),
  null, { timeout: 15000 }).catch(() => {});

/** Each poster: the page, its viewport (default 1280×720), and shoot(page) → the clip, after setting the scene up. */
const POSTERS = {
  // The flock answering "sudo honk --all": the whole lawn, at a viewport width that makes it 16:9.
  'demo-flock': {
    path: '/demo/flock.html',
    viewport: { width: 716, height: 720 },
    async shoot(page) {
      await page.waitForTimeout(3000);
      await page.locator('#honkAll').click();
      await page.waitForTimeout(350);
      return frame([await box(page, '#lawn')]);
    },
  },
  // Trailmark's hero sky scene: the fox, the boy and the slime, across the whole width of the scene.
  'demo-index': {
    path: '/demo/',
    async shoot(page) {
      await page.waitForTimeout(2500);
      const stage = await box(page, '.hero .stage'), w = FIXED || stage.w, h = w * 9 / 16;
      return { x: stage.x, y: stage.y + stage.h - h - 6, width: w, height: h };
    },
  },
  // Fox Trail mid-run: the fox in the air over an obstacle (the script plays, jumping when one comes near).
  'demo-runner': {
    path: '/demo/runner.html',
    async shoot(page) {
      const game = await box(page, '#game');
      await page.evaluate(() => new Promise((done) => {
        const { S, jump, start } = window.foxTrail;
        start();
        const fox = document.getElementById('fox'), x = fox.getBoundingClientRect().x - document.getElementById('game').getBoundingClientRect().x;
        const tick = () => {
          const o = S.obstacles.find((o) => o.x > x - 20);
          if (o && !S.air && o.x - x < 150) jump();
          // Done when, after a couple of seconds' run, the fox is near the top of a leap with an obstacle beneath it.
          if (S.t > 2.5 && S.air && S.vy < 60 && S.obstacles.some((o) => Math.abs(o.x - x - 40) < 50)) return done();
          requestAnimationFrame(tick);
        };
        tick();
      }));
      return frame([{ ...game, w: game.h * 16 / 9 }], { within: game });
    },
  },
  // The Trailhead stage playing its scene "The plan": Moss on "Lakeside" thinking aloud, by the crate and the cloud.
  'demo-stage': {
    path: '/demo/stage.html',
    async shoot(page) {
      // Moss does not always make it to "Lakeside" (the characters wander first): try again from a fresh page.
      for (let attempt = 1; ; attempt++) {
        await spritesReady(page);
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.getElementById('scene').click());   // without scrolling down to the button
        const ok = await page.waitForFunction(() => {
          const moss = document.getElementById('moss'), card = document.getElementById('card-b').getBoundingClientRect();
          const r = moss.shadowRoot.querySelector('pixel-sprite').getBoundingClientRect(), mid = r.x + r.width / 2;
          return /think/.test(moss.shadowRoot.querySelector('.say.on')?.textContent ?? '') && mid > card.left && mid < card.right;
        }, null, { timeout: 25000 }).then(() => true, () => false);
        if (ok) break;
        if (attempt === 4) throw new Error('demo-stage: Moss never reached "Lakeside"');
        await page.reload();
      }
      await page.waitForTimeout(400);
      const boxes = await Promise.all(['#card-a', '#card-b', '#crate'].map((s) => box(page, s)));
      boxes.push(...await spriteBoxes(page, '#moss'));
      boxes.push(await page.evaluate(() => {
        const r = document.getElementById('moss').shadowRoot.querySelector('.say').getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }));
      return frame(boxes, { pad: 18, within: viewport(page) });
    },
  },
  // The studio: the goose large in the preview, facing out and flapping, with a little of the spec and the settings either side.
  'studio-index': {
    path: '/studio/',
    viewport: { width: 1280, height: 1000 },
    async shoot(page) {
      await page.waitForTimeout(2000);
      await page.locator('#anim-chips > *', { hasText: /^flap@front$/ }).click();
      await page.waitForTimeout(1500);
      const stage = await box(page, '#stage'), w = FIXED || 800, h = w * 9 / 16;
      return { x: stage.x + stage.w / 2 - w / 2, y: stage.y + stage.h - h, width: w, height: h };
    },
  },
  // The playground: the goose on its checkerboard and its frame strip, with the character and material controls.
  'studio-play': {
    path: '/studio/play.html',
    viewport: { width: 1100, height: 800 },
    async shoot(page) {
      await page.waitForTimeout(3000);
      const big = await box(page, '#big'), w = FIXED || 960;
      return { x: 1100 - w, y: big.y - 14, width: w, height: w * 9 / 16 };
    },
  },
  // The figure library: the dog skeleton mid-gallop, with its onion skin and foot trails.
  'studio-figures': {
    path: '/studio/figures.html#dog',
    viewport: { width: 1280, height: 800 },
    async shoot(page) {
      await page.waitForTimeout(800);
      await page.locator('#motions button[data-name="gallop"]').click();
      await page.locator('#onion').check();
      await page.waitForTimeout(2500);
      const cv = await box(page, '#cv');
      return frame([{ x: cv.x + cv.w * 0.2, y: cv.y + cv.h * 0.22, w: cv.w * 0.6, h: cv.h * 0.72 }], { pad: 10 });
    },
  },
  // The goose workbench: the goose large on its checkerboard under the size, background and overlay switches.
  'studio-goose': {
    path: '/studio/goose.html',
    async shoot(page) {
      await page.waitForTimeout(3000);
      const big = await box(page, '#big');
      return frame([big, { ...big, y: big.y - 50, h: 1 }], { pad: 8, within: viewport(page) });
    },
  },
};

const browser = await pw.webkit.launch(arg('webkit') ? { executablePath: arg('webkit') } : {});
for (const [name, p] of Object.entries(POSTERS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const viewport = p.viewport ?? { width: 1280, height: 720 };
  // Lay the page out at scale 1 to measure the clip, then shoot it at the scale that makes the clip 1280 px wide.
  let ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
  let page = await ctx.newPage();
  await page.goto(BASE + p.path);
  await spritesReady(page);
  const probe = await p.shoot(page);
  await ctx.close();
  const scale = W / probe.width;
  ctx = await browser.newContext({ viewport, colorScheme: 'dark', deviceScaleFactor: scale });
  page = await ctx.newPage();
  await page.goto(BASE + p.path);
  await spritesReady(page);
  FIXED = probe.width;
  const clip = await p.shoot(page);
  FIXED = 0;
  const png = await page.screenshot({ type: 'png', clip });
  // At a fractional scale the shot can come out a pixel short: draw it onto an exact 1280×720 canvas, then encode.
  const blank = await ctx.newPage();
  const jpeg = await blank.evaluate(async ([src, w, h]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }, [`data:image/png;base64,${png.toString('base64')}`, W, W * 9 / 16]);
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(jpeg.split(',')[1], 'base64'));
  await ctx.close();
  console.log(`${name}.jpg  clip ${clip.width.toFixed(0)}×${clip.height.toFixed(0)} at ${clip.x.toFixed(0)},${clip.y.toFixed(0)}  ×${(W / clip.width).toFixed(2)}`);
}
await browser.close();
