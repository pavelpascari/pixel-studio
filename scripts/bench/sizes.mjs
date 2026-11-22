// What a page downloads for Pixel Studio characters: the runtime files and every demo bundle, raw, gzip and brotli,
// and how much smaller one goose's bundle gets with fewer resolutions, views or animations, or with --external.
// Node built-ins only. The bundles come from demo/assets (npm run build:demo).
//
//   node scripts/bench/sizes.mjs            markdown tables
//   node scripts/bench/sizes.mjs --json     the raw numbers
//
// The same tables are generated into packages/pixel-studio/docs/performance.md by docs-gen (website/docs-gen.config.mjs),
// so `npm run build` in website/ fails when a bundle or a runtime file changes size and the page was not regenerated.
// KB = 1024 bytes. gzip at level 9 and brotli at quality 11 (what static hosts and CDNs use for pre-compressed files).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ASSETS = join(ROOT, 'demo/assets');
/** The goose measured with bundle options: the stage demo's goose (three resolutions, front and back views, two skins). */
export const GOOSE = 'goose-root';

const gzip = (buf) => gzipSync(buf, { level: 9 }).length;
const brotli = (buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
/** raw, gzip and brotli byte counts of a buffer or string. */
export function sizesOf(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return { raw: buf.length, gzip: gzip(buf), brotli: brotli(buf) };
}
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
export const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
/** Width × height × 4 bytes: what a decoded PNG data URL takes in memory as RGBA. */
function decodedBytes(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return 0;
  const png = Buffer.from(dataUrl.slice(22, 22 + 64), 'base64');   // the IHDR chunk is in the first 24 bytes
  return png.readUInt32BE(16) * png.readUInt32BE(20) * 4;
}

/** The two runtime files as published in @pixel-studio/runtime (unminified source, comments included). */
export function runtimeSizes() {
  return ['pixel-sprite.js', 'pixel-stage.js'].map((file) => ({ file, ...sizesOf(readFileSync(join(ROOT, 'packages/runtime/src', file))) }));
}

/** Every demo bundle: animations, sizes, and the decoded (RGBA) size of each default sheet, by resolution. */
export function bundleSizes() {
  if (!existsSync(ASSETS)) throw new Error('demo/assets is missing: run `npm run build:demo` first');
  return readdirSync(ASSETS).filter((f) => f.endsWith('.bundle.json')).sort().map((file) => {
    const text = readFileSync(join(ASSETS, file), 'utf8');
    const b = JSON.parse(text);
    const plain = b.variants.filter((v) => !v.skin);
    return {
      name: file.replace(/\.bundle\.json$/, ''), animations: Object.keys(b.animations).length,
      resolutions: plain.map((v) => v.res), skins: (b.skins ?? []).length,
      ...sizesOf(text), decoded: Object.fromEntries(plain.map((v) => [v.res, decodedBytes(v.image)])),
    };
  });
}

/** The goose rebuilt with the CLI's options (same code as `pixel bundle`): resolutions, views, animations, --external. */
export async function gooseOptions(name = GOOSE) {
  const { compile, buildBundle, resolveSpec } = await import('../../packages/pixel-studio/src/core/index.js');
  const { encodePNG } = await import('../../packages/pixel-studio/src/node/png.js');
  const read = (dir, file) => JSON.parse(readFileSync(join(ROOT, 'packages/pixel-studio', dir, file), 'utf8'));
  const c = compile(await resolveSpec(read('examples', `${name}.json`), {
    loadRef: (f) => read('examples', f), loadFigure: (n) => read('figures', `${n}.json`), warn: () => {},
  }));
  const encode = (w, h, rgba) => 'data:image/png;base64,' + encodePNG(w, h, rgba).toString('base64');
  const rows = [];
  const add = async (flags, opts, external = false) => {
    const bundle = await buildBundle(c, { encode, ...opts });
    const animations = Object.keys(bundle.animations).length;
    const top = bundle.variants.filter((v) => !v.skin).reduce((a, v) => (v.res > a.res ? v : a));
    const decoded = { res: top.res, bytes: decodedBytes(top.image) };
    if (!external) return rows.push({ flags, animations, decoded, ...sizesOf(JSON.stringify(bundle)) });
    // --external: the JSON plus the one PNG a page shows (the 32 px default sheet); PNGs are not re-compressed.
    const png = Buffer.from(bundle.variants.find((v) => v.res === 32 && !v.skin).image.slice(22), 'base64');
    for (const v of bundle.variants) for (const k of ['image', 'overlay']) if (typeof v[k] === 'string') v[k] = `${name}.${v.res}.png`;
    const json = sizesOf(JSON.stringify(bundle));
    rows.push({ flags, animations, decoded, raw: json.raw + png.length, gzip: json.gzip + png.length, brotli: json.brotli + png.length, external: true });
  };
  // The first row is the demo build (buildBundle's defaults: every view); the CLI ships the side view unless --views.
  await add('`--views all` (as built for the demos)', {});
  await add('(default: `--res 16,32,64`, side view only)', { views: [] });
  await add('`--anims stage`', { views: [], animations: ['stage'] });
  await add('`--anims idle,waddle,honk`', { views: [], animations: ['idle', 'waddle', 'honk'] });
  await add('`--views all --anims stage`', { animations: ['stage'] });
  await add('`--res 32 --views all`', { resolutions: [32] });
  await add('`--res 32`', { resolutions: [32], views: [] });
  await add('`--res 32 --anims idle,waddle,honk`', { resolutions: [32], views: [], animations: ['idle', 'waddle', 'honk'] });
  await add('`--res 32 --external`', { resolutions: [32], views: [] }, true);
  return rows;
}

const pct = (part, whole) => `${Math.round((1 - part / whole) * 100)}%`;

/** Markdown for one table: `runtime`, `bundles` or `goose`. */
export async function sizesTable(which) {
  if (which === 'runtime') {
    const rows = runtimeSizes();
    const [sprite, stage] = rows;
    return ['| File | Raw | gzip | brotli |', '|---|--:|--:|--:|',
      ...rows.map((r) => `| \`${r.file}\` | ${kb(r.raw)} | ${kb(r.gzip)} | ${kb(r.brotli)} |`),
      `| both (a page with \`<pixel-stage>\`) | ${kb(sprite.raw + stage.raw)} | ${kb(sprite.gzip + stage.gzip)} | ${kb(sprite.brotli + stage.brotli)} |`].join('\n');
  }
  if (which === 'bundles') {
    return ['| Bundle | Animations | Raw | gzip | brotli | Decoded 32 px sheet | Decoded 64 px sheet |', '|---|--:|--:|--:|--:|--:|--:|',
      ...bundleSizes().map((r) => `| \`${r.name}\` | ${r.animations} | ${kb(r.raw)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${mb(r.decoded[32] ?? 0)} | ${mb(r.decoded[64] ?? 0)} |`)].join('\n');
  }
  if (which === 'goose') {
    const rows = await gooseOptions();
    const base = rows[0];
    return [`| \`pixel bundle ${GOOSE}.json\` with | Animations | Raw | gzip | brotli | gzip saved | Largest sheet decoded |`, '|---|--:|--:|--:|--:|--:|--:|',
      ...rows.map((r, i) => `| ${r.flags} | ${r.animations} | ${kb(r.raw)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${i ? pct(r.gzip, base.gzip) : ''} | ${mb(r.decoded.bytes)} (${r.decoded.res} px) |`)].join('\n');
  }
  throw new Error(`unknown sizes table "${which}" (runtime, bundles, goose)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ runtime: runtimeSizes(), bundles: bundleSizes(), goose: await gooseOptions() }, null, 2));
  } else {
    for (const t of ['runtime', 'bundles', 'goose']) console.log(`${await sizesTable(t)}\n`);
  }
}
