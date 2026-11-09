import {
  validate, compile, renderAnimation, renderSheet, resolveStyle, buildBundle, contactSheet, DETAIL_NAMES, pngBytes,
  resolveSpec, checkBounds, samplePose, sampleValue, frameTime, worldMatrices,
} from '../src/core/index.js';
import '../src/runtime/pixel-sprite.js';
import { initAgent } from './agent.js';

const $ = (s) => document.querySelector(s);
const EXAMPLES = ['goose-base', 'goose-root', 'goose-sudo', 'goose-phreak', 'goose-kiddie', 'goose-greylag', 'pip', 'fox', 'slime', 'robot'];
const LOD_STRIP = [16, 24, 32, 48, 64];
const STORAGE_KEY = 'pixel-studio:spec';

const state = {
  compiled: null,
  anim: null,
  frame: 0,
  playing: true,
  frames: [],          // current anim at current res: [{w,h,rgba}]
  frameCanvases: [],
  lod: [],             // [{res, style, canvases: []}]
  lastTick: 0,
  acc: 0,
};

// ---------- helpers ----------
// Escape a value for a double-quoted HTML attribute (snippets the user copies into their pages).
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toCanvas(fr) {
  const c = document.createElement('canvas');
  c.width = fr.w; c.height = fr.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h), 0, 0);
  return c;
}
function encodePNG(w, h, rgba) {
  const c = toCanvas({ w, h, rgba });
  return c.toDataURL('image/png');
}
// Bundle sheets: the shared encoder (indexed PNG, ~40% smaller than the canvas's RGBA) with the
// browser's zlib; the canvas encoder where CompressionStream is missing.
async function encodeSheet(w, h, rgba) {
  if (typeof CompressionStream !== 'function') return encodePNG(w, h, rgba);
  const deflate = async (raw) => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const bytes = await pngBytes(w, h, rgba, deflate);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(bin);
}
function download(name, data, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// JSON that is safe to embed inside <script> (no `</script>` breakout).
const safeJSON = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const slug = (s) => String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';

function overrides() {
  const v = (id) => $(id).value;
  const tex = Number(v('#texture'));
  return {
    lod: v('#lod') ? Number(v('#lod')) : undefined,
    tones: v('#tones') ? Number(v('#tones')) : undefined,
    texture: tex >= 0 ? tex : undefined,
    dither: v('#dither') ? v('#dither') === 'true' : undefined,
    outline: v('#outline') || undefined,
    innerLines: v('#innerLines') ? v('#innerLines') === 'true' : undefined,
    light: Number(v('#light')),
    ambient: Number(v('#ambient')),
    curvature: Number(v('#curvature')),
    flip: $('#flip').checked || undefined,
  };
}
// Lighting knobs apply to the LOD strip too; detail knobs don't (the strip shows the presets).
const globalOverrides = () => {
  const o = overrides();
  return { light: o.light, ambient: o.ambient, curvature: o.curvature, flip: o.flip };
};
const res = () => Number($('#res').value);

// ---------- status ----------
function setStatus(items) {
  const el = $('#status');
  el.replaceChildren(...items.map(({ cls, text, onclick }) => {
    const d = document.createElement('div');
    d.className = cls; d.textContent = text;
    if (onclick) d.onclick = onclick;
    return d;
  }));
}

// ---------- spec → render ----------
function parseEditor() {
  const text = $('#editor').value;
  try {
    return { spec: JSON.parse(text) };
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    return { error: e.message, pos: m ? Number(m[1]) : null };
  }
}

// "extends" refers to files in examples/ (fetched fresh, so edits to a base show up on rebuild).
const loadRef = async (ref) => {
  const r = await fetch(`../examples/${ref}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`examples/${ref}: HTTP ${r.status}`);
  return r.json();
};

// "figure" refers to the skeleton library in figures/.
const loadFigure = async (name) => {
  const r = await fetch(`../figures/${name}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`figures/${name}.json: HTTP ${r.status}`);
  return r.json();
};

let rebuildSeq = 0;
async function rebuild() {
  const seq = ++rebuildSeq;
  const parsed = parseEditor();
  if (parsed.error) {
    setStatus([{ cls: 'err', text: `JSON: ${parsed.error}`, onclick: () => selectPos(parsed.pos) }]);
    return;
  }
  let spec = parsed.spec;
  const motionNotes = [];
  try {
    spec = await resolveSpec(parsed.spec, { loadRef, loadFigure, warn: (path, message) => motionNotes.push({ path, message }) });
  } catch (e) {
    if (seq === rebuildSeq) setStatus((e.errors ?? [{ path: '$', message: e.message }]).map((x) => ({ cls: 'err', text: `error ${x.path}: ${x.message}`, onclick: () => selectPath(x.path) })));
    return;
  }
  if (seq !== rebuildSeq) return; // a newer edit superseded this one
  state.resolvedSpec = spec;
  const { errors, warnings } = validate(spec);
  warnings.push(...motionNotes);
  if (errors.length) {
    setStatus([
      ...errors.map((e) => ({ cls: 'err', text: `error ${e.path}: ${e.message}`, onclick: () => selectPath(e.path) })),
      ...warnings.map((w) => ({ cls: 'warn', text: `warning ${w.path}: ${w.message}` })),
    ]);
    return;
  }
  localStorage.setItem(STORAGE_KEY, $('#editor').value);
  state.compiled = compile(spec);
  warnings.push(...checkBounds(state.compiled));
  const names = Object.keys(state.compiled.animations);
  if (!names.includes(state.anim)) state.anim = names[0];
  renderChips(names);
  const t0 = performance.now();
  renderCurrent();
  renderLodStrip();
  renderSheetView(t0);
  setStatus([
    { cls: 'ok', text: `ok — ${parsed.spec.extends ? `extends ${parsed.spec.extends} → ` : ''}${parsed.spec.figure ? `figure ${parsed.spec.figure.use ?? parsed.spec.figure} → ` : ''}${state.compiled.parts.length} parts, ${Object.keys(state.compiled.materials).length} materials, ${names.length} animations` },
    ...warnings.map((w) => ({ cls: 'warn', text: `warning ${w.path}: ${w.message}`, onclick: () => selectPath(w.path) })),
  ]);
  refreshWebview();
}

function renderCurrent() {
  if (!state.compiled) return;
  const { frames } = renderAnimation(state.compiled, state.anim, res(), overrides());
  state.frames = frames;
  state.frameCanvases = frames.map(toCanvas);
  state.frame %= frames.length;
  $('#scrub').max = frames.length - 1;
  const st = resolveStyle(state.compiled, res(), overrides());
  $('#res-label').textContent = `${res()}px · ${DETAIL_NAMES[st.lod]}`;
  drawView();
}

function renderLodStrip() {
  const strip = $('#lod-strip');
  const go = globalOverrides();
  state.lod = LOD_STRIP.map((r) => {
    const { frames, style } = renderAnimation(state.compiled, state.anim, r, go);
    return { res: r, style, canvases: frames.map(toCanvas) };
  });
  strip.replaceChildren(...state.lod.map((l) => {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    const k = Math.max(1, Math.floor(128 / l.res));
    c.width = l.canvases[0].width; c.height = l.canvases[0].height;
    c.style.width = `${c.width * k}px`; c.style.height = `${c.height * k}px`;
    l.view = c;
    const cap = document.createElement('figcaption');
    const b = document.createElement('b');
    b.textContent = `${l.res}px`;
    cap.append(b, ` · ${DETAIL_NAMES[l.style.lod]}`, document.createElement('br'),
      `${l.style.tones} tones${l.style.texture ? ' · tex' : ''}${l.style.dither ? ' · dither' : ''}`);
    fig.append(c, cap);
    fig.title = `Click to edit at ${l.res}px`;
    fig.style.cursor = 'pointer';
    fig.onclick = () => { $('#res').value = l.res; $('#lod').value = ''; renderCurrent(); renderSheetView(performance.now()); };
    return fig;
  }));
  drawLod();
}

function renderSheetView(t0) {
  const sheet = renderSheet(state.compiled, res(), overrides());
  const c = $('#sheet');
  c.width = sheet.width; c.height = sheet.height;
  c.getContext('2d').putImageData(new ImageData(sheet.rgba, sheet.width, sheet.height), 0, 0);
  const k = Math.max(1, Math.floor(248 / sheet.width));
  c.style.width = `${sheet.width * k}px`;
  const colors = new Set();
  for (let i = 0; i < sheet.rgba.length; i += 4) if (sheet.rgba[i + 3]) colors.add((sheet.rgba[i] << 16) | (sheet.rgba[i + 1] << 8) | sheet.rgba[i + 2]);
  const frames = Object.values(sheet.meta.animations).reduce((s, a) => s + a.frames, 0);
  $('#stats').textContent = `${sheet.width}×${sheet.height} · ${frames} frames · ${colors.size} colours · ${(performance.now() - t0).toFixed(0)} ms`;
}

// ---------- drawing ----------
function drawView() {
  const cv = $('#view');
  const fc = state.frameCanvases[state.frame];
  if (!fc) return;
  const stage = $('#stage');
  const k = Math.max(1, Math.floor(Math.min(stage.clientWidth * 0.92 / fc.width, stage.clientHeight * 0.92 / fc.height)));
  cv.width = fc.width * k; cv.height = fc.height * k;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if ($('#onion').checked && state.frameCanvases.length > 1) {
    ctx.globalAlpha = 0.25;
    ctx.drawImage(state.frameCanvases[(state.frame - 1 + state.frameCanvases.length) % state.frameCanvases.length], 0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(fc, 0, 0, cv.width, cv.height);
  if ($('#grid').checked && k >= 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= fc.width; x++) { ctx.moveTo(x * k + 0.5, 0); ctx.lineTo(x * k + 0.5, cv.height); }
    for (let y = 0; y <= fc.height; y++) { ctx.moveTo(0, y * k + 0.5); ctx.lineTo(cv.width, y * k + 0.5); }
    ctx.stroke();
  }
  if ($('#rig').checked) drawRig(ctx, cv.width / state.compiled.size[0]);
  $('#scrub').value = state.frame;
  $('#frame-label').textContent = `${state.frame + 1}/${state.frameCanvases.length}`;
}

/** Rig overlay: part pivots (dots), and for reach constraints the target (ring) and the tip (dot). */
function drawRig(ctx, u) {
  const c = state.compiled, anim = c.animations[state.anim];
  const pose = samplePose(c, anim, state.frame);
  const { world, visible } = worldMatrices(c.parts, pose);
  const at = (m, [x, y]) => [(m[0] * x + m[2] * y + m[4]) * u, (m[1] * x + m[3] * y + m[5]) * u];
  ctx.save();
  ctx.font = '11px ui-monospace, monospace';
  ctx.lineWidth = 1.5;
  for (const p of c.parts) {
    if (!visible.get(p.id)) continue;
    const [x, y] = at(world.get(p.id), p.pivot);
    if (p.tip) {
      // A bone from the figure: a line from its joint to its tip.
      const [tx, ty] = at(world.get(p.id), p.tip);
      ctx.strokeStyle = p.shade < 0 ? 'rgba(160,150,200,0.6)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.lineWidth = 1.5;
      if (p.follow) { ctx.strokeStyle = 'rgba(120,200,255,.7)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); }
    } else if (p.parent && visible.get(p.parent)) {
      const q = c.parts.find((o) => o.id === p.parent);
      const [px, py] = at(world.get(q.id), q.pivot);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(p.id, x + 5, y - 4);
  }
  (anim.reach || []).forEach((r, i) => {
    const end = r.end ?? r.chain[r.chain.length - 1];
    const [tx, ty] = at(world.get(end), r.tip);
    const miss = pose.reachMiss?.[i] ?? 0;
    ctx.strokeStyle = miss > 1 ? '#ff5d6c' : '#46ff7a';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
    const tgt = reachTarget(r, anim, state.frame).map((v) => v * u);
    ctx.beginPath(); ctx.arc(tgt[0], tgt[1], 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillText(miss > 1 ? `reach[${i}] misses by ${miss.toFixed(1)}` : `reach[${i}]`, tgt[0] + 9, tgt[1] + 4);
  });
  ctx.restore();
}
const reachTarget = (r, anim, frame) => r.target.map((v) => sampleValue(v, frameTime(anim, frame), anim.loop, false));

function drawLod() {
  for (const l of state.lod) {
    const c = l.canvases[state.frame % l.canvases.length];
    const ctx = l.view.getContext('2d');
    ctx.clearRect(0, 0, l.view.width, l.view.height);
    ctx.drawImage(c, 0, 0);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const a = state.compiled && state.compiled.animations[state.anim];
  const dt = state.lastTick ? Math.min(100, now - state.lastTick) : 0;
  state.lastTick = now;
  if (!a || !state.playing || state.frameCanvases.length < 2) return;
  state.acc += dt;
  const step = 1000 / a.fps;
  if (state.acc < step) return;
  while (state.acc >= step) { state.acc -= step; state.frame = (state.frame + 1) % state.frameCanvases.length; }
  drawView();
  drawLod();
}

// ---------- chips ----------
function renderChips(names) {
  const box = $('#anim-chips');
  box.replaceChildren(...names.map((n) => {
    const b = document.createElement('button');
    b.textContent = n;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === state.anim));
    b.onclick = () => { state.anim = n; state.frame = 0; renderChips(names); renderCurrent(); renderLodStrip(); };
    return b;
  }));
}

// ---------- editor navigation ----------
function selectPos(pos) {
  if (pos == null) return;
  const ed = $('#editor');
  ed.focus();
  ed.setSelectionRange(pos, pos + 1);
}
function selectPath(path) {
  // Best effort: find the last key of the path in the text.
  const key = (path.match(/\.([A-Za-z_][\w-]*)$/) || [])[1];
  const idMatch = path.match(/parts\[(\d+)\]/);
  const ed = $('#editor');
  let from = 0;
  if (idMatch) {
    const spec = parseEditor().spec;
    const id = spec?.parts?.[Number(idMatch[1])]?.id;
    if (id) from = Math.max(0, ed.value.indexOf(`"${id}"`));
  }
  const at = key ? ed.value.indexOf(`"${key}"`, from) : from;
  if (at >= 0) { ed.focus(); ed.setSelectionRange(at, at + (key ? key.length + 2 : 1)); }
}

// ---------- web view (live <pixel-sprite>) ----------
let bundleCache = null;
const refreshWebview = debounce(async () => {
  if (!state.compiled) return;
  bundleCache = await buildBundle(state.compiled, { resolutions: [16, 32, 64], overrides: { ...globalOverrides(), flip: undefined }, encode: encodeSheet });
  const names = Object.keys(bundleCache.animations);
  for (const id of ['#wv-hover', '#wv-click']) {
    const sel = $(id), prev = sel.value;
    sel.replaceChildren(new Option('—', ''), ...names.map((n) => new Option(n, n)));
    sel.value = names.includes(prev) ? prev : (id === '#wv-hover' ? names[1] || '' : names[2] || '');
  }
  mountWebview();
}, 400);

function mountWebview() {
  if (!bundleCache) return;
  const el = document.createElement('pixel-sprite');
  el.setAttribute('size', '112');
  el.setAttribute('anim', Object.keys(bundleCache.animations)[0]);
  if ($('#wv-hover').value) el.setAttribute('hover-anim', $('#wv-hover').value);
  if ($('#wv-click').value) el.setAttribute('click-anim', $('#wv-click').value);
  const s = document.createElement('script');
  s.type = 'application/json';
  s.textContent = safeJSON(bundleCache);
  el.append(s);
  $('#webview-slot').replaceChildren(el);
}

// ---------- export ----------
async function exportBundle() {
  const resolutions = $('#export-res').value.split(',').map(Number).filter((n) => n > 0);
  const b = await buildBundle(state.compiled, { resolutions, overrides: { ...globalOverrides(), flip: undefined }, encode: encodeSheet });
  return b;
}
function openExport() {
  if (!state.compiled) return;
  const name = slug(state.compiled.name);
  const anims = Object.keys(state.compiled.animations);
  $('#embed-src').textContent =
`<script type="module" src="/pixel-sprite.js"></script>

<pixel-sprite src="/sprites/${name}.bundle.json"
              anim="${attr(anims[0])}" size="128"${anims[1] ? `\n              hover-anim="${attr(anims[1])}"` : ''}${anims[2] ? ` click-anim="${attr(anims[2])}"` : ''}
              alt="${state.compiled.name.replace(/"/g, '&quot;')}"></pixel-sprite>`;
  $('#inline-size').textContent = '';
  $('#export-dialog').showModal();
}

// ---------- examples ----------
async function loadExample(name) {
  const r = await fetch(`../examples/${name}.json`);
  if (!r.ok) throw new Error(`examples/${name}.json: HTTP ${r.status}`);
  $('#editor').value = await r.text();
  state.frame = 0;
  state.anim = null;
  rebuild();
}

const TEMPLATE = {
  name: 'New character',
  size: [100, 100],
  materials: { body: { color: '#5b8def', texture: 'noise' }, eye: { color: '#1b1424', flat: true } },
  parts: [
    { id: 'body', pivot: [50, 90], shapes: [{ type: 'ellipse', cx: 50, cy: 62, rx: 28, ry: 28, material: 'body' }] },
    { id: 'eyes', parent: 'body', pivot: [50, 56], z: 2, shapes: [
      { type: 'ellipse', cx: 41, cy: 56, rx: 3, ry: 5, material: 'eye' },
      { type: 'ellipse', cx: 59, cy: 56, rx: 3, ry: 5, material: 'eye' }] },
  ],
  animations: { idle: { frames: 8, fps: 8, tracks: { body: { sy: { wave: 0.04, offset: 1 }, sx: { wave: -0.04, offset: 1 } }, eyes: { show: [1, 1, 1, 1, 1, 1, 0, 1] } } } },
};

// ---------- wiring ----------
async function init() {
  // Tabs
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('[data-tab-body]').forEach((x) => x.classList.toggle('hidden', x.dataset.tabBody !== b.dataset.tab));
  });

  // Examples (only those that exist)
  const sel = $('#example');
  const available = (await Promise.all(EXAMPLES.map(async (n) => ((await fetch(`../examples/${n}.json`, { method: 'HEAD' })).ok ? n : null)))).filter(Boolean);
  sel.replaceChildren(new Option('— choose —', ''), ...available.map((n) => new Option(n, n)));
  sel.onchange = () => sel.value && loadExample(sel.value);

  $('#editor').addEventListener('input', debounce(rebuild, 250));
  $('#editor').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });

  const rerender = () => { if (!state.compiled) return; const t0 = performance.now(); renderCurrent(); renderSheetView(t0); };
  for (const id of ['#res', '#lod', '#tones', '#texture', '#dither', '#outline', '#innerLines', '#flip']) $(id).addEventListener('input', rerender);
  for (const id of ['#light', '#ambient', '#curvature']) $(id).addEventListener('input', debounce(() => { rerender(); renderLodStrip(); refreshWebview(); }, 60));
  const labels = () => {
    const t = Number($('#texture').value);
    $('#texture-label').textContent = t < 0 ? 'preset' : `${Math.round(t * 100)}%`;
    $('#light-label').textContent = `${$('#light').value}°`;
    $('#ambient-label').textContent = $('#ambient').value;
    $('#curvature-label').textContent = $('#curvature').value;
  };
  document.querySelector('.panel.right').addEventListener('input', labels);
  labels();
  $('#btn-reset-style').onclick = () => {
    for (const id of ['#lod', '#tones', '#dither', '#outline', '#innerLines']) $(id).value = '';
    $('#texture').value = -0.05; $('#light').value = -45; $('#ambient').value = 0.15; $('#curvature').value = 0.8; $('#flip').checked = false;
    labels(); rerender(); renderLodStrip(); refreshWebview();
  };

  $('#btn-play').onclick = () => { state.playing = !state.playing; $('#btn-play').textContent = state.playing ? '❚❚' : '▶'; };
  $('#scrub').oninput = (e) => { state.playing = false; $('#btn-play').textContent = '▶'; state.frame = Number(e.target.value); drawView(); drawLod(); };
  $('#bg').onchange = (e) => { $('#stage').className = `stage ${e.target.value}`; };
  $('#stage').className = 'stage checker';
  $('#grid').onchange = drawView;
  $('#onion').onchange = drawView;
  $('#rig').onchange = drawView;
  window.addEventListener('resize', debounce(drawView, 100));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('textarea, input, select')) return;
    if (e.key === ' ') { e.preventDefault(); $('#btn-play').click(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      state.playing = false; $('#btn-play').textContent = '▶';
      const n = state.frameCanvases.length || 1;
      state.frame = (state.frame + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
      drawView(); drawLod();
    }
  });

  $('#btn-new').onclick = () => { $('#editor').value = JSON.stringify(TEMPLATE, null, 2); sel.value = ''; rebuild(); };
  $('#btn-format').onclick = () => { const p = parseEditor(); if (p.spec) { $('#editor').value = JSON.stringify(p.spec, null, 2); } };
  $('#btn-download-spec').onclick = () => state.compiled && download(`${slug(state.compiled.name)}.json`, $('#editor').value);
  $('#btn-download-png').onclick = () => {
    if (!state.compiled) return;
    const sheet = renderSheet(state.compiled, res(), overrides());
    toCanvas({ w: sheet.width, h: sheet.height, rgba: sheet.rgba }).toBlob((b) => download(`${slug(state.compiled.name)}.${res()}.png`, b));
    download(`${slug(state.compiled.name)}.${res()}.json`, JSON.stringify({ name: state.compiled.name, image: `${slug(state.compiled.name)}.${res()}.png`, ...sheet.meta }, null, 2));
  };
  $('#btn-export').onclick = openExport;
  $('#btn-export-bundle').onclick = async (e) => { e.preventDefault(); download(`${slug(state.compiled.name)}.bundle.json`, JSON.stringify(await exportBundle())); };
  $('#btn-export-runtime').onclick = async (e) => { e.preventDefault(); download('pixel-sprite.js', await (await fetch('../src/runtime/pixel-sprite.js')).text(), 'text/javascript'); };
  $('#btn-copy-inline').onclick = async (e) => {
    e.preventDefault();
    const b = await exportBundle();
    const anims = Object.keys(b.animations);
    const runtime = await (await fetch('../src/runtime/pixel-sprite.js')).text();
    const snippet = `<pixel-sprite anim="${attr(anims[0])}" size="128"${anims[1] ? ` hover-anim="${attr(anims[1])}"` : ''}>\n<script type="application/json">${safeJSON(b)}</script>\n</pixel-sprite>\n<script type="module">\n${runtime}\n</script>`;
    await navigator.clipboard.writeText(snippet);
    $('#inline-size').textContent = `copied · ${(snippet.length / 1024).toFixed(1)} KB`;
  };
  $('#wv-hover').onchange = mountWebview;
  $('#wv-click').onchange = mountWebview;

  // Brief
  const brief = await (await fetch('../docs/SPEC.md')).text();
  $('#brief-text').textContent = brief;
  $('#btn-copy-brief').onclick = () => navigator.clipboard.writeText(brief);

  initAgent({
    brief,
    getSpecText: () => $('#editor').value,
    setSpecText: (t) => { $('#editor').value = t; sel.value = ''; rebuild(); },
    validate,
    // Contact sheet PNG of the current spec (all animations × 16/32/64) for the agent to look at.
    renderPreviewPNG: () => {
      const blocks = [16, 32, 64].map((r) => ({
        res: r,
        rows: Object.keys(state.compiled.animations).map((n) => ({ name: n, frames: renderAnimation(state.compiled, n, r, globalOverrides()).frames })),
      }));
      const img = contactSheet(blocks, { cellH: 96 });
      return encodePNG(img.w, img.h, img.rgba);
    },
    hasRender: () => !!state.compiled,
  });

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { $('#editor').value = saved; rebuild(); }
  else if (available.length) { sel.value = available[0]; await loadExample(available[0]); }
  else $('#btn-new').click();
  requestAnimationFrame(loop);
}

init().catch((e) => setStatus([{ cls: 'err', text: String(e.stack || e) }]));
