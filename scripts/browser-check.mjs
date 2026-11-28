// Run the in-browser runtime checks and every page of the website's guide (live examples and editable
// characters) in real browser engines (Firefox and WebKit by default; add chromium with --browsers). CI runs it in
// all three (the browser job in .github/workflows/ci.yml). Playwright is not a dependency of the packages:
// test/browser/package.json pins it, and the script is run from there, with the dev server running (npm run studio)
// and the website served (in website/: npm run build && npm run preview):
//
//   cd test/browser && npm ci && npx playwright install chromium firefox webkit
//   npm test -- [--base http://localhost:5173] [--site http://localhost:4321] [--browsers firefox,webkit,chromium]
//
// (Run from any other folder where playwright is installed, it uses that one.)
import { createRequire } from 'node:module';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:5173');
const SITE = arg('site', 'http://localhost:4321');
let pw;
try { pw = createRequire(join(process.cwd(), 'x.js'))('playwright'); }
catch { console.error('playwright not found: run this from a folder where it is installed (npm i playwright)'); process.exit(2); }

const PAGES = ['index', 'sprite', 'events', 'states', 'moving', 'stage', 'authoring', 'motions', 'export'];
const EXPECTED = /missing\.bundle|does-not-exist|404|Failed to load resource/;   // the checks' own deliberate failures
let failed = false;
for (const name of arg('browsers', 'firefox,webkit').split(',')) {
  // Firefox blocks WebGL on GPU-less machines (CI runners have only a software renderer), and the guide's PixiJS
  // example needs it: PixiJS 8 has no canvas fallback. Allow the software renderer.
  const browser = await pw[name].launch(name === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true } } : {});
  const report = [];
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${BASE}/test/browser/runtime.html`);
  await page.waitForFunction(() => !/running/.test(document.getElementById('summary').textContent), null, { timeout: 180000 });
  const summary = await page.evaluate(() => document.getElementById('summary').textContent);
  if (!/^all \d+ checks passed$/.test(summary)) { failed = true; report.push(`runtime checks: ${summary}`); } else report.push(summary);
  for (const p of PAGES) {
    const errs = [];
    const pg = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    pg.on('pageerror', (e) => errs.push(e.message));
    pg.on('console', async (m) => {
      if (m.type() !== 'error') return;
      const text = (await Promise.all(m.args().map((a) => a.evaluate((v) => v?.message ?? String(v)).catch(() => '')))).join(' ') || m.text();
      if (!EXPECTED.test(text)) errs.push(text);
    });
    await pg.goto(`${SITE}/docs/guide/${p === 'index' ? '' : `${p}/`}`);
    await pg.waitForTimeout(['motions', 'authoring'].includes(p) ? 6000 : 3000);
    // Pages with many sprites can still be loading on a busy machine: give them up to 15 s more.
    await pg.waitForFunction(() => ![...document.querySelectorAll('pixel-sprite')].some((s) => s.status === 'loading'), null, { timeout: 15000 }).catch(() => {});
    const bad = await pg.evaluate(() => [
      ...[...document.querySelectorAll('pixel-sprite')].filter((s) => s.status !== 'ready' && !/missing/.test(s.getAttribute('src'))).map((s) => `sprite ${s.getAttribute('src')}: ${s.status}`),
      ...[...document.querySelectorAll('.ps-status')].filter((s) => !s.classList.contains('ok')).map((s) => `playground: ${s.textContent.slice(0, 100)}`),
    ]);
    if (errs.length || bad.length) { failed = true; report.push(`guide/${p}: ${[...errs, ...bad].join(' | ')}`); }
    await pg.close();
  }
  console.log(`${name}: ${report.join('\n  ')}${report.length === 1 ? '\n  guide: all pages clean' : ''}`);
  await browser.close();
}
process.exit(failed ? 1 : 0);
