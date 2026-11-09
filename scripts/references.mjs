// Provenance of motion data: references/sources.json (who/what/where, cited in full) and one log per
// figure or character, references/<name>.json, saying which source each tuned parameter and each derived
// frame comes from. See references/README.md.
//
//   node scripts/references.mjs           check every log; exit 1 on problems
//   node scripts/references.mjs credits   rewrite references/CREDITS.md from the registry
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REF = join(ROOT, 'references');

export const KINDS = ['photo-sequence', 'paper', 'dataset', 'video', 'image', 'book'];
/** Licences we accept. facts-only: a copyrighted work whose measured numbers we use, never its images or text. */
export const LICENCES = ['public-domain', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'facts-only'];
const needsAttribution = (l) => l.startsWith('CC-BY');
const REQUIRED = ['kind', 'title', 'creator', 'year', 'url', 'licence', 'rights'];
const PARAM_FIELDS = ['param', 'value', 'source', 'location', 'method', 'by', 'date'];
const FRAME_FIELDS = ['frame', 'source', 'sourceFrame', 'method', 'by', 'date'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function loadSources() {
  const { $comment, ...sources } = readJSON(join(REF, 'sources.json'));
  return sources;
}

/** Problems in the registry: missing citation fields, unknown kinds or licences, attribution that does not match the licence. */
export function checkSources(sources) {
  const out = [];
  for (const [id, s] of Object.entries(sources)) {
    const at = `sources.json ${id}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) out.push(`${at}: ids are lowercase words joined by "-"`);
    for (const k of REQUIRED) if (s[k] == null || s[k] === '') out.push(`${at}: missing "${k}"`);
    if (s.kind && !KINDS.includes(s.kind)) out.push(`${at}: kind "${s.kind}" is not one of ${KINDS.join(', ')}`);
    if (s.licence && !LICENCES.includes(s.licence)) out.push(`${at}: licence "${s.licence}" fails the no-strings rule (allowed: ${LICENCES.join(', ')})`);
    if (s.licence && needsAttribution(s.licence) !== (typeof s.attribution === 'string' && s.attribution.length > 0))
      out.push(`${at}: "attribution" must be set exactly when the licence is CC BY (it is ${s.licence})`);
    if (s.kind === 'photo-sequence' && (s.plate == null || !s.frames)) out.push(`${at}: a photo sequence needs "plate" and "frames" (how the frames are laid out and numbered)`);
    if (s.kind === 'video' && !(s.fps > 0)) out.push(`${at}: a video needs "fps"`);
    if (s.intervalSource && !sources[s.intervalSource]) out.push(`${at}: intervalSource "${s.intervalSource}" is not in sources.json`);
  }
  return out;
}

/** The figure or character a log describes, and its animations' frame counts. */
function targetOf(log, file) {
  if (log.figure) {
    const f = join(ROOT, 'figures', `${log.figure}.json`);
    if (!existsSync(f)) return { error: `${file}: no figures/${log.figure}.json` };
    const data = readJSON(f);
    return { data, frames: (anim) => data.motions?.[anim]?.frames };
  }
  if (log.character) {
    const f = join(ROOT, 'examples', `${log.character}.json`);
    if (!existsSync(f)) return { error: `${file}: no examples/${log.character}.json` };
    const data = readJSON(f);
    return { data, frames: (anim) => data.animations?.[anim]?.frames };
  }
  return { error: `${file}: say which "figure" or "character" this log is for` };
}

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Problems in one log: unknown sources, values that drifted from the figure, frames out of range, missing fields. */
export function checkLog(log, file, sources) {
  const out = [];
  const t = targetOf(log, file);
  if (t.error) return [t.error];
  for (const [i, p] of (log.params ?? []).entries()) {
    const where = `${file} params[${i}] ${p.param ?? ''}`;
    for (const k of PARAM_FIELDS) if (p[k] == null || p[k] === '') out.push(`${where}: missing "${k}"`);
    if (p.source && !sources[p.source]) out.push(`${where}: source "${p.source}" is not in sources.json`);
    if (p.date && !DATE.test(p.date)) out.push(`${where}: date must be YYYY-MM-DD`);
    if (p.param) {
      const now = at(t.data, p.param);
      if (now === undefined) out.push(`${where}: no such value in the ${log.figure ? 'figure' : 'character'}`);
      else if (!same(now, p.value)) out.push(`${where}: the log says ${JSON.stringify(p.value)} but it is now ${JSON.stringify(now)} (update the log or the value)`);
    }
  }
  for (const [anim, list] of Object.entries(log.frames ?? {})) {
    const n = t.frames(anim);
    if (n == null) { out.push(`${file} frames.${anim}: no such animation`); continue; }
    for (const [i, f] of list.entries()) {
      const where = `${file} frames.${anim}[${i}]`;
      for (const k of FRAME_FIELDS) if (f[k] == null || f[k] === '') out.push(`${where}: missing "${k}"`);
      if (Number.isInteger(f.frame) && (f.frame < 0 || f.frame >= n)) out.push(`${where}: frame ${f.frame} is outside 0..${n - 1}`);
      const s = sources[f.source];
      if (f.source && !s) out.push(`${where}: source "${f.source}" is not in sources.json`);
      // Poses are measured from pictures: the picture itself must be free to use, not just its numbers.
      if (s?.licence === 'facts-only') out.push(`${where}: "${f.source}" is facts-only; a frame must come from a public-domain, CC0 or CC BY image or video`);
      if (f.points && !existsSync(join(ROOT, f.points))) out.push(`${where}: measurement file ${f.points} does not exist`);
      if (f.date && !DATE.test(f.date)) out.push(`${where}: date must be YYYY-MM-DD`);
    }
  }
  return out;
}

/** Problems in a raw measurement file (references/measurements/): an unknown source, or no record of who, when and how. */
export function checkMeasurement(m, file, sources) {
  const out = [];
  if (!m.source || !sources[m.source]) out.push(`${file}: source "${m.source}" is not in sources.json`);
  else if (sources[m.source].licence === 'facts-only') out.push(`${file}: "${m.source}" is facts-only; measurements must come from a public-domain, CC0 or CC BY image or video`);
  for (const k of ['by', 'date', 'method']) if (!m[k]) out.push(`${file}: missing "${k}"`);
  if (m.date && !DATE.test(m.date)) out.push(`${file}: date must be YYYY-MM-DD`);
  if (!Array.isArray(m.frames)) out.push(`${file}: "frames" must list the measured frames`);
  else for (const [i, f] of m.frames.entries()) if (f.sourceFrame == null) out.push(`${file} frames[${i}]: missing "sourceFrame"`);
  return out;
}

/** Every log in references/ (all JSON files except sources.json) and every measurement file, checked against the registry. */
export function checkAll() {
  const sources = loadSources();
  const out = checkSources(sources);
  for (const f of readdirSync(REF).filter((f) => f.endsWith('.json') && f !== 'sources.json'))
    out.push(...checkLog(readJSON(join(REF, f)), `references/${f}`, sources));
  const MEAS = join(REF, 'measurements');
  if (existsSync(MEAS)) for (const f of readdirSync(MEAS).filter((f) => f.endsWith('.json')))
    out.push(...checkMeasurement(readJSON(join(MEAS, f)), `references/measurements/${f}`, sources));
  return out;
}

/** CREDITS.md: the sources that ask for attribution, then every source we draw on. */
export function credits(sources = loadSources()) {
  const line = (id, s) => `- **${s.title}**, ${s.creator}, ${s.year}. ${s.url}${s.recordId ? ` (${s.recordId})` : ''}. ${s.licence}.`;
  const entries = Object.entries(sources);
  return [
    '# Credits for motion data',
    '',
    'Generated from `references/sources.json` by `node scripts/references.mjs credits`. Do not edit by hand.',
    '',
    '## Attribution required (CC BY)',
    '',
    ...entries.filter(([, s]) => s.attribution).map(([, s]) => `- ${s.attribution}`),
    '',
    '## All sources',
    '',
    ...entries.map(([id, s]) => line(id, s)),
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === 'credits') {
    writeFileSync(join(REF, 'CREDITS.md'), credits());
    console.log('wrote references/CREDITS.md');
  } else {
    const problems = checkAll();
    for (const p of problems) console.log(`✗ ${p}`);
    if (problems.length) process.exit(1);
    console.log('✓ references: every source is cited, every logged value matches');
  }
}
