// What Pixel Studio characters cost a page in a real browser: load impact (Lighthouse, throttled mobile profile, simulated and
// applied throttling) and
// runtime cost (main-thread time per frame, JS heap, process memory) for 0, 1, 10 and 50 sprites, 50 off-screen,
// 50 under reduced motion, and a stage with three actors. The numbers on packages/pixel-studio/docs/performance.md.
//
// Lighthouse and Playwright are not dependencies of this project (like scripts/browser-check.mjs): install them in any
// folder and run this script from there. It drives an installed Google Chrome (or any Chromium: --chrome <path>).
//
//   mkdir /tmp/bench && cd /tmp/bench && npm i lighthouse playwright-core
//   node /path/to/pixel-studio/scripts/bench/browser.mjs [--runs 5] [--only load|runtime] [--chrome <path>] [--json out.json]
//   node /path/to/pixel-studio/scripts/bench/browser.mjs --serve [--port 4917]   only serve the test pages
//
// Needs demo/assets (npm run build:demo). It serves the repository root itself (gzip, like a static host), on a free
// port, with the test pages made from scripts/bench/page.html. Takes about 25 minutes with --runs 5.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release, platform } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg('runs', 5));
const ONLY = arg('only', 'load,runtime').split(',');
const CHROME = arg('chrome', process.env.CHROME_PATH || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[platform()]);
const WINDOW_MS = 4000;   // each runtime measurement window
if (!existsSync(join(ROOT, 'demo/assets/fox.bundle.json'))) { console.error('demo/assets is missing: run `npm run build:demo` first'); process.exit(2); }
if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME}: pass --chrome <path> or set CHROME_PATH`); process.exit(2); }

const req = createRequire(join(process.cwd(), 'x.js'));
const load = async (name) => { try { return await import(pathToFileURL(req.resolve(name)).href); } catch { return null; } };
const pwModule = (await load('playwright-core')) ?? (await load('playwright'));
const pw = pwModule?.chromium ? pwModule : pwModule?.default;
if (!pw?.chromium) { console.error('playwright-core not found: run this from a folder where it is installed (npm i lighthouse playwright-core)'); process.exit(2); }

// ---------- the test pages ----------

const SPRITE_JS = '<script type="module" src="/packages/runtime/src/pixel-sprite.js"></script>';
const STAGE_JS = '<script type="module" src="/packages/runtime/src/pixel-stage.js"></script>';
const foxes = (n) => '<div class="grid">' + Array.from({ length: n }, (_, i) =>
  `<pixel-sprite src="/demo/assets/fox.bundle.json" anim="${i % 2 ? 'trot' : 'walk'}" size="64" alt="${i ? '' : 'A fox'}"></pixel-sprite>`).join('') + '</div>';
const STAGE = `<pixel-stage>
  <pixel-actor src="/demo/assets/goose-root.bundle.json" size="80" alt="a goose" start="#card-a"></pixel-actor>
  <pixel-actor src="/demo/assets/pip.bundle.json" size="72" alt="Pip" start="#card-b"></pixel-actor>
  <pixel-actor src="/demo/assets/slime.bundle.json" size="56" alt="a slime" start="#card-c"></pixel-actor>
</pixel-stage>`;
/** name → what goes into page.html's three slots, and how the runtime case is run. */
const CASES = {
  'plain': { label: 'Plain page (no characters)' },
  'sprite-1': { label: '1 sprite', head: SPRITE_JS, sprites: foxes(1) },
  // runtime.md's rule for the box before the script runs (an undefined element is inline and has no size).
  'sprite-1-reserved': { label: '1 sprite, box reserved in CSS', head: `${SPRITE_JS}<style>pixel-sprite:not(:defined){display:inline-block;width:64px;height:64px}</style>`, sprites: foxes(1) },
  'sprite-10': { label: '10 sprites', head: SPRITE_JS, sprites: foxes(10) },
  'sprite-50': { label: '50 sprites', head: SPRITE_JS, sprites: foxes(50) },
  'sprite-50-offscreen': { label: '50 sprites, all off-screen', head: SPRITE_JS, sprites: `<div class="spacer"></div>${foxes(50)}` },
  'sprite-50-reduced': { label: '50 sprites, reduced motion', head: SPRITE_JS, sprites: foxes(50), reducedMotion: 'reduce' },
  'stage-3': { label: 'Stage with 3 actors', head: STAGE_JS, body: STAGE },
};
const LOAD_CASES = ['plain', 'sprite-1', 'sprite-1-reserved', 'stage-3'];
const RUNTIME_CASES = Object.keys(CASES).filter((n) => n !== 'sprite-1-reserved');
const TEMPLATE = readFileSync(join(ROOT, 'scripts/bench/page.html'), 'utf8');
const pageFor = (c) => TEMPLATE.replace('<!-- head -->', c.head ?? '').replace('<!-- sprites -->', c.sprites ?? '').replace('<!-- body -->', c.body ?? '');

// ---------- a static server: the repository root, gzip for text, like a static host ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
const server = createServer((rq, res) => {
  const path = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  let body, type;
  const m = /^\/bench\/([\w-]+)\.html$/.exec(path);
  if (m && CASES[m[1]]) { body = Buffer.from(pageFor(CASES[m[1]])); type = TYPES['.html']; }
  else {
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep) || file.slice(ROOT.length).split(sep).some((s) => s.startsWith('.')) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    try { body = readFileSync(file); } catch { res.writeHead(404); return res.end(); }
    type = TYPES[extname(file)] || 'application/octet-stream';
  }
  const headers = { 'content-type': type, 'cache-control': 'no-cache' };
  if (/text|json/.test(type) && /gzip/.test(rq.headers['accept-encoding'] ?? '')) { body = gzipSync(body, { level: 9 }); headers['content-encoding'] = 'gzip'; }
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
});
await new Promise((r) => server.listen(Number(arg('port', 0)), '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
// --serve: only serve the test pages, to look at them or profile them by hand.
if (process.argv.includes('--serve')) {
  console.log(Object.keys(CASES).map((n) => `${BASE}/bench/${n}.html`).join('\n'));
  await new Promise(() => {});
}

// ---------- helpers ----------

const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
/** Resident memory of every process started by this one (the browser's whole process tree), in bytes. */
function treeRss() {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Map();
  for (const [pid, ppid] of rows) (kids.get(ppid) ?? kids.set(ppid, []).get(ppid)).push(pid);
  const rss = new Map(rows.map(([pid, , r]) => [pid, r]));
  let total = 0;
  const walk = (pid) => { for (const k of kids.get(pid) ?? []) { total += rss.get(k) * 1024; walk(k); } };
  walk(process.pid);
  return total;
}

// ---------- runtime: main-thread time per frame ----------

/** One measurement window: main-thread busy time (CDP Performance.getMetrics TaskDuration) per rendered frame. */
async function measureWindow(page, cdp) {
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => { window.__long = 0; window.__frames0 = window.__frames; });
  const a = await metrics();
  await page.waitForTimeout(WINDOW_MS);
  const b = await metrics();
  const { frames, long } = await page.evaluate(() => ({ frames: window.__frames - window.__frames0, long: window.__long }));
  const d = (k) => (b[k] - a[k]) * 1000;
  return { frames, fps: frames / (WINDOW_MS / 1000), taskMs: d('TaskDuration') / frames, scriptMs: d('ScriptDuration') / frames, longTasks: long };
}

async function runtimeRun(name) {
  const c = CASES[name];
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: c.reducedMotion ?? 'no-preference' });
    const page = await context.newPage();
    // A frame counter on every page (the plain page too), so frames are produced and counted the same way everywhere.
    await page.addInitScript(() => {
      window.__frames = 0; window.__long = 0;
      const tick = () => { window.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      try { new PerformanceObserver((l) => { window.__long += l.getEntries().length; }).observe({ type: 'longtask' }); } catch { /* no long task API */ }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`${BASE}/bench/${name}.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const sprites = [...document.querySelectorAll('pixel-sprite'), ...[...document.querySelectorAll('pixel-actor')].map((a) => a.sprite)];
      return sprites.every((s) => s && s.status === 'ready');
    }, null, { timeout: 30000 });
    const visible = await page.evaluate(() => [...document.querySelectorAll('pixel-sprite, pixel-actor')].filter((s) => {
      const r = s.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    }).length);
    await page.waitForTimeout(1500);   // warm up: JIT, first decodes, actors leaving their start spots
    const fast = await measureWindow(page, cdp);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1000);
    const slow = await measureWindow(page, cdp);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    return { visible, fast, slow, heap, rss: treeRss() };
  } finally {
    await browser.close();
  }
}

async function runtime() {
  const out = {};
  for (const name of RUNTIME_CASES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await runtimeRun(name));
    const med = (f) => median(runs.map(f));
    out[name] = {
      label: CASES[name].label, visible: runs[0].visible,
      fps: med((r) => r.fast.fps), taskMs: med((r) => r.fast.taskMs), scriptMs: med((r) => r.fast.scriptMs), longTasks: med((r) => r.fast.longTasks),
      fps4x: med((r) => r.slow.fps), taskMs4x: med((r) => r.slow.taskMs), scriptMs4x: med((r) => r.slow.scriptMs), longTasks4x: med((r) => r.slow.longTasks),
      heap: med((r) => r.heap), rss: med((r) => r.rss), runs,
    };
    console.error(`runtime ${name}: ${fx(out[name].taskMs, 2)} ms/frame (4x: ${fx(out[name].taskMs4x, 2)}), heap ${fx(out[name].heap / 1048576)} MB, rss ${fx(out[name].rss / 1048576)} MB`);
  }
  return out;
}

// ---------- load: Lighthouse, default mobile profile (slow 4G, 4x CPU slowdown, Moto G Power screen) ----------
// Twice: with Lighthouse's default simulated throttling (a model run on an unthrottled load), and with throttling
// applied in the browser (devtools), which is slower to run but times what really happens.

async function loadImpact(method) {
  const lh = await load('lighthouse');
  const launcher = await load('chrome-launcher');
  if (!lh || !launcher) { console.error('lighthouse not found: skipping the load measurements (npm i lighthouse)'); return null; }
  const out = {};
  for (const name of LOAD_CASES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const chrome = await launcher.launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-first-run'] });
      try {
        const r = await lh.default(`${BASE}/bench/${name}.html`, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], throttlingMethod: method });
        const a = r.lhr.audits;
        const diag = a.diagnostics?.details?.items?.[0] ?? {};
        runs.push({
          fcp: a['first-contentful-paint'].numericValue, lcp: a['largest-contentful-paint'].numericValue,
          tbt: a['total-blocking-time'].numericValue, cls: a['cumulative-layout-shift'].numericValue,
          bytes: diag.totalByteWeight, requests: diag.numRequests, longTasks: diag.numTasksOver50ms,
          mainThread: a['mainthread-work-breakdown'].numericValue, score: r.lhr.categories.performance.score,
          longTaskList: (a['long-tasks']?.details?.items ?? []).map((t) => `${t.url} ${Math.round(t.duration)} ms`),
          shifts: (a['layout-shifts']?.details?.items ?? []).map((t) => `${t.node?.selector} ${t.score.toFixed(3)}`),
          lighthouse: r.lhr.lighthouseVersion,
        });
      } finally {
        await chrome.kill();
      }
    }
    const med = (k) => median(runs.map((r) => r[k]));
    out[name] = { label: CASES[name].label, ...Object.fromEntries(['fcp', 'lcp', 'tbt', 'cls', 'bytes', 'requests', 'longTasks', 'mainThread', 'score'].map((k) => [k, med(k)])), lighthouse: runs[0].lighthouse, runs };
    console.error(`load ${method} ${name}: LCP ${fx(out[name].lcp, 0)} ms, TBT ${fx(out[name].tbt, 0)} ms, ${out[name].requests} requests, ${fx(out[name].bytes / 1024)} KB`);
  }
  return out;
}

// ---------- run and print ----------

const env = { cpu: cpus()[0].model, cores: cpus().length, ram: `${Math.round(totalmem() / 2 ** 30)} GB`, os: `${platform()} ${release()}`, node: process.version, runs: RUNS };
{
  const b = await pw.chromium.launch({ executablePath: CHROME, headless: true });
  env.chrome = b.version();
  await b.close();
}
const results = { env };
try {
  if (ONLY.includes('load')) results.load = { simulate: await loadImpact('simulate'), devtools: await loadImpact('devtools') };
  if (ONLY.includes('runtime')) results.runtime = await runtime();
} finally {
  server.close();
}

console.log(`Machine: ${env.cpu} (${env.cores} threads), ${env.ram}, ${env.os}; Chrome ${env.chrome} headless; Node ${env.node}; median of ${RUNS} runs.\n`);
if (results.load) {
  const { simulate: S, devtools: D } = results.load;
  if (S && D) {
    console.log(`Load (Lighthouse ${Object.values(S)[0].lighthouse}, mobile profile: slow 4G, 4x CPU slowdown; LCP and TBT simulated / applied throttling)\n`);
    console.log('| Page | LCP, simulated | LCP, applied | TBT, simulated | TBT, applied | CLS | Transferred | Requests |\n|---|--:|--:|--:|--:|--:|--:|--:|');
    for (const [name, r] of Object.entries(S)) {
      const d = D[name];
      console.log(`| ${r.label} | ${fx(r.lcp, 0)} ms | ${fx(d.lcp, 0)} ms | ${fx(r.tbt, 0)} ms | ${fx(d.tbt, 0)} ms | ${fx(r.cls, 3)} | ${fx(r.bytes / 1024)} KB | ${r.requests} |`);
    }
  }
  console.log('');
}
if (results.runtime) {
  const R = results.runtime;
  const base = R.plain;
  const added = (v, b) => `${fx(v - b, 2)} ms (${fx(((v - b) / 16.7) * 100)}%)`;
  console.log(`Runtime (1280×900 viewport, DPR 1; ${WINDOW_MS / 1000} s windows; main-thread busy time per frame, and what the characters add to the plain page as a share of a 16.7 ms frame)\n`);
  console.log('| Case | Visible | Per frame | Added (% of frame) | Per frame, 4x CPU | Added, 4x CPU | fps, 4x CPU | Long tasks |\n|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const [name, r] of Object.entries(R)) {
    const plain = name === 'plain';
    console.log(`| ${r.label} | ${r.visible} | ${fx(r.taskMs, 2)} ms | ${plain ? '' : added(r.taskMs, base.taskMs)} | ${fx(r.taskMs4x, 2)} ms | ${plain ? '' : added(r.taskMs4x, base.taskMs4x)} | ${fx(r.fps4x, 0)} | ${r.longTasks + r.longTasks4x} |`);
  }
  console.log('\nMemory (after a forced garbage collection; added to the plain page)\n');
  console.log('| Case | JS heap | All browser processes (RSS) |\n|---|--:|--:|');
  for (const [name, r] of Object.entries(R)) {
    if (name === 'plain') console.log(`| ${r.label} | ${fx(r.heap / 1048576)} MB | ${fx(r.rss / 1048576, 0)} MB |`);
    else console.log(`| ${r.label} | +${fx((r.heap - base.heap) / 1048576)} MB | ${fx((r.rss - base.rss) / 1048576, 0)} MB |`);
  }
}
const jsonOut = arg('json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
