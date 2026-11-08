// Run the in-browser checks and every docs-site page in real browser engines (Firefox and WebKit by
// default; add chromium with --browsers). Playwright is not a dependency of this project: install it in
// any folder and run this script from there, with the dev server running (npm run studio):
//
//   mkdir /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install firefox webkit
//   node /path/to/pixel-studio/scripts/browser-check.mjs [--base http://localhost:5173] [--browsers firefox,webkit,chromium]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:5173');
let pw;
try { pw = createRequire(join(process.cwd(), 'x.js'))('playwright'); }
catch { console.error('playwright not found: run this from a folder where it is installed (npm i playwright)'); process.exit(2); }

const PAGES = ['index', 'sprite', 'events', 'states', 'moving', 'stage', 'authoring', 'motions', 'export'];
const EXPECTED = /missing\.bundle|does-not-exist|404|Failed to load resource/;   // the checks' own deliberate failures
let failed = false;
for (const name of arg('browsers', 'firefox,webkit').split(',')) {
  const browser = await pw[name].launch();
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
    await pg.goto(`${BASE}/site/${p}.html`);
    await pg.waitForTimeout(['motions', 'authoring'].includes(p) ? 6000 : 3000);
    const bad = await pg.evaluate(() => [
      ...[...document.querySelectorAll('pixel-sprite')].filter((s) => s.state !== 'ready' && !/missing/.test(s.getAttribute('src'))).map((s) => `sprite ${s.getAttribute('src')}: ${s.state}`),
      ...[...document.querySelectorAll('.pg-status')].filter((s) => !s.classList.contains('ok')).map((s) => `playground: ${s.textContent.slice(0, 100)}`),
    ]);
    if (errs.length || bad.length) { failed = true; report.push(`site/${p}.html: ${[...errs, ...bad].join(' | ')}`); }
    await pg.close();
  }
  console.log(`${name}: ${report.join('\n  ')}${report.length === 1 ? '\n  docs site: all pages clean' : ''}`);
  await browser.close();
}
process.exit(failed ? 1 : 0);
