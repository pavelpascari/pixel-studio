#!/usr/bin/env node
// Pixel Studio CLI — the agent's hands and eyes.
//
//   pixel validate <spec.json>                       check a spec, print errors with JSON paths
//   pixel preview  <spec.json> [--out p.png] [--res 16,32,64] [--cell 128] [--anim a,b]
//                                                    contact sheet: every animation (or those named) × every LOD tier
//   pixel ascii    <spec.json> [--res 24] [--anim idle] [--frame 0|all]
//                                                    a frame as text (for agents without vision)
//   pixel render   <spec.json> [--res 32] [--out dir] [--lod 1|2|3] [--tones n] [--texture 0..1] ...
//                                                    sprite sheet PNG + JSON metadata
//   pixel export   <spec.json> [--res 32] [--out dir] [--format aseprite]
//                                                    sheet PNG + Aseprite JSON (Phaser, PixiJS)
//   pixel bundle   <spec.json> [--res 16,32,64] [--views front,back|all] [--anims idle,walk|stage] [--external]
//                  [--out file.bundle.json]          self-contained web bundle for <pixel-sprite> (all skins);
//                                                    side view only unless --views; --anims keeps only those
//                                                    animations (stage: what <pixel-stage> uses);
//                                                    --external writes the sheets as PNG files beside it
//   pixel import   <sheet.json|sheet.png|folder> [--format aseprite|grid|frames] [--out file.bundle.json]
//                  [--frame 32x32] [--anims idle:4,walk:8] [--fps 10|walk=12] [--loop jump=false]
//                  [--speed walk=40] [--speed-y climb=20] [--ground 30] [--name fox] [--external] [--check]
//                                                    a hand-drawn sheet (Aseprite JSON, a PNG grid, or a folder of
//                                                    frame PNGs) as a web bundle; --check only reports
//   pixel resolve  <variant.json> [--out full.json]   print a variant ("extends") merged with its base
//   pixel where    <spec.json> [--anim a] [--frame f] [--part id --point x,y]
//                                                    world positions of part pivots (or of a point on a part)
//   pixel figures                                    list the figure library (skeletons + motions)
//   pixel preview goose                              any command takes a bare figure name instead of a spec
//
//   --skin <name> (preview, ascii, render, export, where): use one of the spec's skins
//   style flags (preview, ascii, render, export, bundle): --lod 1|2|3 --tones n --texture 0..1 --dither true|false
//                                                         --outline dark|selective|none --light deg --flip
//   pixel brief                                      print the agent brief (spec format docs)
//   pixel help                                       this text
//
//   --plugin ./a.mjs,./b.mjs (any command): register plug-in shapes, textures, motion models and importers first
//   errors print as one line and exit 1; PIXEL_DEBUG=1 adds the stack trace
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validate, compile, renderSheet, renderAnimation, renderFrame, resolveStyle,
  contactSheet, frameToAscii, buildBundle, exportSheet, usePlugin, registeredPlugins, DETAIL_NAMES, resolveSpec, checkBounds, MAX_RES,
  importSheet, bundleImport,
} from '../src/core/index.js';
import { samplePose, worldMatrices } from '../src/core/internal.js';
import { encodePNG, decodePNG } from '../src/node/png.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BOOLEAN_FLAGS = new Set(['flip', 'external', 'check']); // never take the next argument as their value

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('='), k = eq < 0 ? a.slice(2) : a.slice(2, eq), v = eq < 0 ? undefined : a.slice(eq + 1);
      args[k] = v ?? (!BOOLEAN_FLAGS.has(k) && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else args._.push(a);
  }
  return args;
}

function readJSON(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { fail(`cannot read ${path}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { fail(`${path} is not valid JSON: ${e.message}`); }
}

/** Load a spec, resolve its "extends" chain (paths relative to the file that names them) and its "figure". */
async function loadSpec(path) {
  if (!path) fail('missing <spec.json>');
  // A bare figure name ("goose") previews that figure's skeleton.
  const spec = !path.endsWith('.json') && figureNames().includes(path) ? { figure: path } : readJSON(path);
  const absOf = new Map();
  try {
    return await resolveSpec(spec, {
      loadRef: (ref, from) => {
        const abs = resolve(dirname(from ? absOf.get(from) : resolve(path)), ref);
        absOf.set(ref, abs);
        return JSON.parse(readFileSync(abs, 'utf8'));
      },
      loadFigure: (name) => JSON.parse(readFileSync(join(ROOT, 'figures', `${name}.json`), 'utf8')),
      warn: (p, m) => console.error(`warning ${p}: ${m}`),
    });
  } catch (e) { fail(`${path}: ${e.message}`); }
}
const figureNames = () => readdirSync(join(ROOT, 'figures')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

function printBounds(c, log = console.error) {
  const w = checkBounds(c);
  for (const x of w) log(`warning ${x.path}: ${x.message}`);
  return w;
}

function fail(msg) { console.error(`error: ${msg}`); process.exit(1); }

function compileOrExit(spec) {
  const { errors, warnings } = validate(spec);
  for (const w of warnings) console.error(`warning ${w.path}: ${w.message}`);
  if (errors.length) {
    for (const e of errors) console.error(`error   ${e.path}: ${e.message}`);
    process.exit(1);
  }
  let c = compile(spec);
  if (args.skin && cmd !== 'bundle') {
    // Preview, render or inspect one skin (bundle always bakes all of them).
    if (!c.skins?.[args.skin]) { console.error(`error   unknown skin "${args.skin}" (skins: ${Object.keys(c.skins ?? {}).join(', ') || 'none'})`); process.exit(1); }
    c = c.skins[args.skin];
  }
  printBounds(c);
  return c;
}

/** A numeric flag, or a clear error naming what was typed. */
const numFlag = (a, k) => {
  if (a[k] == null) return undefined;
  const n = Number(a[k]);
  if (a[k] === true || !Number.isFinite(n)) fail(`--${k} must be a number (got "${a[k] === true ? '' : a[k]}")`);
  return n;
};
const overridesFrom = (a) => ({
  lod: a.lod ? numFlag(a, 'lod') : undefined,
  tones: numFlag(a, 'tones'),
  texture: numFlag(a, 'texture'),
  dither: a.dither != null ? a.dither !== 'false' : undefined,
  outline: a.outline === true ? fail('--outline needs a value: dark, selective or none') : a.outline,
  light: numFlag(a, 'light'),
  flip: a.flip && a.flip !== 'false' ? true : undefined,
});

const resList = (v, d) => {
  const list = String(v ?? d).split(',').map(Number);
  if (!list.length || list.some((n) => !Number.isInteger(n) || n <= 0 || n > MAX_RES)) fail(`--res must be whole numbers 1..${MAX_RES}, e.g. 16,32,64 (got "${v}")`);
  return list;
};
const oneRes = (v, d) => {
  if (v != null && String(v).includes(',')) fail(`--res takes one resolution here (got "${v}"); use bundle or preview for several`);
  return resList(v, d)[0];
};
/** --frame n, wrapped into 0..frames-1 (so -1 is the last frame). */
const frameIndex = (v, frames) => { const n = Math.trunc(Number(v) || 0); return ((n % frames) + frames) % frames; };
function animOrExit(c, name) {
  const key = name ?? Object.keys(c.animations)[0];
  if (!c.animations[key]) fail(`no animation "${name}" (have: ${Object.keys(c.animations).join(', ')})`);
  return key;
}
const stem = (p) => basename(p).replace(/\.json$/, '');
const pngDataURL = (w, h, rgba) => 'data:image/png;base64,' + encodePNG(w, h, rgba).toString('base64');

/** Write a bundle's data-URL sheets as PNG files beside `out` and point the bundle at them (--external). */
function externalSheets(bundle, out) {
  const name = basename(out).replace(/\.bundle\.json$|\.json$/, '');
  for (const v of bundle.variants) for (const key of ['image', 'overlay']) {
    if (typeof v[key] !== 'string' || !v[key].startsWith('data:image/png;base64,')) continue;
    // Skin names come from the spec: keep them to a safe slug so the file stays beside the bundle.
    const slug = (x) => String(x).replace(/[^A-Za-z0-9_-]+/g, '_');
    const file = `${slug(name)}.${Number(v.res)}${v.skin ? `.${slug(v.skin)}` : ''}${key === 'overlay' ? '.overlay' : ''}.png`;
    const dir = dirname(resolve(out)), target = resolve(dir, file);
    if (basename(file) !== file || dirname(target) !== dir) fail(`--external: refusing to write ${file} outside ${dir}`);
    writeFileSync(target, Buffer.from(v[key].slice(22), 'base64'));
    v[key] = file;
  }
}

/**
 * A per-animation flag: "10" → 10 for all; "walk=12,idle=6" → {walk: 12, idle: 6}; "8,walk=12" → {'*': 8, walk: 12}.
 * `parse` turns one value into what the option wants (or calls fail).
 */
function perAnim(v, flag, parse) {
  if (v == null) return undefined;
  if (v === true) fail(`--${flag} needs a value, e.g. --${flag} walk=${flag === 'loop' ? 'false' : '12'}`);
  const out = {};
  for (const item of String(v).split(',').map((s) => s.trim()).filter(Boolean)) {
    const eq = item.indexOf('=');
    if (eq < 0) out['*'] = parse(item); else out[item.slice(0, eq).trim()] = parse(item.slice(eq + 1).trim());
  }
  const keys = Object.keys(out);
  return keys.length === 1 && keys[0] === '*' ? out['*'] : out;
}
const numberOf = (flag) => (s) => { const n = Number(s); if (s === '' || !Number.isFinite(n) || n < 0) fail(`--${flag} takes numbers (got "${s}")`); return n; };
const boolOf = (flag) => (s) => { if (s !== 'true' && s !== 'false') fail(`--${flag} takes true or false (got "${s}")`); return s === 'true'; };

/** A file ({name, bytes}) or a folder ({name, entries}: every file inside, as paths relative to it). */
function importSource(path) {
  let st;
  try { st = statSync(path); } catch { fail(`cannot read ${path}: no such file or folder`); }
  if (!st.isDirectory()) return { name: basename(path), bytes: readFileSync(path), dir: dirname(resolve(path)) };
  const root = resolve(path), entries = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) walk(p); else if (e.isFile()) entries.push(relative(root, p).split(sep).join('/')); } };
  walk(root);
  return { name: basename(root), entries: entries.sort(), dir: root };
}

// Anything that throws becomes one line on stderr and exit code 1 (PIXEL_DEBUG=1 shows the stack).
// A closed pipe (`pixel ascii … | head`) is not an error, and the handler must never run twice: writing the
// message to a closed stderr would throw again.
let crashing = false;
const crash = (e) => {
  if (e?.code === 'EPIPE') process.exit(0);
  if (crashing) process.exit(1);
  crashing = true;
  try { console.error(`error: ${e?.message ?? e}`); if (process.env.PIXEL_DEBUG) console.error(e?.stack); } finally { process.exit(1); }
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
// Plug-ins (--plugin ./a.mjs,./b.mjs): register shapes, textures and motion models before anything runs.
if (args.plugin) {
  for (const p of String(args.plugin).split(',')) {
    try { await usePlugin(await import(pathToFileURL(resolve(p.trim())).href)); }
    catch (e) { fail(`--plugin ${p}: ${e.message}`); }
  }
}

switch (cmd) {
  case 'figures': {
    for (const n of figureNames()) {
      const f = JSON.parse(readFileSync(join(ROOT, 'figures', `${n}.json`), 'utf8'));
      console.log(`${n.padEnd(8)} ${f.bones.length} bones   motions: ${Object.entries(f.motions ?? {}).map(([k, m]) => `${k}(${m.model ?? 'gait'})`).join(' ')}`);
      if (f.description) console.log(`         ${f.description}`);
      console.log(`         bones: ${f.bones.map((b) => b.id).join(' ')}`);
    }
    break;
  }
  case 'validate': {
    const spec = await loadSpec(args._[0]);
    const { errors, warnings } = validate(spec);
    for (const w of warnings) console.log(`warning ${w.path}: ${w.message}`);
    for (const e of errors) console.log(`error   ${e.path}: ${e.message}`);
    if (errors.length) process.exit(1);
    const c = compile(spec);
    printBounds(c, console.log);
    const anims = Object.values(c.animations).map((a) => `${a.name}(${a.frames}f@${a.fps}fps)`).join(' ');
    console.log(`ok: "${c.name}" ${c.parts.length} parts, ${Object.keys(c.materials).length} materials, animations: ${anims}`);
    break;
  }
  case 'preview': {
    const c = compileOrExit(await loadSpec(args._[0]));
    const ov = overridesFrom(args);
    const previewAnims = args.anim ? String(args.anim).split(',').map((n) => animOrExit(c, n.trim())) : Object.keys(c.animations);
    const blocks = resList(args.res, '16,32,64').map((res) => ({
      res,
      rows: previewAnims.map((n) => ({ name: n, frames: renderAnimation(c, n, res, ov).frames })),
    }));
    const img = contactSheet(blocks, { cellH: Number(args.cell) || 128 });
    const out = args.out || `${stem(args._[0])}.preview.png`;
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, encodePNG(img.w, img.h, img.rgba));
    console.log(`wrote ${out} (${img.w}x${img.h})`);
    console.log(`blocks top→bottom: ${blocks.map((b) => `${b.res}px [${DETAIL_NAMES[resolveStyle(c, b.res, ov).lod]}]`).join(', ')}`);
    console.log(`rows per block: ${previewAnims.join(', ')}`);
    break;
  }
  case 'ascii': {
    const c = compileOrExit(await loadSpec(args._[0]));
    const res = oneRes(args.res, 24);
    const anim = animOrExit(c, args.anim);
    const frames = args.frame === 'all'
      ? [...Array(c.animations[anim].frames).keys()]
      : [frameIndex(args.frame, c.animations[anim].frames)];
    const style = resolveStyle(c, res, overridesFrom(args));
    for (const f of frames) {
      const fr = renderFrame(c, { res, anim, frame: f, style });
      const { text, legend } = frameToAscii(fr);
      console.log(`${anim} frame ${f} @${res}px  legend: ${Object.entries(legend).map(([k, v]) => `${v}=${k}`).join(' ')} #=outline .=empty`);
      console.log(text + '\n');
    }
    break;
  }
  case 'render': {
    const c = compileOrExit(await loadSpec(args._[0]));
    const res = oneRes(args.res, 32);
    const sheet = renderSheet(c, res, overridesFrom(args));
    const dir = args.out || '.';
    mkdirSync(dir, { recursive: true });
    const base = `${stem(args._[0])}.${res}`;
    writeFileSync(join(dir, `${base}.png`), encodePNG(sheet.width, sheet.height, sheet.rgba));
    writeFileSync(join(dir, `${base}.json`), JSON.stringify({ name: c.name, image: `${base}.png`, ...sheet.meta }, null, 2));
    console.log(`wrote ${join(dir, base)}.png (${sheet.width}x${sheet.height}) + .json`);
    break;
  }
  case 'export': {
    // Aseprite-format JSON (Phaser) with a PixiJS animations map, plus the PNG sheet.
    const c = compileOrExit(await loadSpec(args._[0]));
    const res = oneRes(args.res, 32);
    if ((args.format ?? 'aseprite') !== 'aseprite') { console.error('error   --format: only "aseprite" (also read by Phaser and PixiJS)'); process.exit(1); }
    const dir = args.out || '.';
    mkdirSync(dir, { recursive: true });
    const base = `${stem(args._[0])}${args.skin ? `.${args.skin}` : ''}.${res}`;
    const ex = exportSheet(c, res, { image: `${base}.png`, overrides: overridesFrom(args) });
    writeFileSync(join(dir, `${base}.png`), encodePNG(ex.width, ex.height, ex.rgba));
    writeFileSync(join(dir, `${base}.json`), JSON.stringify(ex.json, null, 2));
    console.log(`wrote ${join(dir, base)}.png (${ex.width}x${ex.height}) + .json (${Object.keys(ex.json.frames).length} frames, ${ex.json.meta.frameTags.length} tags, ${ex.json.meta.slices.length} slices)`);
    break;
  }
  case 'bundle': {
    const c = compileOrExit(await loadSpec(args._[0]));
    // --views front | front,back | all | none: which extra views (front, back, …) to ship; default none (the side
    // view only): they are for <pixel-stage> turning a character to the reader, and each about doubles the sheets.
    const has = [...new Set(Object.keys(c.animations).filter((n) => n.startsWith('turn@')).map((n) => n.slice(5)))];
    if (args.views === true) fail('--views needs a value: front, back, all or none');
    const asked = args.views == null ? 'none' : String(args.views).trim();
    const views = asked === 'all' ? undefined : asked === 'none' ? [] : asked.split(',').map((s) => s.trim()).filter(Boolean);
    for (const v of views ?? []) if (!has.includes(v)) fail(`--views: no view "${v}" (${has.length ? `views: ${has.join(', ')}, all or none` : 'this character has only the side view'})`);
    if (args.views == null && has.length) console.error(`note: side view only; --views all (or ${has.join(', ')}) adds the character's other views`);
    // --anims idle,waddle | stage: only those animations, with their views, turns and transitions.
    if (args.anims === true) fail('--anims needs a list, e.g. --anims idle,walk (or --anims stage)');
    const animations = args.anims == null ? undefined : String(args.anims).split(',').map((s) => s.trim()).filter(Boolean);
    const bundle = await buildBundle(c, { resolutions: resList(args.res, '16,32,64'), overrides: overridesFrom(args), encode: pngDataURL, views, animations });
    const dropped = Object.keys(c.states?.nodes ?? {}).filter((n) => !bundle.states?.nodes[n]);
    if (dropped.length) console.error(`note: states: ${bundle.states ? `dropped node${dropped.length > 1 ? 's' : ''} ${dropped.join(', ')} (no animation left to play)` : 'dropped the state machine (no node has an animation left)'}`);
    const out = args.out || `${stem(args._[0])}.bundle.json`;
    mkdirSync(dirname(resolve(out)), { recursive: true });
    // --external: sheets as PNG files next to the bundle, so a page downloads only the one it shows.
    if (args.external) externalSheets(bundle, out);
    const json = JSON.stringify(bundle);
    writeFileSync(out, json);
    console.log(`wrote ${out} (${(json.length / 1024).toFixed(1)} KB, variants: ${bundle.variants.map((v) => v.skin ? `${v.res} (${v.skin})` : v.res).join(', ')})`);
    break;
  }
  case 'import': {
    if (!args._[0]) fail('missing <sheet.json|sheet.png|folder>');
    const src = importSource(args._[0]);
    const imported = await importSheet(src, {
      format: args.format === true ? fail('--format needs a value: aseprite, grid or frames') : args.format,
      // Files the sheet names (an Aseprite sheet's PNG, a folder's frames) are read from beside it or inside it.
      readFile: (rel) => {
        // Aseprite may write the sheet's absolute path: look for that file beside the JSON instead.
        if (isAbsolute(rel)) rel = basename(rel);
        // Only files inside the sheet's folder, also after following symlinks: a sheet cannot name ../../secret.
        let target;
        try { target = realpathSync(resolve(src.dir, rel)); } catch (e) { throw new Error(`cannot read ${rel} (named by ${src.name}): ${e.code === 'ENOENT' ? 'no such file' : e.message}`); }
        const inside = relative(realpathSync(src.dir), target);
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error(`refusing to read ${rel}: outside ${src.dir}`);
        return readFileSync(target);
      },
      decodePNG: (bytes) => { try { return decodePNG(bytes); } catch (e) { throw new Error(`${src.name}: ${e.message}`); } },
      options: { frame: args.frame, anims: args.anims },
    });
    const { bundle, report } = await bundleImport(imported, {
      encode: pngDataURL,
      name: typeof args.name === 'string' ? args.name : undefined,
      fps: perAnim(args.fps, 'fps', numberOf('fps')),
      loop: perAnim(args.loop, 'loop', boolOf('loop')),
      speed: perAnim(args.speed, 'speed', numberOf('speed')),
      speedY: perAnim(args['speed-y'], 'speed-y', numberOf('speed-y')),
      ground: numFlag(args, 'ground'),
    });
    console.log(`read ${src.name} (${imported.format}): ${report.animations.length} animation${report.animations.length > 1 ? 's' : ''}, ${report.frameW}x${report.frameH} frames, sheet ${report.width}x${report.height}`);
    for (const a of report.animations) {
      const timing = a.durations ? `${a.fps} fps with holds` : `${a.fps} fps`;
      const extras = [a.loop ? 'loops' : 'once', a.speed && `speed ${a.speed} px/s`, a.speedY && `climbs ${a.speedY} px/s`, a.events && `${a.events.length} events`].filter(Boolean);
      console.log(`  ${a.name.padEnd(10)} ${String(a.frames).padStart(3)} frames  ${timing}, ${extras.join(', ')}`);
    }
    console.log(`  ground    row ${report.ground} (${{ option: 'from --ground', file: 'from the file', pixels: "the idle's lowest pixel; --ground to change" }[report.groundFrom]})`);
    if (bundle.points) console.log(`  points    ${Object.keys(bundle.points).join(', ')}`);
    const roles = Object.entries(report.roles).map(([r, n]) => (r === n ? r : `${r}=${n}`));
    console.log(`  stage     ${roles.length ? roles.join(' ') : 'no animation <pixel-stage> looks for'}`);
    for (const n of report.notes) console.error(`note: ${n}`);
    for (const h of report.hints) console.error(`hint: ${h}`);
    if (args.check) break;
    const out = typeof args.out === 'string' ? args.out : `${src.name.replace(/\.(json|png)$/i, '')}.bundle.json`;
    mkdirSync(dirname(resolve(out)), { recursive: true });
    if (args.external) externalSheets(bundle, out);
    const json = JSON.stringify(bundle);
    writeFileSync(out, json);
    console.log(`wrote ${out} (${(json.length / 1024).toFixed(1)} KB)`);
    break;
  }
  case 'resolve': {
    const json = JSON.stringify(await loadSpec(args._[0]), null, 2);
    if (args.out) { writeFileSync(args.out, json + '\n'); console.log(`wrote ${args.out}`); } else console.log(json);
    break;
  }
  case 'where': {
    const c = compileOrExit(await loadSpec(args._[0]));
    const anim = c.animations[animOrExit(c, args.anim)];
    const frame = frameIndex(args.frame, anim.frames);
    const pose = samplePose(c, anim, frame);
    const { world, visible } = worldMatrices(c.parts, pose);
    const at = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]].map((v) => +v.toFixed(1));
    console.log(`${anim.name} frame ${frame} (canvas ${c.size.join('x')} units)`);
    if (args.part) {
      const p = c.parts.find((q) => q.id === args.part);
      if (!p) fail(`no part "${args.part}"`);
      const pt = args.point ? String(args.point).split(',').map(Number) : p.pivot;
      console.log(`${p.id} [${pt}] (rest) → [${at(world.get(p.id), pt)}]  rot ${pose.get(p.id).rot.toFixed(1)}°`);
    } else {
      for (const p of c.parts) {
        const t = pose.get(p.id);
        console.log(`${p.id.padEnd(12)} pivot [${p.pivot}] → [${at(world.get(p.id), p.pivot)}]  rot ${t.rot.toFixed(1)}°${visible.get(p.id) ? '' : '  (hidden)'}`);
      }
    }
    break;
  }
  case 'brief': {
    process.stdout.write(readFileSync(join(ROOT, 'docs/SPEC.md'), 'utf8'));
    const extra = registeredPlugins();
    if (extra.length) process.stdout.write(`\n## Plug-ins loaded for this project\n\n${extra.map((p) => `- ${p.kind} \`${p.name}\`${p.describe ? `: ${p.describe}` : ''}`).join('\n')}\n`);
    break;
  }
  case 'help': case '--help': case '-h': case undefined:
  default:
    {
      const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);   // skip the #! line
      const header = lines.slice(0, lines.findIndex((l) => !l.startsWith('//')));
      console.log(header.map((l) => l.slice(3)).join('\n'));
    }
    process.exit(!cmd || ['help', '--help', '-h'].includes(cmd) ? 0 : 1);
}
