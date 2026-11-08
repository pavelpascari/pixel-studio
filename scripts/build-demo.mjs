// Builds demo/assets/*.bundle.json from examples/*.json (and, with --previews, contact sheets in previews/).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, buildBundle, renderAnimation, renderFrame, resolveStyle, exportSheet, contactSheet, resolveSpec } from '../src/core/index.js';
import { encodePNG } from '../src/node/png.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previews = process.argv.includes('--previews');
const encode = (w, h, rgba) => 'data:image/png;base64,' + encodePNG(w, h, rgba).toString('base64');

mkdirSync(join(ROOT, 'demo/assets'), { recursive: true });
copyFileSync(join(ROOT, 'src/runtime/pixel-sprite.js'), join(ROOT, 'demo/assets/pixel-sprite.js'));
copyFileSync(join(ROOT, 'src/runtime/pixel-stage.js'), join(ROOT, 'demo/assets/pixel-stage.js'));
for (const f of readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.json'))) {
  const name = f.replace(/\.json$/, '');
  const read = (file) => JSON.parse(readFileSync(join(ROOT, 'examples', file), 'utf8'));
  const c = compile(await resolveSpec(read(f), {
    loadRef: read,
    loadFigure: (n) => JSON.parse(readFileSync(join(ROOT, 'figures', `${n}.json`), 'utf8')),
    warn: (p, m) => console.warn(`  warning ${f} ${p}: ${m}`),
  }));
  const bundle = await buildBundle(c, { resolutions: [16, 32, 64], encode });
  const json = JSON.stringify(bundle);
  writeFileSync(join(ROOT, 'demo/assets', `${name}.bundle.json`), json);
  console.log(`demo/assets/${name}.bundle.json  ${(json.length / 1024).toFixed(1)} KB  [${Object.keys(bundle.animations).join(', ')}]`);
  // A poster (first frame at 64 px) for <pixel-sprite> fallbacks.
  const first = Object.values(c.animations)[0];
  const fr = renderFrame(c, { res: 64, anim: first, frame: 0, style: resolveStyle(c, 64) });
  writeFileSync(join(ROOT, 'demo/assets', `${name}.poster.png`), encodePNG(fr.w, fr.h, fr.rgba));
  // The goose also ships as a game-engine sheet (docs site: PixiJS / Phaser example).
  if (name === 'goose-root') {
    const ex = exportSheet(c, 32, { image: `${name}.32.png` });
    writeFileSync(join(ROOT, 'demo/assets', `${name}.32.png`), encodePNG(ex.width, ex.height, ex.rgba));
    writeFileSync(join(ROOT, 'demo/assets', `${name}.32.json`), JSON.stringify(ex.json, null, 1));
  }
  if (previews) {
    mkdirSync(join(ROOT, 'previews'), { recursive: true });
    const blocks = [16, 32, 64].map((res) => ({ res, rows: Object.keys(c.animations).map((n) => ({ name: n, frames: renderAnimation(c, n, res).frames })) }));
    const img = contactSheet(blocks, { cellH: 96 });
    writeFileSync(join(ROOT, 'previews', `${name}.png`), encodePNG(img.w, img.h, img.rgba));
  }
}
